import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { findLatchCandidate } from '../bricks/latch.js';
import { validateCollision } from './collision.js';
import {
  captureBrickInTcp,
  heldBrickWorldPose,
  selectAutomaticYaw,
  shortestHalfTurnDelta,
  toolOrientationForYaw,
  UR10_GRIPPER
} from './gripper-definition.js';
import { forwardKinematics, inverseKinematicsPose } from './kinematics.js';
import { angleDistance, distance3, isFiniteNumber, wrapPi } from './math.js';
import { CHALLENGE_LAYOUT, CHALLENGE_WORKSPACE, UR10_DEFINITION } from './ur10-definition.js';
import { validateWorkspacePoint } from './workspace.js';
import { RevisionClock } from '../state/revision-clock.js';

const clone = (value) => structuredClone(value);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class RobotError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'RobotError';
    this.code = code;
    this.details = details;
  }
}

function profile(distanceMm, speedMmS, accelerationMmS2) {
  if (distanceMm <= 1e-9) return { distanceMm: 0, peakSpeedMmS: 0, accelerationMmS2, accelTimeS: 0, cruiseTimeS: 0, accelDistanceMm: 0, durationMs: 0 };
  const accelDistance = speedMmS ** 2 / (2 * accelerationMmS2);
  if (2 * accelDistance >= distanceMm) {
    const peak = Math.sqrt(distanceMm * accelerationMmS2);
    const accelTime = peak / accelerationMmS2;
    return { distanceMm, peakSpeedMmS: peak, accelerationMmS2, accelTimeS: accelTime, cruiseTimeS: 0, accelDistanceMm: distanceMm / 2, durationMs: accelTime * 2 * 1000 };
  }
  const accelTime = speedMmS / accelerationMmS2;
  const cruiseDistance = distanceMm - 2 * accelDistance;
  const cruiseTime = cruiseDistance / speedMmS;
  return { distanceMm, peakSpeedMmS: speedMmS, accelerationMmS2, accelTimeS: accelTime, cruiseTimeS: cruiseTime, accelDistanceMm: accelDistance, durationMs: (2 * accelTime + cruiseTime) * 1000 };
}

function timeAtDistanceMs(distanceAlongMm, p) {
  if (p.distanceMm <= 1e-9) return 0;
  const s = Math.max(0, Math.min(p.distanceMm, distanceAlongMm));
  const cruiseStart = p.accelDistanceMm;
  const cruiseEnd = p.distanceMm - p.accelDistanceMm;
  if (s <= cruiseStart) return Math.sqrt(2 * s / p.accelerationMmS2) * 1000;
  if (s <= cruiseEnd && p.cruiseTimeS > 0) return (p.accelTimeS + (s - cruiseStart) / p.peakSpeedMmS) * 1000;
  const remaining = p.distanceMm - s;
  return (p.accelTimeS + p.cruiseTimeS + (p.accelTimeS - Math.sqrt(Math.max(0, 2 * remaining / p.accelerationMmS2)))) * 1000;
}

function combineSignals(external, internal) {
  if (!external) return internal;
  if (!internal) return external;
  const controller = new AbortController();
  const abort = (signal) => { if (!controller.signal.aborted) controller.abort(signal.reason); };
  if (external.aborted) abort(external);
  if (internal.aborted) abort(internal);
  external.addEventListener('abort', () => abort(external), { once: true });
  internal.addEventListener('abort', () => abort(internal), { once: true });
  return controller.signal;
}

export class RobotController {
  constructor({
    definition = UR10_DEFINITION,
    workspace = CHALLENGE_WORKSPACE,
    layout = CHALLENGE_LAYOUT,
    speedLimitMmS = 650,
    accelerationLimitMmS2 = 1200,
    jointSpeedLimitRadS = 1.6,
    jointAccelerationLimitRadS2 = 4.0,
    timeScale = 1,
    board = null,
    bricks = [],
    revisionClock = board?.revisionClock ?? new RevisionClock()
    ,placementAuthority = null
  } = {}) {
    this.definition = definition;
    this.workspace = workspace;
    this.layout = layout;
    this.speedLimitMmS = speedLimitMmS;
    this.accelerationLimitMmS2 = accelerationLimitMmS2;
    this.jointSpeedLimitRadS = jointSpeedLimitRadS;
    this.jointAccelerationLimitRadS2 = jointAccelerationLimitRadS2;
    this.timeScale = timeScale;
    this.playbackMultiplier = timeScale === 0 ? 0 : 1 / timeScale;
    this.board = board;
    this.bricks = clone(bricks);
    this.revisionClock = revisionClock;
    this.listeners = new Set();
    this.robotRevision = 0;
    this.jointsRad = Array.from(definition.homeJointsRad);
    const fk = forwardKinematics(this.jointsRad, definition);
    if (!fk.ok) throw new Error('Invalid configured home joints');
    this.tcp = { ...fk.tcp };
    this.moving = false;
    this.operationState = 'idle';
    this.heldBrickId = null;
    this.toolYawRad = 0;
    this.jawGapMm = UR10_GRIPPER.openGapMm;
    this.jawState = 'open';
    this.brickInTcp = null;
    this.brickYawInTcpRad = 0;
    this.operation = Promise.resolve();
    this.activeAbortController = null;
    this.operationEpoch = 0;
    this.pendingMoveCount = 0;
    this.exclusiveOperationToken = null;
    this.exclusiveOperationLabel = null;
    this.releaseClearanceBrickId = null;
    this.placementAuthority = placementAuthority;
  }

  get worldRevision() { return this.revisionClock.value; }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({ type: 'initial', state: this.getState(), worldRevision: this.worldRevision });
    return () => this.listeners.delete(listener);
  }

  emit(type, details = {}) {
    const event = { type, ...details, state: this.getState(), worldRevision: this.worldRevision };
    for (const listener of this.listeners) listener(event);
  }

  #bumpRobot(type, details = {}, { bumpWorld = true } = {}) {
    this.robotRevision += 1;
    if (bumpWorld) this.revisionClock.bump();
    this.emit(type, details);
  }

  getState() {
    return {
      tcp: { ...this.tcp },
      toolOrientation: 'fixed-down-auto-yaw',
      toolYawRad: this.toolYawRad,
      gripper: {
        id: UR10_GRIPPER.id,
        sourceGlbSha256: UR10_GRIPPER.sourceGlbSha256,
        jawGapMm: this.jawGapMm,
        jawState: this.jawState,
        uniformScale: UR10_GRIPPER.uniformScale,
        gripperRootToTcpMm: { ...UR10_GRIPPER.gripperRootToTcpMm },
        brickInTcp: this.brickInTcp ? { ...this.brickInTcp } : null,
        brickYawInTcpRad: this.heldBrickId ? this.brickYawInTcpRad : null
      },
      jointsRad: Array.from(this.jointsRad),
      speedLimitMmS: this.speedLimitMmS,
      accelerationLimitMmS2: this.accelerationLimitMmS2,
      jointSpeedLimitRadS: this.jointSpeedLimitRadS,
      jointAccelerationLimitRadS2: this.jointAccelerationLimitRadS2,
      simulationPlaybackMultiplier: this.playbackMultiplier,
      moving: this.moving,
      operationState: this.operationState,
      heldBrickId: this.heldBrickId,
      robotRevision: this.robotRevision,
      worldRevision: this.worldRevision
    };
  }

  getWorkspace() { return clone(this.workspace); }
  getBricks() { return clone(this.bricks); }

  operationBlocked(operationToken = null) {
    return Boolean(this.exclusiveOperationToken && operationToken !== this.exclusiveOperationToken);
  }

  beginExclusiveOperation(label = 'compound') {
    if (this.exclusiveOperationToken || this.operationState !== 'idle' || this.pendingMoveCount > 0) {
      return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    }
    const token = Symbol(label);
    this.exclusiveOperationToken = token;
    this.exclusiveOperationLabel = label;
    this.emit('exclusive_operation_started', { label });
    return { ok: true, token, worldRevision: this.worldRevision };
  }

  endExclusiveOperation(token) {
    if (!token || token !== this.exclusiveOperationToken) return false;
    const label = this.exclusiveOperationLabel;
    this.exclusiveOperationToken = null;
    this.exclusiveOperationLabel = null;
    this.emit('exclusive_operation_completed', { label });
    return true;
  }

  setSimulationPlaybackMultiplier(multiplier) {
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 40) {
      return { ok: false, reason: 'invalid_input', minimum: 1, maximum: 40 };
    }
    if (this.operationState !== 'idle' || this.pendingMoveCount > 0 || this.exclusiveOperationToken) {
      return { ok: false, reason: 'operation_in_progress' };
    }
    this.playbackMultiplier = multiplier;
    this.timeScale = 1 / multiplier;
    this.emit('playback_rate_changed', { multiplier });
    return { ok: true, multiplier, physicalSpeedLimitMmS: this.speedLimitMmS };
  }

  setPlacementAuthority(authority) {
    if (this.operationBlocked() || this.operationState !== 'idle' || this.pendingMoveCount > 0 || this.heldBrickId) return false;
    this.placementAuthority = authority;
    return true;
  }

  setBricks(bricks) {
    if (this.operationBlocked() || this.operationState !== 'idle') return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    this.bricks = clone(bricks);
    this.heldBrickId = null;
    this.jawGapMm = UR10_GRIPPER.openGapMm;
    this.jawState = 'open';
    this.brickInTcp = null;
    this.brickYawInTcpRad = 0;
    this.#bumpRobot('world_reset');
    return { ok: true, bricks: this.getBricks(), worldRevision: this.worldRevision };
  }

  addLooseBricks(bricks, { actor = 'human' } = {}) {
    if (this.operationBlocked() || this.operationState !== 'idle' || this.pendingMoveCount > 0 || this.heldBrickId) {
      return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    }
    if (!Array.isArray(bricks) || bricks.length < 1 || bricks.length > 50) {
      return { ok: false, reason: 'invalid_input', worldRevision: this.worldRevision };
    }
    const known = new Set(this.bricks.map((brick) => brick.id));
    const accepted = [];
    for (const source of bricks) {
      if (!source || typeof source.id !== 'string' || known.has(source.id)
        || !source.position || ![source.position.xMm, source.position.yMm, source.position.zMm, source.yawRad].every(isFiniteNumber)) {
        return { ok: false, reason: 'invalid_input', worldRevision: this.worldRevision };
      }
      known.add(source.id);
      const brick = clone({
        ...source,
        heldBy: null,
        ownership: null,
        placedTargetId: null,
        placementType: null,
        connection: null,
        snapped: false,
        graspable: source.graspable !== false
      });
      accepted.push(brick);
    }
    this.bricks.push(...accepted);
    this.#bumpRobot('loose_bricks_added', { actor, brickIds: accepted.map((brick) => brick.id) });
    return { ok: true, bricks: clone(accepted), count: accepted.length, worldRevision: this.worldRevision };
  }

  heldBrick() { return this.heldBrickId ? this.bricks.find((brick) => brick.id === this.heldBrickId) ?? null : null; }

  moveLooseBrick(brickId, position, { actor = 'human', yawRad = null, freeQuaternion = null } = {}) {
    if (typeof brickId !== 'string' || !position || ![position.xMm, position.yMm, position.zMm].every(isFiniteNumber)
      || (yawRad !== null && !isFiniteNumber(yawRad))
      || (freeQuaternion !== null && (!Array.isArray(freeQuaternion) || freeQuaternion.length !== 4 || !freeQuaternion.every(isFiniteNumber)))) {
      return { ok: false, reason: 'invalid_input', worldRevision: this.worldRevision };
    }
    const brick = this.bricks.find((candidate) => candidate.id === brickId);
    if (!brick) return { ok: false, reason: 'invalid_input', worldRevision: this.worldRevision };
    if (brick.heldBy || brick.snapped || brick.placedTargetId || brick.placementType) {
      return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    }
    brick.position = { ...position };
    if (yawRad !== null) brick.yawRad = yawRad;
    if (freeQuaternion !== null) brick.freeQuaternion = [...freeQuaternion];
    else delete brick.freeQuaternion;
    brick.reachability = {
      reachable: false,
      reason: 'pose_changed_requires_revalidation',
      validatedAtWorldRevision: this.worldRevision
    };
    this.#bumpRobot('loose_brick_moved', { brickId, actor, position: { ...position }, yawRad: brick.yawRad ?? 0 });
    return { ok: true, brick: clone(brick), actor, worldRevision: this.worldRevision };
  }

  beginHumanCarry(brickId) {
    if (this.operationBlocked() || this.operationState !== 'idle' || this.pendingMoveCount > 0) {
      return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    }
    if (this.heldBrickId) return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    const brick = this.bricks.find((candidate) => candidate.id === brickId);
    if (!brick) return { ok: false, reason: 'invalid_input', worldRevision: this.worldRevision };
    if (brick.heldBy) return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    if (brick.snapped || brick.placedTargetId || brick.placementType || this.board?.getPlacements?.().some((entry) => entry.brickId === brickId)) {
      const removed = this.board?.removeBrick?.(brickId, 'human');
      if (removed && !removed.ok) return removed;
    }
    brick.heldBy = 'human';
    brick.ownership = 'human';
    brick.snapped = false;
    brick.placedTargetId = null;
    brick.placementType = null;
    brick.connection = null;
    delete brick.freeQuaternion;
    brick.placementType = null;
    brick.connection = null;
    this.#bumpRobot('human_pickup', { brickId, actor: 'human' });
    return { ok: true, brick: clone(brick), worldRevision: this.worldRevision };
  }

  commitHumanPlacement({
    brickId, position, yawRad = 0, connection = null, placementType = 'free-build',
    supportBrickId = null, supportSide = null, carriedSide = null
  } = {}) {
    if (this.operationBlocked() || this.operationState !== 'idle' || this.pendingMoveCount > 0) {
      return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    }
    if (!position || ![position.xMm, position.yMm, position.zMm, yawRad].every(isFiniteNumber)) {
      return { ok: false, reason: 'invalid_input', worldRevision: this.worldRevision };
    }
    const brick = this.bricks.find((candidate) => candidate.id === brickId);
    if (!brick || brick.heldBy !== 'human') {
      return { ok: false, reason: 'not_holding', worldRevision: this.worldRevision };
    }
    if (this.placementAuthority) {
      const authoritative = this.placementAuthority.commit({
        brickId,
        position,
        yawRad,
        actor: 'human',
        supportBrickId: supportBrickId ?? connection?.lowerBrickId ?? connection?.groups?.[0]?.lowerBrickId ?? null,
        supportSide: supportSide ?? connection?.lowerConnector ?? connection?.groups?.[0]?.lowerConnector ?? 'M',
        carriedSide: carriedSide ?? connection?.upperConnector ?? connection?.groups?.[0]?.upperConnector ?? null
      });
      if (!authoritative.ok) return authoritative;
      brick.position = { ...authoritative.position };
      brick.yawRad = authoritative.yawRad;
      delete brick.freeQuaternion;
      brick.heldBy = null;
      brick.ownership = null;
      brick.snapped = authoritative.snapped;
      brick.placedTargetId = authoritative.targetId;
      brick.placementType = authoritative.placementType;
      brick.connection = authoritative.connections?.length > 1
        ? { groups: clone(authoritative.connections) }
        : authoritative.connection ? clone(authoritative.connection) : null;
      this.#bumpRobot('human_placement', {
        brickId,
        actor: 'human',
        placementType: authoritative.placementType,
        targetId: authoritative.targetId,
        connection: authoritative.connection
      }, { bumpWorld: false });
      return { ...authoritative, brick: clone(brick), placementAuthorityApplied: true, worldRevision: this.worldRevision };
    }
    const snap = this.board?.trySnapBrick({
      brickId,
      colour: brick.colour,
      position,
      yawRad,
      actor: 'human'
    }) ?? { ok: false, reason: 'no_snap_target' };
    if (!snap.ok && ['target_occupied', 'wrong_colour'].includes(snap.reason)) {
      return { ok: false, reason: snap.reason, targetId: snap.targetId ?? null, worldRevision: this.worldRevision };
    }
    let accepted = snap;
    if (!snap.ok) {
      accepted = this.board?.acceptPlacement?.({
        brickId,
        colour: brick.colour,
        position,
        yawRad,
        actor: 'human',
        connection,
        placementType
      }) ?? { ok: false, reason: 'no_snap_target' };
      if (!accepted.ok) return accepted;
    }
    const finalPosition = snap.ok ? snap.transform.position : position;
    const finalYawRad = snap.ok ? snap.transform.yawRad : yawRad;
    brick.position = { ...finalPosition };
    brick.yawRad = finalYawRad;
    delete brick.freeQuaternion;
    brick.heldBy = null;
    brick.ownership = null;
    brick.snapped = Boolean(snap.ok);
    brick.placedTargetId = snap.targetId ?? null;
    brick.placementType = snap.ok ? 'blueprint-target' : placementType;
    brick.connection = connection ? clone(connection) : null;
    this.#bumpRobot('human_placement', {
      brickId,
      actor: 'human',
      placementType: snap.ok ? 'blueprint-target' : placementType,
      targetId: snap.targetId ?? null,
      connection
    });
    return {
      ok: true,
      accepted: true,
      brick: clone(brick),
      snapped: Boolean(snap.ok),
      targetId: snap.targetId ?? null,
      placement: snap.ok ? null : accepted.placement,
      worldRevision: this.worldRevision
    };
  }

  commitHumanDrop({ brickId, position, yawRad = 0 } = {}) {
    if (this.operationBlocked() || this.operationState !== 'idle' || this.pendingMoveCount > 0) {
      return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    }
    if (!position || ![position.xMm, position.yMm, position.zMm, yawRad].every(isFiniteNumber)) {
      return { ok: false, reason: 'invalid_input', worldRevision: this.worldRevision };
    }
    const brick = this.bricks.find((candidate) => candidate.id === brickId);
    if (!brick || brick.heldBy !== 'human') return { ok: false, reason: 'not_holding', worldRevision: this.worldRevision };
    brick.position = { ...position };
    brick.yawRad = yawRad;
    delete brick.freeQuaternion;
    brick.heldBy = null;
    brick.ownership = null;
    brick.snapped = false;
    brick.placedTargetId = null;
    brick.placementType = null;
    brick.connection = null;
    this.#bumpRobot('human_drop', { brickId, actor: 'human' });
    return { ok: true, brick: clone(brick), worldRevision: this.worldRevision };
  }

  cancelHumanCarry(brickId, original) {
    if (this.operationBlocked() || this.operationState !== 'idle' || this.pendingMoveCount > 0) {
      return { ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    }
    const brick = this.bricks.find((candidate) => candidate.id === brickId);
    if (!brick || brick.heldBy !== 'human') return { ok: false, reason: 'not_holding', worldRevision: this.worldRevision };
    brick.position = { ...original.position };
    brick.yawRad = original.yawRad;
    delete brick.freeQuaternion;
    brick.heldBy = null;
    brick.ownership = null;
    brick.snapped = false;
    brick.placedTargetId = null;
    brick.placementType = original.placement?.placementType ?? null;
    brick.connection = original.placement?.connection ? clone(original.placement.connection) : null;
    this.#bumpRobot('human_carry_cancelled', { brickId, actor: 'human' });
    return { ok: true, brick: clone(brick), worldRevision: this.worldRevision };
  }

  updateHeldBrickPose() {
    const brick = this.heldBrick();
    if (!brick || !this.brickInTcp) return;
    const pose = heldBrickWorldPose(this.tcp, this.toolYawRad, this.brickInTcp, this.brickYawInTcpRad);
    brick.position = pose.position;
    brick.yawRad = pose.yawRad;
  }

  validateMoveRequest({ xMm, yMm, zMm, speedMmS, yawRad = undefined, expectedWorldRevision }) {
    if (![xMm, yMm, zMm, speedMmS].every(isFiniteNumber) || speedMmS <= 0) return { ok: false, reason: 'invalid_input' };
    if (yawRad !== undefined && !isFiniteNumber(yawRad)) return { ok: false, reason: 'invalid_input' };
    if (expectedWorldRevision !== undefined && expectedWorldRevision !== this.worldRevision) return { ok: false, reason: 'stale_state', expectedWorldRevision, worldRevision: this.worldRevision };
    if (speedMmS > this.speedLimitMmS) return { ok: false, reason: 'speed_limit', speedLimitMmS: this.speedLimitMmS };
    const target = { xMm, yMm, zMm };
    const workspace = validateWorkspacePoint(target, this.workspace);
    if (!workspace.ok) return workspace;
    const xyTravelMm = Math.hypot(target.xMm - this.tcp.xMm, target.yMm - this.tcp.yMm);
    if (Math.min(target.zMm, this.tcp.zMm) < UR10_GRIPPER.safeLateralZMm && xyTravelMm > UR10_GRIPPER.lowZxyLimitMm) {
      return { ok: false, reason: 'low_height_lateral_move', safeLateralZMm: UR10_GRIPPER.safeLateralZMm, lowZxyLimitMm: UR10_GRIPPER.lowZxyLimitMm };
    }
    return { ok: true, target };
  }

  *planMoveSteps(request) {
    const validation = this.validateMoveRequest(request);
    if (!validation.ok) return validation;
    const startTcp = { ...this.tcp };
    const target = validation.target;
    const startYawRad = this.toolYawRad;
    const targetYawRad = isFiniteNumber(request.yawRad)
      ? wrapPi(request.yawRad)
      : selectAutomaticYaw({
        currentYawRad: startYawRad,
        target,
        heldBrick: this.heldBrick(),
        heldBrickYawInTcpRad: this.brickYawInTcpRad,
        bricks: this.bricks,
        targets: this.board?.getTargets?.() ?? []
      });
    const yawDeltaRad = shortestHalfTurnDelta(startYawRad, targetYawRad);
    const distanceMm = distance3(startTcp, target);
    const releasedBrick = this.releaseClearanceBrickId ? this.bricks.find((brick) => brick.id === this.releaseClearanceBrickId) : null;
    const releaseClearanceMove = Boolean(releasedBrick && target.zMm > startTcp.zMm && Math.hypot(target.xMm - startTcp.xMm, target.yMm - startTcp.yMm) <= 2);
    const ignoreBrickIds = releaseClearanceMove ? [releasedBrick.id] : [];
    const sampleSpacingMm = 6;
    const samples = Math.max(2, Math.ceil(distanceMm / sampleSpacingMm));
    const points = [];
    let priorJoints = Array.from(this.jointsRad);
    let maxPositionErrorMm = 0;
    let maxOrientationErrorRad = 0;
    let maxJointStepRad = 0;

    for (let i = 1; i <= samples; i += 1) {
      const t = i / samples;
      const point = { xMm: startTcp.xMm + (target.xMm - startTcp.xMm) * t, yMm: startTcp.yMm + (target.yMm - startTcp.yMm) * t, zMm: startTcp.zMm + (target.zMm - startTcp.zMm) * t };
      const yawRad = wrapPi(startYawRad + yawDeltaRad * t);
      const workspaceCheck = validateWorkspacePoint(point, this.workspace);
      if (!workspaceCheck.ok) return workspaceCheck;
      const ik = inverseKinematicsPose({
        ...point,
        rotation: toolOrientationForYaw(yawRad, this.definition.fixedToolOrientation)
      }, priorJoints, this.definition, { maxBranchJumpRad: 0.55 });
      if (!ik.ok) return { ok: false, reason: ik.reason, diagnostics: { point, ...ik.diagnostics } };
      const jointStep = Math.max(...ik.jointsRad.map((value, index) => angleDistance(value, priorJoints[index])));
      maxJointStepRad = Math.max(maxJointStepRad, jointStep);
      if (jointStep > 0.55) return { ok: false, reason: 'joint_limit', diagnostics: { cause: 'continuity', jointStepRad: jointStep } };
      const fk = forwardKinematics(ik.jointsRad, this.definition);
      const collision = validateCollision({ tcp: point, jointPositions: [...fk.jointPositions, fk.tcp], heldBrick: this.heldBrick(), bricks: this.bricks, board: this.board, ignoreBrickIds }, this.layout);
      if (!collision.ok) return collision;
      points.push({ t, tcp: { ...fk.tcp }, yawRad, jointsRad: ik.jointsRad, jointPositions: [...fk.jointPositions, fk.tcp] });
      priorJoints = ik.jointsRad;
      maxPositionErrorMm = Math.max(maxPositionErrorMm, ik.positionErrorMm);
      maxOrientationErrorRad = Math.max(maxOrientationErrorRad, ik.orientationErrorRad);
      yield i;
    }

    let motionProfile = profile(distanceMm, request.speedMmS, this.accelerationLimitMmS2);
    let timesMs = points.map((point) => timeAtDistanceMs(point.t * distanceMm, motionProfile));
    let scaleFactor = 1;
    let maxJointSpeedRadS = 0;
    let maxJointAccelerationRadS2 = 0;
    let maxYawSpeedRadS = 0;
    let previousJoints = Array.from(this.jointsRad);
    let previousYawRad = startYawRad;
    let previousTime = 0;
    let previousVelocities = new Array(6).fill(0);
    for (let i = 0; i < points.length; i += 1) {
      const dt = Math.max(1e-6, (timesMs[i] - previousTime) / 1000);
      const velocities = points[i].jointsRad.map((value, joint) => angleDistance(value, previousJoints[joint]) / dt);
      maxYawSpeedRadS = Math.max(maxYawSpeedRadS, angleDistance(points[i].yawRad, previousYawRad) / dt);
      maxJointSpeedRadS = Math.max(maxJointSpeedRadS, ...velocities);
      if (i > 0) {
        const accelerations = velocities.map((value, joint) => Math.abs(value - previousVelocities[joint]) / dt);
        maxJointAccelerationRadS2 = Math.max(maxJointAccelerationRadS2, ...accelerations);
      }
      previousJoints = points[i].jointsRad;
      previousYawRad = points[i].yawRad;
      previousVelocities = velocities;
      previousTime = timesMs[i];
    }
    if (maxJointSpeedRadS > this.jointSpeedLimitRadS) scaleFactor = Math.max(scaleFactor, maxJointSpeedRadS / this.jointSpeedLimitRadS);
    if (maxJointAccelerationRadS2 > this.jointAccelerationLimitRadS2) scaleFactor = Math.max(scaleFactor, Math.sqrt(maxJointAccelerationRadS2 / this.jointAccelerationLimitRadS2));
    if (maxYawSpeedRadS > UR10_GRIPPER.maxYawSpeedRadS) scaleFactor = Math.max(scaleFactor, maxYawSpeedRadS / UR10_GRIPPER.maxYawSpeedRadS);
    if (scaleFactor > 1) timesMs = timesMs.map((value) => value * scaleFactor);
    points.forEach((point, index) => { point.targetElapsedMs = timesMs[index]; });

    return {
      ok: true,
      target,
      distanceMm,
      durationMs: (timesMs.at(-1) ?? 0),
      points,
      diagnostics: {
        samples,
        maxPositionErrorMm,
        maxOrientationErrorRad,
        maxJointStepRad,
        requestedSpeedMmS: request.speedMmS,
        peakTcpSpeedMmS: motionProfile.peakSpeedMmS / scaleFactor,
        accelerationMmS2: motionProfile.accelerationMmS2 / (scaleFactor ** 2),
        estimatedMaxJointSpeedRadS: maxJointSpeedRadS / scaleFactor,
        estimatedMaxJointAccelerationRadS2: maxJointAccelerationRadS2 / (scaleFactor ** 2),
        estimatedMaxYawSpeedRadS: maxYawSpeedRadS / scaleFactor,
        timeScaleFactor: scaleFactor,
        startYawRad,
        targetYawRad
      }
    };
  }

  planMove(request) {
    const steps = this.planMoveSteps(request);
    let result = steps.next();
    while (!result.done) result = steps.next();
    return result.value;
  }

  async planMoveResponsive(request, signal, epoch) {
    const steps = this.planMoveSteps(request);
    let result = steps.next();
    let samplesSinceYield = 0;
    while (!result.done) {
      if (signal?.aborted || epoch !== this.operationEpoch) throw new RobotError('cancelled');
      samplesSinceYield += 1;
      if (samplesSinceYield >= 12) {
        samplesSinceYield = 0;
        if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
        else if (typeof requestAnimationFrame === 'function') await new Promise((resolve) => requestAnimationFrame(resolve));
        else await Promise.resolve();
      }
      result = steps.next();
    }
    return result.value;
  }

  moveTool(request = {}) {
    if (this.operationBlocked(request.operationToken ?? null)) {
      return Promise.reject(new RobotError('operation_in_progress', { worldRevision: this.worldRevision }));
    }
    const queuedEpoch = this.operationEpoch;
    this.pendingMoveCount += 1;
    const run = async () => {
      if (queuedEpoch !== this.operationEpoch) {
        this.pendingMoveCount = Math.max(0, this.pendingMoveCount - 1);
        throw new RobotError('cancelled');
      }
      const validation = this.validateMoveRequest(request);
      if (!validation.ok) throw new RobotError(validation.reason, validation);
      const epoch = queuedEpoch;
      const internalAbort = new AbortController();
      this.activeAbortController = internalAbort;
      const signal = combineSignals(request.signal, internalAbort.signal);
      this.operationState = 'planning';
      this.emit('motion_planning', { target: validation.target });
      try {
        const plan = await this.planMoveResponsive(request, signal, epoch);
        if (!plan.ok) throw new RobotError(plan.reason, plan);
        if (signal?.aborted || epoch !== this.operationEpoch) throw new RobotError('cancelled');
        if (request.expectedWorldRevision !== undefined && request.expectedWorldRevision !== this.worldRevision) throw new RobotError('stale_state', { expectedWorldRevision: request.expectedWorldRevision, worldRevision: this.worldRevision });
        this.moving = true;
        this.operationState = 'moving';
        this.emit('motion_started', { target: plan.target, durationMs: plan.durationMs, diagnostics: plan.diagnostics });
        const startedAt = nowMs();
        let acceptedIndex = -1;
        for (let i = 0; i < plan.points.length; i += 1) {
          if (signal?.aborted || epoch !== this.operationEpoch) throw new RobotError('cancelled', { acceptedIndex });
          const point = plan.points[i];
          if (this.timeScale > 0) {
            const targetElapsed = point.targetElapsedMs * this.timeScale;
            while (true) {
              if (signal?.aborted || epoch !== this.operationEpoch) throw new RobotError('cancelled', { acceptedIndex });
              const wait = targetElapsed - (nowMs() - startedAt);
              if (wait <= 0) break;
              await new Promise((resolve) => setTimeout(resolve, Math.min(16, wait)));
            }
          }
          const currentFk = forwardKinematics(point.jointsRad, this.definition);
          const liveCollision = validateCollision({ tcp: point.tcp, jointPositions: [...currentFk.jointPositions, currentFk.tcp], heldBrick: this.heldBrick(), bricks: this.bricks, board: this.board, ignoreBrickIds: this.releaseClearanceBrickId && plan.target.zMm > this.tcp.zMm && Math.hypot(plan.target.xMm - this.tcp.xMm, plan.target.yMm - this.tcp.yMm) <= 2 ? [this.releaseClearanceBrickId] : [] }, this.layout);
          if (!liveCollision.ok) throw new RobotError(liveCollision.reason, liveCollision);
          this.tcp = { ...point.tcp };
          this.toolYawRad = point.yawRad;
          this.jointsRad = Array.from(point.jointsRad);
          this.updateHeldBrickPose();
          acceptedIndex = i;
          this.#bumpRobot('motion_sample', { sampleIndex: i, sampleCount: plan.points.length });
          if (this.timeScale === 0) await Promise.resolve();
        }
        this.moving = false;
        this.operationState = 'idle';
        if (this.releaseClearanceBrickId) {
          const released = this.bricks.find((brick) => brick.id === this.releaseClearanceBrickId);
          if (!released || this.tcp.zMm >= released.position.zMm + 45) this.releaseClearanceBrickId = null;
        }
        this.emit('motion_completed', { diagnostics: plan.diagnostics });
        return { ok: true, accepted: this.getState(), diagnostics: plan.diagnostics, appliedSpeedMmS: plan.diagnostics.peakTcpSpeedMmS, durationMs: plan.durationMs };
      } catch (error) {
        this.moving = false;
        this.operationState = 'idle';
        if (error instanceof RobotError && error.code === 'cancelled') this.emit('motion_cancelled', error.details);
        else this.emit('motion_rejected', { reason: error.code ?? 'internal_error', details: error.details ?? {} });
        throw error;
      } finally {
        this.pendingMoveCount = Math.max(0, this.pendingMoveCount - 1);
        if (this.activeAbortController === internalAbort) this.activeAbortController = null;
      }
    };
    this.operation = this.operation.then(run, run);
    return this.operation;
  }

  async latch({ expectedWorldRevision, actor = 'agent', operationToken = null } = {}) {
    if (this.operationBlocked(operationToken) || this.operationState !== 'idle' || this.pendingMoveCount > 0) return { success: false, ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    if (expectedWorldRevision !== undefined && expectedWorldRevision !== this.worldRevision) return { success: false, ok: false, reason: 'stale_state', expectedWorldRevision, worldRevision: this.worldRevision };
    const candidate = findLatchCandidate(this.tcp, this.bricks, this.heldBrickId);
    if (!candidate.ok) return { success: false, ok: false, reason: candidate.reason, robotRevision: this.robotRevision, worldRevision: this.worldRevision };
    const brick = candidate.brick;
    const requiredYawRad = brick.yawRad + Math.PI / 2;
    const yawErrorRad = Math.abs(shortestHalfTurnDelta(this.toolYawRad, requiredYawRad));
    if (yawErrorRad > BRICK_SPEC.capture.yawToleranceRad) {
      return { success: false, ok: false, reason: 'orientation_not_aligned', yawErrorRad, robotRevision: this.robotRevision, worldRevision: this.worldRevision };
    }
    this.brickInTcp = captureBrickInTcp(this.tcp, this.toolYawRad, brick.position);
    this.brickYawInTcpRad = wrapPi(brick.yawRad - this.toolYawRad);
    brick.heldBy = actor === 'human' ? 'human' : 'robot';
    delete brick.freeQuaternion;
    brick.ownership = brick.heldBy;
    brick.snapped = false;
    brick.placedTargetId = null;
    this.heldBrickId = brick.id;
    this.jawGapMm = UR10_GRIPPER.contactGapMm;
    this.jawState = 'holding';
    this.updateHeldBrickPose();
    this.#bumpRobot('latched', { brickId: brick.id, actor });
    return { success: true, ok: true, brickId: brick.id, captureOffset: candidate.captureOffset, yawErrorRad, robotRevision: this.robotRevision, worldRevision: this.worldRevision, reason: null };
  }

  async unlatch({
    expectedWorldRevision,
    actor = 'agent',
    operationToken = null,
    supportBrickId = null,
    supportSide = 'M',
    carriedSide = null,
    placementPosition = null,
    placementYawRad = null
  } = {}) {
    if (this.operationBlocked(operationToken) || this.operationState !== 'idle' || this.pendingMoveCount > 0) return { success: false, ok: false, reason: 'operation_in_progress', worldRevision: this.worldRevision };
    if (expectedWorldRevision !== undefined && expectedWorldRevision !== this.worldRevision) return { success: false, ok: false, reason: 'stale_state', expectedWorldRevision, worldRevision: this.worldRevision };
    if (!this.heldBrickId) return { success: false, ok: false, reason: 'not_holding', robotRevision: this.robotRevision, worldRevision: this.worldRevision };
    const brick = this.heldBrick();
    const position = { ...brick.position };
    const requestedPosition = placementPosition && [placementPosition.xMm, placementPosition.yMm, placementPosition.zMm].every(isFiniteNumber)
      ? { ...placementPosition }
      : position;
    const requestedYawRad = isFiniteNumber(placementYawRad) ? placementYawRad : brick.yawRad;
    if (placementPosition && distance3(position, requestedPosition) > 2) {
      return { success: false, ok: false, reason: 'placement_pose_mismatch', heldBrickId: brick.id, robotRevision: this.robotRevision, worldRevision: this.worldRevision };
    }
    if (isFiniteNumber(placementYawRad) && Math.abs(shortestHalfTurnDelta(brick.yawRad, requestedYawRad)) > 2 * Math.PI / 180) {
      return { success: false, ok: false, reason: 'placement_pose_mismatch', heldBrickId: brick.id, robotRevision: this.robotRevision, worldRevision: this.worldRevision };
    }
    if (this.placementAuthority) {
      const placement = this.placementAuthority.commit({
        brickId: brick.id,
        position: requestedPosition,
        yawRad: requestedYawRad,
        actor,
        supportBrickId,
        supportSide,
        carriedSide
      });
      if (!placement.ok) {
        return { success: false, ok: false, reason: placement.reason, heldBrickId: brick.id, robotRevision: this.robotRevision, worldRevision: this.worldRevision };
      }
      brick.position = { ...placement.position };
      brick.yawRad = placement.yawRad;
      brick.heldBy = null;
      brick.ownership = null;
      delete brick.freeQuaternion;
      brick.snapped = placement.snapped;
      brick.placedTargetId = placement.targetId;
      brick.placementType = placement.placementType;
      brick.connection = placement.connections?.length > 1
        ? { groups: clone(placement.connections) }
        : placement.connection ? clone(placement.connection) : null;
      this.heldBrickId = null;
      this.jawGapMm = UR10_GRIPPER.openGapMm;
      this.jawState = 'open';
      this.brickInTcp = null;
      this.brickYawInTcpRad = 0;
      this.releaseClearanceBrickId = brick.id;
      this.#bumpRobot('unlatched', { brickId: brick.id, snap: placement, actor }, { bumpWorld: false });
      return {
        success: true,
        ok: true,
        brickId: brick.id,
        finalPosition: { ...brick.position },
        snapped: placement.snapped,
        targetId: placement.targetId,
        correctness: placement.correctness,
        placementType: placement.placementType,
        connection: brick.connection ? clone(brick.connection) : null,
        reason: null,
        robotRevision: this.robotRevision,
        worldRevision: this.worldRevision
      };
    }
    const snap = this.board?.trySnapBrick({ brickId: brick.id, colour: brick.colour, position, yawRad: brick.yawRad, actor }) ?? { ok: false, reason: 'no_snap_target' };
    if (!snap.ok && ['target_occupied', 'wrong_colour'].includes(snap.reason)) return { success: false, ok: false, reason: snap.reason, targetId: snap.targetId ?? null, heldBrickId: brick.id, robotRevision: this.robotRevision, worldRevision: this.worldRevision };
    brick.heldBy = null;
    brick.ownership = null;
    delete brick.freeQuaternion;
    if (snap.ok) {
      brick.position = { ...snap.transform.position };
      brick.yawRad = snap.transform.yawRad;
      brick.placedTargetId = snap.targetId;
      brick.placementType = 'blueprint-target';
      brick.connection = null;
      brick.snapped = true;
    } else {
      brick.snapped = false;
      brick.placedTargetId = null;
      brick.placementType = null;
      brick.connection = null;
    }
    this.heldBrickId = null;
    this.jawGapMm = UR10_GRIPPER.openGapMm;
    this.jawState = 'open';
    this.brickInTcp = null;
    this.brickYawInTcpRad = 0;
    if (snap.ok) this.releaseClearanceBrickId = brick.id;
    this.#bumpRobot('unlatched', { brickId: brick.id, snap, actor });
    return { success: true, ok: true, brickId: brick.id, finalPosition: { ...brick.position }, snapped: Boolean(snap.ok), targetId: snap.targetId ?? null, correctness: Boolean(snap.correctness), reason: snap.ok ? null : (snap.reason ?? 'no_snap_target'), robotRevision: this.robotRevision, worldRevision: this.worldRevision };
  }

  async reset({ bricks = null } = {}) {
    this.operationEpoch += 1;
    this.exclusiveOperationToken = null;
    this.exclusiveOperationLabel = null;
    this.activeAbortController?.abort(new DOMException('Reset requested', 'AbortError'));
    try { await this.operation; } catch { /* cancellation/rejection is expected before reset */ }
    this.operationState = 'resetting';
    this.moving = false;
    this.jointsRad = Array.from(this.definition.homeJointsRad);
    const fk = forwardKinematics(this.jointsRad, this.definition);
    this.tcp = { ...fk.tcp };
    this.heldBrickId = null;
    this.toolYawRad = 0;
    this.jawGapMm = UR10_GRIPPER.openGapMm;
    this.jawState = 'open';
    this.brickInTcp = null;
    this.brickYawInTcpRad = 0;
    this.releaseClearanceBrickId = null;
    if (bricks) this.bricks = clone(bricks);
    for (const brick of this.bricks) {
      brick.heldBy = null;
      delete brick.freeQuaternion;
      brick.ownership = null;
      brick.placedTargetId = null;
      brick.placementType = null;
      brick.connection = null;
      brick.snapped = false;
    }
    this.board?.reset?.();
    this.operationState = 'idle';
    this.#bumpRobot('reset');
    return this.getState();
  }
}
