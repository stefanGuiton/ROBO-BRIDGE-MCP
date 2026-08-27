import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { findLatchCandidate } from '../bricks/latch.js';
import { validateCollision } from './collision.js';
import { forwardKinematics, inverseKinematics } from './kinematics.js';
import { angleDistance, distance3, isFiniteNumber } from './math.js';
import { CHALLENGE_LAYOUT, CHALLENGE_WORKSPACE, UR10_DEFINITION } from './ur10-definition.js';
import { validateWorkspacePoint } from './workspace.js';

const clone = (value) => structuredClone(value);

export class RobotError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'RobotError';
    this.code = code;
    this.details = details;
  }
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function approachForPoint(point, layout) {
  const nearPickup = Math.hypot(point.xMm - layout.pickupTcp.xMm, point.yMm - layout.pickupTcp.yMm) < 20;
  if (nearPickup) return 'pickup';
  const nearTarget = Math.hypot(point.xMm - layout.targetTcp.xMm, point.yMm - layout.targetTcp.yMm) < 24;
  if (nearTarget) return 'target';
  return null;
}

export class RobotController {
  constructor({
    definition = UR10_DEFINITION,
    workspace = CHALLENGE_WORKSPACE,
    layout = CHALLENGE_LAYOUT,
    speedLimitMmS = 650,
    timeScale = 1,
    board = null,
    bricks = []
  } = {}) {
    this.definition = definition;
    this.workspace = workspace;
    this.layout = layout;
    this.speedLimitMmS = speedLimitMmS;
    this.timeScale = timeScale;
    this.board = board;
    this.bricks = bricks;
    this.listeners = new Set();
    this.worldRevision = 0;
    this.robotRevision = 0;
    this.jointsRad = Array.from(definition.homeJointsRad);
    const fk = forwardKinematics(this.jointsRad, definition);
    if (!fk.ok) throw new Error('Invalid configured home joints');
    this.tcp = { ...fk.tcp };
    this.moving = false;
    this.heldBrickId = null;
    this.operation = Promise.resolve();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({ type: 'initial', state: this.getState() });
    return () => this.listeners.delete(listener);
  }

  emit(type, details = {}) {
    const event = { type, ...details, state: this.getState(), worldRevision: this.worldRevision };
    for (const listener of this.listeners) listener(event);
  }

  getState() {
    return {
      tcp: { ...this.tcp },
      toolOrientation: 'fixed-down',
      jointsRad: Array.from(this.jointsRad),
      speedLimitMmS: this.speedLimitMmS,
      moving: this.moving,
      heldBrickId: this.heldBrickId,
      robotRevision: this.robotRevision,
      worldRevision: this.worldRevision
    };
  }

  getWorkspace() {
    return clone(this.workspace);
  }

  getBricks() {
    return clone(this.bricks);
  }

  setBricks(bricks) {
    this.bricks = bricks;
    this.heldBrickId = null;
    this.worldRevision += 1;
    this.emit('world_reset');
  }

  placedBricks() {
    return this.bricks.filter((brick) => brick.snapped || brick.placedTargetId);
  }

  heldBrick() {
    return this.heldBrickId ? this.bricks.find((brick) => brick.id === this.heldBrickId) ?? null : null;
  }

  updateHeldBrickPose() {
    const brick = this.heldBrick();
    if (!brick) return;
    brick.position = {
      xMm: this.tcp.xMm,
      yMm: this.tcp.yMm,
      zMm: this.tcp.zMm - BRICK_SPEC.capture.tcpAboveCentreMm
    };
  }

  validateMoveRequest({ xMm, yMm, zMm, speedMmS }) {
    if (![xMm, yMm, zMm, speedMmS].every(isFiniteNumber) || speedMmS <= 0) {
      return { ok: false, reason: 'invalid_input' };
    }
    if (speedMmS > this.speedLimitMmS) {
      return { ok: false, reason: 'speed_limit', speedLimitMmS: this.speedLimitMmS };
    }
    const target = { xMm, yMm, zMm };
    const workspace = validateWorkspacePoint(target, this.workspace);
    if (!workspace.ok) return workspace;
    return { ok: true, target };
  }

  *planMoveSteps({ xMm, yMm, zMm, speedMmS }) {
    const request = this.validateMoveRequest({ xMm, yMm, zMm, speedMmS });
    if (!request.ok) return request;
    const target = request.target;
    const distanceMm = distance3(this.tcp, target);
    const sampleSpacingMm = 12;
    const samples = Math.max(2, Math.ceil(distanceMm / sampleSpacingMm));
    const points = [];
    let priorJoints = Array.from(this.jointsRad);
    let maxPositionErrorMm = 0;
    let maxOrientationErrorRad = 0;
    let maxJointStepRad = 0;

    for (let i = 1; i <= samples; i += 1) {
      const t = i / samples;
      const point = {
        xMm: this.tcp.xMm + (target.xMm - this.tcp.xMm) * t,
        yMm: this.tcp.yMm + (target.yMm - this.tcp.yMm) * t,
        zMm: this.tcp.zMm + (target.zMm - this.tcp.zMm) * t
      };
      const workspaceCheck = validateWorkspacePoint(point, this.workspace);
      if (!workspaceCheck.ok) return workspaceCheck;
      const ik = inverseKinematics(point, priorJoints, this.definition, { maxBranchJumpRad: 0.55 });
      if (!ik.ok) return { ok: false, reason: ik.reason, diagnostics: { point, ...ik.diagnostics } };
      const jointStep = Math.max(...ik.jointsRad.map((value, index) => angleDistance(value, priorJoints[index])));
      maxJointStepRad = Math.max(maxJointStepRad, jointStep);
      if (jointStep > 0.55) return { ok: false, reason: 'joint_limit', diagnostics: { cause: 'continuity', jointStepRad: jointStep } };
      const collision = validateCollision({
        tcp: point,
        heldBrick: this.heldBrick(),
        placedBricks: this.placedBricks(),
        approach: approachForPoint(point, this.layout)
      }, this.layout);
      if (!collision.ok) return collision;
      points.push({ t, tcp: point, jointsRad: ik.jointsRad });
      priorJoints = ik.jointsRad;
      maxPositionErrorMm = Math.max(maxPositionErrorMm, ik.positionErrorMm);
      maxOrientationErrorRad = Math.max(maxOrientationErrorRad, ik.orientationErrorRad);
      yield i;
    }
    return {
      ok: true,
      target,
      distanceMm,
      durationMs: distanceMm / speedMmS * 1000,
      points,
      diagnostics: { samples, maxPositionErrorMm, maxOrientationErrorRad, maxJointStepRad }
    };
  }

  planMove(request) {
    const steps = this.planMoveSteps(request);
    let result = steps.next();
    while (!result.done) result = steps.next();
    return result.value;
  }

  async planMoveResponsive(request) {
    const steps = this.planMoveSteps(request);
    let result = steps.next();
    let processed = 0;
    while (!result.done) {
      processed += 1;
      if (processed % 1 === 0) {
        if (globalThis.scheduler?.yield) {
          await globalThis.scheduler.yield();
        } else if (typeof requestAnimationFrame === 'function') {
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        } else {
          await Promise.resolve();
        }
      }
      result = steps.next();
    }
    return result.value;
  }

  moveTool(request = {}) {
    const run = async () => {
      const { signal } = request;
      const plan = await this.planMoveResponsive(request);
      if (!plan.ok) throw new RobotError(plan.reason, plan);
      if (signal?.aborted) throw new RobotError('cancelled');
      this.moving = true;
      this.emit('motion_started', { target: plan.target, durationMs: plan.durationMs });
      const durationMs = plan.durationMs * this.timeScale;
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      let acceptedIndex = -1;

      for (let i = 0; i < plan.points.length; i += 1) {
        if (signal?.aborted) {
          this.moving = false;
          this.emit('motion_cancelled', { acceptedIndex });
          throw new RobotError('cancelled', { acceptedIndex });
        }
        const point = plan.points[i];
        if (durationMs > 0) {
          const targetElapsed = smoothstep(point.t) * durationMs;
          while (true) {
            if (signal?.aborted) {
              this.moving = false;
              this.emit('motion_cancelled', { acceptedIndex });
              throw new RobotError('cancelled', { acceptedIndex });
            }
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const wait = targetElapsed - (now - startedAt);
            if (wait <= 0) break;
            await new Promise((resolve) => setTimeout(resolve, Math.min(16, wait)));
          }
        }
        this.tcp = { ...point.tcp };
        this.jointsRad = Array.from(point.jointsRad);
        this.robotRevision += 1;
        this.worldRevision += 1;
        acceptedIndex = i;
        this.updateHeldBrickPose();
        this.emit('motion_sample', { sampleIndex: i, sampleCount: plan.points.length });
        if (durationMs === 0) await Promise.resolve();
      }

      this.moving = false;
      this.emit('motion_completed', { diagnostics: plan.diagnostics });
      return { ok: true, accepted: this.getState(), diagnostics: plan.diagnostics };
    };
    this.operation = this.operation.then(run, run);
    return this.operation;
  }

  latch() {
    if (this.moving) return { success: false, reason: 'invalid_input', robotRevision: this.robotRevision, worldRevision: this.worldRevision };
    const candidate = findLatchCandidate(this.tcp, this.bricks, this.heldBrickId);
    if (!candidate.ok) return { success: false, reason: candidate.reason, robotRevision: this.robotRevision, worldRevision: this.worldRevision };
    const brick = candidate.brick;
    brick.heldBy = 'robot';
    brick.snapped = false;
    brick.placedTargetId = null;
    this.heldBrickId = brick.id;
    this.robotRevision += 1;
    this.worldRevision += 1;
    this.updateHeldBrickPose();
    this.emit('latched', { brickId: brick.id });
    return {
      success: true,
      brickId: brick.id,
      captureOffset: candidate.captureOffset,
      robotRevision: this.robotRevision,
      worldRevision: this.worldRevision,
      reason: null
    };
  }

  unlatch() {
    if (!this.heldBrickId) {
      return { success: false, reason: 'not_holding', robotRevision: this.robotRevision, worldRevision: this.worldRevision };
    }
    const brick = this.heldBrick();
    brick.heldBy = null;
    const position = { ...brick.position };
    let snap = null;
    if (this.board) snap = this.board.trySnapBrick({ brickId: brick.id, colour: brick.colour, position, yawRad: brick.yawRad });
    if (snap?.ok) {
      brick.position = { ...snap.transform.position };
      brick.yawRad = snap.transform.yawRad;
      brick.placedTargetId = snap.targetId;
      brick.snapped = true;
    } else {
      brick.snapped = false;
      brick.placedTargetId = null;
    }
    this.heldBrickId = null;
    this.robotRevision += 1;
    this.worldRevision += 1;
    this.emit('unlatched', { brickId: brick.id, snap });
    return {
      success: true,
      brickId: brick.id,
      finalPosition: { ...brick.position },
      snapped: Boolean(snap?.ok),
      targetId: snap?.targetId ?? null,
      reason: snap?.ok ? null : (snap?.reason ?? 'no_snap_target'),
      robotRevision: this.robotRevision,
      worldRevision: this.worldRevision
    };
  }

  reset({ bricks = null } = {}) {
    this.jointsRad = Array.from(this.definition.homeJointsRad);
    const fk = forwardKinematics(this.jointsRad, this.definition);
    this.tcp = { ...fk.tcp };
    this.moving = false;
    this.heldBrickId = null;
    this.robotRevision += 1;
    this.worldRevision += 1;
    if (bricks) this.bricks = bricks;
    for (const brick of this.bricks) {
      brick.heldBy = null;
      brick.placedTargetId = null;
      brick.snapped = false;
    }
    this.board?.reset?.();
    this.emit('reset');
    return this.getState();
  }
}
