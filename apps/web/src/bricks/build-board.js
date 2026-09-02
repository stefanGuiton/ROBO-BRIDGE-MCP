import { BRICK_SPEC } from './brick-spec.js';
import { RevisionClock } from '../state/revision-clock.js';

const clone = (value) => structuredClone(value);

function toTargetRecord(target) {
  const id = target.targetId ?? target.id;
  const position = target.position ?? {
    xMm: target.worldXmm,
    yMm: target.worldYmm,
    zMm: target.worldZmm
  };
  const yawDeg = Number.isFinite(target.yawDeg)
    ? target.yawDeg
    : Number(target.yawRad ?? BRICK_SPEC.canonicalYawRad) * 180 / Math.PI;
  return {
    ...clone(target),
    id,
    targetId: id,
    colour: target.colour ?? null,
    position: clone(position),
    yawDeg,
    yawRad: yawDeg * Math.PI / 180,
    gridRow: target.gridRow ?? null,
    gridCol: target.gridCol ?? null,
    occupiedBy: target.occupiedBy ?? target.placedBrickId ?? null,
    placedBrickId: target.occupiedBy ?? target.placedBrickId ?? null,
    claimOwner: target.claimOwner ?? 'none',
    correctness: Boolean(target.correctness),
    completedBy: target.completedBy ?? null
  };
}

export class BuildBoard {
  #blueprintId;
  #targets;
  #brickToTarget = new Map();
  #placements = new Map();
  #clock;
  #contributions = { human: 0, agent: 0 };
  #corrections = 0;
  #events = [];

  constructor(blueprintOrTargets, options = {}) {
    this.mode = options.mode ?? 'co-build';
    this.snapToleranceMm = options.snapToleranceMm ?? 7;
    this.zToleranceMm = options.zToleranceMm ?? 10;
    this.yawToleranceDeg = options.yawToleranceDeg ?? 2;
    this.#clock = options.revisionClock ?? new RevisionClock();
    const isBlueprint = blueprintOrTargets && !Array.isArray(blueprintOrTargets) && Array.isArray(blueprintOrTargets.targets);
    const targets = isBlueprint ? blueprintOrTargets.targets : (blueprintOrTargets ?? []);
    this.#blueprintId = isBlueprint ? blueprintOrTargets.blueprintId : (options.blueprintId ?? 'live-board');
    this.#targets = new Map(targets.map((target) => {
      const record = toTargetRecord(target);
      if (!record.id) throw new TypeError('board target id is required');
      if (![record.position.xMm, record.position.yMm, record.position.zMm].every(Number.isFinite)) throw new TypeError(`invalid target position: ${record.id}`);
      if (record.occupiedBy) this.#brickToTarget.set(record.occupiedBy, record.id);
      return [record.id, record];
    }));
  }

  get blueprintId() { return this.#blueprintId; }
  get worldRevision() { return this.#clock.value; }
  get revisionClock() { return this.#clock; }
  get eventLog() { return clone(this.#events); }

  #record(type, payload = {}) {
    const revision = this.#clock.bump();
    const event = { index: this.#events.length, revision, type, ...clone(payload) };
    this.#events.push(event);
    return event;
  }

  loadBlueprint(blueprint, { expectedWorldRevision } = {}) {
    if (expectedWorldRevision !== this.worldRevision) throw new Error('stale_world_revision');
    if (this.#brickToTarget.size || this.#placements.size) throw new Error('board_not_empty');
    if (!blueprint?.blueprintId || !Array.isArray(blueprint.targets)) throw new TypeError('invalid_blueprint');
    const records = blueprint.targets.map(toTargetRecord);
    if (new Set(records.map(t => t.id)).size !== records.length || records.some(t => !t.id || t.occupiedBy
      || ![t.position.xMm, t.position.yMm, t.position.zMm, t.yawRad].every(Number.isFinite))) throw new TypeError('invalid_targets');
    this.#blueprintId = blueprint.blueprintId;
    this.#targets = new Map(records.map(t => [t.id, t]));
    this.#record('blueprint_loaded', { blueprintId: this.#blueprintId, count: records.length });
    return this.getBuildState();
  }

  targetBlockReason(target, colour) {
    if (target.occupiedBy) return 'target_occupied';
    if (target.colour && target.colour !== colour) return 'wrong_colour';
    if (target.bridgeConstruction) {
      if ((target.dependencyIds ?? []).some(id => !this.#targets.get(id)?.correctness)) return 'support_not_ready';
      if (target.requiresStructureComplete && [...this.#targets.values()].some(t => t.partClass !== 'TRACK_SEGMENT' && !t.correctness)) return 'structure_not_ready';
    }
    return null;
  }

  reset() {
    let changed = this.#placements.size > 0;
    for (const target of this.#targets.values()) {
      if (target.occupiedBy || target.claimOwner !== 'none' || target.correctness || target.completedBy) changed = true;
      target.occupiedBy = null;
      target.placedBrickId = null;
      target.claimOwner = 'none';
      target.correctness = false;
      target.completedBy = null;
    }
    this.#brickToTarget.clear();
    this.#placements.clear();
    this.#contributions = { human: 0, agent: 0 };
    this.#corrections = 0;
    this.#events = [];
    if (changed) this.#record('board_reset');
    return this.getBuildState();
  }

  getTargets() {
    return Array.from(this.#targets.values(), (target) => ({
      ...clone(target),
      worldXmm: target.position.xMm,
      worldYmm: target.position.yMm,
      worldZmm: target.position.zMm,
      status: target.occupiedBy ? (target.correctness ? 'correct' : 'incorrect') : 'unfilled'
    }));
  }

  getTarget(targetId) {
    return this.getTargets().find((target) => target.id === targetId) ?? null;
  }

  nearestTarget(position, toleranceMm = 30) {
    let best = null;
    for (const target of this.#targets.values()) {
      const distance = Math.hypot(position.xMm - target.position.xMm, position.yMm - target.position.yMm);
      if (distance <= toleranceMm && (!best || distance < best.distance)) best = { target: clone(target), distance };
    }
    return best;
  }

  claimTarget(targetId, owner) {
    if (!['human', 'agent'].includes(owner)) return { ok: false, accepted: false, reason: 'invalid_owner', worldRevision: this.worldRevision };
    const target = this.#targets.get(targetId);
    if (!target) return { ok: false, accepted: false, reason: 'unknown_target', worldRevision: this.worldRevision };
    if (target.occupiedBy) return { ok: false, accepted: false, reason: 'target_occupied', worldRevision: this.worldRevision };
    if (target.claimOwner !== 'none' && target.claimOwner !== owner) {
      return { ok: false, accepted: false, reason: 'claim_conflict', claimOwner: target.claimOwner, worldRevision: this.worldRevision };
    }
    if (target.claimOwner === owner) {
      return { ok: true, accepted: true, reason: 'already_claimed', targetId, claimOwner: owner, worldRevision: this.worldRevision };
    }
    target.claimOwner = owner;
    this.#record('claim', { targetId, owner });
    return { ok: true, accepted: true, targetId, claimOwner: owner, worldRevision: this.worldRevision };
  }

  releaseClaim(targetId, owner) {
    const target = this.#targets.get(targetId);
    if (!target) return { ok: false, accepted: false, reason: 'unknown_target', worldRevision: this.worldRevision };
    if (target.claimOwner !== owner) return { ok: false, accepted: false, reason: 'not_claim_owner', claimOwner: target.claimOwner, worldRevision: this.worldRevision };
    target.claimOwner = 'none';
    this.#record('claim_released', { targetId, owner });
    return { ok: true, accepted: true, targetId, worldRevision: this.worldRevision };
  }

  trySnapBrick({ brickId, colour, position, yawDeg, yawRad, actor = null, targetId = null }) {
    const effectiveYawDeg = Number.isFinite(yawDeg) ? yawDeg : Number(yawRad ?? 0) * 180 / Math.PI;
    if (!brickId || !position || ![position.xMm, position.yMm, position.zMm, effectiveYawDeg].every(Number.isFinite)) {
      return { ok: false, accepted: false, reason: 'invalid_input', worldRevision: this.worldRevision };
    }
    if (this.#brickToTarget.has(brickId)) {
      return { ok: false, accepted: false, reason: 'brick_already_placed', targetId: this.#brickToTarget.get(brickId), worldRevision: this.worldRevision };
    }
    let best = null;
    let occupied = null;
    let wrongColour = null;
    for (const target of this.#targets.values()) {
      const dx = position.xMm - target.position.xMm;
      const dy = position.yMm - target.position.yMm;
      const dz = position.zMm - target.position.zMm;
      const planar = Math.hypot(dx, dy);
      if (targetId && target.id !== targetId) continue;
      if (planar > this.snapToleranceMm || Math.abs(dz) > (target.bridgeConstruction ? 2 : this.zToleranceMm)) continue;
      if (Math.abs(effectiveYawDeg - target.yawDeg) > this.yawToleranceDeg) continue;
      if (target.occupiedBy) {
        if (!occupied || planar < occupied.planar) occupied = { target, planar };
        continue;
      }
      if (target.colour && target.colour !== colour) {
        if (!wrongColour || planar < wrongColour.planar) wrongColour = { target, planar };
        continue;
      }
      if (!best || planar < best.planar - 1e-9 || (Math.abs(planar - best.planar) <= 1e-9 && target.id < best.target.id)) best = { target, planar };
    }
    if (!best && occupied) return { ok: false, accepted: false, reason: 'target_occupied', targetId: occupied.target.id, worldRevision: this.worldRevision };
    if (!best && wrongColour) return { ok: false, accepted: false, reason: 'wrong_colour', targetId: wrongColour.target.id, expectedColour: wrongColour.target.colour, worldRevision: this.worldRevision };
    if (!best) return { ok: false, accepted: false, reason: 'no_snap_target', worldRevision: this.worldRevision };

    const target = best.target;
    const blocked = this.targetBlockReason(target, colour);
    if (blocked) return { ok: false, reason: blocked, worldRevision: this.worldRevision };
    target.occupiedBy = brickId;
    target.placedBrickId = brickId;
    target.correctness = true;
    target.completedBy = ['human', 'agent'].includes(actor) ? actor : null;
    target.claimOwner = 'none';
    this.#brickToTarget.set(brickId, target.id);
    if (target.completedBy) this.#contributions[target.completedBy] += 1;
    this.#record('snap', { targetId: target.id, brickId, colour, actor });
    const snappedPose = { xMm: target.position.xMm, yMm: target.position.yMm, zMm: target.position.zMm, yawDeg: target.yawDeg };
    return {
      ok: true,
      accepted: true,
      reason: 'correct',
      targetId: target.id,
      correctness: true,
      snappedPose,
      transform: { position: clone(target.position), yawRad: target.yawRad },
      worldRevision: this.worldRevision
    };
  }

  acceptPlacement({ brickId, colour, position, yawRad = 0, actor = null, connection = null, connections = [], cells = [], placementType = 'free-build' }) {
    if (!brickId || !position || ![position.xMm, position.yMm, position.zMm, yawRad].every(Number.isFinite)) {
      return { ok: false, accepted: false, reason: 'invalid_input', worldRevision: this.worldRevision };
    }
    if (this.#brickToTarget.has(brickId) || this.#placements.has(brickId)) {
      return { ok: false, accepted: false, reason: 'brick_already_placed', worldRevision: this.worldRevision };
    }
    const owner = ['human', 'agent'].includes(actor) ? actor : null;
    const record = {
      brickId,
      colour: colour ?? null,
      position: clone(position),
      yawRad,
      yawDeg: yawRad * 180 / Math.PI,
      actor: owner,
      placementType,
      connection: connection ? clone(connection) : null,
      connections: clone(connections),
      cells: clone(cells)
    };
    this.#placements.set(brickId, record);
    if (owner) this.#contributions[owner] += 1;
    this.#record('placement', record);
    return { ok: true, accepted: true, placement: clone(record), worldRevision: this.worldRevision };
  }

  getPlacements() {
    return Array.from(this.#placements.values(), clone);
  }

  removeBrick(brickId, actor = null) {
    const targetId = this.#brickToTarget.get(brickId);
    if (!targetId) {
      const placement = this.#placements.get(brickId);
      if (!placement) return { ok: false, accepted: false, reason: 'brick_not_placed', worldRevision: this.worldRevision };
      if (placement.actor) this.#contributions[placement.actor] = Math.max(0, this.#contributions[placement.actor] - 1);
      this.#placements.delete(brickId);
      this.#corrections += 1;
      this.#record('placement_removed', { brickId, actor });
      return { ok: true, accepted: true, placementType: placement.placementType, worldRevision: this.worldRevision };
    }
    const target = this.#targets.get(targetId);
    if (target.completedBy) this.#contributions[target.completedBy] = Math.max(0, this.#contributions[target.completedBy] - 1);
    target.occupiedBy = null;
    target.placedBrickId = null;
    target.correctness = false;
    target.completedBy = null;
    this.#brickToTarget.delete(brickId);
    this.#corrections += 1;
    this.#record('remove', { targetId, brickId, actor });
    return { ok: true, accepted: true, targetId, worldRevision: this.worldRevision };
  }

  progress() {
    const all = [...this.#targets.values()];
    const correctTargets = all.filter((target) => target.correctness).length;
    return { filled: all.filter((target) => target.occupiedBy).length, correctTargets, totalTargets: all.length, total: all.length, fraction: all.length ? correctTargets / all.length : 1, percent: all.length ? correctTargets / all.length * 100 : 100 };
  }

  isComplete() { return this.progress().correctTargets === this.#targets.size; }

  getBuildState(filters = {}) {
    const limit = Math.max(1, Math.min(50, Math.trunc(filters.limit ?? 20)));
    let targets = this.getTargets();
    if (filters.status === 'unfilled') targets = targets.filter((target) => !target.occupiedBy);
    if (filters.status === 'filled') targets = targets.filter((target) => Boolean(target.occupiedBy));
    if (filters.status === 'correct') targets = targets.filter((target) => target.correctness);
    if (filters.status === 'incorrect') targets = targets.filter((target) => target.occupiedBy && !target.correctness);
    if (filters.colour) targets = targets.filter((target) => target.colour === filters.colour);
    if (filters.claimOwner !== undefined) targets = targets.filter((target) => target.claimOwner === filters.claimOwner);
    targets.sort((a, b) => a.id.localeCompare(b.id));
    return {
      ok: true,
      mode: this.mode,
      worldRevision: this.worldRevision,
      blueprintId: this.#blueprintId,
      progress: this.progress(),
      targets: targets.slice(0, limit),
      freePlacements: this.getPlacements().slice(0, limit),
      contributions: clone(this.#contributions),
      contributionSummary: clone(this.#contributions),
      corrections: this.#corrections,
      status: this.isComplete() ? 'complete' : 'active'
    };
  }
}
