import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { CHALLENGE_LAYOUT } from './ur10-definition.js';

const LINK_RADII_MM = Object.freeze([24, 28, 26, 22, 16, 8, 4]);

function aabbFromCenter(center, size, id) {
  return {
    id,
    min: { xMm: center.xMm - size.xMm / 2, yMm: center.yMm - size.yMm / 2, zMm: center.zMm - size.zMm / 2 },
    max: { xMm: center.xMm + size.xMm / 2, yMm: center.yMm + size.yMm / 2, zMm: center.zMm + size.zMm / 2 }
  };
}

function expandAabb(box, margin) {
  return {
    ...box,
    min: { xMm: box.min.xMm - margin, yMm: box.min.yMm - margin, zMm: box.min.zMm - margin },
    max: { xMm: box.max.xMm + margin, yMm: box.max.yMm + margin, zMm: box.max.zMm + margin }
  };
}

function pointInsideAabb(point, box) {
  return point.xMm >= box.min.xMm && point.xMm <= box.max.xMm &&
    point.yMm >= box.min.yMm && point.yMm <= box.max.yMm &&
    point.zMm >= box.min.zMm && point.zMm <= box.max.zMm;
}

export function segmentIntersectsAabb(a, b, box, radiusMm = 0) {
  const expanded = expandAabb(box, radiusMm);
  if (pointInsideAabb(a, expanded) || pointInsideAabb(b, expanded)) return true;
  let tMin = 0;
  let tMax = 1;
  for (const axis of ['xMm', 'yMm', 'zMm']) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-12) {
      if (a[axis] < expanded.min[axis] || a[axis] > expanded.max[axis]) return false;
      continue;
    }
    let t1 = (expanded.min[axis] - a[axis]) / delta;
    let t2 = (expanded.max[axis] - a[axis]) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMax < tMin) return false;
  }
  return tMax >= 0 && tMin <= 1;
}

function dot(a, b) { return a.xMm * b.xMm + a.yMm * b.yMm + a.zMm * b.zMm; }
function sub(a, b) { return { xMm: a.xMm - b.xMm, yMm: a.yMm - b.yMm, zMm: a.zMm - b.zMm }; }
function add(a, b) { return { xMm: a.xMm + b.xMm, yMm: a.yMm + b.yMm, zMm: a.zMm + b.zMm }; }
function scale(a, s) { return { xMm: a.xMm * s, yMm: a.yMm * s, zMm: a.zMm * s }; }
function length2(a) { return dot(a, a); }

export function segmentDistance(a0, a1, b0, b1) {
  const u = sub(a1, a0);
  const v = sub(b1, b0);
  const w = sub(a0, b0);
  const A = dot(u, u);
  const B = dot(u, v);
  const C = dot(v, v);
  const D = dot(u, w);
  const E = dot(v, w);
  const denom = A * C - B * B;
  let sN;
  let sD = denom;
  let tN;
  let tD = denom;
  if (denom < 1e-12) {
    sN = 0; sD = 1; tN = E; tD = C;
  } else {
    sN = B * E - C * D;
    tN = A * E - B * D;
    if (sN < 0) { sN = 0; tN = E; tD = C; }
    else if (sN > sD) { sN = sD; tN = E + B; tD = C; }
  }
  if (tN < 0) {
    tN = 0;
    if (-D < 0) sN = 0;
    else if (-D > A) sN = sD;
    else { sN = -D; sD = A; }
  } else if (tN > tD) {
    tN = tD;
    if (-D + B < 0) sN = 0;
    else if (-D + B > A) sN = sD;
    else { sN = -D + B; sD = A; }
  }
  const sc = Math.abs(sN) < 1e-12 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-12 ? 0 : tN / tD;
  const dP = sub(add(w, scale(u, sc)), scale(v, tc));
  return Math.sqrt(length2(dP));
}

function workcellAabbs(layout) {
  const tray = layout.tray;
  const board = layout.board;
  const wall = 6;
  const walls = [
    aabbFromCenter({ xMm: tray.minX, yMm: (tray.minY + tray.maxY) / 2, zMm: tray.floorZ + tray.wallHeight / 2 }, { xMm: wall, yMm: tray.maxY - tray.minY, zMm: tray.wallHeight }, 'tray_wall_left'),
    aabbFromCenter({ xMm: tray.maxX, yMm: (tray.minY + tray.maxY) / 2, zMm: tray.floorZ + tray.wallHeight / 2 }, { xMm: wall, yMm: tray.maxY - tray.minY, zMm: tray.wallHeight }, 'tray_wall_right'),
    aabbFromCenter({ xMm: (tray.minX + tray.maxX) / 2, yMm: tray.minY, zMm: tray.floorZ + tray.wallHeight / 2 }, { xMm: tray.maxX - tray.minX, yMm: wall, zMm: tray.wallHeight }, 'tray_wall_front'),
    aabbFromCenter({ xMm: (tray.minX + tray.maxX) / 2, yMm: tray.maxY, zMm: tray.floorZ + tray.wallHeight / 2 }, { xMm: tray.maxX - tray.minX, yMm: wall, zMm: tray.wallHeight }, 'tray_wall_back')
  ];
  return {
    table: { id: 'table', min: { xMm: -1000, yMm: -1000, zMm: -80 }, max: { xMm: 1200, yMm: 1000, zMm: layout.tableZMm } },
    board: { id: 'board', min: { xMm: board.minX, yMm: board.minY, zMm: layout.tableZMm }, max: { xMm: board.maxX, yMm: board.maxY, zMm: board.surfaceZ } },
    trayFloor: { id: 'tray_floor', min: { xMm: tray.minX, yMm: tray.minY, zMm: layout.tableZMm }, max: { xMm: tray.maxX, yMm: tray.maxY, zMm: tray.floorZ } },
    walls
  };
}

function brickAabb(brick) {
  return aabbFromCenter(brick.position, { xMm: BRICK_SPEC.lengthMm, yMm: BRICK_SPEC.widthMm, zMm: BRICK_SPEC.bodyHeightMm }, `brick:${brick.id}`);
}

function movingBodyAabb(tcp, heldBrick) {
  if (heldBrick) {
    return aabbFromCenter(
      { xMm: tcp.xMm, yMm: tcp.yMm, zMm: tcp.zMm - BRICK_SPEC.capture.tcpAboveCentreMm },
      { xMm: BRICK_SPEC.lengthMm, yMm: BRICK_SPEC.widthMm, zMm: BRICK_SPEC.bodyHeightMm },
      `held:${heldBrick.id}`
    );
  }
  return aabbFromCenter({ xMm: tcp.xMm, yMm: tcp.yMm, zMm: tcp.zMm + 16 }, { xMm: 24, yMm: 24, zMm: 36 }, 'tool');
}

function aabbOverlap(a, b) {
  return a.min.xMm < b.max.xMm && a.max.xMm > b.min.xMm &&
    a.min.yMm < b.max.yMm && a.max.yMm > b.min.yMm &&
    a.min.zMm < b.max.zMm && a.max.zMm > b.min.zMm;
}

function validateSelfCollision(jointPositions) {
  if (!jointPositions || jointPositions.length < 4) return null;
  const segments = [];
  for (let i = 0; i < jointPositions.length - 1; i += 1) segments.push({ a: jointPositions[i], b: jointPositions[i + 1], radius: LINK_RADII_MM[Math.min(i, LINK_RADII_MM.length - 1)], index: i });
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 2; j < segments.length; j += 1) {
      if (i === 0 && j === 2) continue;
      const distance = segmentDistance(segments[i].a, segments[i].b, segments[j].a, segments[j].b);
      if (distance < segments[i].radius + segments[j].radius - 2) return { ok: false, reason: 'collision', obstacle: `self:${i}:${j}`, distanceMm: distance };
    }
  }
  return null;
}

export function validateCollision({ tcp, jointPositions = null, heldBrick = null, bricks = [], board = null, ignoreBrickIds = [] }, layout = CHALLENGE_LAYOUT) {
  const ignored = new Set(ignoreBrickIds);
  const targetContext = board?.nearestTarget?.(tcp, 24) ?? null;
  const allowBoardContact = Boolean(targetContext && !targetContext.target.occupiedBy && Math.abs(tcp.xMm - targetContext.target.position.xMm) <= 12 && Math.abs(tcp.yMm - targetContext.target.position.yMm) <= 12);
  const pickup = !heldBrick
    ? bricks.filter((brick) => !brick.heldBy && !brick.snapped).map((brick) => ({ brick, distance: Math.hypot(tcp.xMm - brick.position.xMm, tcp.yMm - brick.position.yMm) })).sort((a, b) => a.distance - b.distance)[0]
    : null;
  const intendedPickupId = pickup && pickup.distance <= 8 && Math.abs(tcp.zMm - (pickup.brick.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm)) <= 12 ? pickup.brick.id : null;
  const workcell = workcellAabbs(layout);
  const moving = movingBodyAabb(tcp, heldBrick);

  if (moving.min.zMm < layout.tableZMm - 0.1) return { ok: false, reason: 'collision', obstacle: 'table' };
  if (!allowBoardContact && aabbOverlap(moving, workcell.board)) return { ok: false, reason: 'collision', obstacle: 'board' };
  if (!intendedPickupId && aabbOverlap(moving, workcell.trayFloor)) return { ok: false, reason: 'collision', obstacle: 'tray_floor' };
  for (const wall of workcell.walls) if (aabbOverlap(moving, wall)) return { ok: false, reason: 'collision', obstacle: wall.id };

  for (const brick of bricks) {
    if (ignored.has(brick.id) || brick.id === heldBrick?.id || brick.id === intendedPickupId) continue;
    if (aabbOverlap(moving, brickAabb(brick))) return { ok: false, reason: 'collision', obstacle: `brick:${brick.id}` };
  }

  if (jointPositions?.length >= 2) {
    const self = validateSelfCollision(jointPositions);
    if (self) return self;
    // The published DH frame does not define the project-owned visual link mesh relative to the table.
    // Tool/brick clearance enforces the table plane; moving link capsules are checked against raised workcell geometry and self-collision.
    const environment = [...workcell.walls, workcell.board];
    for (let i = 1; i < jointPositions.length - 1; i += 1) {
      const a = jointPositions[i];
      const b = jointPositions[i + 1];
      const radius = LINK_RADII_MM[Math.min(i, LINK_RADII_MM.length - 1)];
      for (const obstacle of environment) {
        if (obstacle.id === 'board' && allowBoardContact && i >= jointPositions.length - 3) continue;
        if (obstacle.id.startsWith('tray_wall_') && intendedPickupId && i >= jointPositions.length - 3) continue;
        if (segmentIntersectsAabb(a, b, obstacle, radius)) return { ok: false, reason: 'collision', obstacle: `${obstacle.id}:link${i}` };
      }
      for (const brick of bricks) {
        if (ignored.has(brick.id) || brick.id === heldBrick?.id) continue;
        if (brick.id === intendedPickupId && i >= jointPositions.length - 3) continue;
        if (segmentIntersectsAabb(a, b, brickAabb(brick), radius)) return { ok: false, reason: 'collision', obstacle: `brick:${brick.id}:link${i}` };
      }
    }
  }
  return { ok: true, targetId: targetContext?.target?.id ?? null, intendedPickupId };
}
