'use strict';

import { toolOrientationForYaw } from '../robot/gripper-definition.js';
import { validateWorkspacePoint } from '../robot/workspace.js';
import { wrapPi } from '../robot/math.js';
import {
  canonicalJson, cloneValue, deepFreezePlain, normaliseQuaternion,
  quaternionAngularError, quaternionFromRotationMatrix
} from '../train/math.js';

const FRAME = 'main-demo-machine-mm';
const POSITION_TOLERANCE_MM = 0.25;
const ROTATION_TOLERANCE_RAD = Math.PI / 720;
const LEASE_LABEL = 'train-tcp-push';
const validRevision = value => Number.isSafeInteger(value) && value >= 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export class RobotTcpPusherError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RobotTcpPusherError';
    this.code = code;
    this.details = details;
  }
}

function requireValue(condition, code, message) {
  if (!condition) throw new RobotTcpPusherError(code, message);
}

function bounded(value, minimum, maximum, name) {
  requireValue(finite(value) && value >= minimum && value <= maximum,
    'INVALID_PARAMETER', `${name} must be a finite number from ${minimum} to ${maximum}.`);
  return value;
}

function quaternionForYaw(controller, yawRad) {
  const matrix = toolOrientationForYaw(yawRad, controller.definition.fixedToolOrientation);
  return quaternionFromRotationMatrix([
    { x: matrix[0], y: matrix[3], z: matrix[6] },
    { x: matrix[1], y: matrix[4], z: matrix[7] },
    { x: matrix[2], y: matrix[5], z: matrix[8] }
  ]);
}

function checkedPose(source) {
  const position = source?.positionMm;
  const rotation = source?.rotationQuaternion;
  requireValue(position && [position.xMm, position.yMm, position.zMm].every(finite)
    && rotation && [rotation.x, rotation.y, rotation.z, rotation.w].every(finite)
    && Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w) > 1e-9
    && (source.frame === undefined || source.frame === FRAME),
  'INVALID_PUSH_POSE', 'A finite machine-frame TCP position and quaternion are required.');
  return { frame: FRAME, positionMm: { xMm: position.xMm, yMm: position.yMm, zMm: position.zMm }, rotationQuaternion: normaliseQuaternion(rotation) };
}

function posesMatch(actual, target) {
  return Math.hypot(...['xMm', 'yMm', 'zMm'].map(key => actual.positionMm[key] - target.positionMm[key])) <= POSITION_TOLERANCE_MM
    && quaternionAngularError(actual.rotationQuaternion, target.rotationQuaternion) <= ROTATION_TOLERANCE_RAD;
}

function motionFailure(error) {
  if (error instanceof RobotTcpPusherError) return error;
  const code = error?.code === 'stale_state' ? 'STALE_WORLD_REVISION'
    : error?.code === 'cancelled' || error?.name === 'AbortError' ? 'CANCELLED' : 'PUSH_MOTION_FAILED';
  return new RobotTcpPusherError(code,
    'The authoritative robot could not complete the TCP push sequence.', {
      causeCode: String(error?.code ?? error?.name ?? 'unknown').slice(0, 80),
      obstacle: error?.details?.obstacle ? String(error.details.obstacle).slice(0, 160) : null
    });
}

/**
 * A view of the one RobotController, not another pose or motion authority.
 * All positions are machine-local millimetres; the existing machineRoot adds
 * the display mount once. The collider may have local extents, never an offset
 * world-space origin. This adapter does not apply any force/velocity to Train.
 */
export function createRobotTcpPusher({
  controller,
  nowSeconds = () => performance.now() / 1000,
  getBoardFingerprint = null,
  maximumRunTimeMs = 60000,
  visible: initialVisible = true
} = {}) {
  requireValue(controller && ['getState', 'subscribe', 'moveTool', 'validateMoveRequest', 'beginExclusiveOperation', 'endExclusiveOperation', 'operationBlocked']
    .every(name => typeof controller[name] === 'function')
    && controller.definition?.fixedToolOrientation?.length === 9,
  'INVALID_CONTROLLER', 'The existing Cartesian RobotController is required.');
  requireValue(typeof nowSeconds === 'function' && (getBoardFingerprint === null || typeof getBoardFingerprint === 'function'),
    'INVALID_PARAMETER', 'Clock and optional board fingerprint providers must be synchronous functions.');
  bounded(maximumRunTimeMs, 250, 60000, 'maximumRunTimeMs');
  const initialTime = nowSeconds();
  requireValue(finite(initialTime) && initialTime >= 0, 'INVALID_CLOCK', 'A finite monotonic TCP sample time is required.');

  let disposed = false, visible = Boolean(initialVisible), pushing = false;
  let active = null, lastRun = null, targetPose = null, latestSample = null;
  const listeners = new Set(), witnesses = new WeakSet();
  const readState = () => controller.getState();
  const poseFromState = state => ({ frame: FRAME, positionMm: { ...state.tcp }, rotationQuaternion: quaternionForYaw(controller, state.toolYawRad) });
  const getPose = () => poseFromState(readState());
  const fingerprint = () => {
    if (!getBoardFingerprint) return null;
    const value = getBoardFingerprint();
    requireValue(!value?.then, 'INVALID_PARAMETER', 'The board fingerprint provider must be synchronous.');
    return typeof value === 'string' ? value : canonicalJson(value);
  };

  function invalidate(run, code, message, details = {}) {
    run.failure ??= new RobotTcpPusherError(code, message, details);
    run.abort.abort(run.failure);
  }

  function stable(run, { requireLease = true, checkBoard = true } = {}) {
    const state = readState();
    if (run.failure || !validRevision(state.worldRevision) || state.worldRevision !== run.worldRevision
      || state.robotRevision !== run.robotRevision || state.heldBrickId) return false;
    if (requireLease && (controller.exclusiveOperationToken !== run.leaseToken || controller.operationBlocked(run.leaseToken))) return false;
    if (!requireLease && (controller.operationBlocked() || controller.pendingMoveCount || state.operationState !== 'idle' || state.moving)) return false;
    if (checkBoard && getBoardFingerprint && fingerprint() !== run.boardFingerprint) return false;
    return true;
  }

  function check(run) {
    if (run.failure) throw run.failure;
    if (run.abort.signal.aborted) throw new RobotTcpPusherError('CANCELLED', 'The TCP push was cancelled.');
    if (!stable(run)) {
      invalidate(run, 'STALE_WORLD_REVISION', 'The world, board, or robot lease changed outside this TCP push.');
      throw run.failure;
    }
  }

  function summary(run) {
    let valid = false;
    try { valid = stable(run, { requireLease: !run.released }); } catch {}
    return deepFreezePlain({
      schemaVersion: 'robo-bridge.tcp-motion-witness.v1',
      startWorldRevision: run.startWorldRevision, finalWorldRevision: run.worldRevision,
      startRobotRevision: run.startRobotRevision, finalRobotRevision: run.robotRevision,
      motionSampleCount: run.motionSampleCount, movesCompleted: run.movesCompleted,
      stage: run.stage, complete: run.complete, released: run.released,
      valid, failureCode: run.failure?.code ?? null,
      failureReason: run.failure?.details?.causeCode ?? null, obstacle: run.failure?.details?.obstacle ?? null
    });
  }

  function makeWitness(run) {
    const witness = Object.freeze({
      getSnapshot: () => summary(run),
      isValid({ sampledWorldRevision = run.startWorldRevision, finalWorldRevision = readState().worldRevision, requireComplete = true } = {}) {
        try {
          return typeof requireComplete === 'boolean' && validRevision(sampledWorldRevision) && validRevision(finalWorldRevision)
            && sampledWorldRevision === run.startWorldRevision && finalWorldRevision === run.worldRevision
            && (!requireComplete || (run.complete && run.released && !controller.pendingMoveCount && readState().operationState === 'idle'))
            && stable(run, { requireLease: !run.released });
        } catch { return false; }
      }
    });
    witnesses.add(witness);
    return witness;
  }

  function observeOwnedMotion(event) {
    const run = active;
    if (!run?.leaseToken || run.released || run.failure) return;
    const state = event.state;
    const move = run.move;
    if (event.type === 'exclusive_operation_completed') {
      if (!run.releasing || event.label !== LEASE_LABEL || state.worldRevision !== run.worldRevision || state.robotRevision !== run.robotRevision) {
        invalidate(run, 'STALE_WORLD_REVISION', 'The TCP push lease was released by another operation.');
      }
      return;
    }
    if (controller.exclusiveOperationToken !== run.leaseToken || !state || controller.pendingMoveCount !== 1 || !move) {
      invalidate(run, 'STALE_WORLD_REVISION', 'Unowned robot activity occurred during the TCP push.');
      return;
    }
    if (event.type === 'motion_sample') {
      const next = move.samples;
      if (move.phase !== 'moving' || !state.moving || state.operationState !== 'moving'
        || event.worldRevision !== run.worldRevision + 1 || state.worldRevision !== event.worldRevision
        || state.robotRevision !== run.robotRevision + 1 || event.sampleIndex !== next
        || !Number.isSafeInteger(event.sampleCount) || event.sampleCount < 1
        || (move.sampleCount !== null && move.sampleCount !== event.sampleCount) || next >= event.sampleCount) {
        invalidate(run, 'STALE_WORLD_REVISION', 'TCP samples did not form one contiguous owned motion revision chain.');
        return;
      }
      move.samples += 1;
      move.sampleCount = event.sampleCount;
      run.motionSampleCount += 1;
      run.worldRevision = state.worldRevision;
      run.robotRevision = state.robotRevision;
      return;
    }
    if (state.worldRevision !== run.worldRevision || state.robotRevision !== run.robotRevision) {
      invalidate(run, 'STALE_WORLD_REVISION', 'A non-motion mutation changed the world during the TCP push.');
      return;
    }
    if (event.type === 'motion_planning' && move.phase === 'queued') move.phase = 'planning';
    else if (event.type === 'motion_started' && move.phase === 'planning') move.phase = 'moving';
    else if (event.type === 'motion_completed' && move.phase === 'moving' && move.samples === move.sampleCount) move.phase = 'completed';
    else if (event.type === 'motion_cancelled') invalidate(run, 'CANCELLED', 'The controller cancelled the TCP push.');
    else if (event.type === 'motion_rejected') invalidate(run, event.reason === 'stale_state' ? 'STALE_WORLD_REVISION' : 'PUSH_MOTION_FAILED', 'The controller rejected the TCP push.', {
      causeCode: String(event.reason ?? 'unknown').slice(0, 80), obstacle: event.details?.obstacle ? String(event.details.obstacle).slice(0, 160) : null
    });
    else invalidate(run, 'STALE_WORLD_REVISION', 'Unexpected controller activity interrupted the TCP push.');
  }

  const unsubscribe = controller.subscribe(event => {
    observeOwnedMotion(event);
    const state = readState(), pose = poseFromState(state);
    const changed = !latestSample || event.type === 'motion_sample'
      || canonicalJson(pose) !== canonicalJson({ frame: latestSample.frame, positionMm: latestSample.positionMm, rotationQuaternion: latestSample.rotationQuaternion });
    if (!changed) return;
    let time;
    try { time = nowSeconds(); } catch { time = NaN; }
    if (!finite(time) || time < 0) {
      if (active) invalidate(active, 'INVALID_CLOCK', 'The TCP sample clock became invalid.');
      time = latestSample?.sampleTimeSeconds ?? 0;
    }
    latestSample = deepFreezePlain({ ...pose, sampleTimeSeconds: Math.max(time, (latestSample?.sampleTimeSeconds ?? -1) + 1e-9),
      worldRevision: state.worldRevision, robotRevision: state.robotRevision, sequence: (latestSample?.sequence ?? -1) + 1 });
    for (const listener of listeners) {
      // Observation cannot become another robot authority or throw through its loop.
      try { listener(cloneValue(latestSample)); } catch {}
    }
  });

  function getSample() {
    const state = readState();
    return { ...poseFromState(state), sampleTimeSeconds: latestSample.sampleTimeSeconds,
      worldRevision: state.worldRevision, robotRevision: state.robotRevision, sequence: latestSample.sequence };
  }

  function prepare(input) {
    requireValue(input && typeof input === 'object' && !Array.isArray(input), 'INVALID_PARAMETER', 'TCP push input must be an object.');
    requireValue(!disposed, 'PUSHER_DISPOSED', 'The TCP pusher has been disposed.');
    requireValue(!active, 'ROBOT_BUSY', 'Another TCP push is active.');
    const state = readState();
    requireValue(validRevision(input.expectedWorldRevision), 'INVALID_PARAMETER', 'An exact expectedWorldRevision is required.');
    requireValue(state.worldRevision === input.expectedWorldRevision, 'STALE_WORLD_REVISION', 'The TCP push world revision is stale.');
    requireValue(input.signal == null || (typeof input.signal.aborted === 'boolean' && typeof input.signal.addEventListener === 'function' && typeof input.signal.removeEventListener === 'function'),
      'INVALID_PARAMETER', 'signal must be an AbortSignal.');
    requireValue(!input.signal?.aborted, 'CANCELLED', 'The TCP push was cancelled before starting.');
    requireValue(state.operationState === 'idle' && !state.moving && !controller.pendingMoveCount && !controller.operationBlocked(), 'ROBOT_BUSY', 'The robot must be idle before the TCP push.');
    requireValue(!state.heldBrickId, 'GRIPPER_NOT_EMPTY', 'The robot must have an empty gripper before the TCP push.');
    const start = checkedPose(input.startPose), forward = input.routeFrame?.forward;
    requireValue(forward && [forward.x, forward.y, forward.z].every(finite)
      && Math.abs(forward.z) < 1e-7 && Math.abs(Math.hypot(forward.x, forward.y) - 1) < 1e-7,
    'INVALID_PUSH_POSE', 'A level, unit-length direction from the authoritative route frame is required.');
    const yawRad = Math.atan2(forward.y, forward.x);
    requireValue(quaternionAngularError(start.rotationQuaternion, quaternionForYaw(controller, yawRad)) <= ROTATION_TOLERANCE_RAD,
      'INVALID_PUSH_POSE', 'The Train start pose must use the route-aligned fixed-down TCP orientation.');
    const maximum = bounded(input.maxPushDistanceMm ?? 1000, 0.1, 1000, 'maxPushDistanceMm');
    const pushDistanceMm = bounded(input.pushDistanceMm, 0.1, maximum, 'pushDistanceMm');
    const speedMmS = bounded(input.speedMmS ?? 120, 1, Math.min(650, state.speedLimitMmS), 'speedMmS');
    const approach = bounded(input.approachClearanceMm ?? 80, 1, 300, 'approachClearanceMm');
    const clearance = bounded(input.prePushClearanceMm ?? 20, 1, 100, 'prePushClearanceMm');
    for (const name of ['onWitness', 'onAtStart']) requireValue(input[name] === undefined || typeof input[name] === 'function', 'INVALID_PARAMETER', `${name} must be a function.`);
    const offset = (point, distance, rise = 0) => ({ xMm: point.xMm + forward.x * distance, yMm: point.yMm + forward.y * distance, zMm: point.zMm + rise });
    const pre = offset(start.positionMm, -clearance), above = offset(pre, 0, approach);
    const end = offset(start.positionMm, pushDistanceMm), retract = offset(end, -clearance);
    const yawDelta = wrapPi(yawRad - state.toolYawRad);
    const yawSteps = Math.max(1, Math.ceil(Math.abs(yawDelta) / (Math.PI / 3)));
    // Cartesian gripper motion chooses a half-turn-equivalent yaw. Small explicit
    // yaw steps on the approach preserve the exact requested TCP quaternion.
    const points = Array.from({ length: yawSteps }, (_, index) => {
      const fraction = (index + 1) / yawSteps;
      return { stage: 'approach', position: Object.fromEntries(['xMm', 'yMm', 'zMm'].map(key => [key, state.tcp[key] + (above[key] - state.tcp[key]) * fraction])), yawRad: wrapPi(state.toolYawRad + yawDelta * fraction) };
    });
    points.push({ stage: 'pre_push', position: pre, yawRad }, { stage: 'align', position: start.positionMm, yawRad },
      { stage: 'push', position: end, yawRad }, { stage: 'retract', position: retract, yawRad },
      { stage: 'retreat', position: offset(retract, 0, approach), yawRad });
    for (const point of points) requireValue(validateWorkspacePoint(point.position, controller.workspace).ok, 'INVALID_PUSH_POSE', 'A derived TCP push waypoint is outside the existing workspace.');
    return { start, points, speedMmS, input: { signal: input.signal ?? null, onWitness: input.onWitness, onAtStart: input.onAtStart }, initial: state, boardFingerprint: fingerprint() };
  }

  async function callback(run, handler, value) {
    if (!handler) return;
    const signal = run.abort.signal;
    let abortListener;
    try {
      const result = await Promise.race([Promise.resolve().then(() => { check(run); return handler(value); }), new Promise((_, reject) => {
        abortListener = () => reject(run.failure ?? new RobotTcpPusherError('CANCELLED', 'The TCP push was cancelled.'));
        signal.addEventListener('abort', abortListener, { once: true });
        if (signal.aborted) abortListener();
      })]);
      requireValue(result !== false && result?.ok !== false, 'PUSH_PRECONDITION_FAILED', 'The Train integration rejected TCP push readiness.');
    } finally { signal.removeEventListener('abort', abortListener); }
    check(run);
  }

  async function execute(run, prepared) {
    const { input } = prepared;
    const onAbort = () => invalidate(run, 'CANCELLED', 'The TCP push was cancelled.');
    let timeout = null;
    try {
      input.signal?.addEventListener('abort', onAbort, { once: true });
      timeout = setTimeout(() => invalidate(run, 'PUSH_TIMEOUT', 'The bounded TCP push time limit was reached.'), maximumRunTimeMs);
      requireValue(!input.signal?.aborted && !run.abort.signal.aborted, 'CANCELLED', 'The TCP push was cancelled before starting.');
      requireValue(readState().worldRevision === run.startWorldRevision, 'STALE_WORLD_REVISION', 'The TCP push became stale before acquiring its lease.');
      const lease = controller.beginExclusiveOperation(LEASE_LABEL);
      requireValue(lease.ok, 'ROBOT_BUSY', 'The robot could not acquire the TCP push lease.');
      run.leaseToken = lease.token;
      check(run);
      await callback(run, input.onWitness, run.witness);
      targetPose = cloneValue(prepared.start);
      for (const waypoint of prepared.points) {
        check(run);
        if (waypoint.stage === 'push') {
          requireValue(posesMatch(getPose(), prepared.start), 'PUSH_POSE_MISMATCH', 'The actual TCP did not reach the Train start pose.');
          await callback(run, input.onAtStart, { pose: getPose(), sample: getSample(), witness: run.witness, signal: run.abort.signal });
          pushing = true;
        }
        run.stage = waypoint.stage;
        const request = { ...waypoint.position, yawRad: waypoint.yawRad, speedMmS: prepared.speedMmS,
          expectedWorldRevision: run.worldRevision, signal: run.abort.signal, operationToken: run.leaseToken };
        const validation = controller.validateMoveRequest(request);
        requireValue(validation.ok, 'PUSH_MOTION_FAILED', `The controller rejected the ${waypoint.stage} waypoint: ${validation.reason}.`);
        run.move = { phase: 'queued', samples: 0, sampleCount: null };
        await controller.moveTool(request);
        check(run);
        requireValue(run.move.phase === 'completed' && !controller.pendingMoveCount && readState().operationState === 'idle',
          'PUSH_MOTION_FAILED', 'The controller did not finish one witnessed Cartesian move.');
        requireValue(posesMatch(getPose(), { positionMm: waypoint.position, rotationQuaternion: quaternionForYaw(controller, waypoint.yawRad) }),
          'PUSH_POSE_MISMATCH', 'The measured TCP does not match its completed Cartesian waypoint.');
        run.movesCompleted += 1;
        run.move = null;
      }
      run.complete = true;
      run.stage = 'complete';
    } catch (error) {
      run.failure ??= motionFailure(error);
      run.abort.abort(run.failure);
      run.stage = run.failure.code === 'CANCELLED' ? 'cancelled' : 'failed';
    } finally {
      // Every move is awaited above; cancellation cannot return with an owned
      // queue item still executing, and no retreat is started after abort.
      pushing = false;
      clearTimeout(timeout);
      try { input.signal?.removeEventListener('abort', onAbort); } catch {}
      if (run.leaseToken) {
        run.releasing = true;
        controller.endExclusiveOperation(run.leaseToken);
      }
      run.released = true;
      lastRun = run;
      if (active === run) active = null;
    }
    if (!run.failure) {
      try {
        requireValue(!input.signal?.aborted, 'CANCELLED', 'The TCP push was cancelled during final cleanup.');
        requireValue(stable(run, { requireLease: false }), 'STALE_WORLD_REVISION', 'The world changed while the TCP push lease was released.');
      } catch (error) { run.failure = motionFailure(error); run.stage = run.failure.code === 'CANCELLED' ? 'cancelled' : 'failed'; }
    }
    if (run.failure) throw run.failure;
    return Object.freeze({ ok: true, ...summary(run), worldRevision: run.worldRevision, witness: run.witness });
  }

  function run(input = {}) {
    try {
      const prepared = prepare(input);
      const state = prepared.initial;
      const operation = { startWorldRevision: state.worldRevision, worldRevision: state.worldRevision,
        startRobotRevision: state.robotRevision, robotRevision: state.robotRevision,
        boardFingerprint: prepared.boardFingerprint, abort: new AbortController(), leaseToken: null,
        failure: null, move: null, motionSampleCount: 0, movesCompleted: 0,
        stage: 'queued', complete: false, released: false, releasing: false };
      operation.witness = makeWitness(operation);
      active = operation;
      operation.done = Promise.resolve().then(() => execute(operation, prepared));
      return operation.done;
    } catch (error) { return Promise.reject(motionFailure(error)); }
  }

  function cancel(reason = 'cancelled') {
    const operation = active;
    if (!operation) return Promise.resolve({ ok: true, worldRevision: readState().worldRevision });
    invalidate(operation, 'CANCELLED', `TCP push cancelled: ${String(reason).slice(0, 100)}.`);
    return operation.done.then(() => undefined, () => undefined).then(() => ({ ok: true, worldRevision: readState().worldRevision }));
  }

  return Object.freeze({
    mode: 'tcp_contact', getPose, getSample, run, cancel,
    getOrientationForYaw(yawRad) {
      requireValue(finite(yawRad), 'INVALID_PARAMETER', 'A finite Cartesian tool yaw is required.');
      return quaternionForYaw(controller, wrapPi(yawRad));
    },
    subscribe(listener) {
      requireValue(typeof listener === 'function', 'INVALID_PARAMETER', 'A TCP sample listener is required.');
      listeners.add(listener);
      listener(getSample());
      return () => listeners.delete(listener);
    },
    setTargetPose(pose) { targetPose = checkedPose(pose); return cloneValue(targetPose); },
    getTargetPose: () => cloneValue(targetPose),
    isAtTarget(pose = targetPose) { try { return posesMatch(getPose(), checkedPose(pose)); } catch { return false; } },
    setVisible(value) { visible = Boolean(value); return visible; },
    onPushStart() { pushing = true; },
    onPushEnd() { pushing = false; },
    reset(pose) { if (active) void cancel('train_reset'); if (pose) targetPose = checkedPose(pose); pushing = false; return getPose(); },
    getSnapshot() { return { mode: 'tcp_contact', pose: getPose(), sample: getSample(), targetPose: cloneValue(targetPose), visible, pushing,
      atTarget: Boolean(targetPose && posesMatch(getPose(), targetPose)), running: Boolean(active), motion: active ? summary(active) : lastRun ? summary(lastRun) : null }; },
    isMotionWitnessValid(witness, options) { return witnesses.has(witness) && witness.isValid(options); },
    async dispose() { disposed = true; await cancel('disposed'); unsubscribe(); listeners.clear(); }
  });
}
