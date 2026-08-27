import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { CHALLENGE_LAYOUT } from './ur10-definition.js';

function inside2d(point, rect, margin = 0) {
  return point.xMm >= rect.minX - margin && point.xMm <= rect.maxX + margin &&
    point.yMm >= rect.minY - margin && point.yMm <= rect.maxY + margin;
}

function overlapsAabb(a, b) {
  return Math.abs(a.xMm - b.xMm) * 2 < a.sizeX + b.sizeX &&
    Math.abs(a.yMm - b.yMm) * 2 < a.sizeY + b.sizeY &&
    Math.abs(a.zMm - b.zMm) * 2 < a.sizeZ + b.sizeZ;
}

export function validateCollision({ tcp, heldBrick = null, placedBricks = [], approach = null }, layout = CHALLENGE_LAYOUT) {
  const toolRadius = 14;
  const toolBottomZ = tcp.zMm - 2;
  if (toolBottomZ < layout.tableZMm - 0.5) return { ok: false, reason: 'collision', obstacle: 'table' };

  const inTray = inside2d(tcp, layout.tray, 6);
  const inBoard = inside2d(tcp, layout.board, 6);
  if (tcp.zMm < layout.safeClearanceZMm) {
    if (inTray && approach !== 'pickup') {
      const nearWall = tcp.xMm < layout.tray.minX + 12 || tcp.xMm > layout.tray.maxX - 12 ||
        tcp.yMm < layout.tray.minY + 12 || tcp.yMm > layout.tray.maxY - 12;
      if (nearWall) return { ok: false, reason: 'collision', obstacle: 'tray_wall' };
    }
    if (inBoard && approach !== 'target') {
      return { ok: false, reason: 'collision', obstacle: 'board' };
    }
  }

  const movingBox = heldBrick ? {
    xMm: tcp.xMm,
    yMm: tcp.yMm,
    zMm: tcp.zMm - BRICK_SPEC.capture.tcpAboveCentreMm,
    sizeX: BRICK_SPEC.lengthMm,
    sizeY: BRICK_SPEC.widthMm,
    sizeZ: BRICK_SPEC.bodyHeightMm + BRICK_SPEC.studHeightMm
  } : {
    xMm: tcp.xMm,
    yMm: tcp.yMm,
    zMm: tcp.zMm + 35,
    sizeX: toolRadius * 2,
    sizeY: toolRadius * 2,
    sizeZ: 70
  };

  for (const brick of placedBricks) {
    if (heldBrick && brick.id === heldBrick.id) continue;
    if (approach === 'target' && Math.hypot(tcp.xMm - brick.position.xMm, tcp.yMm - brick.position.yMm) < 24) continue;
    const brickBox = {
      xMm: brick.position.xMm,
      yMm: brick.position.yMm,
      zMm: brick.position.zMm,
      sizeX: BRICK_SPEC.lengthMm,
      sizeY: BRICK_SPEC.widthMm,
      sizeZ: BRICK_SPEC.bodyHeightMm + BRICK_SPEC.studHeightMm
    };
    if (overlapsAabb(movingBox, brickBox)) return { ok: false, reason: 'collision', obstacle: 'brick:' + brick.id };
  }
  return { ok: true };
}
