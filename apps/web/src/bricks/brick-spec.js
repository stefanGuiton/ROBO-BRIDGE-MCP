export const BRICK_SPEC = Object.freeze({
  id: 'generic-2x4-v1',
  type: '2x4',
  studPitchMm: 8,
  logicalCellMm: 16,
  widthMm: 15.8,
  lengthMm: 31.8,
  bodyHeightMm: 9.6,
  heightMm: 9.6,
  studDiameterMm: 4.8,
  studHeightMm: 1.8,
  canonicalYawRad: 0,
  canonicalYawDeg: 0,
  capture: Object.freeze({
    xyToleranceMm: 0.5,
    zToleranceMm: 0.5,
    yawToleranceRad: Math.PI / 900,
    tcpAboveBaseMm: 12.5,
    tcpAboveCentreMm: 7.7
  })
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
    ownership: null,
    placedTargetId: null,
    placementType: null,
    connection: null,
    snapped: false,
    graspable: true
  };
}
