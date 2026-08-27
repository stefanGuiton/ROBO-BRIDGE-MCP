export const BRICK_SPEC = Object.freeze({
  id: 'generic-2x4-v1',
  type: '2x4',
  studPitchMm: 8,
  logicalCellMm: 16,
  widthMm: 16,
  lengthMm: 32,
  bodyHeightMm: 9.6,
  heightMm: 9.6,
  studDiameterMm: 4.8,
  studHeightMm: 1.8,
  canonicalYawRad: 0,
  canonicalYawDeg: 0,
  capture: Object.freeze({ xyToleranceMm: 5.0, zToleranceMm: 3.0, tcpAboveCentreMm: 6.6 })
});

export const DEFAULT_BOARD_LIMITS = Object.freeze({
  maxWidthMm: 480,
  maxHeightMm: 320
});

export function makeBrick({ id, colour = 'white', xMm, yMm, zMm, yawRad = 0 }) {
  return {
    id,
    colour,
    position: { xMm, yMm, zMm },
    yawRad,
    heldBy: null,
    placedTargetId: null,
    snapped: false,
    graspable: true
  };
}
