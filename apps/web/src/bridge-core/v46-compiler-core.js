'use strict';

// Extracted from ROBO BRIDGE V4.6. The formulas and packing rules are retained.
// Source computational-section SHA-256: dc09246a2cce320ad35e1501234ff6189a780dc7123275461260a72d4467b1a1
// Procedural terrain and render buffers are intentionally not included.

import { assertNotAborted, BridgeCoreError, cloneValue } from './errors.js';
import { createSupportSampler, supportProfileSummary } from './support-profile.js';
import { normalizeCompilerSettings } from './schemas.js';

export const V46_ROLE = Object.freeze({ NONE: 0, BODY: 1, DECK: 2, CAP: 3, MAIN: 4, ACCENT: 5 });
export const V46_ROLE_NAME = Object.freeze(['none', 'body', 'deck', 'cap', 'main', 'accent']);
export const V46_TERRITORY = Object.freeze({ NONE: 0, USER: 1, SHARED: 2, CODEX: 3, SHARED_MACRO: 4 });
export const V46_TERRITORY_NAME = Object.freeze(['none', 'user', 'shared', 'codex']);

const ROLE = V46_ROLE;
const ROLE_NAME = V46_ROLE_NAME;
const TERRITORY = V46_TERRITORY;
const TERRITORY_NAME = V46_TERRITORY_NAME;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const degrees = (value) => value * Math.PI / 180;
const now = () => globalThis.performance?.now?.() ?? Date.now();

function deriveSettings(source) {
  const roadY = source.anchorBaseY + source.anchorHeightY;
  return {
    ...source,
    roadY,
    span: source.anchorGapX,
    bridgeWidth: source.bridgeWidthCells * source.voxelSize,
    deckElevation: roadY - source.deckThickness,
    bridgeStartX: -source.anchorGapX * 0.5,
    bridgeEndX: source.anchorGapX * 0.5,
  };
}

function terrainAtLocalX(localX, settings, supportSampler) {
  return supportSampler(settings.anchorGroupX + localX, settings.anchorGroupZ);
}

function curveDistanceCircle(x, y, centreX, centreY, radius) {
  return Math.abs(Math.hypot(x - centreX, y - centreY) - radius);
}

function buildAqueduct(settings) {
  const halfSpan = settings.span * 0.5;
  const counts = [settings.aqTopCount, settings.aqMiddleCount, settings.aqBottomCount].map((value) => Math.max(2, Math.round(value)));
  const offsets = [settings.aqTopOffset, settings.aqMiddleOffset, settings.aqBottomOffset];
  const supportBands = [settings.aqTopSupportBand, settings.aqMiddleSupportBand, settings.aqBottomSupportBand];
  const tiers = [];
  let tierTop = settings.deckElevation;

  for (let tierIndex = 0; tierIndex < 3; tierIndex += 1) {
    const count = counts[tierIndex];
    const pitch = settings.span / count;
    const radius = Math.max(0.1, pitch * 0.5 * (1 - clamp(offsets[tierIndex], 0, 0.48)));
    const centreY = tierTop - radius;
    const springY = centreY;
    const supportBand = Math.max(0.1, supportBands[tierIndex]);
    const tierBottom = springY - supportBand;
    const firstCentre = -halfSpan + pitch * 0.5;
    tiers.push({
      tierIndex,
      top: tierTop,
      bottom: tierBottom,
      springY,
      centreY,
      supportBand,
      count,
      pitch,
      radius,
      firstCentre,
    });
    tierTop = tierBottom;
  }

  const deckMinX = -halfSpan - settings.deckOverhang;
  const deckMaxX = halfSpan + settings.deckOverhang;

  function nearestArchCentre(tier, x) {
    const index = clamp(Math.round((x - tier.firstCentre) / tier.pitch), 0, tier.count - 1);
    return tier.firstCentre + index * tier.pitch;
  }

  function roleAt2D(x, y) {
    if (
      x >= deckMinX - settings.capOverhang
      && x <= deckMaxX + settings.capOverhang
      && y >= settings.deckElevation + settings.deckThickness
      && y <= settings.deckElevation + settings.deckThickness + settings.capHeight
    ) return ROLE.CAP;

    if (
      x >= deckMinX
      && x <= deckMaxX
      && y >= settings.deckElevation
      && y < settings.deckElevation + settings.deckThickness
    ) return ROLE.DECK;

    for (const tier of tiers) {
      const ledgeTop = tier.bottom + settings.aqLedgeHeight * 0.5;
      const ledgeBottom = tier.bottom - settings.aqLedgeHeight * 0.5;
      if (
        x >= -halfSpan - settings.aqLedgeOverhang
        && x <= halfSpan + settings.aqLedgeOverhang
        && y >= ledgeBottom
        && y <= ledgeTop
      ) return ROLE.ACCENT;

      if (x < -halfSpan || x > halfSpan || y < tier.bottom || y > tier.top) continue;

      // The opening is a true upper semicircle. Its diameter touches the support band.
      if (y <= tier.springY) return ROLE.BODY;
      const centreX = nearestArchCentre(tier, x);
      const dx = x - centreX;
      if (Math.abs(dx) <= tier.radius) {
        const arcY = tier.centreY + Math.sqrt(Math.max(0, tier.radius * tier.radius - dx * dx));
        if (y > tier.springY && y < arcY) return ROLE.NONE;
      }
      return ROLE.BODY;
    }
    return ROLE.NONE;
  }

  function curveNear(x, y, band) {
    for (const tier of tiers) {
      const approximateIndex = Math.round((x - tier.firstCentre) / tier.pitch);
      for (let offset = -1; offset <= 1; offset += 1) {
        const index = approximateIndex + offset;
        if (index < 0 || index >= tier.count) continue;
        const centreX = tier.firstCentre + index * tier.pitch;
        const dx = x - centreX;
        if (Math.abs(dx) > tier.radius + band) continue;
        if (y < tier.springY - band || y > tier.top + band) continue;
        const q = tier.radius * tier.radius - dx * dx;
        if (q < 0) continue;
        const arcY = tier.centreY + Math.sqrt(q);
        if (Math.abs(y - arcY) <= band) return true;
      }
    }
    return false;
  }

  return {
    family: 'aqueduct',
    xMin: deckMinX - settings.capOverhang,
    xMax: deckMaxX + settings.capOverhang,
    yMin: tiers[2].bottom,
    yMax: settings.deckElevation + settings.deckThickness + settings.capHeight,
    roleAt2D,
    curveNear,
    meta: { tiers },
  };
}

function buildViaduct(settings, supportSampler) {
  const halfSpan = settings.span * 0.5;
  const archCount = Math.max(2, Math.round(settings.viArchCount));
  const pitch = settings.span / archCount;
  const radius = Math.max(0.2, pitch * 0.5 * clamp(settings.viOpeningWidthRatio, 0.25, 0.98));
  const springY = settings.deckElevation - radius;
  const arches = [];
  const springXs = [];
  for (let index = 0; index < archCount; index += 1) {
    const centreX = -halfSpan + pitch * (index + 0.5);
    const leftX = centreX - radius;
    const rightX = centreX + radius;
    arches.push({ centreX, leftX, rightX });
    springXs.push(leftX, rightX);
  }

  let maximumReach = 0;
  for (const x of springXs) maximumReach = Math.max(maximumReach, springY - terrainAtLocalX(x, settings, supportSampler));
  maximumReach = Math.max(0, maximumReach) + Math.max(0, settings.viPenetration);
  const bottomY = springY - maximumReach;
  const draftShift = maximumReach * Math.tan(degrees(settings.viDraftDeg));
  const deckMinX = -halfSpan - settings.deckOverhang;
  const deckMaxX = halfSpan + settings.deckOverhang;

  function insideOpening(x, y, arch) {
    if (y > settings.deckElevation || y < bottomY) return false;
    if (y >= springY) {
      const dy = y - springY;
      if (dy > radius) return false;
      const halfWidth = Math.sqrt(Math.max(0, radius * radius - dy * dy));
      return x >= arch.centreX - halfWidth && x <= arch.centreX + halfWidth;
    }
    const t = clamp((springY - y) / Math.max(0.001, springY - bottomY), 0, 1);
    return x >= arch.leftX + draftShift * t && x <= arch.rightX - draftShift * t;
  }

  function roleAt2D(x, y) {
    if (
      x >= deckMinX - settings.capOverhang
      && x <= deckMaxX + settings.capOverhang
      && y >= settings.deckElevation + settings.deckThickness
      && y <= settings.deckElevation + settings.deckThickness + settings.capHeight
    ) return ROLE.CAP;
    if (
      x >= deckMinX
      && x <= deckMaxX
      && y >= settings.deckElevation
      && y < settings.deckElevation + settings.deckThickness
    ) return ROLE.DECK;
    if (
      x < -halfSpan - settings.viEndAbutment
      || x > halfSpan + settings.viEndAbutment
      || y < bottomY
      || y > settings.deckElevation
    ) return ROLE.NONE;
    if (x >= -halfSpan && x <= halfSpan) {
      for (const arch of arches) if (insideOpening(x, y, arch)) return ROLE.NONE;
    }
    return ROLE.BODY;
  }

  function curveNear(x, y, band) {
    for (const arch of arches) {
      const dx = x - arch.centreX;
      const q = radius * radius - dx * dx;
      if (q < 0) continue;
      const arcY = springY + Math.sqrt(q);
      if (Math.abs(y - arcY) <= band) return true;
    }
    return false;
  }

  return {
    family: 'viaduct',
    xMin: deckMinX - settings.capOverhang,
    xMax: deckMaxX + settings.capOverhang,
    yMin: bottomY,
    yMax: settings.deckElevation + settings.deckThickness + settings.capHeight,
    roleAt2D,
    curveNear,
    meta: { arches, radius, springY, bottomY, maximumReach, draftShift },
  };
}

function buildGeometry(settings, supportSampler) {
  if (settings.family === 'viaduct') return buildViaduct(settings, supportSampler);
  return buildAqueduct(settings);
}

function canonicalJsonWorker(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonWorker).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonWorker(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksumWorker(value) {
  const text = canonicalJsonWorker(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function archTerritoryForBounds(leftX, rightX, settings) {
  if (settings.collaborationMode === 'codex_all') return { territory: 'codex', territoryCode: TERRITORY.CODEX };
  if (settings.collaborationMode === 'shared_open') return { territory: 'shared', territoryCode: TERRITORY.SHARED };
  const splitX = -settings.span * 0.5 + settings.span * clamp(settings.splitRatio, 0, 1);
  const meetHalfWidth = Math.max(0, settings.meetBandCells) * settings.voxelSize * 0.5;
  const leftBoundary = splitX - meetHalfWidth, rightBoundary = splitX + meetHalfWidth;
  if (rightX < leftBoundary) return { territory: 'user', territoryCode: TERRITORY.USER };
  if (leftX > rightBoundary) return { territory: 'codex', territoryCode: TERRITORY.CODEX };
  if (leftX >= leftBoundary && rightX <= rightBoundary) return { territory: 'shared', territoryCode: TERRITORY.SHARED };
  return { territory: 'shared_macro', territoryCode: 4 };
}

function createArchDefinition(request, settings, definitions) {
  const dx = settings.voxelSize, dy = settings.voxelSize * settings.brickHeightRatio;
  const clearSpanCells = Math.max(2, Math.round(request.clearSpanCells));
  const sideThicknessCells = clamp(Math.max(0.5, settings.archMinSideThicknessCells || 0.75), 0.5, 1.0);
  const outerWidthCells = clearSpanCells + 2;
  const baseLayer = Math.min(request.leftFootLayer, request.rightFootLayer);
  const leftFootOffsetLayers = request.leftFootLayer - baseLayer;
  const rightFootOffsetLayers = request.rightFootLayer - baseLayer;
  const springOffsetLayers = Math.max(leftFootOffsetLayers, rightFootOffsetLayers, request.springLayer - baseLayer);
  const targetTopLayers = Math.max(springOffsetLayers + 1, request.targetTopLayer - baseLayer);
  const thicknessCells = Math.max(0.15, request.thicknessCells);
  const minimumThicknessLayers = Math.max(1, Math.ceil(Math.max(0.5, sideThicknessCells) * dx / dy));
  // Keep the crown inside the requested tier. Previously enforcing minimum
  // thickness after sampling pushed ARCH_B above targetTop into the next tier.
  const thicknessWorld = Math.max(thicknessCells, minimumThicknessLayers) * dy, springOffsetWorld = springOffsetLayers * dy, targetTopWorld = targetTopLayers * dy;
  const riseWorld = Math.max(dy * 0.25, targetTopWorld - springOffsetWorld - thicknessWorld);
  const style = request.style === 'B' ? 'B' : 'A';
  const topLayers = [], bottomLayers = [], reservedRuns = [], topSupportMap = [];
  const a = clearSpanCells * dx * 0.5;
  const outerA = a + sideThicknessCells * dx;
  const outerB = Math.max(dy, riseWorld + thicknessWorld);
  const outerCentreX = outerWidthCells * 0.5;
  for (let xCell = 0; xCell < outerWidthCells; xCell += 1) {
    let bottomLayer, topLayer;
    const columnX = (xCell + 0.5 - outerCentreX) * dx;
    const outerRatio = clamp(columnX / Math.max(0.0001, outerA), -1, 1);
    const outerY = springOffsetWorld + outerB * Math.sqrt(Math.max(0, 1 - outerRatio * outerRatio));
    if (xCell === 0) {
      bottomLayer = leftFootOffsetLayers;
      topLayer = style === 'A' ? targetTopLayers : Math.ceil(outerY / dy);
    } else if (xCell === outerWidthCells - 1) {
      bottomLayer = rightFootOffsetLayers;
      topLayer = style === 'A' ? targetTopLayers : Math.ceil(outerY / dy);
    } else {
      const openingCell = xCell - 1;
      // Reserve the full cell envelope, not just the curve at its centre.
      // Curved undersides reach lower at the outer edge of each opening cell.
      const leftX = (openingCell - clearSpanCells * 0.5) * dx;
      const rightX = leftX + dx;
      const x = Math.abs(leftX) > Math.abs(rightX) ? leftX : rightX;
      const ratio = clamp(x / Math.max(0.0001, a), -1, 1);
      const innerY = springOffsetWorld + riseWorld * Math.sqrt(Math.max(0, 1 - ratio * ratio));
      bottomLayer = Math.max(springOffsetLayers, Math.floor(innerY / dy));
      topLayer = style === 'A' ? targetTopLayers : Math.ceil(outerY / dy);
    }
    if (style === 'B') topLayer = Math.min(targetTopLayers, topLayer);
    topLayer = Math.min(targetTopLayers, Math.max(bottomLayer + minimumThicknessLayers, topLayer));
    bottomLayers.push(bottomLayer); topLayers.push(topLayer);
    reservedRuns.push({ xCell, y0: bottomLayer, y1: topLayer - 1 });
    topSupportMap.push({ xCell, topLayer });
  }
  const parameters = {
    partClass: style === 'A' ? 'ARCH_A' : 'ARCH_B', style, clearSpanCells, outerWidthCells,
    riseWorld: Math.round(riseWorld * 1e6) / 1e6, thicknessCells: Math.round(thicknessCells * 1e6) / 1e6,
    sideThicknessCells: Math.round(sideThicknessCells * 1e6) / 1e6, footWidthCells: 1, leftFootOffsetLayers, rightFootOffsetLayers, springOffsetLayers, targetTopLayers,
    topLayers, bottomLayers, cellX: dx, cellY: dy, cellZ: dx,
    segmentsPerCell: Math.max(1, Math.round(settings.archSegmentsPerCell)), geometryVersion: 1,
  };
  const geometryHash = checksumWorker(parameters), definitionId = `arch_${geometryHash}`;
  if (!definitions.has(definitionId)) definitions.set(definitionId, {
    definitionId, partClass: parameters.partClass, geometryVersion: 1, geometryHash, widthCells: 1, parameters,
    supportFootprint: [{ xCell: 0, layer: leftFootOffsetLayers }, { xCell: outerWidthCells - 1, layer: rightFootOffsetLayers }],
    topSupportMap, reservedRuns, materialRole: request.role,
  });
  return definitions.get(definitionId);
}

function planArchFeatures(geometry, settings, supportSampler) {
  const dx = settings.voxelSize, dy = settings.voxelSize * settings.brickHeightRatio;
  const definitions = new Map(), placements = [], reservedByX = new Map();
  let nextPlacementId = 0;

  function addRequest({ style, centreX, clearSpanWorld, baseY, leftBaseY = baseY, rightBaseY = baseY, springY = baseY, targetTopY, thicknessCells, role, roleCode, label }) {
    const clearSpanCells = Math.max(2, Math.floor(clearSpanWorld / dx + 1e-6));
    const desiredLeftOpening = centreX - clearSpanCells * dx * 0.5;
    const leftOpeningGrid = Math.round(desiredLeftOpening / dx);
    const actualCentreX = (leftOpeningGrid + clearSpanCells * 0.5) * dx;
    const outerLeftGrid = leftOpeningGrid - 1;
    const leftFootLayer = Math.round(leftBaseY / dy), rightFootLayer = Math.round(rightBaseY / dy);
    const springLayer = Math.max(leftFootLayer, rightFootLayer, Math.round(springY / dy));
    const targetTopLayer = Math.max(springLayer + 1, Math.round(targetTopY / dy));
    const definition = createArchDefinition({ style, clearSpanCells, leftFootLayer, rightFootLayer, springLayer, targetTopLayer, thicknessCells, role }, settings, definitions);
    const baseLayer = Math.min(leftFootLayer, rightFootLayer), baseYQuant = baseLayer * dy;
    const outerLeftX = outerLeftGrid * dx, outerRightX = (outerLeftGrid + definition.parameters.outerWidthCells) * dx;
    const territoryInfo = archTerritoryForBounds(outerLeftX, outerRightX, settings);
    const reservedRuns = definition.reservedRuns.map((run) => ({ gridX: outerLeftGrid + run.xCell, y0: baseLayer + run.y0, y1: baseLayer + run.y1 }));
    const topSupportMap = definition.topSupportMap.map((cell) => ({ gridX: outerLeftGrid + cell.xCell, topLayer: baseLayer + cell.topLayer }));
    const supportFootprint = definition.supportFootprint.map((foot) => {
      const gridX = outerLeftGrid + foot.xCell, layer = baseLayer + foot.layer;
      const worldX = (gridX + 0.5) * dx, worldY = layer * dy;
      return { gridX, layer, terrainSupported: terrainAtLocalX(worldX, settings, supportSampler) >= worldY - dy - settings.contactEpsilon };
    });
    const placement = {
      customPlacementId: nextPlacementId++, placementKind: 'CUSTOM_ARCH', definitionId: definition.definitionId,
      partClass: definition.partClass, label, role, roleCode, centreX: actualCentreX, baseY: baseYQuant, baseLayer,
      outerLeftGrid, outerWidthCells: definition.parameters.outerWidthCells, repeatAcrossSlices: true,
      territory: territoryInfo.territory, territoryCode: territoryInfo.territoryCode, reservedRuns, topSupportMap, supportFootprint,
      phase: 'ARCH_MACRO',
    };
    placements.push(placement);
    for (const run of reservedRuns) {
      if (!reservedByX.has(run.gridX)) reservedByX.set(run.gridX, []);
      reservedByX.get(run.gridX).push({ y0: run.y0, y1: run.y1, customPlacementId: placement.customPlacementId });
    }
    return placement;
  }

  if (geometry.family === 'aqueduct') {
    const styles = [settings.aqTopArchType, settings.aqMiddleArchType, settings.aqBottomArchType];
    for (const tier of geometry.meta.tiers) {
      const style = styles[tier.tierIndex] || (tier.tierIndex === 2 ? 'B' : 'A');
      const maximumClearSpan = Math.max(dx * 2, tier.pitch - dx * 2);
      const clearSpanWorld = Math.min(tier.radius * 2, maximumClearSpan);
      for (let index = 0; index < tier.count; index += 1) addRequest({ style, centreX: tier.firstCentre + index * tier.pitch,
        clearSpanWorld, baseY: tier.springY, springY: tier.springY, targetTopY: tier.top, thicknessCells: settings.aqArchThicknessCells,
        role: 'body', roleCode: ROLE.BODY, label: `aqueduct_t${tier.tierIndex}_${index}` });
    }
  } else if (geometry.family === 'viaduct') {
    const maximumClearSpan = Math.max(dx * 2, settings.span / geometry.meta.arches.length - dx * 2);
    const clearSpanWorld = Math.min(geometry.meta.radius * 2, maximumClearSpan);
    for (let index = 0; index < geometry.meta.arches.length; index += 1) {
      const arch = geometry.meta.arches[index];
      addRequest({ style: settings.viArchType, centreX: arch.centreX, clearSpanWorld, baseY: geometry.meta.springY,
        springY: geometry.meta.springY, targetTopY: settings.deckElevation, thicknessCells: settings.viArchThicknessCells,
        role: 'body', roleCode: ROLE.BODY, label: `viaduct_${index}` });
    }

  }

  function reservedAt(gridX, gridY) {
    const runs = reservedByX.get(gridX); if (!runs) return -1;
    for (const run of runs) if (gridY >= run.y0 && gridY <= run.y1) return run.customPlacementId;
    return -1;
  }
  return { definitions: [...definitions.values()], placements, reservedAt };
}

function index2D(x, y, width) {
  return y * width + x;
}

function majorityRole(geometry, x0, y0, dx, dy, sampleCount) {
  const counts = new Uint16Array(6);
  for (let sampleY = 0; sampleY < sampleCount; sampleY += 1) {
    for (let sampleX = 0; sampleX < sampleCount; sampleX += 1) {
      const x = x0 + (sampleX + 0.5) * dx / sampleCount;
      const y = y0 + (sampleY + 0.5) * dy / sampleCount;
      counts[geometry.roleAt2D(x, y)] += 1;
    }
  }
  let role = ROLE.NONE;
  let bestCount = 0;
  for (let candidate = 1; candidate < counts.length; candidate += 1) {
    if (counts[candidate] > bestCount) {
      role = candidate;
      bestCount = counts[candidate];
    }
  }
  return { role, ratio: bestCount / (sampleCount * sampleCount) };
}

function territoryAt(localX, settings, cellSize) {
  if (settings.collaborationMode === 'codex_all') return TERRITORY.CODEX;
  if (settings.collaborationMode === 'shared_open') return TERRITORY.SHARED;
  const splitX = -settings.span * 0.5 + settings.span * clamp(settings.splitRatio, 0, 1);
  const meetHalfWidth = Math.max(0, settings.meetBandCells) * cellSize * 0.5;
  if (localX < splitX - meetHalfWidth) return TERRITORY.USER;
  if (localX > splitX + meetHalfWidth) return TERRITORY.CODEX;
  return TERRITORY.SHARED;
}

function rasteriseSlice2D(geometry, settings, archPlan, supportSampler, signal) {
  const dx = settings.voxelSize, dy = settings.voxelSize * settings.brickHeightRatio;
  const gridMinX = Math.floor(geometry.xMin / dx), gridMaxX = Math.ceil(geometry.xMax / dx) - 1;
  const gridMinY = Math.floor(geometry.yMin / dy), gridMaxY = Math.ceil(geometry.yMax / dy) - 1;
  const width = gridMaxX - gridMinX + 1, height = gridMaxY - gridMinY + 1, cellCount = width * height;
  if (cellCount > settings.maxGridCells) throw new Error(`Slice grid ${cellCount.toLocaleString()} exceeds Maximum grid cells.`);
  const roles = new Uint8Array(cellCount), curve = new Uint8Array(cellCount), territory = new Uint8Array(cellCount), reservedFeatureByCell = new Int32Array(cellCount);
  reservedFeatureByCell.fill(-1);
  let capturedCells = 0, culledCells = 0, occupiedCells = 0;
  for (let localY = 0; localY < height; localY += 1) {
    if ((localY & 31) === 0) assertNotAborted(signal);
    const gridY = gridMinY + localY, y0 = gridY * dy, centreY = y0 + dy * 0.5, topY = y0 + dy;
    for (let localX = 0; localX < width; localX += 1) {
      const gridX = gridMinX + localX, x0 = gridX * dx, centreX = x0 + dx * 0.5, cellIndex = index2D(localX, localY, width);
      const reservedFeature = archPlan ? archPlan.reservedAt(gridX, gridY) : -1;
      if (reservedFeature >= 0) { reservedFeatureByCell[cellIndex] = reservedFeature; continue; }
      const majority = majorityRole(geometry, x0, y0, dx, dy, settings.samplesPerAxis);
      if (!majority.role || majority.ratio < settings.captureThreshold) continue;
      capturedCells += 1;
      let minimumTerrain = Infinity;
      for (const offset of [0, 0.5, 1]) minimumTerrain = Math.min(minimumTerrain, supportSampler(settings.anchorGroupX + x0 + offset * dx, settings.anchorGroupZ));
      if (topY < minimumTerrain - settings.contactEpsilon) { culledCells += 1; continue; }
      roles[cellIndex] = majority.role;
      curve[cellIndex] = geometry.curveNear(centreX, centreY, settings.curveBandCells * Math.max(dx, dy)) ? 1 : 0;
      territory[cellIndex] = territoryAt(centreX, settings, dx);
      occupiedCells += 1;
    }
  }
  for (let pass = 0; pass < Math.round(settings.closurePasses); pass += 1) {
    const additions = [];
    for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
      const cellIndex = index2D(x, y, width); if (roles[cellIndex] || reservedFeatureByCell[cellIndex] >= 0) continue;
      const leftIndex = index2D(x - 1, y, width), rightIndex = index2D(x + 1, y, width), downIndex = index2D(x, y - 1, width), upIndex = index2D(x, y + 1, width);
      if (curve[leftIndex] || curve[rightIndex] || curve[downIndex] || curve[upIndex]) continue;
      const leftRole = roles[leftIndex], rightRole = roles[rightIndex], downRole = roles[downIndex], upRole = roles[upIndex];
      if (leftRole && leftRole === rightRole && downRole && downRole === upRole && leftRole === downRole) additions.push([cellIndex, leftRole, territory[leftIndex]]);
    }
    for (const [cellIndex, role, owner] of additions) { roles[cellIndex] = role; territory[cellIndex] = owner; occupiedCells += 1; }
  }
  return { roles, curve, territory, reservedFeatureByCell, width, height, gridMinX, gridMinY, dx, dy, candidateCells: cellCount, capturedCells, culledCells, occupiedCells };
}
function solveRun(startX, endX, curveRun, previousLayerSeams, layer, bondPattern) {
  const runLength = endX - startX + 1;
  const allowedLengths = curveRun ? [2, 1] : [20, 2, 1];
  const cost = new Float64Array(runLength + 1);
  const partCount = new Int32Array(runLength + 1);
  const choice = new Int8Array(runLength + 1);
  cost.fill(Infinity);
  partCount.fill(0x3fffffff);
  cost[runLength] = 0;
  partCount[runLength] = 0;
  const partCost = { 20: 0, 2: 0.05, 1: 1 };

  for (let position = runLength - 1; position >= 0; position -= 1) {
    for (const length of allowedLengths) {
      if (position + length > runLength) continue;
      const seamX = startX + position + length;
      const alignedPenalty = bondPattern === 'running'
        && seamX < endX + 1
        && previousLayerSeams.has(seamX) ? 2 : 0;
      const candidateCost = partCost[length] + alignedPenalty + cost[position + length];
      const candidateParts = 1 + partCount[position + length];
      const currentCost = cost[position];
      const epsilon = 1e-9;
      const parityPreference = layer % 2 === 0
        ? length > choice[position]
        : length < choice[position] || choice[position] === 0;
      if (
        candidateCost < currentCost - epsilon
        || (
          Math.abs(candidateCost - currentCost) <= epsilon
          && (
            candidateParts < partCount[position]
            || (candidateParts === partCount[position] && parityPreference)
          )
        )
      ) {
        cost[position] = candidateCost;
        partCount[position] = candidateParts;
        choice[position] = length;
      }
    }
  }

  if (!Number.isFinite(cost[0])) throw new Error(`No legal packing for run ${startX}..${endX}.`);
  const result = [];
  for (let position = 0; position < runLength;) {
    const length = choice[position];
    result.push(length);
    position += length;
  }
  return result;
}

function createPlaybackOrder(placements, settings) {
  const byLayer = new Map();
  for (const placement of placements) {
    if (!byLayer.has(placement.layer)) byLayer.set(placement.layer, []);
    byLayer.get(placement.layer).push(placement);
  }
  const order = [];
  for (const layer of [...byLayer.keys()].sort((a, b) => a - b)) {
    const layerPlacements = byLayer.get(layer);
    if (settings.collaborationMode === 'split_meet_middle') {
      const user = layerPlacements
        .filter((placement) => placement.territoryCode === TERRITORY.USER)
        .sort((a, b) => a.x - b.x || a.basePlacementId - b.basePlacementId);
      const codex = layerPlacements
        .filter((placement) => placement.territoryCode === TERRITORY.CODEX)
        .sort((a, b) => b.x - a.x || a.basePlacementId - b.basePlacementId);
      const shared = layerPlacements
        .filter((placement) => placement.territoryCode === TERRITORY.SHARED)
        .sort((a, b) => Math.abs(a.x + a.lengthCells * 0.5) - Math.abs(b.x + b.lengthCells * 0.5));
      const sideCount = Math.max(user.length, codex.length);
      for (let index = 0; index < sideCount; index += 1) {
        if (user[index]) order.push(user[index].basePlacementId);
        if (codex[index]) order.push(codex[index].basePlacementId);
      }
      for (const placement of shared) order.push(placement.basePlacementId);
    } else {
      for (const placement of layerPlacements.sort((a, b) => a.x - b.x || a.basePlacementId - b.basePlacementId)) {
        order.push(placement.basePlacementId);
      }
    }
  }
  return order;
}

function packSlice(slice, settings, signal) {
  const { width, height, roles, curve, territory, gridMinX, gridMinY } = slice;
  const segments = [];
  const segmentByCell = new Int32Array(width * height);
  const placementByCell = new Int32Array(width * height);
  segmentByCell.fill(-1);
  placementByCell.fill(-1);
  const placements = [];
  const layerSeams = [];
  let nextSegmentId = 0;

  for (let layer = 0; layer < height; layer += 1) {
    if ((layer & 31) === 0) assertNotAborted(signal);
    const previousLayerSeams = layerSeams[layer - 1] || new Set();
    const seams = new Set();
    let x = 0;
    while (x < width) {
      const startIndex = index2D(x, layer, width);
      const roleCode = roles[startIndex];
      if (!roleCode) {
        x += 1;
        continue;
      }
      const curveRun = Boolean(curve[startIndex]);
      const territoryCode = territory[startIndex];
      const runStart = x;
      x += 1;
      while (x < width) {
        const cellIndex = index2D(x, layer, width);
        if (roles[cellIndex] !== roleCode) break;
        if (Boolean(curve[cellIndex]) !== curveRun) break;
        if (settings.strictTerritories && territory[cellIndex] !== territoryCode) break;
        x += 1;
      }
      const runEnd = x - 1;
      const segment = {
        segmentId: nextSegmentId,
        layer,
        x0: runStart,
        x1: runEnd,
        gridX0: gridMinX + runStart,
        gridX1: gridMinX + runEnd,
        gridY: gridMinY + layer,
        role: ROLE_NAME[roleCode],
        roleCode,
        curve: curveRun,
        territory: TERRITORY_NAME[territoryCode],
        territoryCode,
      };
      segments.push(segment);
      for (let cellX = runStart; cellX <= runEnd; cellX += 1) {
        segmentByCell[index2D(cellX, layer, width)] = nextSegmentId;
      }

      const lengths = solveRun(
        runStart,
        runEnd,
        curveRun,
        previousLayerSeams,
        layer,
        settings.bondPattern,
      );
      let cursor = runStart;
      for (const lengthCells of lengths) {
        const placement = {
          basePlacementId: placements.length,
          x: cursor,
          layer,
          gridX: gridMinX + cursor,
          gridY: gridMinY + layer,
          lengthCells,
          partType: `1x${lengthCells}x1`,
          role: ROLE_NAME[roleCode],
          roleCode,
          curve: curveRun,
          territory: TERRITORY_NAME[territoryCode],
          territoryCode,
          segmentId: nextSegmentId,
          dependsOn: [],
        };
        placements.push(placement);
        for (let cellX = cursor; cellX < cursor + lengthCells; cellX += 1) {
          placementByCell[index2D(cellX, layer, width)] = placement.basePlacementId;
        }
        cursor += lengthCells;
        if (cursor <= runEnd) seams.add(cursor);
      }
      nextSegmentId += 1;
    }
    layerSeams[layer] = seams;
  }

  for (const placement of placements) {
    if (placement.layer <= 0) continue;
    const dependencies = new Set();
    for (let cellX = placement.x; cellX < placement.x + placement.lengthCells; cellX += 1) {
      const belowIndex = index2D(cellX, placement.layer - 1, width);
      if (!roles[belowIndex]) continue;
      const dependencyId = placementByCell[belowIndex];
      if (dependencyId >= 0) dependencies.add(dependencyId);
    }
    placement.dependsOn = [...dependencies].sort((a, b) => a - b);
  }

  const requiredRuns = segments.map((segment) => ({
    segmentId: segment.segmentId,
    layer: segment.layer,
    gridY: segment.gridY,
    gridX0: segment.gridX0,
    gridX1: segment.gridX1,
    role: segment.role,
    curve: segment.curve,
    territory: segment.territory,
  }));

  return {
    placements,
    requiredRuns,
    segments,
    segmentByCell,
    placementByCell,
    renderBaseIds: createPlaybackOrder(placements, settings),
  };
}


function serialiseGridMaps(slice, packed) {
  return {
    roles: Array.from(slice.roles),
    curve: Array.from(slice.curve),
    territory: Array.from(slice.territory),
    reservedFeatureByCell: Array.from(slice.reservedFeatureByCell),
    segmentByCell: Array.from(packed.segmentByCell),
    placementByCell: Array.from(packed.placementByCell)
  };
}

function familyGeometrySummary(geometry) {
  if (geometry.family === 'aqueduct') {
    return {
      family: 'aqueduct',
      tiers: geometry.meta.tiers.map((tier) => ({
        tierIndex: tier.tierIndex,
        top: tier.top,
        bottom: tier.bottom,
        springY: tier.springY,
        centreY: tier.centreY,
        supportBand: tier.supportBand,
        count: tier.count,
        pitch: tier.pitch,
        radius: tier.radius,
        firstCentre: tier.firstCentre
      }))
    };
  }
  return {
    family: 'viaduct',
    arches: geometry.meta.arches.map((arch) => ({ ...arch })),
    radius: geometry.meta.radius,
    springY: geometry.meta.springY,
    bottomY: geometry.meta.bottomY,
    maximumReach: geometry.meta.maximumReach,
    draftShift: geometry.meta.draftShift
  };
}

export function compileV46Core({
  settings: inputSettings = {},
  supportProfile = { type: 'flat', heightY: 0 },
  terrainHeightAt = null,
  signal = null,
  includeGridMaps = false
} = {}) {
  assertNotAborted(signal);
  const started = now();
  const settings = deriveSettings(normalizeCompilerSettings(inputSettings));
  const supportSampler = createSupportSampler(supportProfile, { terrainHeightAt });

  try {
    const geometryStart = now();
    const geometry = buildGeometry(settings, supportSampler);
    const geometryEnd = now();
    assertNotAborted(signal);

    const archPlan = planArchFeatures(geometry, settings, supportSampler);
    const slice = rasteriseSlice2D(geometry, settings, archPlan, supportSampler, signal);
    const sliceEnd = now();
    assertNotAborted(signal);

    const packed = packSlice(slice, settings, signal);
    const packingEnd = now();
    assertNotAborted(signal);

    const counts = { 1: 0, 2: 0, 20: 0 };
    const roleCounts = {};
    for (const placement of packed.placements) {
      counts[placement.lengthCells] = (counts[placement.lengthCells] ?? 0) + 1;
      roleCounts[placement.role] = (roleCounts[placement.role] || 0) + 1;
    }

    const aqueductTiers = geometry.family === 'aqueduct'
      ? geometry.meta.tiers.map((tier) => ({
        top: tier.top,
        springY: tier.springY,
        bottom: tier.bottom,
        radius: tier.radius,
        supportBand: tier.supportBand,
        count: tier.count
      }))
      : null;

    const metadata = {
      family: settings.family,
      masterBrickCount: packed.placements.length,
      masterArchCount: archPlan.placements.length,
      uniqueArchDefinitionCount: archPlan.definitions.length,
      voxelCount: slice.occupiedCells,
      culled: slice.culledCells,
      candidateCells: slice.candidateCells,
      counts,
      roleCounts,
      timing: {
        geometry: geometryEnd - geometryStart,
        slice: sliceEnd - geometryEnd,
        packing: packingEnd - sliceEnd,
        total: packingEnd - started
      },
      cache: { geometry: false, slice: false, packing: false, terrain: false },
      bounds: {
        xMin: settings.anchorGroupX + geometry.xMin,
        xMax: settings.anchorGroupX + geometry.xMax,
        yMin: geometry.yMin,
        yMax: geometry.yMax
      },
      aqueductTiers,
      familyGeometry: familyGeometrySummary(geometry),
      supportProfile: terrainHeightAt ? { type: 'callback' } : supportProfileSummary(supportProfile)
    };

    const result = {
      ok: true,
      compilerVersion: '4.6-core-v1',
      metadata,
      placements: cloneValue(packed.placements),
      customDefinitions: cloneValue(archPlan.definitions),
      customPlacements: cloneValue(archPlan.placements),
      requiredRuns: cloneValue(packed.requiredRuns),
      segments: cloneValue(packed.segments),
      renderBaseIds: Array.from(packed.renderBaseIds),
      grid: {
        width: slice.width,
        height: slice.height,
        gridMinX: slice.gridMinX,
        gridMinY: slice.gridMinY,
        dx: slice.dx,
        dy: slice.dy
      },
      settings: cloneValue(settings)
    };
    if (includeGridMaps) result.gridMaps = serialiseGridMaps(slice, packed);
    return result;
  } catch (error) {
    if (error instanceof BridgeCoreError) throw error;
    if (signal?.aborted) throw new BridgeCoreError('CANCELLED', 'The bridge compile was cancelled.');
    throw new BridgeCoreError('COMPILE_FAILED', error?.message || 'The V4.6 compiler failed.', {
      family: settings.family
    });
  }
}

export const V46_COMPILER_SOURCE_SECTION_SHA256 = 'dc09246a2cce320ad35e1501234ff6189a780dc7123275461260a72d4467b1a1';
