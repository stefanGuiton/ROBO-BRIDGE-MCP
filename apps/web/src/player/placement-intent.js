import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { angleWrap } from './math.js';

const SIDES = Object.freeze(['L', 'M', 'R']);
const SIDE_OFFSET = Object.freeze({ L: -BRICK_SPEC.studPitchMm, M: 0, R: BRICK_SPEC.studPitchMm });

function rotate2(x, y, yawRad) {
  const cosine = Math.cos(yawRad);
  const sine = Math.sin(yawRad);
  return { x: cosine * x - sine * y, y: sine * x + cosine * y };
}

function localX(point, brick) {
  const dx = point.xMm - brick.position.xMm;
  const dy = point.yMm - brick.position.yMm;
  return rotate2(dx, dy, -(brick.yawRad ?? 0)).x;
}

function axisProjectionRadius(yawRad, halfLength, halfWidth, axisX, axisY) {
  const long = rotate2(1, 0, yawRad);
  const short = rotate2(0, 1, yawRad);
  return halfLength * Math.abs(long.x * axisX + long.y * axisY)
    + halfWidth * Math.abs(short.x * axisX + short.y * axisY);
}

export function brickObbOverlap(a, b, clearanceMm = 0.1) {
  const halfLength = BRICK_SPEC.lengthMm / 2;
  const halfWidth = BRICK_SPEC.widthMm / 2;
  const halfHeight = BRICK_SPEC.bodyHeightMm / 2;
  if (Math.abs(a.position.zMm - b.position.zMm) >= halfHeight * 2 - clearanceMm) return false;
  const deltaX = b.position.xMm - a.position.xMm;
  const deltaY = b.position.yMm - a.position.yMm;
  for (const yaw of [a.yawRad ?? 0, (a.yawRad ?? 0) + Math.PI / 2, b.yawRad ?? 0, (b.yawRad ?? 0) + Math.PI / 2]) {
    const axisX = Math.cos(yaw);
    const axisY = Math.sin(yaw);
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
  }

  rotate(direction = 1) {
    this.rotationQuarterTurns = (this.rotationQuarterTurns + (direction < 0 ? 3 : 1)) % 4;
    return this.rotationQuarterTurns * 90;
  }

  reset() {
    this.rotationQuarterTurns = 0;
    this.lastSupport = null;
    this.lastSide = 'M';
  }

  selectSide(support, hitPoint) {
    const rawX = localX(hitPoint, support);
    const band = Math.max(0.1, this.settings.connectionCenterBandMm);
    let side = rawX < -band ? 'L' : rawX > band ? 'R' : 'M';
    if (this.lastSupport === support.id) {
      const hysteresis = Math.max(0, Math.min(0.9, this.settings.connectionSwitchHysteresisPct / 100));
      if (this.lastSide === 'M' && Math.abs(rawX) <= band * (1 + hysteresis)) side = 'M';
      if (this.lastSide === 'L' && rawX < -band * (1 - hysteresis)) side = 'L';
      if (this.lastSide === 'R' && rawX > band * (1 - hysteresis)) side = 'R';
    }
    this.lastSupport = support.id;
    this.lastSide = side;
    return side;
  }

  targetCandidate(target, carried) {
    const yawRad = Number.isFinite(target.yawRad)
      ? target.yawRad
      : Number.isFinite(target.yawDeg) ? target.yawDeg * Math.PI / 180 : 0;
    return {
      type: 'TARGET',
      status: target.occupiedBy ? 'BLOCKED' : 'VALID',
      valid: !target.occupiedBy,
      blockedReason: target.occupiedBy ? 'TARGET_OCCUPIED' : null,
      targetId: target.id,
      placementType: 'blueprint-target',
      position: { ...target.position },
      yawRad,
      carriedBrickId: carried.id,
      connection: null,
      side: null,
      relativeRotationDeg: yawRad * 180 / Math.PI
    };
  }

  matCandidate(point, carried, bricks) {
    const pitch = this.settings.gridPitchMm;
    const yawRad = this.rotationQuarterTurns * Math.PI / 2;
    const position = {
      xMm: Math.round(point.xMm / pitch) * pitch,
      yMm: Math.round(point.yMm / pitch) * pitch,
      zMm: BRICK_SPEC.bodyHeightMm / 2
    };
    const proxy = { id: carried.id, position, yawRad };
    const blocker = bricks.find((brick) => brick.id !== carried.id && brickObbOverlap(proxy, brick));
    return {
      type: 'MAT',
      status: blocker ? 'BLOCKED' : 'VALID',
      valid: !blocker,
      blockedReason: blocker ? `COLLISION:${blocker.id}` : null,
      placementType: 'mat',
      position,
      yawRad,
      carriedBrickId: carried.id,
      connection: null,
      side: null,
      relativeRotationDeg: this.rotationQuarterTurns * 90
    };
  }

  connectionCandidate(support, hitPoint, carried, bricks, carriedSide = 'M') {
    const supportSide = this.selectSide(support, hitPoint);
    const supportYaw = support.yawRad ?? 0;
    const targetYaw = angleWrap(supportYaw + this.rotationQuarterTurns * Math.PI / 2);
    const supportOffset = rotate2(SIDE_OFFSET[supportSide], 0, supportYaw);
    const carriedOffset = rotate2(SIDE_OFFSET[carriedSide], 0, targetYaw);
    const position = {
      xMm: support.position.xMm + supportOffset.x - carriedOffset.x,
      yMm: support.position.yMm + supportOffset.y - carriedOffset.y,
      zMm: support.position.zMm + BRICK_SPEC.bodyHeightMm
    };
    const proxy = { id: carried.id, position, yawRad: targetYaw };
    const blocker = bricks.find((brick) => (
      brick.id !== carried.id
      && brick.id !== support.id
      && brickObbOverlap(proxy, brick)
    ));
    const connectorFree = this.graph.isConnectorFree(support.id, 'top', supportSide)
      && this.graph.isConnectorFree(carried.id, 'bottom', carriedSide);
    const valid = !blocker && connectorFree;
    const lowerCells = this.graph.connectorCells(supportSide);
    const upperCells = this.graph.connectorCells(carriedSide);
    return {
      type: 'BRICK',
      status: valid ? 'VALID' : 'BLOCKED',
      valid,
      blockedReason: blocker ? `COLLISION:${blocker.id}` : connectorFree ? null : 'CONNECTOR_OCCUPIED',
      placementType: 'brick-connection',
      position,
      yawRad: targetYaw,
      carriedBrickId: carried.id,
      supportBrickId: support.id,
      side: supportSide,
      carriedSide,
      relativeRotationDeg: this.rotationQuarterTurns * 90,
      connection: {
        lowerBrickId: support.id,
        lowerConnector: supportSide,
        upperConnector: carriedSide,
        relativeRotationDeg: this.rotationQuarterTurns * 90,
        studPairs: lowerCells.map((lower, index) => ({ lower, upper: upperCells[index] }))
      }
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

export { SIDES as CONNECTION_SIDES };
