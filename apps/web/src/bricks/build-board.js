import { BRICK_SPEC } from './brick-spec.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export class BuildBoard {
  #blueprint;
  #targets;
  #brickToTarget = new Map();
  #revision = 0;
  #contributions = { human: 0, agent: 0 };
  #corrections = 0;
  #events = [];

  constructor(blueprint, options = {}) {
    this.#blueprint = blueprint;
    this.mode = options.mode ?? 'co-build';
    this.snapToleranceMm = options.snapToleranceMm ?? 8;
    this.zToleranceMm = options.zToleranceMm ?? 10;
    this.yawToleranceDeg = options.yawToleranceDeg ?? 5;
    this.#targets = new Map(blueprint.targets.map((target) => [target.targetId, {
      targetId: target.targetId,
      colour: target.colour,
      occupiedBy: null,
      claimOwner: null,
      correctness: false,
      completedBy: null,
      worldXmm: target.worldXmm,
      worldYmm: target.worldYmm,
      worldZmm: target.worldZmm,
      yawDeg: target.yawDeg,
      gridRow: target.gridRow,
      gridCol: target.gridCol
    }]));
  }

  get blueprintId() { return this.#blueprint.blueprintId; }
  get worldRevision() { return this.#revision; }
  get eventLog() { return clone(this.#events); }

  #record(type, payload = {}) {
    const event = { index: this.#events.length, revision: this.#revision, type, ...clone(payload) };
    this.#events.push(event);
    return event;
  }

  #bump(type, payload = {}) {
    this.#revision += 1;
    return this.#record(type, payload);
  }

  getTarget(targetId) {
    const target = this.#targets.get(targetId);
    return target ? clone(target) : null;
  }

  claimTarget(targetId, owner) {
    if (!['human', 'agent'].includes(owner)) return { accepted: false, reason: 'invalid_owner', worldRevision: this.#revision };
    const target = this.#targets.get(targetId);
    if (!target) return { accepted: false, reason: 'target_not_found', worldRevision: this.#revision };
    if (target.occupiedBy) return { accepted: false, reason: 'target_occupied', worldRevision: this.#revision };
    if (target.claimOwner && target.claimOwner !== owner) return { accepted: false, reason: 'claim_conflict', claimOwner: target.claimOwner, worldRevision: this.#revision };
    if (target.claimOwner === owner) return { accepted: true, reason: 'already_claimed', targetId, claimOwner: owner, worldRevision: this.#revision };
    target.claimOwner = owner;
    this.#bump('claim', { targetId, owner });
    return { accepted: true, targetId, claimOwner: owner, worldRevision: this.#revision };
  }

  releaseClaim(targetId, owner) {
    const target = this.#targets.get(targetId);
    if (!target) return { accepted: false, reason: 'target_not_found', worldRevision: this.#revision };
    if (target.claimOwner !== owner) return { accepted: false, reason: 'not_claim_owner', claimOwner: target.claimOwner, worldRevision: this.#revision };
    target.claimOwner = null;
    this.#bump('claim_released', { targetId, owner });
    return { accepted: true, targetId, worldRevision: this.#revision };
  }

  trySnapBrick({ brickId, colour, position, yawDeg = 0, actor = null }) {
    if (!brickId || !position || ![position.xMm, position.yMm, position.zMm].every(Number.isFinite)) {
      return { accepted: false, reason: 'invalid_candidate', worldRevision: this.#revision };
    }
    if (this.#brickToTarget.has(brickId)) return { accepted: false, reason: 'brick_already_placed', targetId: this.#brickToTarget.get(brickId), worldRevision: this.#revision };
    if (Math.abs(yawDeg - BRICK_SPEC.canonicalYawDeg) > this.yawToleranceDeg) return { accepted: false, reason: 'yaw_outside_tolerance', worldRevision: this.#revision };
    let best = null;
    for (const target of this.#targets.values()) {
      if (target.occupiedBy) continue;
      const dx = position.xMm - target.worldXmm;
      const dy = position.yMm - target.worldYmm;
      const dz = position.zMm - target.worldZmm;
      const planar = Math.hypot(dx, dy);
      if (planar > this.snapToleranceMm || Math.abs(dz) > this.zToleranceMm) continue;
      if (!best || planar < best.planar - 1e-9 || (Math.abs(planar - best.planar) <= 1e-9 && target.targetId < best.target.targetId)) best = { target, planar };
    }
    if (!best) return { accepted: false, reason: 'outside_snap_tolerance', worldRevision: this.#revision };
    const target = best.target;
    const correctness = colour === target.colour;
    target.occupiedBy = brickId;
    target.correctness = correctness;
    target.completedBy = correctness && ['human', 'agent'].includes(actor) ? actor : null;
    target.claimOwner = null;
    this.#brickToTarget.set(brickId, target.targetId);
    if (target.completedBy) this.#contributions[target.completedBy] += 1;
    this.#bump('snap', { targetId: target.targetId, brickId, colour, correctness, actor });
    return {
      accepted: true,
      targetId: target.targetId,
      snappedPose: { xMm: target.worldXmm, yMm: target.worldYmm, zMm: target.worldZmm, yawDeg: target.yawDeg },
      correctness,
      reason: correctness ? 'correct' : 'wrong_colour',
      worldRevision: this.#revision
    };
  }

  removeBrick(brickId, actor = null) {
    const targetId = this.#brickToTarget.get(brickId);
    if (!targetId) return { accepted: false, reason: 'brick_not_placed', worldRevision: this.#revision };
    const target = this.#targets.get(targetId);
    if (target.correctness && target.completedBy) this.#contributions[target.completedBy] = Math.max(0, this.#contributions[target.completedBy] - 1);
    target.occupiedBy = null;
    target.correctness = false;
    target.completedBy = null;
    this.#brickToTarget.delete(brickId);
    this.#corrections += 1;
    this.#bump('remove', { targetId, brickId, actor });
    return { accepted: true, targetId, worldRevision: this.#revision };
  }

  progress() {
    const all = [...this.#targets.values()];
    const correctTargets = all.filter((target) => target.correctness).length;
    return { correctTargets, totalTargets: all.length, fraction: all.length ? correctTargets / all.length : 1 };
  }

  isComplete() { return this.progress().correctTargets === this.#targets.size; }

  getBuildState(filters = {}) {
    const limit = Math.max(1, Math.min(200, Math.trunc(filters.limit ?? 50)));
    let targets = [...this.#targets.values()];
    if (filters.status === 'unfilled') targets = targets.filter((target) => !target.occupiedBy);
    if (filters.status === 'correct') targets = targets.filter((target) => target.correctness);
    if (filters.status === 'incorrect') targets = targets.filter((target) => target.occupiedBy && !target.correctness);
    if (filters.colour) targets = targets.filter((target) => target.colour === filters.colour);
    if (filters.claimOwner !== undefined) targets = targets.filter((target) => target.claimOwner === filters.claimOwner);
    targets.sort((a, b) => a.targetId.localeCompare(b.targetId));
    return {
      mode: this.mode,
      worldRevision: this.#revision,
      blueprintId: this.#blueprint.blueprintId,
      progress: this.progress(),
      targets: clone(targets.slice(0, limit)),
      contributions: clone(this.#contributions),
      corrections: this.#corrections,
      status: this.isComplete() ? 'complete' : 'active'
    };
  }
}
