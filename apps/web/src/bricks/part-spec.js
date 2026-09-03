import { BRICK_SPEC } from './brick-spec.js';

// Geometry/capture metadata only. RobotController and BuildBoard own live state.
export const captureOffset = (part) => part?.captureProxy?.tcpAboveCentreMm
  ?? part?.bridgePart?.captureProxy?.tcpAboveCentreMm ?? BRICK_SPEC.capture.tcpAboveCentreMm;

export function partSize(part) {
  return part?.collisionProxy?.sizeMm ?? part?.bridgePart?.collisionProxy?.sizeMm
    ?? { xMm: BRICK_SPEC.lengthMm, yMm: BRICK_SPEC.widthMm, zMm: BRICK_SPEC.bodyHeightMm };
}

export function partBounds(part, position = part.position, yawRad = part.yawRad ?? 0) {
  const size = partSize(part), c = Math.abs(Math.cos(yawRad)), s = Math.abs(Math.sin(yawRad));
  const extent = { xMm: (c * size.xMm + s * size.yMm) / 2, yMm: (s * size.xMm + c * size.yMm) / 2, zMm: size.zMm / 2 };
  return { min: Object.fromEntries(Object.keys(extent).map(a => [a, position[a] - extent[a]])),
    max: Object.fromEntries(Object.keys(extent).map(a => [a, position[a] + extent[a]])) };
}

export function boundsOverlap(a, b, tolerance = 0.1) {
  return ['xMm', 'yMm', 'zMm'].every(k => a.min[k] < b.max[k] - tolerance && a.max[k] > b.min[k] + tolerance);
}

export function partCollisionBounds(part, position = part.position, yawRad = part.yawRad ?? 0) {
  const boxes = part?.collisionProxy?.boxes ?? part?.bridgePart?.collisionProxy?.boxes;
  if (!boxes?.length) return [partBounds(part, position, yawRad)];
  const c = Math.cos(yawRad), s = Math.sin(yawRad);
  return boxes.map(box => partBounds({ collisionProxy: box }, {
    xMm: position.xMm + c * box.position.xMm - s * box.position.yMm,
    yMm: position.yMm + s * box.position.xMm + c * box.position.yMm,
    zMm: position.zMm + box.position.zMm
  }, yawRad));
}

export function partsOverlap(a, b, tolerance = 0.1) {
  if (!boundsOverlap(partBounds(a), partBounds(b), tolerance)) return false;
  return partCollisionBounds(a).some(x => partCollisionBounds(b).some(y => boundsOverlap(x, y, tolerance)));
}
