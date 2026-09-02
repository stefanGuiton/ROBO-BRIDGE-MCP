import { captureOffset, partBounds, boundsOverlap, partsOverlap } from './part-spec.js';
import { PlacementIntentEngine } from '../player/placement-intent.js';
import { isParallelYaw } from '../player/connector-contract.js';

const clone = (value) => structuredClone(value);
const SIDES = new Set(['L', 'M', 'R']);
const PARALLEL_YAW_TOLERANCE_RAD = 2 * Math.PI / 180;

function connectorPoint(graph, support, side) {
  const point = graph.connectorWorld(support, side, true);
  return { xMm: point.xMm, yMm: point.yMm, zMm: point.zMm };
}

export class PlacementAuthority {
  constructor({ board, graph, placementEngine, settings, getBricks, profile = null }) {
    if (!board || !graph || !placementEngine || !settings || typeof getBricks !== 'function') {
      throw new TypeError('board, graph, placementEngine, settings, and getBricks are required');
    }
    this.board = board;
    this.graph = graph;
    this.placementEngine = placementEngine;
    this.settings = settings;
    this.getBricks = getBricks;
    this.profile = profile;
  }

  #engine() {
    const engine = new PlacementIntentEngine(this.settings, this.board, this.graph);
    engine.configureTableFrame(clone(this.placementEngine.tableFrame));
    return engine;
  }

  refreshDerivedGraph() {
    this.graph.clear();
    for (const target of this.board.getTargets()) {
      if (target.occupiedBy) this.graph.registerPlacement(target.occupiedBy, { placementType: 'blueprint-target', cells: [] });
    }
    for (const placement of this.board.getPlacements()) {
      this.graph.registerPlacement(placement.brickId, {
        placementType: placement.placementType,
        cells: placement.cells ?? [],
        connection: placement.connection ?? null,
        connections: placement.connections ?? []
      });
    }
    return this.graph.snapshot();
  }

  preview({ brickId, position = null, yawRad = 0, supportBrickId = null, supportSide = 'M', carriedSide = null } = {}) {
    if (typeof brickId !== 'string' || !brickId) return { ok: false, reason: 'invalid_input', worldRevision: this.board.worldRevision };
    if (position !== null && (!position || ![position.xMm, position.yMm, position.zMm].every(Number.isFinite))) {
      return { ok: false, reason: 'invalid_input', worldRevision: this.board.worldRevision };
    }
    if (!Number.isFinite(yawRad)) return { ok: false, reason: 'invalid_input', worldRevision: this.board.worldRevision };
    if (!SIDES.has(supportSide) || (carriedSide !== null && !SIDES.has(carriedSide))) {
      return { ok: false, reason: 'invalid_input', worldRevision: this.board.worldRevision };
    }
    this.refreshDerivedGraph();
    const bricks = this.getBricks();
    const carried = bricks.find((brick) => brick.id === brickId);
    if (!carried) return { ok: false, reason: 'unknown_brick', worldRevision: this.board.worldRevision };
    const engine = this.#engine();
    let candidate;
    if (supportBrickId) {
      const support = bricks.find((brick) => brick.id === supportBrickId);
      if (!support || support.id === carried.id) return { ok: false, reason: 'unknown_support', worldRevision: this.board.worldRevision };
      engine.rotationQuarterTurns = ((Math.round((yawRad - (support.yawRad ?? 0)) / (Math.PI / 2)) % 4) + 4) % 4;
      candidate = engine.connectionCandidate(
        support,
        connectorPoint(this.graph, support, supportSide),
        { ...carried, yawRad },
        bricks,
        carriedSide
      );
      if (supportSide === 'M' && !isParallelYaw(yawRad, support.yawRad ?? 0, PARALLEL_YAW_TOLERANCE_RAD)) {
        candidate = {
          ...candidate,
          valid: false,
          status: 'BLOCKED',
          blockedReason: 'PERPENDICULAR_CONNECTION_FORBIDDEN',
          requestedYawRad: yawRad
        };
      }
    } else {
      if (!position) return { ok: false, reason: 'invalid_input', worldRevision: this.board.worldRevision };
      const target = engine.nearestTarget(position);
      if (target && Math.abs(position.zMm - target.position.zMm) <= 10) candidate = engine.targetCandidate(target, carried);
      else {
        const baseCentreZMm = engine.tableFrame.placementSurfaceZMm + this.settings.brickBodyHeightMm / 2;
        const support = position.zMm > baseCentreZMm + this.settings.brickBodyHeightMm / 2
          ? bricks
            .filter((brick) => brick.id !== carried.id && (brick.placementType || brick.snapped))
            .map((brick) => ({ brick, distance: Math.hypot(position.xMm - brick.position.xMm, position.yMm - brick.position.yMm) }))
            .filter(({ brick, distance }) => distance <= this.settings.brickLengthMm * 1.25
              && Math.abs((brick.position.zMm + this.settings.brickBodyHeightMm) - position.zMm) <= 2)
            .sort((a, b) => a.distance - b.distance || a.brick.id.localeCompare(b.brick.id))[0]?.brick
          : null;
        if (support) {
          engine.rotationQuarterTurns = ((Math.round((yawRad - (support.yawRad ?? 0)) / (Math.PI / 2)) % 4) + 4) % 4;
          candidate = engine.connectionCandidate(support, position, { ...carried, yawRad }, bricks, carriedSide);
          if (candidate.supportSide === 'M' && !isParallelYaw(yawRad, support.yawRad ?? 0, PARALLEL_YAW_TOLERANCE_RAD)) {
            candidate = {
              ...candidate,
              valid: false,
              status: 'BLOCKED',
              blockedReason: 'PERPENDICULAR_CONNECTION_FORBIDDEN',
              requestedYawRad: yawRad
            };
          }
        } else {
        const frameYaw = engine.tableFrame.yawRad;
        engine.rotationQuarterTurns = ((Math.round((yawRad - frameYaw) / (Math.PI / 2)) % 4) + 4) % 4;
        candidate = engine.matCandidate(position, carried, bricks);
        }
      }
    }
    if (carried.bridgePart) {
      if (candidate?.type !== 'TARGET') return { ok: false, reason: 'bridge_target_required', worldRevision: this.board.worldRevision };
      const bounds = partBounds(carried, candidate.position, candidate.yawRad);
      const obstacle = bounds.min.zMm < (this.constructionTableZMm ?? 0) - 0.1 ? 'table'
        : this.constructionObstacles?.find(box => boundsOverlap(bounds, box))?.id;
      const brickObstacle = bricks.find(b => b.id !== carried.id && !b.heldBy && partsOverlap({ ...carried, position: candidate.position, yawRad: candidate.yawRad }, b));
      if (brickObstacle) return { ok: false, reason: 'collision', obstacle: brickObstacle.id, worldRevision: this.board.worldRevision };
      if (obstacle) return { ok: false, reason: 'collision', obstacle, worldRevision: this.board.worldRevision };
    }
    if (!candidate?.valid) {
      return {
        ok: false,
        reason: String(candidate?.blockedReason ?? 'no_snap_target').toLowerCase(),
        candidate: candidate ? clone(candidate) : null,
        worldRevision: this.board.worldRevision
      };
    }
    const requiredTcp = {
      xMm: candidate.position.xMm,
      yMm: candidate.position.yMm,
      zMm: candidate.position.zMm + captureOffset(carried)
    };
    const clearanceZMm = this.profile?.safeClearanceZMm ?? 400;
    return {
      ok: true,
      valid: true,
      brickId,
      candidate: clone(candidate),
      requiredTcp,
      approachTcp: { ...requiredTcp, zMm: clearanceZMm },
      retreatTcp: { ...requiredTcp, zMm: clearanceZMm },
      worldRevision: this.board.worldRevision
    };
  }

  commit({ brickId, position, yawRad = 0, actor = null, supportBrickId = null, supportSide = 'M', carriedSide = null } = {}) {
    const preview = this.preview({ brickId, position, yawRad, supportBrickId, supportSide, carriedSide });
    if (!preview.ok) return preview;
    const brick = this.getBricks().find((candidate) => candidate.id === brickId);
    const candidate = preview.candidate;
    const targetSnap = this.board.trySnapBrick({
      brickId,
      colour: brick.colour,
      targetId: candidate.targetId,
      position: candidate.position,
      yawRad: candidate.yawRad,
      actor
    });
    let accepted = targetSnap;
    if (!targetSnap.ok) {
      if (brick.bridgePart || ['target_occupied', 'wrong_colour'].includes(targetSnap.reason)) return targetSnap;
      accepted = this.board.acceptPlacement({
        brickId,
        colour: brick.colour,
        position: candidate.position,
        yawRad: candidate.yawRad,
        actor,
        connection: candidate.connections?.length > 1 ? { groups: candidate.connections } : candidate.connection,
        connections: candidate.connections ?? [],
        cells: candidate.cells ?? [],
        placementType: candidate.placementType
      });
      if (!accepted.ok) return accepted;
    }
    this.refreshDerivedGraph();
    return {
      ok: true,
      accepted: true,
      snapped: Boolean(targetSnap.ok),
      targetId: targetSnap.targetId ?? null,
      correctness: Boolean(targetSnap.correctness),
      position: clone(targetSnap.ok ? targetSnap.transform.position : candidate.position),
      yawRad: targetSnap.ok ? targetSnap.transform.yawRad : candidate.yawRad,
      placementType: targetSnap.ok ? 'blueprint-target' : candidate.placementType,
      connection: candidate.connection ? clone(candidate.connection) : null,
      connections: clone(candidate.connections ?? []),
      placement: targetSnap.ok ? null : clone(accepted.placement),
      worldRevision: this.board.worldRevision
    };
  }
}
