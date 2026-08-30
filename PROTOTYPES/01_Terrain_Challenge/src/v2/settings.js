const MODES = new Set(["flat-gap", "ravine", "river", "mountain-pass", "alpine-ravine"]);
const RAIL_MODES = new Set(["rail-single", "rail-double", "road"]);

export const BASE_SETTINGS = Object.freeze({
  generatorVersion: 2,
  seed: 24001,
  mode: "mountain-pass",
  chunkWidth: 160,
  chunkDepth: 96,
  baseThickness: 18,
  gridU: 129,
  gridV: 97,
  sharedTopY: 22,
  valleyFloorY: -10,
  floorWidth: 14,
  shoulderWidth: 20,
  shoulderExponent: 1.05,
  centreOffset: 0,
  centreNoiseAmplitude: 3.5,
  centreNoiseScale: 58,
  platformWidth: 18,
  platformLength: 20,
  platformSetback: 5,
  platformBlendWidth: 7,
  moundFalloffWidth: 30,
  moundEdgeDrop: 27,
  mountainPeakScale: 0.9,
  ridgeAmplitude: 10,
  ridgeScale: 20,
  ridgeWarpAmplitude: 10,
  ridgeWarpScale: 54,
  macroAmplitude: 2.2,
  macroScale: 48,
  slopeNoiseAmplitude: 2.1,
  slopeNoiseScale: 16,
  detailAmplitude: 0.35,
  detailScale: 5.5,
  terraceStrength: 0.22,
  terraceCount: 7,
  deckWidth: 10,
  vehicleClearWidth: 8,
  vehicleClearHeight: 9,
  railMode: "rail-single",
  maxSupportSlope: 0.52,
  minEdgeMargin: 3,
  waterLevel: -5,
  stretchX: 1,
  stretchY: 1,
  stretchZ: 1,
  validateMesh: false
});

const preset = (overrides) => Object.freeze({ ...BASE_SETTINGS, ...overrides });

export const PRESETS = Object.freeze({
  V2_FLAT_GAP_SMALL: preset({
    seed: 1001, mode: "flat-gap", chunkWidth: 112, chunkDepth: 76,
    sharedTopY: 6, valleyFloorY: -8, floorWidth: 14, shoulderWidth: 3,
    centreNoiseAmplitude: 0, platformWidth: 16, platformLength: 18,
    moundFalloffWidth: 12, moundEdgeDrop: 0, mountainPeakScale: 1,
    ridgeAmplitude: 0, ridgeWarpAmplitude: 0,
    macroAmplitude: 0, slopeNoiseAmplitude: 0, detailAmplitude: 0,
    terraceStrength: 0, maxSupportSlope: 0.08
  }),
  V2_RAVINE_SIMPLE: preset({
    seed: 2201, mode: "ravine", sharedTopY: 12, valleyFloorY: -9,
    floorWidth: 16, shoulderWidth: 20, centreNoiseAmplitude: 2.2,
    moundFalloffWidth: 26, moundEdgeDrop: 16, mountainPeakScale: 1.18,
    ridgeAmplitude: 2, ridgeScale: 32, ridgeWarpAmplitude: 3,
    macroAmplitude: 0.7, slopeNoiseAmplitude: 0.75, detailAmplitude: 0.16,
    terraceStrength: 0.04, maxSupportSlope: 0.42
  }),
  V2_RIVER_SIMPLE: preset({
    seed: 3301, mode: "river", sharedTopY: 11, valleyFloorY: -9,
    floorWidth: 20, shoulderWidth: 18, centreNoiseAmplitude: 4.5,
    centreNoiseScale: 52, macroAmplitude: 0.8, slopeNoiseAmplitude: 0.7,
    moundFalloffWidth: 28, moundEdgeDrop: 15, mountainPeakScale: 1.18,
    ridgeAmplitude: 1.2, ridgeScale: 36, ridgeWarpAmplitude: 4,
    detailAmplitude: 0.14, terraceStrength: 0.02, waterLevel: -5.2,
    maxSupportSlope: 0.4
  }),
  V2_MOUNTAIN_PASS: preset({ seed: 24001 }),
  V2_ALPINE_RAVINE: preset({
    seed: 47001, mode: "alpine-ravine", sharedTopY: 34, valleyFloorY: -16,
    floorWidth: 12, shoulderWidth: 18, centreNoiseAmplitude: 5.5,
    centreNoiseScale: 44, platformWidth: 17, platformLength: 18,
    platformBlendWidth: 6, macroAmplitude: 3.4, macroScale: 38,
    moundFalloffWidth: 30, moundEdgeDrop: 42, mountainPeakScale: 0.95,
    ridgeAmplitude: 10, ridgeScale: 24, ridgeWarpAmplitude: 8,
    slopeNoiseAmplitude: 3.6, slopeNoiseScale: 12, detailAmplitude: 0.5,
    detailScale: 4.5, terraceStrength: 0.28, terraceCount: 10,
    maxSupportSlope: 0.62
  }),
  V2_CORRUPTION_STRESS: preset({
    seed: 9907, mode: "mountain-pass", sharedTopY: 26, valleyFloorY: -14,
    floorWidth: 15, shoulderWidth: 23, centreNoiseAmplitude: 6,
    centreNoiseScale: 34, macroAmplitude: 4.2, macroScale: 34,
    moundFalloffWidth: 32, moundEdgeDrop: 35, mountainPeakScale: 1.5,
    ridgeAmplitude: 14, ridgeScale: 18, ridgeWarpAmplitude: 14,
    slopeNoiseAmplitude: 4.5, slopeNoiseScale: 10, detailAmplitude: 0.7,
    detailScale: 3.8, terraceStrength: 0.35, terraceCount: 11,
    maxSupportSlope: 0.68
  })
});

const NUMERIC_KEYS = Object.freeze([
  "chunkWidth", "chunkDepth", "baseThickness", "gridU", "gridV", "sharedTopY",
  "valleyFloorY", "floorWidth", "shoulderWidth", "shoulderExponent", "centreOffset",
  "centreNoiseAmplitude", "centreNoiseScale", "platformWidth", "platformLength",
  "platformSetback", "platformBlendWidth", "moundFalloffWidth", "moundEdgeDrop",
  "mountainPeakScale", "ridgeAmplitude", "ridgeScale", "ridgeWarpAmplitude", "ridgeWarpScale",
  "macroAmplitude", "macroScale",
  "slopeNoiseAmplitude", "slopeNoiseScale", "detailAmplitude", "detailScale",
  "terraceStrength", "terraceCount", "deckWidth", "vehicleClearWidth",
  "vehicleClearHeight", "maxSupportSlope", "minEdgeMargin", "waterLevel",
  "stretchX", "stretchY", "stretchZ"
]);

export class TerrainGenerationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "TerrainGenerationError";
    this.code = code;
    this.details = details;
  }
}

function requireCondition(condition, code, message, details) {
  if (!condition) throw new TerrainGenerationError(code, message, details);
}

export function normaliseSettings(seed, input = {}) {
  const result = { ...BASE_SETTINGS, ...input, seed: Number(seed ?? input.seed ?? BASE_SETTINGS.seed) | 0, generatorVersion: 2 };
  requireCondition(MODES.has(result.mode), "INVALID_MODE", `Unsupported terrain mode: ${result.mode}`);
  requireCondition(RAIL_MODES.has(result.railMode), "INVALID_RAIL_MODE", `Unsupported rail mode: ${result.railMode}`);
  for (const key of NUMERIC_KEYS) {
    result[key] = Number(result[key]);
    requireCondition(Number.isFinite(result[key]), "INVALID_NUMBER", `${key} must be finite`, { key, value: input[key] });
  }
  result.gridU = Math.trunc(result.gridU);
  result.gridV = Math.trunc(result.gridV);
  result.terraceCount = Math.trunc(result.terraceCount);
  result.validateMesh = Boolean(result.validateMesh);
  requireCondition(result.gridU >= 9 && result.gridV >= 9 && result.gridU <= 513 && result.gridV <= 513, "INVALID_GRID", "gridU and gridV must be between 9 and 513");
  requireCondition(result.chunkWidth > 0 && result.chunkDepth > 0 && result.baseThickness > 0, "INVALID_CHUNK", "Chunk dimensions and base thickness must be positive");
  requireCondition(result.stretchX >= 0.1 && result.stretchX <= 5 && result.stretchY >= 0.1 && result.stretchY <= 5 && result.stretchZ >= 0.1 && result.stretchZ <= 5, "INVALID_STRETCH", "Axis stretch values must be between 0.1 and 5", { x: result.stretchX, y: result.stretchY, z: result.stretchZ });
  requireCondition(result.sharedTopY > result.valleyFloorY, "INVALID_HEIGHTS", "sharedTopY must exceed valleyFloorY");
  requireCondition(result.floorWidth > 0 && result.shoulderWidth > 0 && result.shoulderExponent > 0, "INVALID_VALLEY", "Valley dimensions must be positive");
  requireCondition(result.centreNoiseScale > 0 && result.macroScale > 0 && result.slopeNoiseScale > 0 && result.detailScale > 0 && result.ridgeScale > 0 && result.ridgeWarpScale > 0, "INVALID_SCALE", "Noise scales must be positive");
  requireCondition(result.platformWidth >= result.deckWidth + 2 && result.platformWidth >= result.vehicleClearWidth + 2, "PLATFORM_TOO_NARROW", "Platform must exceed deck and vehicle clear widths by two units");
  requireCondition(result.platformLength > 0 && result.platformSetback >= 0 && result.platformBlendWidth >= 0, "INVALID_PLATFORM", "Platform dimensions and setback must be valid");
  requireCondition(result.moundFalloffWidth > 0 && result.moundEdgeDrop >= 0 && result.moundEdgeDrop < result.sharedTopY - result.valleyFloorY && result.mountainPeakScale > 0, "INVALID_MOUND", "Mound falloff width and peak scale must be positive, and edge drop must stay within the terrain height range");
  requireCondition(result.ridgeAmplitude >= 0 && result.ridgeWarpAmplitude >= 0, "INVALID_RIDGES", "Ridge and warp amplitudes must be non-negative");
  requireCondition(result.maxSupportSlope >= 0 && result.minEdgeMargin >= 0, "INVALID_SUPPORT", "Support slope and edge margin must be non-negative");
  requireCondition(result.terraceStrength >= 0 && result.terraceStrength <= 1 && result.terraceCount >= 1, "INVALID_TERRACES", "Terrace strength must be 0..1 and terrace count positive");
  const outerRequirement = Math.abs(result.centreOffset) + result.centreNoiseAmplitude + result.floorWidth / 2 + result.shoulderWidth + result.platformSetback + result.platformLength + result.platformBlendWidth + result.minEdgeMargin;
  requireCondition(outerRequirement < result.chunkWidth / 2, "NO_PLATFORM_SPACE", "Chunk is too narrow for two protected platforms", { outerRequirement, halfWidth: result.chunkWidth / 2 });
  requireCondition(result.platformWidth + 2 * (result.platformBlendWidth + result.minEdgeMargin) < result.chunkDepth, "PLATFORM_TOO_DEEP", "Chunk is too shallow for the platform and blend ring");
  return Object.freeze(result);
}

export function presetByName(name) {
  const selected = PRESETS[name];
  if (!selected) throw new TerrainGenerationError("UNKNOWN_PRESET", `Unknown preset: ${name}`);
  return selected;
}
