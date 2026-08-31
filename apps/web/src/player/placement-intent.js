import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { angleWrap, gridCandidateLocal, occupancyCells } from './math.js';
import {
  CONNECTION_SIDES,
  canonicalParallelYaw,
  connectorSideForCells,
  requiredCarriedSide,
  validateConnectorConnection
} from './connector-contract.js';

function rotate2(x, y, yawRad) {
  const cosine = Math.cos(yawRad), sine = Math.sin(yawRad);
  return { x: cosine * x - sine * y, y: sine * x + cosine * y };
}

function axisProjectionRadius(yawRad, halfLength, halfWidth, axisX, axisY) {
  const long = rotate2(1, 0, yawRad), short = rotate2(0, 1, yawRad);
  return halfLength * Math.abs(long.x * axisX + long.y * axisY)
    + halfWidth * Math.abs(short.x * axisX + short.y * axisY);
}

export function brickObbOverlap(a, b, clearanceMm = 0.1, settings = BRICK_SPEC) {
  const halfLength = (settings.brickLengthMm ?? settings.lengthMm) / 2;
  const halfWidth = (settings.brickWidthMm ?? settings.widthMm) / 2;
  const halfHeight = (settings.brickBodyHeightMm ?? settings.bodyHeightMm) / 2;
  if (Math.abs(a.position.zMm - b.position.zMm) >= halfHeight * 2 - clearanceMm) return false;
  const deltaX = b.position.xMm - a.position.xMm, deltaY = b.position.yMm - a.position.yMm;
  for (const yaw of [a.yawRad ?? 0, (a.yawRad ?? 0) + Math.PI / 2, b.yawRad ?? 0, (b.yawRad ?? 0) + Math.PI / 2]) {
    const axisX = Math.cos(yaw), axisY = Math.sin(yaw);
    const distance = Math.abs(deltaX * axisX + deltaY * axisY);
    const radius = axisProjectionRadius(a.yawRad ?? 0, halfLength, halfWidth, axisX, axisY)
      + axisProjectionRadius(b.yawRad ?? 0, halfLength, halfWidth, axisX, axisY);
    if (distance >= radius - clearanceMm) return false;
  }
  return true;
}

export class PlacementIntentEngine {
  constructor(settings, board, graph) {
    this.settings = settings;
    this.board = board;
    this.graph = graph;
    this.rotationQuarterTurns = 0;
    this.lastSupport = null;
    this.lastSide = 'M';
    this.carriedSide = null;
    this.configureTableFrame({
      centre: { xMm: settings.matXmm ?? 0, yMm: settings.matYmm ?? 0 },
      yawRad: (settings.matYawDeg ?? 0) * Math.PI / 180,
      placementSurfaceZMm: (settings.matThicknessMm ?? 2) + (settings.matStudHeightMm ?? 1.8),
      widthMm: settings.matWidthMm ?? 640,
      depthMm: settings.matDepthMm ?? 480
    });
  }

  configureTableFrame({ centre, yawRad, placementSurfaceZMm, widthMm, depthMm }) {
    this.tableFrame = {
      centre: { ...centre }, yawRad, placementSurfaceZMm, widthMm, depthMm,
      studCountX: Math.round(widthMm / this.settings.gridPitchMm),
      studCountY: Math.round(depthMm / this.settings.gridPitchMm),
      gridOriginX: -widthMm / 2 + this.settings.gridPitchMm / 2,
      gridOriginY: -depthMm / 2 + this.settings.gridPitchMm / 2
    };
  }

  worldToMat(point) {
    return rotate2(point.xMm - this.tableFrame.centre.xMm, point.yMm - this.tableFrame.centre.yMm, -this.tableFrame.yawRad);
  }

  matToWorld(x, y, zMm) {
    const rotated = rotate2(x, y, this.tableFrame.yawRad);
    return { xMm: this.tableFrame.centre.xMm + rotated.x, yMm: this.tableFrame.centre.yMm + rotated.y, zMm };
  }

  rotate(direction = 1) {
    this.rotationQuarterTurns = (this.rotationQuarterTurns + (direction < 0 ? 3 : 1)) % 4;
    return this.rotationQuarterTurns * 90;
  }

  reset() {
    this.rotationQuarterTurns = 0;
    this.lastSupport = null;
    this.lastSide = 'M';
    this.carriedSide = null;
  }

  selectSide(support, hitPoint) {
    const local = rotate2(hitPoint.xMm - support.position.xMm, hitPoint.yMm - support.position.yMm, -(support.yawRad ?? 0));
    const band = Math.max(0.1, this.settings.connectionCenterBandMm);
    let side = local.x < -band ? 'L' : local.x > band ? 'R' : 'M';
    if (this.lastSupport === support.id) {
      const hysteresis = Math.max(0, Math.min(0.9, this.settings.connectionSwitchHysteresisPct / 100));
      if (this.lastSide === 'M' && Math.abs(local.x) <= band * (1 + hysteresis)) side = 'M';
      if (this.lastSide === 'L' && local.x < -band * (1 - hysteresis)) side = 'L';
      if (this.lastSide === 'R' && local.x > band * (1 - hysteresis)) side = 'R';
    }
    this.lastSupport = support.id;
    this.lastSide = side;
    return side;
  }

  targetCandidate(target, carried) {
    const yawRad = Number.isFinite(target.yawRad) ? target.yawRad : Number.isFinite(target.yawDeg) ? target.yawDeg * Math.PI / 180 : 0;
    return {
      type: 'TARGET', status: target.occupiedBy ? 'BLOCKED' : 'VALID', valid: !target.occupiedBy,
      blockedReason: target.occupiedBy ? 'TARGET_OCCUPIED' : null, targetId: target.id,
      placementType: 'blueprint-target', position: { ...target.position }, yawRad,
      carriedBrickId: carried.id, connection: null, connections: [], side: null,
      relativeRotationDeg: yawRad * 180 / Math.PI, studCount: 0, overhang: false
    };
  }

  matCandidate(point, carried, bricks) {
    const orientation = this.rotationQuarterTurns % 2, frame = this.tableFrame;
    const local = this.worldToMat(point);
    const grid = gridCandidateLocal(local.x, local.y, orientation, this.settings.gridPitchMm, frame.gridOriginX, frame.gridOriginY);
    const cells = occupancyCells(grid.ix, grid.iy, orientation);
    const inBounds = cells.every(([ix, iy]) => ix >= 0 && iy >= 0 && ix < frame.studCountX && iy < frame.studCountY);
    const occupied = cells.some(([ix, iy]) => { const owner = this.graph.matOwner(ix, iy); return owner !== null && owner !== carried.id; });
    const inRadius = Math.hypot(grid.x - local.x, grid.y - local.y) <= this.settings.snapSearchRadiusMm;
    const yawRad = angleWrap(frame.yawRad + this.rotationQuarterTurns * Math.PI / 2);
    const position = this.matToWorld(grid.x, grid.y, frame.placementSurfaceZMm + this.settings.brickBodyHeightMm / 2);
    const proxy = { id: carried.id, position, yawRad };
    const blocker = inBounds && inRadius && !occupied
      ? bricks.find((brick) => brick.id !== carried.id && brickObbOverlap(proxy, brick, 0.1, this.settings)) : null;
    const valid = inBounds && inRadius && !occupied && !blocker;
    return {
      type: 'MAT', mode: 'MAT', status: !inBounds || !inRadius ? 'NONE' : valid ? 'VALID' : 'BLOCKED', valid,
      blockedReason: occupied ? 'MAT_OCCUPIED' : blocker ? `COLLISION:${blocker.id}` : !inBounds ? 'OUT_OF_BOUNDS' : !inRadius ? 'OUT_OF_RANGE' : null,
      placementType: 'mat', position, yawRad, carriedBrickId: carried.id,
      cells, ix: grid.ix, iy: grid.iy, localX: grid.x, localY: grid.y,
      connection: null, connections: [], side: null, relativeRotationDeg: this.rotationQuarterTurns * 90,
      studCount: 0, overhang: false
    };
  }

  connectionCandidate(support, hitPoint, carried, bricks, requestedCarriedSide = null) {
    const supportSide = this.selectSide(support, hitPoint);
    const pivot = this.graph.connectorWorld(support, supportSide, true);
    const carriedSide = requiredCarriedSide(supportSide);
    const connectorPairMismatch = requestedCarriedSide !== null && requestedCarriedSide !== carriedSide;
    this.carriedSide = carriedSide;
    const supportYaw = support.yawRad ?? 0;
    const targetYaw = canonicalParallelYaw(supportYaw);
    const layer = Number.isInteger(support.stackLayer) ? support.stackLayer + 1
      : Math.max(1, Math.round((support.position.zMm - (this.tableFrame.placementSurfaceZMm + this.settings.brickBodyHeightMm / 2)) / this.settings.brickBodyHeightMm) + 1);
    const anchor = this.graph.connectorLocal(carriedSide, false);
    const carriedAnchor = rotate2(anchor.x, anchor.y, targetYaw);
    const position = {
      xMm: pivot.xMm - carriedAnchor.x,
      yMm: pivot.yMm - carriedAnchor.y,
      zMm: this.tableFrame.placementSurfaceZMm + this.settings.brickBodyHeightMm / 2 + layer * this.settings.brickBodyHeightMm
    };
    const placed = bricks.filter((brick) => this.graph.matRoots.has(brick.id) || this.graph.connectionsFor(brick.id).length > 0);
    if (!placed.some((brick) => brick.id === support.id)) placed.push(support);
    this.graph.rebuildSpatial(placed);
    const matches = [];
    for (let ix = 0; ix < 4; ix += 1) for (let iy = 0; iy < 2; iy += 1) {
      if (!this.graph.isBottomStudFree(carried.id, ix, iy)) continue;
      const bottom = this.graph.studLocal(ix, iy, false), rotated = rotate2(bottom.x, bottom.y, targetYaw);
      const world = { xMm: position.xMm + rotated.x, yMm: position.yMm + rotated.y, zMm: position.zMm + bottom.z };
      const match = this.graph.findFreeTopStudAt(world, 0.10, carried.id);
      if (match) matches.push({ upper: { ix, iy }, lower: { ix: match.ix, iy: match.iy }, lowerBrickId: match.brick.id });
    }
    const groupedPairs = new Map();
    for (const match of matches) {
      if (!groupedPairs.has(match.lowerBrickId)) groupedPairs.set(match.lowerBrickId, []);
      groupedPairs.get(match.lowerBrickId).push({ lower: match.lower, upper: match.upper });
    }
    const connections = [];
    for (const [lowerBrickId, studPairs] of groupedPairs) {
      const lowerConnector = lowerBrickId === support.id
        ? supportSide
        : connectorSideForCells(studPairs.map((pair) => pair.lower));
      const upperConnector = lowerBrickId === support.id
        ? carriedSide
        : connectorSideForCells(studPairs.map((pair) => pair.upper));
      const contract = validateConnectorConnection({ lowerConnector, upperConnector, relativeRotationDeg: 0, studPairs });
      if (contract.valid) connections.push({
        lowerBrickId,
        lowerConnector: contract.lowerConnector,
        upperConnector: contract.upperConnector,
        relativeRotation: contract.relativeRotationDeg,
        studPairs
      });
    }
    const selectedGroupValid = connections.some((connection) => connection.lowerBrickId === support.id
      && connection.lowerConnector === supportSide && connection.upperConnector === carriedSide);
    const allowedSupports = new Set(connections.map((connection) => connection.lowerBrickId));
    const proxy = { id: carried.id, position, yawRad: targetYaw };
    const blocker = bricks.find((brick) => brick.id !== carried.id && !allowedSupports.has(brick.id)
      && brickObbOverlap(proxy, brick, 0.1, this.settings));
    const blockedReason = connectorPairMismatch ? 'CONNECTOR_PAIR_MISMATCH'
      : !selectedGroupValid ? 'CONNECTOR_OCCUPIED_OR_MISALIGNED'
        : blocker ? `COLLISION:${blocker.id}` : null;
    const valid = blockedReason === null;
    const acceptedMatches = connections.flatMap((connection) => connection.studPairs.map((pair) => ({
      lowerBrickId: connection.lowerBrickId,
      lower: pair.lower,
      upper: pair.upper
    })));
    return {
      type: 'BRICK', mode: supportSide, status: valid ? 'VALID' : 'BLOCKED', valid, blockedReason,
      placementType: 'brick-connection', position, previewPosition: { ...position }, yawRad: targetYaw, previewYawRad: targetYaw,
      pivot: { ...pivot }, carriedBrickId: carried.id, supportBrickId: support.id,
      side: supportSide, supportSide, carriedSide, requestedCarriedSide, relativeRotationDeg: 0,
      layer, studMatches: acceptedMatches, studCount: acceptedMatches.length, overhang: acceptedMatches.length < 8,
      connections, connection: connections[0] ?? null
    };
  }

  nearestTarget(point, maximumDistanceMm = this.settings.snapSearchRadiusMm) {
    let best = null;
    for (const target of this.board.getTargets()) {
      if (target.occupiedBy) continue;
      const distance = Math.hypot(point.xMm - target.position.xMm, point.yMm - target.position.yMm);
      if (distance <= maximumDistanceMm && (!best || distance < best.distance)) best = { target, distance };
    }
    return best?.target ?? null;
  }
}

export { CONNECTION_SIDES };
