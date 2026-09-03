// Positions are offsets in the existing, fixed machine/world millimetre frame.
// The legacy robotMount* values remain the display transform for that whole world.
export const SCENE_LAYOUT_CONTROLS = Object.freeze({
  tableYawDeg: { label: 'TABLE YAW / ROTATION Z', min: -180, max: 180, step: 1 },
  robotBaseXmm: { label: 'ROBOT BASE X (mm)', min: -300, max: 300, step: 1 },
  robotBaseYmm: { label: 'ROBOT BASE Y (mm)', min: -350, max: 350, step: 1 },
  robotBaseZmm: { label: 'ROBOT BASE Z (mm)', min: -100, max: 200, step: 1 },
  robotBaseYawDeg: { label: 'ROBOT BASE YAW', min: -180, max: 180, step: 1 }
});

export function robotBasePoseFromSettings(settings) {
  return { xMm: Number(settings.robotBaseXmm ?? 0), yMm: Number(settings.robotBaseYmm ?? 0),
    zMm: Number(settings.robotBaseZmm ?? 0), yawRad: Number(settings.robotBaseYawDeg ?? 0) * Math.PI / 180 };
}

export function basePoseMatrix({ xMm = 0, yMm = 0, zMm = 0, yawRad = 0 } = {}) {
  const c = Math.cos(yawRad), s = Math.sin(yawRad);
  return [c, -s, 0, xMm, s, c, 0, yMm, 0, 0, 1, zMm, 0, 0, 0, 1];
}
