const STORAGE_KEY = 'roboBridgeMainDemoPlayerV8';

export const PLAYER_SOURCE_PROVENANCE = Object.freeze({
  sourceDemoSha256: '1a9e333dde43a9b223bca47c586e32b5a276f3faf90c6140f2c764a36b947bb9',
  oracleDefaultSettingsSha256: '10ed9e86601f5daab465d0eb7a966907b4841a1618fb31a207d3a7945a6deccb',
  suppliedSettingsSha256: '3e9a58a4b23b96d4ce98a1cd77b8c123ebf14270c1806016da49620713cbc9b9',
  sourceTestReportSha256: '0f78b4d37a17c67a449165a370231b6289f4af778f37eba8306e90885229e632'
});

export const PLAYER_FALLBACK_SETTINGS = Object.freeze({
  mouseSensitivityRadPerPx: 0.00165,
  invertY: false,
  mouseSmoothingS: 0.012,
  pitchMinDeg: -89,
  pitchMaxDeg: 89,
  fovDeg: 62,
  cameraZoom: 1.3,
  cameraZoomWheelStep: 0.1,
  cameraZoomMin: 0.5,
  cameraZoomMax: 4,
  nearClipMm: 2,
  farClipMm: 12000,
  playerEyeHeightMm: 1650,
  playerCollisionEnabled: true,
  playerCollisionDiameterMm: 50,
  playerCollisionHeightMm: 1600,
  playerCollisionEyeFromBottomMm: 1500,
  playerCollisionSkinMm: 4,
  playerCollisionMaxIterations: 3,
  moveSpeedMmS: 1500,
  verticalSpeedMmS: 1000,
  sprintMultiplier: 2.2,
  accelerationMmS2: 5500,
  decelerationMmS2: 6500,
  movementDampingPerS: 6,
  maximumSpeedMmS: 3600,
  movementFollowsPitch: false,
  playerSpawnBehindTableMm: 260,
  unlimitedPickupReach: true,
  maximumPickupDistanceMm: 20000,
  holdForwardDistanceMm: 300,
  holdSideOffsetMm: 0,
  holdVerticalOffsetMm: 10,
  mobileControlsMode: 'Auto',
  mobileLookSensitivityRadPerPx: 0.003,
  mobileInstantDragPickup: true,
  mobileTouchMoveThresholdPx: 4,
  mobileDpadSpeedScale: 0.82,
  mobileRotateButtonSizePx: 116,
  mobilePickupHitboxScale: 1.3,
  mobilePickupScreenRadiusPx: 20,
  mobilePlacementCaptureScale: 1.35,
  physicsHz: 240,
  maximumSubsteps: 8,
  maximumCatchupS: 0.05,
  brickConnectionsEnabled: true,
  connectionCenterBandMm: 4,
  connectionSwitchHysteresisPct: 15,
  connectionPreviewRotationMs: 100,
  structuralCollapseEnabled: false,
  placementHitscanDistanceMm: 4000,
  gridPitchMm: 8,
  snapSearchRadiusMm: 22,
  snapDurationS: 0.18,
  ghostOpacity: 0.34,
  allowPickingPlacedBricks: true,
  brickCollisionEnabled: true,
  brickLengthMm: 31.8,
  brickWidthMm: 15.8,
  brickBodyHeightMm: 9.6,
  studPitchMm: 8,
  studDiameterMm: 4.8,
  studHeightMm: 1.8,
  pixelRatioCap: 1,
  mobilePixelRatioCap: 1,
  shadowsEnabled: true,
  shadowMapResolution: 1024,
  exposure: 1.05,
  toneMapping: 'ACES',
  colorGradingEnabled: false,
  gradeExposureEV: 0,
  gradeTemperature: 0,
  gradeTint: 0,
  gradeContrast: 1,
  gradeSaturation: 1,
  gradeLift: 0,
  gradeGamma: 1,
  gradeGain: 1,
  gradeShadows: 0,
  gradeMidtones: 0,
  gradeHighlights: 0,
  lutEnabled: false,
  lutStrength: 1,
  lutName: 'None',
  lutSize: 0,
  robotTargetsVisible: false,
  robotMountXmm: -820,
  robotMountYmm: 170,
  robotMountZmm: 1200,
  robotMountYawDeg: 0
});

function sanitizeSettings(input = {}, allowedKeys = null) {
  const allowed = allowedKeys ? new Set(allowedKeys) : null;
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => (
    (!allowed || allowed.has(key))
    && /^[A-Za-z][A-Za-z0-9_]*$/.test(key)
    && (value === null || ['boolean', 'number', 'string'].includes(typeof value))
  )));
}

export async function loadPlayerSettings() {
  let supplied = {};
  try {
    const response = await fetch(new URL('../../config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url));
    if (response.ok) supplied = await response.json();
  } catch {
    supplied = {};
  }
  const suppliedSettings = sanitizeSettings(supplied);
  const allowedKeys = new Set([
    ...Object.keys(PLAYER_FALLBACK_SETTINGS),
    ...Object.keys(suppliedSettings)
  ]);
  let persisted = {};
  try {
    persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    persisted = {};
  }
  return Object.freeze({
    ...PLAYER_FALLBACK_SETTINGS,
    ...suppliedSettings,
    ...sanitizeSettings(persisted, allowedKeys),
    structuralCollapseEnabled: false
  });
}

export class PlayerSettingsStore {
  constructor(settings) {
    this.value = { ...PLAYER_FALLBACK_SETTINGS, ...sanitizeSettings(settings), structuralCollapseEnabled: false };
    this.listeners = new Set();
  }

  get() { return this.value; }

  set(key, value) {
    if (!(key in this.value) || key === 'structuralCollapseEnabled') return false;
    this.value[key] = value;
    this.persist();
    for (const listener of this.listeners) listener(key, value, this.value);
    return true;
  }

  setMany(values) {
    const sanitized = sanitizeSettings(values, Object.keys(this.value));
    if (!Object.keys(sanitized).length) return { ok: false, reason: 'no_valid_settings' };
    for (const [key, value] of Object.entries(sanitized)) {
      if (key !== 'structuralCollapseEnabled') this.value[key] = value;
    }
    this.value.structuralCollapseEnabled = false;
    this.persist();
    for (const listener of this.listeners) listener('*', null, this.value);
    return { ok: true, count: Object.keys(sanitized).length };
  }

  reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage is optional */ }
    return { ...this.value, structuralCollapseEnabled: false };
  }

  persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.value)); } catch { /* storage is optional */ }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  exportJSON() {
    return JSON.stringify({ ...this.value, structuralCollapseEnabled: false }, null, 2);
  }
}
