import { FastPlacementCoordinator } from './fast-placement.js';

const clone = (value) => structuredClone(value);
const MAX_LOOKAHEAD = 5;
const distance3 = (a, b) => Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm);

function finitePosition(position) {
  return Boolean(position) && [position.xMm, position.yMm, position.zMm].every(Number.isFinite);
}

function requestedDestination(proposal) {
  return {
    brickId: proposal.requestedBrickId,
    colour: proposal.requestedColour,
    position: proposal.requestedPosition ? clone(proposal.requestedPosition) : null,
    yawRad: proposal.yawRad,
    supportBrickId: proposal.supportBrickId,
    supportSide: proposal.supportSide,
    carriedSide: proposal.carriedSide
  };
}

export class PlacementLookaheadCoordinator extends FastPlacementCoordinator {
  constructor(options) {
    super(options);
    this.queue = [];
    this.cacheId = null;
    this.cacheSequence = 0;
    this.proposalSequence = 0;
    this.lastPlanningDurationMs = 0;
    this.suppressEmit = false;
    this.repairing = false;
    this.unsubscribeLookahead = this.controller.subscribe((event) => {
      if (!['initial', 'exclusive_operation_completed'].includes(event.type)
        && !this.activeAbortController && this.queue.length && !this.repairing) {
        this.repairQueue(event.type);
      }
    });
  }

  emit() {
    if (this.suppressEmit) return;
    if (this.queue?.length && this.proposal) this.queue[0] = this.proposal;
    super.emit();
  }

  getState() {
    const base = super.getState();
    const worldRevision = this.controller.getState().worldRevision;
    const queue = (this.queue ?? []).map((proposal, index) => {
      const stale = proposal.status !== 'EXECUTING' && proposal.expectedWorldRevision !== worldRevision;
      return {
        ...clone(proposal),
        slotIndex: index,
        slotLabel: String.fromCharCode(65 + index),
        status: stale ? 'STALE' : proposal.status,
        reason: stale ? 'stale_state' : proposal.reason
      };
    });
    return {
      ...base,
      cacheId: this.cacheId,
      queue,
      queueLength: queue.length,
      maximumLookahead: MAX_LOOKAHEAD,
      planningDurationMs: this.lastPlanningDurationMs,
      worldRevision
    };
  }

  selectSource(destination, reserved, anchor, previous = null) {
    const free = this.availableBricks().filter((brick) => !reserved.has(brick.id));
    const colourMatched = destination.colour
      ? free.filter((brick) => brick.colour === destination.colour)
      : free;
    const preferred = colourMatched.find((brick) => brick.id === destination.brickId);
    if (preferred) return preferred;
    const fallbackAnchor = previous?.brick?.position ?? anchor;
    const target = finitePosition(destination.position) ? destination.position : anchor;
    return colourMatched
      .map((brick) => ({
        brick,
        cost: distance3(fallbackAnchor, brick.position) + distance3(brick.position, target) * 0.35
      }))
      .sort((a, b) => a.cost - b.cost || a.brick.id.localeCompare(b.brick.id))[0]?.brick ?? null;
  }

  trajectoryFor(proposal, anchor) {
    if (!proposal.pickupTcp || !proposal.requiredTcp) return null;
    const safeZ = Math.max(
      proposal.clearanceZMm,
      proposal.pickupTcp.zMm + 24,
      proposal.requiredTcp.zMm + 24
    );
    const sourceApproach = { ...proposal.pickupTcp, zMm: safeZ };
    const targetApproach = { ...proposal.requiredTcp, zMm: safeZ };
    const waypoints = [
      { stage: 'source_approach', action: 'move', tcp: clone(sourceApproach) },
      { stage: 'source_descend', action: 'move', tcp: clone(proposal.pickupTcp) },
      { stage: 'capture', action: 'latch', brickId: proposal.brickId },
      { stage: 'source_lift', action: 'move', tcp: clone(sourceApproach) },
      { stage: 'transfer', action: 'move', tcp: clone(targetApproach) },
      { stage: 'target_descend', action: 'move', tcp: clone(proposal.requiredTcp) },
      { stage: 'release', action: 'unlatch' },
      { stage: 'target_retreat', action: 'move', tcp: clone(targetApproach) }
    ];
    return {
      shape: 'staple-up-across-down',
      safeZMm: safeZ,
      startTcp: clone(anchor),
      endTcp: clone(targetApproach),
      waypoints
    };
  }

  planInternal(destinations, previousQueue = []) {
    const revisionBefore = this.controller.getState().worldRevision;
    const reserved = new Set();
    const planned = [];
    let anchor = this.controller.getState().tcp;
    this.suppressEmit = true;
    try {
      for (let index = 0; index < destinations.length; index += 1) {
        const destination = destinations[index] ?? {};
        const previous = previousQueue[index] ?? null;
        const source = this.selectSource(destination, reserved, anchor, previous);
        super.preview({
          brickId: source?.id ?? '__no_source__',
          position: finitePosition(destination.position) ? destination.position : null,
          yawRad: Number(destination.yawRad ?? 0),
          supportBrickId: destination.supportBrickId ?? null,
          supportSide: destination.supportSide ?? 'M',
          carriedSide: destination.carriedSide ?? null
        });
        const proposal = {
          ...clone(this.proposal),
          proposalId: previous?.proposalId ?? `placement-${++this.proposalSequence}`,
          requestedBrickId: destination.brickId ?? null,
          requestedColour: destination.colour ?? null,
          supportBrickId: destination.supportBrickId ?? null,
          supportSide: destination.supportSide ?? 'M',
          carriedSide: destination.carriedSide ?? null,
          sourceReassigned: Boolean(previous?.brickId && this.proposal?.brickId && previous.brickId !== this.proposal.brickId)
        };
        if (!source) {
          proposal.status = 'INVALID';
          proposal.reason = 'no_reachable_brick';
          proposal.brickId = null;
          proposal.brick = null;
          proposal.pickupTcp = null;
        }
        proposal.trajectory = this.trajectoryFor(proposal, anchor);
        planned.push(proposal);
        if (proposal.brickId) reserved.add(proposal.brickId);
        anchor = proposal.trajectory?.endTcp ?? anchor;
      }
    } finally {
      this.suppressEmit = false;
    }
    if (this.controller.getState().worldRevision !== revisionBefore) {
      throw new Error('Look-ahead planning mutated authoritative world state');
    }
    return planned;
  }

  planQueue(placements, { expectedWorldRevision = undefined } = {}) {
    if (!Array.isArray(placements) || placements.length < 1 || placements.length > MAX_LOOKAHEAD) {
      return { ...this.getState(), ok: false, reason: 'invalid_input', maximumLookahead: MAX_LOOKAHEAD };
    }
    const worldRevision = this.controller.getState().worldRevision;
    if (expectedWorldRevision !== undefined && expectedWorldRevision !== worldRevision) {
      return { ...this.getState(), ok: false, reason: 'stale_state', expectedWorldRevision, worldRevision };
    }
    const planningStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.cacheId = `lookahead-${++this.cacheSequence}`;
    this.queue = this.planInternal(placements);
    this.lastPlanningDurationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - planningStartedAt;
    this.proposal = this.queue[0] ?? null;
    this.emit();
    const state = this.getState();
    return { ok: state.queue.every((proposal) => proposal.status === 'VALID'), ...state };
  }

  preview(request = {}) {
    this.planQueue([request]);
    return this.getState();
  }

  repairQueue(reason = 'world_changed') {
    if (this.activeAbortController || !this.queue.length || this.repairing) return this.getState();
    this.repairing = true;
    try {
      const planningStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const previous = this.queue;
      this.queue = this.planInternal(previous.map(requestedDestination), previous)
        .map((proposal) => ({ ...proposal, repairedBecause: reason }));
      this.lastPlanningDurationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - planningStartedAt;
      this.proposal = this.queue[0] ?? null;
      this.emit();
      return this.getState();
    } finally {
      this.repairing = false;
    }
  }

  getRenderPreviews() {
    return this.getState().queue.map((proposal, index) => {
      const candidate = proposal.candidate ?? {};
      const position = candidate.position ?? proposal.requestedPosition;
      if (!position || proposal.status === 'EXECUTING') return null;
      return {
        ...candidate,
        type: candidate.type ?? candidate.placementType ?? 'MAT',
        status: proposal.status,
        valid: proposal.status === 'VALID',
        previewPosition: clone(position),
        previewYawRad: candidate.yawRad ?? proposal.yawRad ?? 0,
        carriedBrickId: proposal.brickId,
        proposal: true,
        proposalId: proposal.proposalId,
        slotIndex: index,
        slotLabel: String.fromCharCode(65 + index),
        opacityScale: Math.max(0.3, 1 - index * 0.16)
      };
    }).filter(Boolean);
  }

  getRenderPreview() {
    return this.getRenderPreviews()[0] ?? null;
  }

  cancel() {
    const active = Boolean(this.activeAbortController);
    const result = super.cancel();
    if (!active) {
      this.queue = [];
      this.cacheId = null;
      this.proposal = null;
      this.emit();
    }
    return result;
  }

  async execute({ proposalId = null, ...options } = {}) {
    const next = this.queue[0] ?? this.proposal;
    if (proposalId && proposalId !== next?.proposalId) {
      return { ok: false, reason: 'invalid_input', message: 'Only the next cached proposal can execute.', nextProposalId: next?.proposalId ?? null };
    }
    this.proposal = next ?? null;
    const result = await super.execute(options);
    if (result.ok) {
      const completed = this.queue.shift();
      this.proposal = this.queue[0] ?? null;
      if (this.queue.length) this.repairQueue('previous_proposal_completed');
      else this.emit();
      return {
        ...result,
        cacheId: this.cacheId,
        proposalId: completed?.proposalId ?? proposalId,
        remainingQueued: this.queue.length
      };
    }
    if (this.queue.length && this.proposal) this.queue[0] = this.proposal;
    this.emit();
    return result;
  }
}

export { MAX_LOOKAHEAD };
