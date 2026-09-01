import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { RobotError } from './controller.js';

const clone = (value) => structuredClone(value);
const distance3 = (a, b) => Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm);

function combineAbortSignals(external, internal) {
  if (!external) return internal;
  if (external.aborted) internal.abort(external.reason);
  else external.addEventListener('abort', () => internal.abort(external.reason), { once: true });
  return internal;
}

export class FastPlacementCoordinator {
  constructor({ controller, placementAuthority, workcellProfile }) {
    if (!controller || !placementAuthority || !workcellProfile) {
      throw new TypeError('controller, placementAuthority, and workcellProfile are required');
    }
    this.controller = controller;
    this.placementAuthority = placementAuthority;
    this.workcellProfile = workcellProfile;
    this.proposal = null;
    this.listeners = new Set();
    this.activeAbortController = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  emit() {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  availableBricks() {
    return this.controller.getBricks()
      .filter((brick) => !brick.heldBy && !brick.snapped && !brick.placedTargetId && !brick.placementType && brick.graspable !== false)
      .filter((brick) => brick.reachability?.reachable !== false)
      .map((brick) => ({ id: brick.id, colour: brick.colour, position: clone(brick.position), yawRad: brick.yawRad ?? 0 }));
  }

  preview({ brickId = null, position = null, yawRad = 0, supportBrickId = null, supportSide = 'M', carriedSide = null } = {}) {
    const revisionBefore = this.controller.getState().worldRevision;
    const brick = this.availableBricks().find((candidate) => candidate.id === brickId) ?? this.availableBricks()[0];
    const validPosition = position && [position.xMm, position.yMm, position.zMm].every(Number.isFinite);
    if (!brick || (!validPosition && !supportBrickId) || !Number.isFinite(yawRad)) {
      this.proposal = {
        status: 'INVALID',
        reason: brick ? 'invalid_input' : 'no_reachable_brick',
        expectedWorldRevision: revisionBefore,
        brickId: brick?.id ?? null,
        requestedPosition: validPosition ? clone(position) : null,
        yawRad
      };
      this.emit();
      return this.getState();
    }
    const preview = this.placementAuthority.preview({ brickId: brick.id, position: validPosition ? position : null, yawRad, supportBrickId, supportSide, carriedSide });
    if (this.controller.getState().worldRevision !== revisionBefore) {
      throw new Error('Placement preview mutated authoritative world state');
    }
    const candidatePosition = preview.candidate?.position ?? position ?? brick.position;
    const pickupTcp = {
      xMm: brick.position.xMm,
      yMm: brick.position.yMm,
      zMm: brick.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm
    };
    const requiredTcp = preview.requiredTcp ?? {
      xMm: candidatePosition.xMm,
      yMm: candidatePosition.yMm,
      zMm: candidatePosition.zMm + BRICK_SPEC.capture.tcpAboveCentreMm
    };
    const clearanceZMm = this.workcellProfile.safeClearanceZMm;
    const currentTcp = this.controller.getState().tcp;
    const approximatePhysicalDistanceMm = distance3(currentTcp, { ...pickupTcp, zMm: clearanceZMm })
      + Math.abs(clearanceZMm - pickupTcp.zMm) * 2
      + Math.hypot(requiredTcp.xMm - pickupTcp.xMm, requiredTcp.yMm - pickupTcp.yMm)
      + Math.abs(clearanceZMm - requiredTcp.zMm) * 2;
    this.proposal = {
      status: preview.ok ? 'VALID' : 'INVALID',
      reason: preview.ok ? null : preview.reason,
      expectedWorldRevision: revisionBefore,
      brickId: brick.id,
      brick,
      requestedPosition: validPosition ? clone(position) : null,
      yawRad,
      preview: clone(preview),
      candidate: preview.candidate ? clone(preview.candidate) : null,
      pickupTcp,
      requiredTcp,
      clearanceZMm,
      approximatePhysicalDistanceMm
    };
    this.emit();
    return this.getState();
  }

  cancel() {
    if (this.activeAbortController) {
      this.activeAbortController.abort(new DOMException('Fast placement cancelled', 'AbortError'));
      return { ok: true, cancelledExecution: true };
    }
    const hadProposal = Boolean(this.proposal);
    this.proposal = null;
    this.emit();
    return { ok: true, cancelledProposal: hadProposal };
  }

  getState() {
    if (!this.proposal) return { status: 'NONE', proposal: null, running: Boolean(this.activeAbortController) };
    const stale = this.proposal.status !== 'EXECUTING'
      && this.proposal.expectedWorldRevision !== this.controller.getState().worldRevision;
    return {
      status: stale ? 'STALE' : this.proposal.status,
      reason: stale ? 'stale_state' : this.proposal.reason,
      proposal: clone(this.proposal),
      running: Boolean(this.activeAbortController)
    };
  }

  getRenderPreview() {
    const state = this.getState();
    const proposal = state.proposal;
    if (!proposal || state.status === 'EXECUTING') return null;
    const candidate = proposal.candidate ?? {};
    const position = candidate.position ?? proposal.requestedPosition;
    if (!position) return null;
    return {
      ...candidate,
      type: candidate.type ?? candidate.placementType ?? 'MAT',
      status: state.status === 'VALID' ? 'VALID' : state.status,
      valid: state.status === 'VALID',
      previewPosition: clone(position),
      previewYawRad: candidate.yawRad ?? proposal.yawRad ?? 0,
      carriedBrickId: proposal.brickId,
      proposal: true
    };
  }

  async execute({ physicalSpeedMmS = 650, playbackMultiplier = 20, signal = null } = {}) {
    const executionStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const state = this.getState();
    if (state.status !== 'VALID') return { ok: false, reason: state.reason ?? 'proposal_required' };
    if (!Number.isFinite(physicalSpeedMmS) || physicalSpeedMmS <= 0 || physicalSpeedMmS > this.controller.speedLimitMmS) {
      return { ok: false, reason: 'speed_limit', speedLimitMmS: this.controller.speedLimitMmS };
    }
    const rate = this.controller.setSimulationPlaybackMultiplier(playbackMultiplier);
    if (!rate.ok) return rate;
    if (state.proposal.expectedWorldRevision !== this.controller.getState().worldRevision) {
      return { ok: false, reason: 'stale_state', worldRevision: this.controller.getState().worldRevision };
    }
    const lease = this.controller.beginExclusiveOperation('fast-placement');
    if (!lease.ok) return lease;
    const proposal = this.proposal;
    const abortController = combineAbortSignals(signal, new AbortController());
    this.activeAbortController = abortController;
    this.proposal = { ...proposal, status: 'EXECUTING', reason: null };
    this.emit();
    const stages = [];
    let physicalDurationMs = 0;
    const move = async (stage, target, speed = physicalSpeedMmS) => {
      const result = await this.controller.moveTool({
        ...target,
        speedMmS: Math.min(speed, physicalSpeedMmS),
        expectedWorldRevision: this.controller.getState().worldRevision,
        operationToken: lease.token,
        signal: abortController.signal
      });
      stages.push({ stage, durationMs: result.durationMs, diagnostics: result.diagnostics });
      physicalDurationMs += result.durationMs;
      return result;
    };
    const pickupTcp = proposal.pickupTcp;
    const targetTcp = proposal.requiredTcp;
    const pickupApproach = { ...pickupTcp, zMm: proposal.clearanceZMm };
    const targetApproach = { ...targetTcp, zMm: proposal.clearanceZMm };
    try {
      await move('pickup_approach', pickupApproach);
      await move('pickup_descend', pickupTcp, Math.min(physicalSpeedMmS, 420));
      const capture = await this.controller.latch({
        actor: 'agent',
        expectedWorldRevision: this.controller.getState().worldRevision,
        operationToken: lease.token
      });
      if (!capture.ok) throw new RobotError(capture.reason, capture);
      stages.push({ stage: 'latch', brickId: capture.brickId });
      const heldYawOffset = this.controller.getState().gripper?.brickYawInTcpRad;
      const desiredBrickYawRad = proposal.candidate?.yawRad ?? proposal.yawRad ?? 0;
      const targetToolYawRad = Number.isFinite(heldYawOffset) ? desiredBrickYawRad - heldYawOffset : undefined;
      const orientedTargetApproach = Number.isFinite(targetToolYawRad)
        ? { ...targetApproach, yawRad: targetToolYawRad }
        : targetApproach;
      const orientedTargetTcp = Number.isFinite(targetToolYawRad)
        ? { ...targetTcp, yawRad: targetToolYawRad }
        : targetTcp;
      await move('pickup_lift', pickupApproach);
      await move('target_transfer', orientedTargetApproach);
      await move('target_descend', orientedTargetTcp, Math.min(physicalSpeedMmS, 420));
      const release = await this.controller.unlatch({
        actor: 'agent',
        expectedWorldRevision: this.controller.getState().worldRevision,
        operationToken: lease.token
      });
      if (!release.ok) throw new RobotError(release.reason, release);
      stages.push({ stage: 'unlatch', placementType: release.placementType, targetId: release.targetId });
      await move('target_retreat', orientedTargetApproach);
      this.proposal = null;
      this.emit();
      return {
        ok: true,
        brickId: proposal.brickId,
        finalPosition: release.finalPosition,
        placementType: release.placementType,
        targetId: release.targetId,
        physicalDurationMs,
        playbackDurationMs: physicalDurationMs / playbackMultiplier,
        executionWallDurationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - executionStartedAt,
        playbackMultiplier,
        physicalSpeedMmS,
        stages,
        worldRevision: this.controller.getState().worldRevision
      };
    } catch (error) {
      const reason = error?.code ?? (abortController.signal.aborted ? 'cancelled' : 'internal_error');
      this.proposal = { ...proposal, status: reason === 'stale_state' ? 'STALE' : 'INVALID', reason };
      this.emit();
      return { ok: false, reason, details: error?.details ?? {}, stages, worldRevision: this.controller.getState().worldRevision };
    } finally {
      this.activeAbortController = null;
      this.controller.endExclusiveOperation(lease.token);
      this.emit();
    }
  }
}
