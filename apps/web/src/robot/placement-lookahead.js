import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { FastPlacementCoordinator } from './fast-placement.js';
import { DEFAULT_PLACEMENT_CYCLE_MS, MAX_PLACEMENT_CYCLE_MS, MIN_PLACEMENT_CYCLE_MS } from './placement-cycle-runner.js';

const clone = (value) => structuredClone(value);
const MAX_LOOKAHEAD = 5;
const MAX_STREAM_BATCH = 50;
const MAX_STREAM_SIZE = 5000;
const MAX_STATUS_PAGE = 50;
const PLACEMENT_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const SATISFIED = new Set(['COMPLETED', 'ADOPTED']);
const TERMINAL = new Set(['COMPLETED', 'ADOPTED', 'CANCELLED']);
const distance3 = (a, b) => Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm);

function finitePosition(position) {
  return Boolean(position) && [position.xMm, position.yMm, position.zMm].every(Number.isFinite);
}

function yawDeltaHalfTurn(a = 0, b = 0) {
  const period = Math.PI;
  const delta = ((a - b + period / 2) % period + period) % period - period / 2;
  return Math.abs(delta);
}

function normalizeDestination(source, fallbackId = null) {
  const position = source?.position ?? (
    [source?.xMm, source?.yMm, source?.zMm].every(Number.isFinite)
      ? { xMm: source.xMm, yMm: source.yMm, zMm: source.zMm }
      : null
  );
  return {
    placementId: source?.placementId ?? fallbackId,
    brickId: source?.brickId ?? null,
    colour: source?.colour ?? null,
    preferredColour: source?.preferredColour ?? null,
    position: position ? clone(position) : null,
    yawRad: Number(source?.yawRad ?? 0),
    supportBrickId: source?.supportBrickId ?? null,
    supportPlacementId: source?.supportPlacementId ?? null,
    dependsOnPlacementIds: Array.isArray(source?.dependsOnPlacementIds) ? [...source.dependsOnPlacementIds] : [],
    supportSide: source?.supportSide ?? 'M',
    carriedSide: source?.carriedSide ?? null
  };
}

function validateDestination(destination, { requirePlacementId = true } = {}) {
  if (requirePlacementId && !PLACEMENT_ID.test(destination.placementId ?? '')) return 'invalid_placement_id';
  if (destination.brickId !== null && !PLACEMENT_ID.test(destination.brickId)) return 'invalid_brick_id';
  if (destination.colour !== null && (typeof destination.colour !== 'string' || !destination.colour)) return 'invalid_colour';
  if (destination.preferredColour !== null && (typeof destination.preferredColour !== 'string' || !destination.preferredColour)) return 'invalid_colour';
  if (!Number.isFinite(destination.yawRad)) return 'invalid_yaw';
  if (!finitePosition(destination.position) && !destination.supportBrickId && !destination.supportPlacementId) return 'missing_destination';
  if (destination.position !== null && !finitePosition(destination.position)) return 'invalid_position';
  if (destination.supportBrickId !== null && !PLACEMENT_ID.test(destination.supportBrickId)) return 'invalid_support_brick_id';
  if (destination.supportPlacementId !== null && !PLACEMENT_ID.test(destination.supportPlacementId)) return 'invalid_support_placement_id';
  if (destination.supportPlacementId === destination.placementId) return 'dependency_cycle';
  if (!Array.isArray(destination.dependsOnPlacementIds) || destination.dependsOnPlacementIds.length > 20) return 'invalid_dependencies';
  if (destination.dependsOnPlacementIds.some((placementId) => !PLACEMENT_ID.test(placementId) || placementId === destination.placementId)) return 'invalid_dependency_id';
  if (new Set(destination.dependsOnPlacementIds).size !== destination.dependsOnPlacementIds.length) return 'duplicate_dependency_id';
  if (!['L', 'M', 'R'].includes(destination.supportSide)) return 'invalid_support_side';
  if (destination.carriedSide !== null && !['L', 'M', 'R'].includes(destination.carriedSide)) return 'invalid_carried_side';
  return null;
}

function contentKey(destination) {
  return JSON.stringify(destination);
}

function placementConnections(brick) {
  const connection = brick?.connection;
  if (!connection) return [];
  return Array.isArray(connection.groups) ? connection.groups : [connection];
}

function rectangleAxes(yawRad) {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  return [[c, s], [-s, c]];
}

function rectanglesOverlap(a, b) {
  if (Math.abs(a.position.zMm - b.position.zMm) >= BRICK_SPEC.bodyHeightMm - 0.5) return false;
  const axesA = rectangleAxes(a.yawRad ?? 0);
  const axesB = rectangleAxes(b.yawRad ?? 0);
  const halfLength = BRICK_SPEC.lengthMm / 2 - 0.25;
  const halfWidth = BRICK_SPEC.widthMm / 2 - 0.25;
  const delta = [b.position.xMm - a.position.xMm, b.position.yMm - a.position.yMm];
  for (const axis of [...axesA, ...axesB]) {
    const centreDistance = Math.abs(delta[0] * axis[0] + delta[1] * axis[1]);
    const radiusA = halfLength * Math.abs(axesA[0][0] * axis[0] + axesA[0][1] * axis[1])
      + halfWidth * Math.abs(axesA[1][0] * axis[0] + axesA[1][1] * axis[1]);
    const radiusB = halfLength * Math.abs(axesB[0][0] * axis[0] + axesB[0][1] * axis[1])
      + halfWidth * Math.abs(axesB[1][0] * axis[0] + axesB[1][1] * axis[1]);
    if (centreDistance >= radiusA + radiusB) return false;
  }
  return true;
}

export class PlacementLookaheadCoordinator extends FastPlacementCoordinator {
  constructor(options) {
    super(options);
    this.queue = [];
    this.cacheId = null;
    this.cacheSequence = 0;
    this.proposalSequence = 0;
    this.streamRevision = 0;
    this.stream = null;
    this.lastInvalidatedStream = null;
    this.lastPlanningDurationMs = 0;
    this.suppressEmit = false;
    this.repairing = false;
    this.executionStarting = false;
    this.executionGeneration = 0;
    this.unsubscribeLookahead = this.controller.subscribe((event) => {
      if (['reset', 'world_reset'].includes(event.type)) {
        this.invalidateStream('reset');
        return;
      }
      if (!['initial', 'exclusive_operation_started', 'exclusive_operation_completed'].includes(event.type)
        && !this.executionStarting && !this.activeAbortController && this.stream && !this.repairing) {
        this.repairQueue(event.type);
      }
    });
  }

  emit() {
    if (this.suppressEmit) return;
    if (this.queue?.length && this.proposal) this.queue[0] = this.proposal;
    super.emit();
  }

  bumpStreamRevision() {
    this.streamRevision += 1;
    if (this.stream) this.stream.streamRevision = this.streamRevision;
  }

  summary() {
    const counts = {};
    for (const entry of this.stream?.entries ?? []) counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    const total = this.stream?.entries.length ?? 0;
    const satisfied = (counts.COMPLETED ?? 0) + (counts.ADOPTED ?? 0);
    return {
      streamId: this.stream?.streamId ?? null,
      streamRevision: this.stream?.streamRevision ?? this.streamRevision,
      finalChunk: Boolean(this.stream?.finalChunk),
      cycleTimeMs: this.stream?.cycleTimeMs ?? DEFAULT_PLACEMENT_CYCLE_MS,
      totalPlacements: total,
      satisfiedPlacements: satisfied,
      remainingPlacements: Math.max(0, total - satisfied - (counts.CANCELLED ?? 0)),
      counts
    };
  }

  getState() {
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
    const streamSummary = this.summary();
    let status = 'NONE';
    if (this.activeAbortController) status = 'EXECUTING';
    else if (queue.length) status = queue[0].status;
    else if (this.stream && streamSummary.remainingPlacements > 0) status = 'WAITING';
    else if (this.stream && streamSummary.totalPlacements > 0) status = 'COMPLETE';
    return {
      status,
      reason: queue[0]?.reason ?? null,
      proposal: queue[0] ? clone(queue[0]) : null,
      running: Boolean(this.activeAbortController),
      cacheId: this.cacheId,
      queue,
      queueLength: queue.length,
      maximumLookahead: MAX_LOOKAHEAD,
      maximumStreamBatch: MAX_STREAM_BATCH,
      maximumStreamSize: MAX_STREAM_SIZE,
      planningDurationMs: this.lastPlanningDurationMs,
      worldRevision,
      stream: streamSummary
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
    const preferredColours = colourMatched.filter(brick => brick.colour === destination.preferredColour);
    return (preferredColours.length ? preferredColours : colourMatched)
      .map((brick) => ({
        brick,
        cost: distance3(fallbackAnchor, brick.position) + distance3(brick.position, target) * 0.35
      }))
      .sort((a, b) => a.cost - b.cost || a.brick.id.localeCompare(b.brick.id))[0]?.brick ?? null;
  }

  trajectoryFor(proposal, anchor) {
    if (!proposal.pickupTcp || !proposal.requiredTcp) return null;
    const safeZ = proposal.travelPolicy ? proposal.clearanceZMm : Math.max(proposal.clearanceZMm, proposal.pickupTcp.zMm + 24, proposal.requiredTcp.zMm + 24);
    const sourceApproach = { ...proposal.pickupTcp, zMm: safeZ };
    const targetApproach = { ...proposal.requiredTcp, zMm: safeZ };
    const waypoints = [
      ...(proposal.travelPolicy ? [{ stage: 'initial_z_hop', action: 'move', tcp: { ...clone(anchor), zMm: safeZ } }] : []),
      { stage: 'source_approach', action: 'move', tcp: clone(sourceApproach) },
      { stage: 'source_descend', action: 'move', tcp: clone(proposal.pickupTcp) },
      { stage: 'capture', action: 'latch', brickId: proposal.brickId },
      { stage: 'source_lift', action: 'move', tcp: clone(sourceApproach) },
      { stage: 'transfer', action: 'move', tcp: clone(targetApproach) },
      { stage: 'target_descend', action: 'move', tcp: clone(proposal.requiredTcp) },
      { stage: 'release', action: 'unlatch' },
      { stage: 'target_retreat', action: 'move', tcp: clone(targetApproach) }
    ];
    return { shape: 'staple-up-across-down', safeZMm: safeZ, startTcp: clone(anchor), endTcp: clone(targetApproach), waypoints };
  }

  planOne(destination, { reserved, anchor, previous = null } = {}) {
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
      proposalId: previous?.proposalId ?? `proposal-${++this.proposalSequence}`,
      placementId: destination.placementId,
      requestedBrickId: destination.brickId ?? null,
      requestedColour: destination.colour ?? null,
      requestedSupportBrickId: destination.requestedSupportBrickId ?? destination.supportBrickId ?? null,
      supportBrickId: destination.supportBrickId ?? null,
      supportPlacementId: destination.supportPlacementId ?? null,
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
    return proposal;
  }

  authoritativePlacements() {
    const boardPlacements = new Map(this.placementAuthority.board.getPlacements().map((entry) => [entry.brickId, entry]));
    const boardTargets = new Map(this.placementAuthority.board.getTargets().filter((target) => target.occupiedBy).map((target) => [target.occupiedBy, target]));
    return this.controller.getBricks()
      .filter((brick) => !brick.heldBy && (brick.snapped || brick.placedTargetId || brick.placementType || boardPlacements.has(brick.id)))
      .map((brick) => ({
        ...brick,
        boardPlacement: boardPlacements.get(brick.id) ?? null,
        boardTarget: boardTargets.get(brick.id) ?? null,
        actor: boardPlacements.get(brick.id)?.actor ?? boardTargets.get(brick.id)?.completedBy ?? null
      }));
  }

  expectedTarget(entry) {
    return entry.plannedTarget ?? entry.request.position ?? null;
  }

  expectedColour(entry) {
    if (entry.request.colour) return entry.request.colour;
    if (entry.request.preferredColour) return null;
    const requested = this.controller.getBricks().find((brick) => brick.id === entry.request.brickId);
    return requested?.colour ?? null;
  }

  connectorCompatible(entry, brick) {
    const supportBrickId = entry.resolvedSupportBrickId ?? entry.request.supportBrickId;
    if (!supportBrickId) return true;
    const connections = placementConnections(brick);
    return connections.some((connection) => connection.lowerBrickId === supportBrickId
      && connection.lowerConnector === entry.request.supportSide
      && (!entry.request.carriedSide || connection.upperConnector === entry.request.carriedSide));
  }

  evaluateOccupancy(entry, placed = this.authoritativePlacements()) {
    const boardTarget = this.placementAuthority.board.getTarget(entry.placementId);
    if (boardTarget?.bridgeConstruction) {
      const brick = placed.find(b => b.id === boardTarget.occupiedBy);
      return { compatible: brick ?? null, conflict: null };
    }
    const target = this.expectedTarget(entry);
    if (!target) return { compatible: null, conflict: null };
    const expected = { position: target, yawRad: entry.request.yawRad ?? 0 };
    const overlapping = placed.filter((brick) => rectanglesOverlap(expected, brick));
    // Simple Bricks is collaborative play: preserve the human's design even
    // when its colour or footprint differs. Subsequent supports still pass
    // through the placement authority using this actual brick, not the plan.
    const humanOverride = this.placementAuthority.board.blueprintId === 'simple-bricks'
      ? overlapping.find(brick => brick.actor === 'human') : null;
    if (humanOverride) return { compatible: humanOverride, conflict: null, humanOverride: true };
    for (const brick of overlapping) {
      const close = Math.hypot(brick.position.xMm - target.xMm, brick.position.yMm - target.yMm) <= 3
        && Math.abs(brick.position.zMm - target.zMm) <= 2;
      const colourOk = !this.expectedColour(entry) || brick.colour === this.expectedColour(entry);
      const yawOk = yawDeltaHalfTurn(brick.yawRad ?? 0, entry.request.yawRad ?? 0) <= 2 * Math.PI / 180;
      const connectorOk = this.connectorCompatible(entry, brick);
      if (close && colourOk && yawOk && connectorOk) return { compatible: brick, conflict: null };
    }
    if (!overlapping.length) return { compatible: null, conflict: null };
    const brick = overlapping.sort((a, b) => a.id.localeCompare(b.id))[0];
    const mismatch = [];
    if (this.expectedColour(entry) && brick.colour !== this.expectedColour(entry)) mismatch.push('colour');
    if (yawDeltaHalfTurn(brick.yawRad ?? 0, entry.request.yawRad ?? 0) > 2 * Math.PI / 180) mismatch.push('yaw');
    if (!this.connectorCompatible(entry, brick)) mismatch.push('connector');
    if (!mismatch.length) mismatch.push('footprint');
    return { compatible: null, conflict: { brick, mismatch } };
  }

  setEntryStatus(entry, status, reason = null, details = null) {
    const changed = entry.status !== status || entry.reason !== reason || JSON.stringify(entry.details) !== JSON.stringify(details);
    entry.status = status;
    entry.reason = reason;
    entry.details = details ? clone(details) : null;
    if (changed) this.bumpStreamRevision();
  }

  reconcileLogicalEntries(reason = 'world_changed') {
    if (!this.stream) return;
    const placed = this.authoritativePlacements();
    for (const entry of this.stream.entries) {
      const occupancy = this.evaluateOccupancy(entry, placed);
      if (occupancy.compatible) {
        const wasAgentCompleted = entry.status === 'COMPLETED' && entry.actualBrickId === occupancy.compatible.id;
        entry.actualBrickId = occupancy.compatible.id;
        entry.actor = wasAgentCompleted ? 'agent' : (occupancy.compatible.actor ?? 'human');
        entry.satisfiedAtWorldRevision ??= this.controller.getState().worldRevision;
        this.setEntryStatus(entry, wasAgentCompleted ? 'COMPLETED' : 'ADOPTED', null, {
          actor: entry.actor,
          actualBrickId: entry.actualBrickId,
          humanOverride: Boolean(occupancy.humanOverride),
          reconciledBecause: reason
        });
        continue;
      }
      if (SATISFIED.has(entry.status)) {
        entry.actualBrickId = null;
        entry.actor = null;
        entry.satisfiedAtWorldRevision = null;
        this.setEntryStatus(entry, 'PENDING', 'satisfied_placement_removed', { reconciledBecause: reason });
      }
      if (occupancy.conflict) {
        this.setEntryStatus(entry, 'BLOCKED', 'target_occupied_incompatible', {
          conflictBrickId: occupancy.conflict.brick.id,
          mismatch: occupancy.conflict.mismatch,
          actor: occupancy.conflict.brick.actor,
          reconciledBecause: reason
        });
      } else if (entry.status === 'BLOCKED' && entry.reason === 'target_occupied_incompatible') {
        this.setEntryStatus(entry, 'PENDING', 'conflict_removed', { reconciledBecause: reason });
      } else if (entry.status === 'BLOCKED') {
        this.setEntryStatus(entry, 'PENDING', 'retry_after_world_change', { reconciledBecause: reason });
      }
    }
  }

  resolveDependency(entry) {
    entry.resolvedSupportBrickId = entry.request.supportBrickId ?? null;
    for (const placementId of entry.request.dependsOnPlacementIds ?? []) {
      const dependency = this.stream.byId.get(placementId);
      if (!dependency) return { ok: false, status: this.stream.finalChunk ? 'BLOCKED' : 'WAITING_DEPENDENCY', reason: 'unknown_dependency' };
      if (!SATISFIED.has(dependency.status) || !dependency.actualBrickId) {
        return {
          ok: false,
          status: 'WAITING_DEPENDENCY',
          reason: dependency.status === 'BLOCKED' ? 'dependency_blocked' : 'dependency_pending',
          details: { dependsOnPlacementId: dependency.placementId, dependencyStatus: dependency.status }
        };
      }
    }
    if (entry.request.supportPlacementId) {
      const dependency = this.stream.byId.get(entry.request.supportPlacementId);
      if (!dependency) return { ok: false, status: this.stream.finalChunk ? 'BLOCKED' : 'WAITING_DEPENDENCY', reason: 'unknown_dependency' };
      if (!SATISFIED.has(dependency.status) || !dependency.actualBrickId) {
        return {
          ok: false,
          status: 'WAITING_DEPENDENCY',
          reason: dependency.status === 'BLOCKED' ? 'dependency_blocked' : 'dependency_pending',
          details: { supportPlacementId: dependency.placementId, supportStatus: dependency.status }
        };
      }
      entry.resolvedSupportBrickId = dependency.actualBrickId;
    }
    if (entry.resolvedSupportBrickId) {
      const support = this.authoritativePlacements().find((brick) => brick.id === entry.resolvedSupportBrickId);
      if (!support) return { ok: false, status: 'WAITING_DEPENDENCY', reason: 'support_not_placed', details: { supportBrickId: entry.resolvedSupportBrickId } };
    }
    return { ok: true };
  }

  resolvedDestination(entry) {
    return { ...clone(entry.request), supportBrickId: entry.resolvedSupportBrickId, requestedSupportBrickId: entry.request.supportBrickId };
  }

  materializeWindow(reason = 'stream_changed') {
    if (!this.stream || this.activeAbortController) return this.getState();
    const revisionBefore = this.controller.getState().worldRevision;
    const previousQueue = this.queue;
    const reserved = new Set();
    const queue = [];
    let anchor = this.controller.getState().tcp;
    const planningStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.suppressEmit = true;
    try {
      for (const entry of this.stream.entries) {
        if (queue.length >= MAX_LOOKAHEAD) break;
        if (TERMINAL.has(entry.status) || entry.status === 'BLOCKED' || entry.status === 'EXECUTING') continue;
        const dependency = this.resolveDependency(entry);
        if (!dependency.ok) {
          this.setEntryStatus(entry, dependency.status, dependency.reason, dependency.details ?? null);
          continue;
        }
        const destination = this.resolvedDestination(entry);
        const previous = previousQueue.find((proposal) => proposal.placementId === entry.placementId) ?? null;
        const proposal = this.planOne(destination, { reserved, anchor, previous });
        if (!proposal.brickId) {
          this.setEntryStatus(entry, 'WAITING_SOURCE', 'no_reachable_brick', { colour: this.expectedColour(entry) });
          entry.sourceBrickId = null;
          continue;
        }
        if (proposal.status !== 'VALID') {
          this.setEntryStatus(entry, 'BLOCKED', proposal.reason ?? 'planning_invalid', { reconciledBecause: reason });
          entry.sourceBrickId = null;
          continue;
        }
        const priorSource = entry.sourceBrickId;
        entry.sourceReassigned = Boolean(priorSource && priorSource !== proposal.brickId) || entry.sourceReassigned;
        entry.sourceBrickId = proposal.brickId;
        entry.expectedColour = proposal.brick?.colour ?? entry.request.colour ?? null;
        entry.plannedTarget = clone(proposal.candidate?.position ?? entry.request.position);
        entry.plannedYawRad = proposal.candidate?.yawRad ?? entry.request.yawRad;
        entry.proposalId = proposal.proposalId;
        entry.plannedAtWorldRevision = revisionBefore;
        proposal.sourceReassigned = entry.sourceReassigned || proposal.sourceReassigned;
        proposal.logicalStatus = 'PLANNED';
        proposal.streamId = this.stream.streamId;
        queue.push(proposal);
        reserved.add(proposal.brickId);
        anchor = proposal.trajectory?.endTcp ?? anchor;
        this.setEntryStatus(entry, 'PLANNED', null, { plannedBecause: reason });
      }
    } finally {
      this.suppressEmit = false;
    }
    if (this.controller.getState().worldRevision !== revisionBefore) throw new Error('Stream materialization mutated authoritative world state');
    this.queue = queue;
    this.proposal = queue[0] ?? null;
    this.lastPlanningDurationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - planningStartedAt;
    this.emit();
    return this.getState();
  }

  appendToStream(placements, { streamId, mode = 'append', finalChunk = false, cycleTimeMs = null } = {}) {
    if (!PLACEMENT_ID.test(streamId ?? '')) return { ...this.getState(), ok: false, reason: 'invalid_stream_id' };
    if (!['replace', 'append'].includes(mode)) return { ...this.getState(), ok: false, reason: 'invalid_mode' };
    if (!Array.isArray(placements) || placements.length < 1 || placements.length > MAX_STREAM_BATCH) {
      return { ...this.getState(), ok: false, reason: 'invalid_input', maximumStreamBatch: MAX_STREAM_BATCH };
    }
    const normalizedCycleTimeMs = cycleTimeMs ?? (mode === 'append' ? this.stream?.cycleTimeMs : null) ?? DEFAULT_PLACEMENT_CYCLE_MS;
    if (!Number.isInteger(normalizedCycleTimeMs) || normalizedCycleTimeMs < MIN_PLACEMENT_CYCLE_MS || normalizedCycleTimeMs > MAX_PLACEMENT_CYCLE_MS) {
      return { ...this.getState(), ok: false, reason: 'invalid_cycle_time', minimumCycleTimeMs: MIN_PLACEMENT_CYCLE_MS, maximumCycleTimeMs: MAX_PLACEMENT_CYCLE_MS };
    }
    const normalized = placements.map((placement) => normalizeDestination(placement));
    for (const destination of normalized) {
      const invalid = validateDestination(destination);
      if (invalid) return { ...this.getState(), ok: false, reason: 'invalid_input', details: { code: invalid, placementId: destination.placementId } };
    }
    const incoming = new Map();
    for (const destination of normalized) {
      const key = contentKey(destination);
      if (incoming.has(destination.placementId) && incoming.get(destination.placementId) !== key) {
        return { ...this.getState(), ok: false, reason: 'duplicate_placement_conflict', placementId: destination.placementId };
      }
      incoming.set(destination.placementId, key);
    }
    if (mode === 'append' && (!this.stream || this.stream.streamId !== streamId)) {
      return { ...this.getState(), ok: false, reason: 'stream_not_found', streamId };
    }
    const existing = mode === 'append' ? this.stream : null;
    if (existing && cycleTimeMs !== null && existing.cycleTimeMs !== normalizedCycleTimeMs) {
      return { ...this.getState(), ok: false, reason: 'cycle_time_conflict', cycleTimeMs: existing.cycleTimeMs };
    }
    if (existing && existing.entries.length + normalized.filter((destination) => !existing.byId.has(destination.placementId)).length > MAX_STREAM_SIZE) {
      return { ...this.getState(), ok: false, reason: 'stream_capacity', maximumStreamSize: MAX_STREAM_SIZE };
    }
    if (existing) {
      for (const destination of normalized) {
        const prior = existing.byId.get(destination.placementId);
        if (prior && prior.contentKey !== contentKey(destination)) {
          return { ...this.getState(), ok: false, reason: 'duplicate_placement_conflict', placementId: destination.placementId };
        }
      }
      const novel = normalized.find((destination) => !existing.byId.has(destination.placementId));
      if (existing.finalChunk && novel) {
        return { ...this.getState(), ok: false, reason: 'stream_finalized', streamId, placementId: novel.placementId };
      }
    }
    if (mode === 'replace') {
      this.executionGeneration += 1;
      this.stream = { streamId, finalChunk: Boolean(finalChunk), cycleTimeMs: normalizedCycleTimeMs, entries: [], byId: new Map(), streamRevision: this.streamRevision };
      this.queue = [];
      this.proposal = null;
      this.cacheId = streamId;
      this.bumpStreamRevision();
    }
    let appendedCount = 0;
    let duplicateCount = 0;
    for (const destination of normalized) {
      const prior = this.stream.byId.get(destination.placementId);
      if (prior) {
        duplicateCount += 1;
        continue;
      }
      const entry = {
        placementId: destination.placementId,
        sequence: this.stream.entries.length,
        request: destination,
        contentKey: contentKey(destination),
        status: 'PENDING',
        reason: null,
        details: null,
        actualBrickId: null,
        actor: null,
        sourceBrickId: null,
        sourceReassigned: false
      };
      this.stream.entries.push(entry);
      this.stream.byId.set(entry.placementId, entry);
      appendedCount += 1;
    }
    if (finalChunk) this.stream.finalChunk = true;
    if (appendedCount || finalChunk) this.bumpStreamRevision();
    this.reconcileLogicalEntries('stream_append');
    const state = this.materializeWindow('stream_append');
    return { ok: true, ...state, appendedCount, duplicateCount, idempotent: appendedCount === 0 };
  }

  planQueue(placements, { expectedWorldRevision = undefined, streamId = null, mode = null, finalChunk = undefined, cycleTimeMs = null } = {}) {
    const worldRevision = this.controller.getState().worldRevision;
    if (expectedWorldRevision !== undefined && expectedWorldRevision !== worldRevision) {
      return { ...this.getState(), ok: false, reason: 'stale_state', expectedWorldRevision, worldRevision };
    }
    const streamed = streamId !== null || mode !== null || finalChunk !== undefined;
    if (!streamed) {
      if (!Array.isArray(placements) || placements.length < 1 || placements.length > MAX_LOOKAHEAD) {
        return { ...this.getState(), ok: false, reason: 'invalid_input', maximumLookahead: MAX_LOOKAHEAD };
      }
      const legacyStreamId = `lookahead-${++this.cacheSequence}`;
      const normalized = placements.map((placement) => normalizeDestination(placement, `placement-${++this.proposalSequence}`));
      return this.appendToStream(normalized, { streamId: legacyStreamId, mode: 'replace', finalChunk: true, cycleTimeMs });
    }
    return this.appendToStream(placements, {
      streamId,
      mode: mode ?? (this.stream?.streamId === streamId ? 'append' : 'replace'),
      finalChunk: Boolean(finalChunk),
      cycleTimeMs
    });
  }

  getStreamStatus({ streamId = this.stream?.streamId ?? null, cursor = 0, limit = 20, status = null } = {}) {
    const worldRevision = this.controller.getState().worldRevision;
    if (!this.stream || streamId !== this.stream.streamId) return { ok: false, reason: 'stream_not_found', streamId, worldRevision };
    const boundedLimit = Math.max(1, Math.min(MAX_STATUS_PAGE, Math.trunc(limit)));
    const offset = Math.max(0, Math.trunc(cursor));
    const entries = status ? this.stream.entries.filter((entry) => entry.status === status) : this.stream.entries;
    const page = entries.slice(offset, offset + boundedLimit).map((entry) => ({
      placementId: entry.placementId,
      sequence: entry.sequence,
      status: entry.status,
      reason: entry.reason,
      details: entry.details ? clone(entry.details) : null,
      sourceBrickId: entry.sourceBrickId,
      sourceReassigned: Boolean(entry.sourceReassigned),
      actualBrickId: entry.actualBrickId,
      actor: entry.actor,
      preferredColour: entry.request.preferredColour,
      targetPosition: this.expectedTarget(entry) ? clone(this.expectedTarget(entry)) : null,
      targetYawDeg: Number(entry.request.yawRad ?? 0) * 180 / Math.PI,
      supportPlacementId: entry.request.supportPlacementId,
      dependsOnPlacementIds: [...(entry.request.dependsOnPlacementIds ?? [])],
      supportBrickId: entry.resolvedSupportBrickId ?? entry.request.supportBrickId
    }));
    return {
      ok: true,
      ...this.summary(),
      worldRevision,
      cursor: offset,
      limit: boundedLimit,
      returnedCount: page.length,
      totalAvailable: entries.length,
      nextCursor: offset + page.length < entries.length ? offset + page.length : null,
      entries: page,
      activeQueue: this.getState().queue.map((proposal) => ({
        placementId: proposal.placementId,
        proposalId: proposal.proposalId,
        slotIndex: proposal.slotIndex,
        status: proposal.status,
        sourceBrickId: proposal.brickId,
        expectedWorldRevision: proposal.expectedWorldRevision
      }))
    };
  }

  preview(request = {}) {
    this.planQueue([request]);
    return this.getState();
  }

  repairQueue(reason = 'world_changed') {
    if (this.activeAbortController || !this.stream || this.repairing) return this.getState();
    this.repairing = true;
    try {
      this.reconcileLogicalEntries(reason);
      return this.materializeWindow(reason);
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
        placementId: proposal.placementId,
        slotIndex: index,
        slotLabel: String.fromCharCode(65 + index),
        opacityScale: Math.max(0.3, 1 - index * 0.16)
      };
    }).filter(Boolean);
  }

  getRenderPreview() {
    return this.getRenderPreviews()[0] ?? null;
  }

  invalidateStream(reason = 'reset') {
    if (!this.stream && !this.queue.length && !this.proposal) return this.getState();
    this.executionGeneration += 1;
    this.lastInvalidatedStream = this.stream ? {
      streamId: this.stream.streamId,
      reason,
      invalidatedAtWorldRevision: this.controller.getState().worldRevision
    } : null;
    this.stream = null;
    this.queue = [];
    this.cacheId = null;
    this.proposal = null;
    this.bumpStreamRevision();
    this.emit();
    return this.getState();
  }

  cancel() {
    const active = Boolean(this.activeAbortController);
    const result = super.cancel();
    if (!active) this.invalidateStream('cancelled');
    return result;
  }

  humanTakeoverParking(proposal) {
    if (this.controller.board?.blueprintId !== 'simple-bricks' || this.travelPolicy) return null;
    const entry = this.stream?.byId.get(proposal.placementId);
    if (!entry || !this.evaluateOccupancy(entry).humanOverride) return null;
    const target = this.expectedTarget(entry);
    const zMm = this.workcellProfile.placementSurfaceZMm + BRICK_SPEC.bodyHeightMm / 2;
    // Bounded search outside the build plan. Every spare placement still uses
    // the existing mat occupancy, support and robot motion validation.
    for (const radius of [40, 80, 120, 160]) {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const preview = this.placementAuthority.preview({ brickId: proposal.brickId,
          position: { xMm: target.xMm + dx * radius, yMm: target.yMm + dy * radius, zMm }, yawRad: 0 });
        if (!preview.ok || preview.candidate.type !== 'MAT') continue;
        const reserved = this.stream.entries.some(other => {
          const position = this.expectedTarget(other);
          return position && rectanglesOverlap(preview.candidate, { position, yawRad: other.request.yawRad ?? 0 });
        });
        if (!reserved) return preview;
      }
    }
    return null;
  }

  async execute({ proposalId = null, ...options } = {}) {
    const next = this.queue[0] ?? this.proposal;
    if (proposalId && proposalId !== next?.proposalId) {
      return { ok: false, reason: 'invalid_input', message: 'Only the next cached proposal can execute.', nextProposalId: next?.proposalId ?? null };
    }
    if (!next?.placementId || !this.stream) return { ok: false, reason: 'proposal_required' };
    const entry = this.stream.byId.get(next.placementId);
    if (!entry) return { ok: false, reason: 'proposal_required' };
    const generation = this.executionGeneration;
    this.setEntryStatus(entry, 'EXECUTING', null, { proposalId: next.proposalId });
    this.proposal = { ...next, status: 'VALID' };
    this.executionStarting = true;
    let result;
    try {
      result = await super.execute(options);
    } finally {
      this.executionStarting = false;
    }
    if (generation !== this.executionGeneration || !this.stream) {
      this.queue = [];
      this.proposal = null;
      this.emit();
      return { ...result, streamInvalidated: true, remainingQueued: 0 };
    }
    if (result.ok) {
      if (!result.divertedBrickId) {
        entry.actualBrickId = result.brickId;
        entry.actor = 'agent';
        entry.satisfiedAtWorldRevision = result.worldRevision;
        this.setEntryStatus(entry, 'COMPLETED', null, { actor: 'agent', actualBrickId: result.brickId, worldRevision: result.worldRevision });
      } else {
        this.setEntryStatus(entry, 'PENDING');
      }
      const completed = this.queue.shift();
      this.proposal = this.queue[0] ?? null;
      this.reconcileLogicalEntries('previous_proposal_completed');
      this.materializeWindow('previous_proposal_completed');
      return {
        ...result,
        streamId: this.stream.streamId,
        cacheId: this.cacheId,
        placementId: entry.placementId,
        proposalId: completed?.proposalId ?? proposalId,
        remainingQueued: this.queue.length,
        remainingPlacements: this.summary().remainingPlacements
      };
    }
    this.setEntryStatus(entry, result.reason === 'cancelled' ? 'CANCELLED' : 'BLOCKED', result.reason ?? 'execution_failed', {
      proposalId: next.proposalId,
      worldRevision: result.worldRevision
    });
    this.queue = this.queue.filter((proposal) => proposal.placementId !== entry.placementId);
    this.proposal = this.queue[0] ?? null;
    this.reconcileLogicalEntries('execution_failed');
    this.materializeWindow('execution_failed');
    return {
      ...result,
      streamId: this.stream.streamId,
      placementId: entry.placementId,
      remainingQueued: this.queue.length,
      remainingPlacements: this.summary().remainingPlacements
    };
  }
}

export { MAX_LOOKAHEAD, MAX_STATUS_PAGE, MAX_STREAM_BATCH, MAX_STREAM_SIZE };
