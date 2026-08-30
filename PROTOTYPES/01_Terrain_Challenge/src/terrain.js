export const PRESETS = Object.freeze({
  FLAT_GAP_SMALL: { seed: 1001, mode: "gap", obstacleWidth: 12, obstacleDepth: 10, noiseAmplitude: 0, noiseFrequency: 48, smoothing: 1.5, terrainAmplitude: 0 },
  FLAT_GAP_LARGE: { seed: 1002, mode: "gap", obstacleWidth: 26, obstacleDepth: 14, noiseAmplitude: 0, noiseFrequency: 48, smoothing: 1.5, terrainAmplitude: 0 },
  RAVINE_SIMPLE: { seed: 2201, mode: "ravine", obstacleWidth: 20, obstacleDepth: 16, noiseAmplitude: 4, noiseFrequency: 52, smoothing: 3, terrainAmplitude: 2.5 },
  RIVER_SIMPLE: { seed: 3301, mode: "river", obstacleWidth: 18, obstacleDepth: 7, noiseAmplitude: 5, noiseFrequency: 58, smoothing: 4, terrainAmplitude: 3 },
  NOISY_TEST: { seed: 9907, mode: "ravine", obstacleWidth: 24, obstacleDepth: 20, noiseAmplitude: 12, noiseFrequency: 28, smoothing: 2, terrainAmplitude: 8 }
});

export const DEFAULT_SETTINGS = Object.freeze({
  ...PRESETS.RAVINE_SIMPLE,
  width: 140,
  depth: 100,
  gridX: 129,
  gridZ: 97,
  deckWidth: 10,
  vehicleClearWidth: 7,
  vehicleClearHeight: 8,
  railMode: "rail-single",
  approachLength: 15,
  approachPadRadius: 10,
  maxSupportSlope: 0.34
});

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}
function hash32(value) {
  let x = value | 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
function rand2(ix, iz, seed) {
  return hash32(ix * 374761393 + iz * 668265263 + seed * 1442695041) / 4294967295 * 2 - 1;
}
function valueNoise2D(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = smoothstep(0, 1, x - x0), tz = smoothstep(0, 1, z - z0);
  const a = rand2(x0, z0, seed), b = rand2(x0 + 1, z0, seed);
  const c = rand2(x0, z0 + 1, seed), d = rand2(x0 + 1, z0 + 1, seed);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}
function fractalNoise(x, z, seed) {
  return valueNoise2D(x, z, seed) * 0.62 + valueNoise2D(x * 2.03, z * 2.03, seed + 19) * 0.27 + valueNoise2D(x * 4.11, z * 4.11, seed + 47) * 0.11;
}
function obstacleCentre(x, settings) {
  if (!settings.noiseAmplitude) return 0;
  return settings.noiseAmplitude * valueNoise2D(x / settings.noiseFrequency, 0.37, settings.seed + 701);
}
function rawHeight(x, z, settings) {
  const terrain = settings.terrainAmplitude * fractalNoise(x / 55, z / 55, settings.seed);
  const centre = obstacleCentre(x, settings);
  const lateral = Math.abs(z - centre);
  const halfWidth = settings.obstacleWidth / 2;
  const channel = 1 - smoothstep(halfWidth, halfWidth + settings.smoothing, lateral);
  const shapedChannel = settings.mode === "gap" ? smoothstep(0, 1, channel) : channel * channel;
  let height = terrain - settings.obstacleDepth * shapedChannel;

  const anchorOffset = halfWidth + settings.smoothing + settings.approachLength;
  for (const padZ of [-anchorOffset, anchorOffset]) {
    const distance = Math.hypot(x, z - padZ);
    const blend = 1 - smoothstep(settings.approachPadRadius * 0.55, settings.approachPadRadius, distance);
    height *= 1 - blend;
  }
  return height;
}

function normaliseSettings(seed, settings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings, seed: Number(seed) | 0 };
  merged.mode = ["gap", "ravine", "river"].includes(merged.mode) ? merged.mode : "gap";
  for (const key of ["width", "depth", "obstacleWidth", "obstacleDepth", "noiseAmplitude", "noiseFrequency", "smoothing", "terrainAmplitude"]) {
    merged[key] = Number(merged[key]);
  }
  merged.gridX = Math.max(3, Number(merged.gridX) | 0);
  merged.gridZ = Math.max(3, Number(merged.gridZ) | 0);
  return merged;
}

export function generateChallenge(seed, settings = {}) {
  const config = normaliseSettings(seed, settings);
  const started = performance.now();
  const heights = new Float32Array(config.gridX * config.gridZ);
  const stepX = config.width / (config.gridX - 1);
  const stepZ = config.depth / (config.gridZ - 1);
  for (let iz = 0; iz < config.gridZ; iz++) {
    const z = -config.depth / 2 + iz * stepZ;
    for (let ix = 0; ix < config.gridX; ix++) {
      const x = -config.width / 2 + ix * stepX;
      heights[iz * config.gridX + ix] = rawHeight(x, z, config);
    }
  }

  const terrainApi = createTerrainApi(config, heights);
  const anchorOffset = config.obstacleWidth / 2 + config.smoothing + config.approachLength;
  const entryY = terrainApi.getHeightAt(0, -anchorOffset);
  const exitY = terrainApi.getHeightAt(0, anchorOffset);
  const entry = { position: { x: 0, y: entryY, z: -anchorOffset }, forward: { x: 0, y: 0, z: 1 }, platformWidth: config.deckWidth + 4, platformLength: config.approachPadRadius * 1.5 };
  const exit = { position: { x: 0, y: exitY, z: anchorOffset }, forward: { x: 0, y: 0, z: 1 }, platformWidth: config.deckWidth + 4, platformLength: config.approachPadRadius * 1.5 };
  const bankMargin = config.obstacleWidth / 2 + config.smoothing;
  const supportRegions = [
    { id: "entry-bank", bounds: { minX: -config.width / 2, maxX: config.width / 2, minZ: -config.depth / 2, maxZ: -bankMargin }, maxSlope: config.maxSupportSlope },
    { id: "exit-bank", bounds: { minX: -config.width / 2, maxX: config.width / 2, minZ: bankMargin, maxZ: config.depth / 2 }, maxSlope: config.maxSupportSlope }
  ];
  const state = {
    version: 3,
    seed: config.seed,
    mode: "rail",
    challengeMode: config.mode,
    terrain: {
      seed: config.seed, width: config.width, depth: config.depth, gridX: config.gridX, gridZ: config.gridZ,
      heightScale: config.terrainAmplitude,
      smoothing: config.smoothing,
      obstacle: { type: config.mode, width: config.obstacleWidth, depth: config.obstacleDepth, noiseAmplitude: config.noiseAmplitude, noiseFrequency: config.noiseFrequency }
    },
    entry,
    exit,
    corridor: { centreline: [entry.position, exit.position], deckWidth: config.deckWidth, vehicleClearWidth: config.vehicleClearWidth, vehicleClearHeight: config.vehicleClearHeight, mode: config.railMode },
    supportRegions
  };
  return { state, settings: config, heights, api: terrainApi, generationMs: performance.now() - started };
}

export function createTerrainApi(settings, heights) {
  const { width, depth, gridX, gridZ } = settings;
  const stepX = width / (gridX - 1), stepZ = depth / (gridZ - 1);
  function getHeightAt(x, z) {
    const gx = clamp((x + width / 2) / stepX, 0, gridX - 1);
    const gz = clamp((z + depth / 2) / stepZ, 0, gridZ - 1);
    const x0 = Math.floor(gx), z0 = Math.floor(gz), x1 = Math.min(x0 + 1, gridX - 1), z1 = Math.min(z0 + 1, gridZ - 1);
    const tx = gx - x0, tz = gz - z0;
    const h00 = heights[z0 * gridX + x0], h10 = heights[z0 * gridX + x1];
    const h01 = heights[z1 * gridX + x0], h11 = heights[z1 * gridX + x1];
    return h00 + (h10 - h00) * tx + (h01 + (h11 - h01) * tx - (h00 + (h10 - h00) * tx)) * tz;
  }
  function getSlopeAt(x, z) {
    const dx = (getHeightAt(x + stepX, z) - getHeightAt(x - stepX, z)) / (2 * stepX);
    const dz = (getHeightAt(x, z + stepZ) - getHeightAt(x, z - stepZ)) / (2 * stepZ);
    return Math.hypot(dx, dz);
  }
  function isSupportable(x, z) {
    const centre = obstacleCentre(x, settings);
    const outsideObstacle = Math.abs(z - centre) > settings.obstacleWidth / 2 + settings.smoothing;
    return outsideObstacle && getSlopeAt(x, z) <= settings.maxSupportSlope;
  }
  function getTerrainBounds() { return { minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2 }; }
  return { getHeightAt, getSlopeAt, isSupportable, getTerrainBounds };
}

export function serialiseChallenge(state) { return JSON.stringify(state, null, 2) + "\n"; }
