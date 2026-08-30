import { checksumString, checksumTypedArray, stableStringify } from "./checksums.js";
import { buildWaterRibbon, buildWatertightMesh, validateWatertightMesh } from "./mesh-builder.js";
import { createNoiseStreams } from "./prng.js";
import { normaliseSettings, TerrainGenerationError } from "./settings.js";

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smoothstep01 = (value) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const smootherstep01 = (value) => { const t = clamp(value, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const now = () => performance.now();

function gridCoordinate(index, count, size) {
  return -size / 2 + index * size / (count - 1);
}

function interpolateGrid(array, x, z, settings) {
  const { chunkWidth, chunkDepth, gridU, gridV } = settings;
  const gx = clamp((x + chunkWidth / 2) / chunkWidth * (gridU - 1), 0, gridU - 1);
  const gz = clamp((z + chunkDepth / 2) / chunkDepth * (gridV - 1), 0, gridV - 1);
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const x1 = Math.min(x0 + 1, gridU - 1), z1 = Math.min(z0 + 1, gridV - 1);
  const tx = gx - x0, tz = gz - z0;
  const a = mix(array[z0 * gridU + x0], array[z0 * gridU + x1], tx);
  const b = mix(array[z1 * gridU + x0], array[z1 * gridU + x1], tx);
  return mix(a, b, tz);
}

function rectanglePolygon(bounds) {
  return [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.minX, z: bounds.maxZ }
  ];
}

function pointInBounds(x, z, bounds, epsilon = 1e-7) {
  return x >= bounds.minX - epsilon && x <= bounds.maxX + epsilon && z >= bounds.minZ - epsilon && z <= bounds.maxZ + epsilon;
}

function distanceOutsideBounds(x, z, bounds) {
  const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
  const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
  return Math.hypot(dx, dz);
}

function createCentreline(settings, noise) {
  const centres = new Float32Array(settings.gridV);
  const centreline = [];
  for (let iz = 0; iz < settings.gridV; iz += 1) {
    const z = gridCoordinate(iz, settings.gridV, settings.chunkDepth);
    const variation = settings.centreNoiseAmplitude === 0 ? 0 : noise.centre(z / settings.centreNoiseScale, 0.271) * settings.centreNoiseAmplitude;
    const x = settings.centreOffset + variation;
    centres[iz] = x;
    centreline.push({ x, y: settings.valleyFloorY, z });
  }
  return { centres, centreline };
}

function createPlatforms(settings, centres) {
  const stepU = settings.chunkWidth / (settings.gridU - 1);
  const stepV = settings.chunkDepth / (settings.gridV - 1);
  const halfLengthCells = Math.ceil((settings.platformLength / 2) / stepU);
  const halfWidthCells = Math.ceil((settings.platformWidth / 2) / stepV);
  const actualHalfLength = halfLengthCells * stepU;
  const actualHalfWidth = halfWidthCells * stepV;
  let maximumCentreMagnitude = 0;
  for (let iz = 0; iz < settings.gridV; iz += 1) {
    const z = gridCoordinate(iz, settings.gridV, settings.chunkDepth);
    if (Math.abs(z) <= actualHalfWidth + settings.platformBlendWidth) maximumCentreMagnitude = Math.max(maximumCentreMagnitude, Math.abs(centres[iz]));
  }
  const requiredDistance = maximumCentreMagnitude + settings.floorWidth / 2 + settings.shoulderWidth + settings.platformSetback + actualHalfLength;
  const centreGridIndex = (settings.gridU - 1) / 2;
  let offsetCells = Math.ceil(requiredDistance / stepU);
  let chosenDistance = null;
  while (offsetCells < centreGridIndex) {
    const distance = offsetCells * stepU;
    const outer = distance + actualHalfLength + settings.platformBlendWidth + settings.minEdgeMargin;
    if (outer < settings.chunkWidth / 2) { chosenDistance = distance; break; }
    offsetCells += 1;
  }
  if (chosenDistance === null) throw new TerrainGenerationError("PLATFORM_SEARCH_FAILED", "No symmetric protected-platform pair fits the generated obstacle", { requiredDistance });
  const make = (side, x) => {
    const bounds = { minX: x - actualHalfLength, maxX: x + actualHalfLength, minZ: -actualHalfWidth, maxZ: actualHalfWidth };
    return Object.freeze({
      id: `${side}-platform`, side,
      centre: { x, y: settings.sharedTopY, z: 0 },
      planeY: settings.sharedTopY,
      width: actualHalfWidth * 2,
      length: actualHalfLength * 2,
      forward: { x: 1, y: 0, z: 0 },
      bounds: Object.freeze(bounds),
      polygon: Object.freeze(rectanglePolygon(bounds).map(Object.freeze))
    });
  };
  return Object.freeze({ left: make("left", -chosenDistance), right: make("right", chosenDistance), sharedPlaneY: settings.sharedTopY });
}

function platformFlattenWeight(x, z, platform, settings, stepU, stepV) {
  const safety = {
    minX: platform.bounds.minX - stepU,
    maxX: platform.bounds.maxX + stepU,
    minZ: platform.bounds.minZ - stepV,
    maxZ: platform.bounds.maxZ + stepV
  };
  const distance = distanceOutsideBounds(x, z, safety);
  if (distance === 0) return 1;
  if (settings.platformBlendWidth === 0 || distance >= settings.platformBlendWidth) return 0;
  return 1 - smootherstep01(distance / settings.platformBlendWidth);
}

function sampleCentreAtZ(centres, z, settings) {
  const scaled = clamp((z + settings.chunkDepth / 2) / settings.chunkDepth * (settings.gridV - 1), 0, settings.gridV - 1);
  const low = Math.floor(scaled), high = Math.min(low + 1, settings.gridV - 1);
  return mix(centres[low], centres[high], scaled - low);
}

function ridgedMultifractal(sample, x, z) {
  let frequency = 1;
  let amplitude = 0.58;
  let weight = 1;
  let total = 0;
  let normaliser = 0;
  for (let octave = 0; octave < 3; octave += 1) {
    let signal = 1 - Math.abs(sample(x * frequency, z * frequency));
    signal *= signal;
    signal *= weight;
    weight = clamp(signal * 2.15, 0, 1);
    total += signal * amplitude;
    normaliser += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return total / normaliser;
}

function createHeightField(settings, noise, centres, platforms) {
  const heightField = new Float32Array(settings.gridU * settings.gridV);
  const displacementMask = new Float32Array(heightField.length);
  const platformMask = new Uint8Array(heightField.length);
  const stepU = settings.chunkWidth / (settings.gridU - 1);
  const stepV = settings.chunkDepth / (settings.gridV - 1);
  const floorHalfWidth = settings.floorWidth / 2;
  const heightRange = settings.sharedTopY - settings.valleyFloorY;
  for (let iz = 0; iz < settings.gridV; iz += 1) {
    const z = gridCoordinate(iz, settings.gridV, settings.chunkDepth);
    for (let ix = 0; ix < settings.gridU; ix += 1) {
      const x = gridCoordinate(ix, settings.gridU, settings.chunkWidth);
      const index = iz * settings.gridU + ix;
      const lateralDistance = Math.abs(x - centres[iz]);
      const shoulderT = clamp((lateralDistance - floorHalfWidth) / settings.shoulderWidth, 0, 1);
      const shapedT = smootherstep01(Math.pow(shoulderT, settings.shoulderExponent));
      const slopeMask = Math.sin(Math.PI * shoulderT) ** 2;
      const bankMask = smoothstep01((shoulderT - 0.58) / 0.42);
      const edgeDistance = Math.min(x + settings.chunkWidth / 2, settings.chunkWidth / 2 - x, z + settings.chunkDepth / 2, settings.chunkDepth / 2 - z);
      const perimeterMask = smootherstep01(edgeDistance / Math.max(settings.minEdgeMargin * 2, Math.min(stepU, stepV)));
      const groundY = settings.sharedTopY - settings.moundEdgeDrop;
      const sideEdgeDistance = x < centres[iz] ? x + settings.chunkWidth / 2 : settings.chunkWidth / 2 - x;
      const longitudinalEdgeDistance = settings.chunkDepth / 2 - Math.abs(z);
      const sideEnvelope = smootherstep01(sideEdgeDistance / settings.moundFalloffWidth);
      const longitudinalEnvelope = smootherstep01(longitudinalEdgeDistance / settings.moundFalloffWidth);
      let platformInfluence = 0;
      for (const platform of [platforms.left, platforms.right]) platformInfluence = Math.max(platformInfluence, platformFlattenWeight(x, z, platform, settings, stepU, stepV));
      const approachBlend = Math.max(settings.platformBlendWidth, stepU * 2);
      const leftApproach = {
        minX: platforms.left.bounds.minX,
        maxX: centres[iz] - floorHalfWidth - settings.shoulderWidth * 0.84,
        minZ: platforms.left.bounds.minZ - stepV,
        maxZ: platforms.left.bounds.maxZ + stepV
      };
      const rightApproach = {
        minX: centres[iz] + floorHalfWidth + settings.shoulderWidth * 0.84,
        maxX: platforms.right.bounds.maxX,
        minZ: platforms.right.bounds.minZ - stepV,
        maxZ: platforms.right.bounds.maxZ + stepV
      };
      const approachDistance = Math.min(distanceOutsideBounds(x, z, leftApproach), distanceOutsideBounds(x, z, rightApproach));
      const approachInfluence = approachDistance >= approachBlend ? 0 : 1 - smootherstep01(approachDistance / approachBlend);
      const mountainEnvelope = Math.max(Math.sqrt(sideEnvelope * longitudinalEnvelope), platformInfluence * 0.82, approachInfluence * 0.82);
      const warpX = noise.ridgeWarp(x / settings.ridgeWarpScale, z / settings.ridgeWarpScale) * settings.ridgeWarpAmplitude;
      const warpZ = noise.ridgeWarp((x + 137.2) / settings.ridgeWarpScale, (z - 91.7) / settings.ridgeWarpScale) * settings.ridgeWarpAmplitude;
      const ridge = ridgedMultifractal(noise.ridge, (x + warpX) / settings.ridgeScale, (z + warpZ) / (settings.ridgeScale * 1.55));
      const mountainRise = settings.moundEdgeDrop * mountainEnvelope * settings.mountainPeakScale;
      const baseMountainHeight = groundY + mountainRise;
      const highGroundThreshold = settings.valleyFloorY + heightRange * 0.55;
      const valleyHeight = mix(settings.valleyFloorY, settings.sharedTopY, shapedT);
      const analyticHighGround = Math.min(valleyHeight, baseMountainHeight) >= highGroundThreshold;
      const ridgeBodyMask = smootherstep01((baseMountainHeight - highGroundThreshold) / Math.max(settings.sharedTopY - highGroundThreshold, 1e-6));
      const ridgeDisplacement = (ridge - 0.46) * settings.ridgeAmplitude * ridgeBodyMask;
      const mountainHeight = Math.min(settings.sharedTopY, baseMountainHeight + ridgeDisplacement);
      let height = Math.min(valleyHeight, mountainHeight);
      const macro = noise.macro(x / settings.macroScale, z / settings.macroScale) * settings.macroAmplitude * bankMask;
      const slopeBreakup = noise.slope(x / settings.slopeNoiseScale, z / settings.slopeNoiseScale) * settings.slopeNoiseAmplitude * slopeMask;
      const detail = noise.detail(x / settings.detailScale, z / settings.detailScale) * settings.detailAmplitude * (0.18 + 0.82 * Math.max(bankMask, slopeMask));
      if (settings.terraceStrength > 0 && shoulderT > 0 && shoulderT < 1) {
        const level = clamp((height - settings.valleyFloorY) / heightRange, 0, 1);
        const terraced = Math.round(level * settings.terraceCount) / settings.terraceCount;
        height = mix(height, settings.valleyFloorY + terraced * heightRange, settings.terraceStrength * slopeMask);
      }
      let allowed = perimeterMask;
      for (const platform of [platforms.left, platforms.right]) allowed *= 1 - platformFlattenWeight(x, z, platform, settings, stepU, stepV);
      displacementMask[index] = allowed;
      height += (macro + slopeBreakup + detail) * allowed;
      height = Math.min(height, settings.sharedTopY);
      const topologyEpsilon = 1e-4;
      if (analyticHighGround) height = Math.max(height, highGroundThreshold + topologyEpsilon);
      else height = Math.min(height, highGroundThreshold - topologyEpsilon);
      let flatten = 0;
      for (const platform of [platforms.left, platforms.right]) flatten = Math.max(flatten, platformFlattenWeight(x, z, platform, settings, stepU, stepV));
      if (flatten > 0) height = mix(height, settings.sharedTopY, flatten);
      if (pointInBounds(x, z, platforms.left.bounds) || pointInBounds(x, z, platforms.right.bounds)) {
        height = settings.sharedTopY;
        displacementMask[index] = 0;
        platformMask[index] = 1;
      }
      heightField[index] = height;
    }
  }
  return { heightField, displacementMask, platformMask };
}

function applyAxisStretch(sourceSettings, sourceCentres, sourceCentreline, sourcePlatforms, sourceHeightField) {
  const sx = sourceSettings.stretchX;
  const sy = sourceSettings.stretchY;
  const sz = sourceSettings.stretchZ;
  if (sx === 1 && sy === 1 && sz === 1) {
    return {
      settings: sourceSettings,
      centres: sourceCentres,
      centreline: sourceCentreline,
      platforms: sourcePlatforms,
      heightField: sourceHeightField
    };
  }

  const horizontalMean = Math.sqrt(sx * sz);
  const settings = Object.freeze({
    ...sourceSettings,
    chunkWidth: sourceSettings.chunkWidth * sx,
    chunkDepth: sourceSettings.chunkDepth * sz,
    baseThickness: sourceSettings.baseThickness * sy,
    sharedTopY: sourceSettings.sharedTopY * sy,
    valleyFloorY: sourceSettings.valleyFloorY * sy,
    floorWidth: sourceSettings.floorWidth * sx,
    shoulderWidth: sourceSettings.shoulderWidth * sx,
    centreOffset: sourceSettings.centreOffset * sx,
    centreNoiseAmplitude: sourceSettings.centreNoiseAmplitude * sx,
    centreNoiseScale: sourceSettings.centreNoiseScale * sz,
    platformWidth: sourceSettings.platformWidth * sz,
    platformLength: sourceSettings.platformLength * sx,
    platformSetback: sourceSettings.platformSetback * sx,
    platformBlendWidth: sourceSettings.platformBlendWidth * horizontalMean,
    moundFalloffWidth: sourceSettings.moundFalloffWidth * horizontalMean,
    moundEdgeDrop: sourceSettings.moundEdgeDrop * sy,
    ridgeAmplitude: sourceSettings.ridgeAmplitude * sy,
    ridgeScale: sourceSettings.ridgeScale * horizontalMean,
    ridgeWarpAmplitude: sourceSettings.ridgeWarpAmplitude * horizontalMean,
    ridgeWarpScale: sourceSettings.ridgeWarpScale * horizontalMean,
    macroAmplitude: sourceSettings.macroAmplitude * sy,
    macroScale: sourceSettings.macroScale * horizontalMean,
    slopeNoiseAmplitude: sourceSettings.slopeNoiseAmplitude * sy,
    slopeNoiseScale: sourceSettings.slopeNoiseScale * horizontalMean,
    detailAmplitude: sourceSettings.detailAmplitude * sy,
    detailScale: sourceSettings.detailScale * horizontalMean,
    deckWidth: sourceSettings.deckWidth * sz,
    vehicleClearWidth: sourceSettings.vehicleClearWidth * sz,
    vehicleClearHeight: sourceSettings.vehicleClearHeight * sy,
    minEdgeMargin: sourceSettings.minEdgeMargin * Math.min(sx, sz),
    waterLevel: sourceSettings.waterLevel * sy
  });
  const centres = new Float32Array(sourceCentres.length);
  for (let index = 0; index < sourceCentres.length; index += 1) centres[index] = sourceCentres[index] * sx;
  const centreline = sourceCentreline.map((point) => ({ x: point.x * sx, y: point.y * sy, z: point.z * sz }));
  const heightField = new Float32Array(sourceHeightField.length);
  for (let index = 0; index < sourceHeightField.length; index += 1) heightField[index] = sourceHeightField[index] * sy;
  const transformPlatform = (platform) => {
    const bounds = Object.freeze({
      minX: platform.bounds.minX * sx,
      maxX: platform.bounds.maxX * sx,
      minZ: platform.bounds.minZ * sz,
      maxZ: platform.bounds.maxZ * sz
    });
    return Object.freeze({
      ...platform,
      centre: Object.freeze({ x: platform.centre.x * sx, y: platform.centre.y * sy, z: platform.centre.z * sz }),
      planeY: platform.planeY * sy,
      width: platform.width * sz,
      length: platform.length * sx,
      bounds,
      polygon: Object.freeze(rectanglePolygon(bounds).map(Object.freeze))
    });
  };
  const platforms = Object.freeze({
    left: transformPlatform(sourcePlatforms.left),
    right: transformPlatform(sourcePlatforms.right),
    sharedPlaneY: sourcePlatforms.sharedPlaneY * sy
  });
  return { settings, centres, centreline, platforms, heightField };
}

function createSlopeField(settings, heights, platformMask) {
  const slopes = new Float32Array(heights.length);
  const stepU = settings.chunkWidth / (settings.gridU - 1);
  const stepV = settings.chunkDepth / (settings.gridV - 1);
  for (let iz = 0; iz < settings.gridV; iz += 1) {
    const zLow = Math.max(0, iz - 1), zHigh = Math.min(settings.gridV - 1, iz + 1);
    for (let ix = 0; ix < settings.gridU; ix += 1) {
      const index = iz * settings.gridU + ix;
      if (platformMask[index]) { slopes[index] = 0; continue; }
      const xLow = Math.max(0, ix - 1), xHigh = Math.min(settings.gridU - 1, ix + 1);
      const dx = (heights[iz * settings.gridU + xHigh] - heights[iz * settings.gridU + xLow]) / ((xHigh - xLow) * stepU || 1);
      const dz = (heights[zHigh * settings.gridU + ix] - heights[zLow * settings.gridU + ix]) / ((zHigh - zLow) * stepV || 1);
      slopes[index] = Math.hypot(dx, dz);
    }
  }
  return slopes;
}

function createSupportMask(settings, heights, slopes, centres, platforms, platformMask) {
  const supportMask = new Uint8Array(heights.length);
  const obstacleMargin = settings.floorWidth / 2 + settings.shoulderWidth * 0.72;
  for (let iz = 0; iz < settings.gridV; iz += 1) {
    const z = gridCoordinate(iz, settings.gridV, settings.chunkDepth);
    for (let ix = 0; ix < settings.gridU; ix += 1) {
      const x = gridCoordinate(ix, settings.gridU, settings.chunkWidth);
      const index = iz * settings.gridU + ix;
      if (platformMask[index]) { supportMask[index] = 1; continue; }
      const edgeDistance = Math.min(x + settings.chunkWidth / 2, settings.chunkWidth / 2 - x, z + settings.chunkDepth / 2, settings.chunkDepth / 2 - z);
      const outsideObstacle = Math.abs(x - centres[iz]) > obstacleMargin;
      const withinKnownBank = x < centres[iz] - obstacleMargin || x > centres[iz] + obstacleMargin;
      supportMask[index] = Number(edgeDistance >= settings.minEdgeMargin && outsideObstacle && withinKnownBank && slopes[index] <= settings.maxSupportSlope);
    }
  }
  for (const platform of [platforms.left, platforms.right]) {
    if (!pointInBounds(platform.centre.x, platform.centre.z, platform.bounds)) throw new TerrainGenerationError("INVALID_PLATFORM", "Platform centre escaped its polygon");
  }
  return supportMask;
}

function safeSupportCells(settings, supportMask, centres) {
  const rows = [];
  const floorHalf = settings.floorWidth / 2;
  for (let iz = 0; iz < settings.gridV - 1; iz += 1) {
    const row = { left: [], right: [] };
    let run = null;
    let runSide = null;
    const flush = () => {
      if (run) row[runSide].push(run);
      run = null; runSide = null;
    };
    for (let ix = 0; ix < settings.gridU - 1; ix += 1) {
      const a = iz * settings.gridU + ix;
      const safe = supportMask[a] && supportMask[a + 1] && supportMask[a + settings.gridU] && supportMask[a + settings.gridU + 1];
      const x = (gridCoordinate(ix, settings.gridU, settings.chunkWidth) + gridCoordinate(ix + 1, settings.gridU, settings.chunkWidth)) / 2;
      const centre = (centres[iz] + centres[iz + 1]) / 2;
      const side = x < centre - floorHalf ? "left" : x > centre + floorHalf ? "right" : null;
      if (!safe || !side) { flush(); continue; }
      if (!run || side !== runSide || ix !== run.end + 1) { flush(); run = { start: ix, end: ix }; runSide = side; }
      else run.end = ix;
    }
    flush();
    rows.push(row);
  }
  return rows;
}

function extractSupportRegions(settings, supportMask, centres) {
  const rows = safeSupportCells(settings, supportMask, centres);
  const completed = [];
  for (const side of ["left", "right"]) {
    let active = new Map();
    for (let iz = 0; iz < rows.length; iz += 1) {
      const next = new Map();
      for (const run of rows[iz][side]) {
        const key = `${run.start}:${run.end}`;
        const existing = active.get(key);
        if (existing) { existing.endRow = iz; next.set(key, existing); }
        else next.set(key, { side, start: run.start, end: run.end, startRow: iz, endRow: iz });
      }
      for (const [key, region] of active) if (!next.has(key)) completed.push(region);
      active = next;
    }
    completed.push(...active.values());
  }
  completed.sort((a, b) => (a.side === b.side ? a.startRow - b.startRow || a.start - b.start : a.side === "left" ? -1 : 1));
  const counters = { left: 0, right: 0 };
  const inset = Math.min(settings.chunkWidth / (settings.gridU - 1), settings.chunkDepth / (settings.gridV - 1)) * 1e-5;
  return completed.map((region) => {
    counters[region.side] += 1;
    const bounds = {
      minX: gridCoordinate(region.start, settings.gridU, settings.chunkWidth) + inset,
      maxX: gridCoordinate(region.end + 1, settings.gridU, settings.chunkWidth) - inset,
      minZ: gridCoordinate(region.startRow, settings.gridV, settings.chunkDepth) + inset,
      maxZ: gridCoordinate(region.endRow + 1, settings.gridV, settings.chunkDepth) - inset
    };
    return Object.freeze({
      id: `${region.side}-support-${String(counters[region.side]).padStart(3, "0")}`,
      side: region.side,
      source: "support-mask-conservative",
      maxSlope: settings.maxSupportSlope,
      bounds: Object.freeze(bounds),
      polygon: Object.freeze(rectanglePolygon(bounds).map(Object.freeze))
    });
  });
}

function createTerrainApi(settings, heights, slopes, supportMask, centres, platforms) {
  const bounds = Object.freeze({ minX: -settings.chunkWidth / 2, maxX: settings.chunkWidth / 2, minZ: -settings.chunkDepth / 2, maxZ: settings.chunkDepth / 2 });
  const insideTerrain = (x, z) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  const insidePlatform = (x, z) => pointInBounds(x, z, platforms.left.bounds) || pointInBounds(x, z, platforms.right.bounds);
  function getHeightAt(x, z) {
    if (insidePlatform(x, z)) return settings.sharedTopY;
    return interpolateGrid(heights, x, z, settings);
  }
  function getSlopeAt(x, z) {
    if (insidePlatform(x, z)) return 0;
    return interpolateGrid(slopes, x, z, settings);
  }
  function getNormalAt(x, z) {
    if (insidePlatform(x, z)) return { x: 0, y: 1, z: 0 };
    const deltaX = settings.chunkWidth / (settings.gridU - 1) * 0.5;
    const deltaZ = settings.chunkDepth / (settings.gridV - 1) * 0.5;
    const dx = (getHeightAt(x + deltaX, z) - getHeightAt(x - deltaX, z)) / (2 * deltaX);
    const dz = (getHeightAt(x, z + deltaZ) - getHeightAt(x, z - deltaZ)) / (2 * deltaZ);
    const length = Math.hypot(dx, 1, dz);
    return { x: -dx / length, y: 1 / length, z: -dz / length };
  }
  function isSupportable(x, z) {
    if (!insideTerrain(x, z)) return false;
    if (insidePlatform(x, z)) return true;
    const gx = clamp((x + settings.chunkWidth / 2) / settings.chunkWidth * (settings.gridU - 1), 0, settings.gridU - 1);
    const gz = clamp((z + settings.chunkDepth / 2) / settings.chunkDepth * (settings.gridV - 1), 0, settings.gridV - 1);
    const exactX = Math.round(gx), exactZ = Math.round(gz);
    if (Math.abs(gx - exactX) <= 1e-8 && Math.abs(gz - exactZ) <= 1e-8) return Boolean(supportMask[exactZ * settings.gridU + exactX]);
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, settings.gridU - 1), z1 = Math.min(z0 + 1, settings.gridV - 1);
    return Boolean(supportMask[z0 * settings.gridU + x0] && supportMask[z0 * settings.gridU + x1] && supportMask[z1 * settings.gridU + x0] && supportMask[z1 * settings.gridU + x1]);
  }
  function getObstacleAt(z) {
    return Object.freeze({ centreX: sampleCentreAtZ(centres, z, settings), floorHalfWidth: settings.floorWidth / 2, shoulderWidth: settings.shoulderWidth });
  }
  function getTerrainBounds() { return bounds; }
  function getGridSample(ix, iz) {
    if (!Number.isInteger(ix) || !Number.isInteger(iz) || ix < 0 || iz < 0 || ix >= settings.gridU || iz >= settings.gridV) throw new RangeError("Grid sample is outside the terrain field");
    const index = iz * settings.gridU + ix;
    return Object.freeze({ x: gridCoordinate(ix, settings.gridU, settings.chunkWidth), y: heights[index], z: gridCoordinate(iz, settings.gridV, settings.chunkDepth), slope: slopes[index], supportable: Boolean(supportMask[index]) });
  }
  return Object.freeze({ getHeightAt, getSlopeAt, getNormalAt, isSupportable, getObstacleAt, getTerrainBounds, getGridSample });
}

function countHighGroundComponents(settings, heights) {
  const threshold = settings.valleyFloorY + (settings.sharedTopY - settings.valleyFloorY) * 0.55;
  const visited = new Uint8Array(heights.length);
  let components = 0;
  const componentSizes = [];
  for (let start = 0; start < heights.length; start += 1) {
    if (visited[start] || heights[start] < threshold) continue;
    components += 1;
    const stack = [start]; visited[start] = 1;
    let componentSize = 0;
    while (stack.length) {
      const current = stack.pop();
      componentSize += 1;
      const ix = current % settings.gridU, iz = Math.floor(current / settings.gridU);
      for (const [nx, nz] of [[ix - 1, iz], [ix + 1, iz], [ix, iz - 1], [ix, iz + 1]]) {
        if (nx < 0 || nz < 0 || nx >= settings.gridU || nz >= settings.gridV) continue;
        const next = nz * settings.gridU + nx;
        if (!visited[next] && heights[next] >= threshold) { visited[next] = 1; stack.push(next); }
      }
    }
    componentSizes.push(componentSize);
  }
  return Object.freeze({ count: components, sizes: Object.freeze(componentSizes) });
}

function makeChallengeState(settings, sourceSettings, platforms, centreline, supportRegions) {
  const entry = Object.freeze({ position: platforms.left.centre, forward: { x: 1, y: 0, z: 0 }, platformWidth: platforms.left.width, platformLength: platforms.left.length });
  const exit = Object.freeze({ position: platforms.right.centre, forward: { x: 1, y: 0, z: 0 }, platformWidth: platforms.right.width, platformLength: platforms.right.length });
  const corridor = Object.freeze({
    centreline: Object.freeze([entry.position, { x: 0, y: settings.sharedTopY, z: 0 }, exit.position].map((point) => Object.freeze({ ...point }))),
    deckWidth: settings.deckWidth,
    vehicleClearWidth: settings.vehicleClearWidth,
    vehicleClearHeight: settings.vehicleClearHeight,
    mode: settings.railMode
  });
  const obstacleType = settings.mode === "flat-gap" ? "gap" : settings.mode === "river" ? "river" : "ravine";
  const state = {
    version: 3,
    seed: settings.seed,
    mode: settings.railMode === "road" ? "road" : "rail",
    challengeMode: settings.mode,
    terrain: {
      generatorVersion: 2,
      seed: settings.seed,
      width: settings.chunkWidth,
      depth: settings.chunkDepth,
      gridX: settings.gridU,
      gridZ: settings.gridV,
      heightScale: settings.sharedTopY - settings.valleyFloorY,
      bottomY: null,
      sharedTopY: settings.sharedTopY,
      postProcess: {
        axisStretch: { x: settings.stretchX, y: settings.stretchY, z: settings.stretchZ },
        sourceDimensions: {
          width: sourceSettings.chunkWidth,
          depth: sourceSettings.chunkDepth,
          heightScale: sourceSettings.sharedTopY - sourceSettings.valleyFloorY
        }
      },
      obstacle: {
        type: obstacleType,
        width: settings.floorWidth,
        depth: settings.sharedTopY - settings.valleyFloorY,
        noiseAmplitude: settings.centreNoiseAmplitude,
        noiseFrequency: settings.centreNoiseScale,
        shoulderWidth: settings.shoulderWidth
      }
    },
    entry,
    exit,
    corridor,
    platforms: { left: platforms.left, right: platforms.right, sharedPlaneY: platforms.sharedPlaneY },
    supportRegions,
    obstacleCentreline: centreline
  };
  return { state, entry, exit, corridor };
}

export function generateChallenge(seed, inputSettings = {}) {
  const started = now();
  const settingsStarted = now();
  const sourceSettings = normaliseSettings(seed, inputSettings);
  const noise = createNoiseStreams(sourceSettings.seed);
  const timings = { settingsValidation: now() - settingsStarted };

  const macroStarted = now();
  const sourceCentreData = createCentreline(sourceSettings, noise);
  const sourcePlatforms = createPlatforms(sourceSettings, sourceCentreData.centres);
  const sourceHeightData = createHeightField(sourceSettings, noise, sourceCentreData.centres, sourcePlatforms);
  const { settings, centres, centreline, platforms, heightField } = applyAxisStretch(
    sourceSettings,
    sourceCentreData.centres,
    sourceCentreData.centreline,
    sourcePlatforms,
    sourceHeightData.heightField
  );
  const { displacementMask, platformMask } = sourceHeightData;
  timings.heightField = now() - macroStarted;

  const supportStarted = now();
  const slopes = createSlopeField(settings, heightField, platformMask);
  const supportMask = createSupportMask(settings, heightField, slopes, centres, platforms, platformMask);
  const supportRegions = Object.freeze(extractSupportRegions(settings, supportMask, centres));
  const api = createTerrainApi(settings, heightField, slopes, supportMask, centres, platforms);
  timings.support = now() - supportStarted;

  const meshStarted = now();
  const meshData = buildWatertightMesh(settings, heightField, slopes, platformMask);
  const waterMeshData = buildWaterRibbon(settings, centreline);
  timings.mesh = now() - meshStarted;
  const validationStarted = now();
  const meshValidation = settings.validateMesh ? validateWatertightMesh(meshData) : Object.freeze({ valid: true, skipped: true });
  timings.meshValidation = now() - validationStarted;
  if (!meshValidation.valid) throw new TerrainGenerationError("INVALID_MESH", "Generated terrain mesh is not a closed manifold", meshValidation);

  const exportStarted = now();
  const { state, entry, exit, corridor } = makeChallengeState(settings, sourceSettings, platforms, centreline, supportRegions);
  state.terrain.bottomY = meshData.bottomY;
  const challengeText = stableStringify(state);
  const checksums = Object.freeze({
    heightField: checksumTypedArray(heightField),
    supportMask: checksumTypedArray(supportMask),
    mesh: meshData.checksum,
    challenge: checksumString(challengeText)
  });
  state.checksums = checksums;
  timings.export = now() - exportStarted;
  const highGroundTopology = countHighGroundComponents(settings, heightField);
  const highGroundComponents = highGroundTopology.count;
  if (highGroundComponents !== 2) throw new TerrainGenerationError("INVALID_BANK_TOPOLOGY", `Expected exactly two high-ground components, received ${highGroundComponents}`, { highGroundComponents, componentSizes: highGroundTopology.sizes });
  timings.total = now() - started;
  return Object.freeze({
    settings,
    sourceSettings,
    frame: Object.freeze({ origin: { x: 0, y: 0, z: 0 }, crossingAxis: { x: 1, y: 0, z: 0 }, obstacleAxis: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } }),
    heightField,
    heights: heightField,
    slopes,
    displacementMask,
    platformMask,
    supportMask,
    obstacle: Object.freeze({ centreline: Object.freeze(centreline.map(Object.freeze)), floorHalfWidths: new Float32Array(settings.gridV).fill(settings.floorWidth / 2), shoulderWidths: new Float32Array(settings.gridV).fill(settings.shoulderWidth) }),
    platforms,
    entry,
    exit,
    corridor,
    supportRegions,
    meshData,
    waterMeshData,
    meshValidation,
    checksums,
    timings: Object.freeze(timings),
    topology: Object.freeze({ highGroundComponents }),
    state: Object.freeze(state),
    api
  });
}

export function serialiseChallenge(state) {
  return `${stableStringify(state, 2)}\n`;
}
