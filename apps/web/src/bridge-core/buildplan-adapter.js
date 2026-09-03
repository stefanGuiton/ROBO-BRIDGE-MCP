'use strict';

import { BridgeCoreError, cloneValue } from './errors.js';

const widthCells = (settings) => settings.bridgeWidthCells ?? 3;
const TERRITORY = Object.freeze({ NONE: 0, USER: 1, SHARED: 2, CODEX: 3, SHARED_MACRO: 4 });

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function checksumFNV(value) {
  const text = canonicalJson(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const round6 = (value) => Math.round(value * 1e6) / 1e6;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function derivedAnchors(settings) {
  const roadY = settings.anchorBaseY + settings.anchorHeightY;
  const width = widthCells(settings) * settings.voxelSize;
  const entryCentreX = settings.anchorGroupX - (settings.anchorGapX * 0.5 + settings.anchorBlockLengthX * 0.5);
  const exitCentreX = settings.anchorGroupX + (settings.anchorGapX * 0.5 + settings.anchorBlockLengthX * 0.5);
  return {
    group: { x: settings.anchorGroupX, y: settings.anchorBaseY, z: settings.anchorGroupZ },
    roadY,
    deckBottomY: roadY - settings.deckThickness,
    bridgeStartX: settings.anchorGroupX - settings.anchorGapX * 0.5,
    bridgeEndX: settings.anchorGroupX + settings.anchorGapX * 0.5,
    bridgeCentreZ: settings.anchorGroupZ,
    bridgeWidth: width,
    entry: {
      centre: { x: entryCentreX, y: settings.anchorBaseY + settings.anchorHeightY * 0.5, z: settings.anchorGroupZ },
      size: { x: settings.anchorBlockLengthX, y: settings.anchorHeightY, z: width },
      innerFaceX: settings.anchorGroupX - settings.anchorGapX * 0.5
    },
    exit: {
      centre: { x: exitCentreX, y: settings.anchorBaseY + settings.anchorHeightY * 0.5, z: settings.anchorGroupZ },
      size: { x: settings.anchorBlockLengthX, y: settings.anchorHeightY, z: width },
      innerFaceX: settings.anchorGroupX + settings.anchorGapX * 0.5
    }
  };
}

export function sliceInfo(settings) {
  return { count: widthCells(settings), pitch: settings.voxelSize, width: widthCells(settings) * settings.voxelSize };
}

function trackDesignForSettings(settings, compiled) {
  const anchors = derivedAnchors(settings);
  const dx = settings.voxelSize;
  const dy = settings.voxelSize * settings.brickHeightRatio;
  const routeLength = Math.max(dx, anchors.exit.innerFaceX - anchors.entry.innerFaceX);
  const nominalLength = Math.max(dx * 2, settings.trackNominalSegmentLengthCells * dx);
  const segmentCount = Math.max(1, Math.round(routeLength / nominalLength));
  const segmentLength = routeLength / segmentCount;
  // Rasterised full bricks can finish above the ideal road height when the
  // authored datum is not layer-aligned. Seat tracks above the actual packed
  // deck/cap, never through its top layer. Route adapters already derive the
  // road-to-rail offset from this authoritative BuildPlan.
  const packedDeckTopY = Math.max(anchors.roadY + settings.capHeight,
    ...compiled.placements.filter(p => p.role === 'deck' || p.role === 'cap').map(p => (p.gridY + 1) * dy));
  const parameters = {
    partClass: 'TRACK_SEGMENT',
    geometryVersion: 1,
    segmentLength: round6(segmentLength),
    widthWorld: round6(widthCells(settings) * dx),
    sleeperCount: 4,
    sleeperWidth: round6(settings.trackSleeperWidthCells * dx),
    sleeperDepth: round6(Math.min(widthCells(settings), settings.trackSleeperDepthCells) * dx),
    sleeperHeight: round6(settings.trackSleeperHeightLayers * dy),
    sleeperEndInset: round6(settings.trackSleeperEndInsetCells * dx),
    railGauge: round6(settings.trackRailGaugeCells * dx),
    railWidth: round6(settings.trackRailWidthCells * dx),
    railHeight: round6(settings.trackRailHeightLayers * dy),
    railBase: round6(settings.trackRailBaseLayers * dy),
    cellX: dx,
    cellY: dy,
    cellZ: dx
  };
  if (parameters.railGauge * 0.5 + parameters.railWidth * 0.5 > parameters.widthWorld * 0.5 + 1e-9) {
    throw new BridgeCoreError('OUT_OF_RANGE', 'Track rail gauge exceeds the configured bridge width.');
  }
  if (parameters.sleeperDepth > parameters.widthWorld + 1e-9) {
    throw new BridgeCoreError('OUT_OF_RANGE', 'Track sleeper depth exceeds the configured bridge width.');
  }
  const geometryHash = checksumFNV(parameters);
  const definitionId = `track_${geometryHash}`;
  const definition = {
    definitionId,
    partClass: 'TRACK_SEGMENT',
    geometryVersion: 1,
    geometryHash,
    widthCells: 3,
    parameters,
    materialRole: 'track'
  };
  const placements = [];
  for (let index = 0; index < segmentCount; index += 1) {
    placements.push({
      masterCustomId: `track_${index}`,
      placementKind: 'TRACK_SEGMENT',
      definitionId,
      partClass: 'TRACK_SEGMENT',
      label: `track_${index}`,
      repeatAcrossSlices: false,
      centreX: anchors.entry.innerFaceX + segmentLength * (index + 0.5),
      baseY: packedDeckTopY + dy * 0.03,
      baseLayer: Math.round(packedDeckTopY / dy),
      role: 'track',
      roleCode: 2,
      territory: settings.trackOwner === 'user' ? 'user' : settings.trackOwner === 'shared_open' ? 'shared' : 'codex',
      territoryCode: settings.trackOwner === 'user' ? TERRITORY.USER : settings.trackOwner === 'shared_open' ? TERRITORY.SHARED : TERRITORY.CODEX,
      phase: 'TRACK',
      trackIndex: index,
      reservedRuns: [],
      supportFootprint: [],
      topSupportMap: []
    });
  }
  return { definition, placements, segmentCount, segmentLength, routeLength };
}

function createCustomDesign(compiled, settings) {
  const definitions = new Map();
  for (const definition of compiled.customDefinitions || []) definitions.set(definition.definitionId, cloneValue(definition));
  const masterPlacements = (compiled.customPlacements || []).map((placement, index) => ({
    ...cloneValue(placement),
    masterCustomId: `arch_${index}`
  }));
  const track = trackDesignForSettings(settings, compiled);
  definitions.set(track.definition.definitionId, track.definition);
  masterPlacements.push(...track.placements);
  return { definitions: [...definitions.values()], masterPlacements, track };
}

function serialisableCustomDefinition(definition) {
  return {
    definitionId: definition.definitionId,
    partClass: definition.partClass,
    geometryVersion: definition.geometryVersion,
    geometryHash: definition.geometryHash,
    widthCells: definition.widthCells,
    parameters: cloneValue(definition.parameters),
    supportFootprint: definition.supportFootprint ? cloneValue(definition.supportFootprint) : [],
    topSupportMap: definition.topSupportMap ? cloneValue(definition.topSupportMap) : [],
    reservedRuns: definition.reservedRuns ? cloneValue(definition.reservedRuns) : [],
    materialRole: definition.materialRole || definition.partClass
  };
}

function roleColour(role, settings) {
  if (role === 'deck') return settings.deckColor;
  if (role === 'cap') return settings.capColor;
  if (role === 'main') return settings.mainArchColor;
  if (role === 'accent') return settings.accentColor;
  return settings.bodyColor;
}

function expandCustomPlacements(customDesign, compiled, settings) {
  const result = [];
  const standardPhysicalCount = compiled.placements.length * widthCells(settings);
  const slice = sliceInfo(settings);
  for (const master of customDesign.masterPlacements) {
    const repeat = master.repeatAcrossSlices !== false;
    const count = repeat ? widthCells(settings) : 1;
    for (let sliceIndex = 0; sliceIndex < count; sliceIndex += 1) {
      const worldZ = repeat
        ? settings.anchorGroupZ + (sliceIndex - (widthCells(settings) - 1) / 2) * slice.pitch
        : settings.anchorGroupZ;
      result.push({
        ...cloneValue(master),
        customPhysicalIndex: result.length,
        physicalPlacementId: standardPhysicalCount + result.length,
        sliceIndex: repeat ? sliceIndex : -1,
        worldX: master.partClass === 'TRACK_SEGMENT' ? master.centreX : settings.anchorGroupX + master.centreX,
        worldY: master.baseY,
        worldZ,
        state: 0,
        actor: null,
        dynamic: false,
        custom: true
      });
    }
  }
  return result;
}

function buildBom(compiled, customPhysicalPlacements, settings) {
  const byPartType = { '1x1x1': 0, '1x2x1': 0, '1x20x1': 0 };
  const byRole = {};
  const byColour = {};
  for (const placement of compiled.placements) {
    byPartType[placement.partType] += widthCells(settings);
    byRole[placement.role] = (byRole[placement.role] || 0) + widthCells(settings);
    const colour = roleColour(placement.role, settings);
    byColour[colour] = (byColour[colour] || 0) + widthCells(settings);
  }
  const byCustomDefinitionId = {};
  let archCount = 0;
  let trackCount = 0;
  for (const placement of customPhysicalPlacements) {
    byCustomDefinitionId[placement.definitionId] = (byCustomDefinitionId[placement.definitionId] || 0) + 1;
    if (placement.partClass === 'TRACK_SEGMENT') trackCount += 1;
    else archCount += 1;
  }
  const standardCount = Object.values(byPartType).reduce((sum, value) => sum + value, 0);
  const totalPhysicalParts = standardCount + archCount + trackCount;
  const spawnInventory = { ...byPartType, ...byCustomDefinitionId };
  return {
    masterSliceBricks: compiled.placements.length,
    sliceCount: widthCells(settings),
    totalPhysicalParts,
    totalPhysicalBricks: standardCount,
    byPartClass: {
      STANDARD_BRICK: standardCount,
      CUSTOM_ARCH: archCount,
      TRACK_SEGMENT: trackCount
    },
    byStandardPartType: { ...byPartType },
    byPartType,
    byCustomDefinitionId,
    byRole,
    byColour,
    trackSegmentCount: trackCount,
    spawnInventory
  };
}

function assignedActorForStandard(placement, settings) {
  if (settings.collaborationMode === 'codex_all') return 'codex';
  if (settings.collaborationMode === 'shared_open') return 'shared';
  if (placement.territoryCode === TERRITORY.USER) return 'user';
  if (placement.territoryCode === TERRITORY.CODEX) return 'codex';
  return 'shared';
}

function assignedActorForCustom(placement, settings) {
  if (placement.partClass === 'TRACK_SEGMENT') {
    if (settings.trackOwner === 'user') return 'user';
    if (settings.trackOwner === 'shared_open') return 'shared';
    return 'codex';
  }
  if (settings.collaborationMode === 'codex_all') return 'codex';
  if (settings.collaborationMode === 'shared_open') return 'shared';
  if (placement.territory === 'shared_macro') {
    if (settings.sharedMacroOwner === 'user') return 'user';
    if (settings.sharedMacroOwner === 'first_available') return 'shared';
    return 'codex';
  }
  if (placement.territory === 'user') return 'user';
  if (placement.territory === 'codex') return 'codex';
  return 'shared';
}

function classCountsForActor(compiled, customPhysicalPlacements, settings, actor = 'codex') {
  const counts = { standard: 0, arch: 0, track: 0 };
  for (const placement of compiled.placements) {
    const assigned = assignedActorForStandard(placement, settings);
    if (assigned === actor || assigned === 'shared') counts.standard += widthCells(settings);
  }
  for (const placement of customPhysicalPlacements) {
    const assigned = assignedActorForCustom(placement, settings);
    if (assigned !== actor && assigned !== 'shared') continue;
    counts[placement.partClass === 'TRACK_SEGMENT' ? 'track' : 'arch'] += 1;
  }
  return counts;
}

function timingBlockFromCounts(counts, settings) {
  const standard = counts.standard || 0;
  const arch = counts.arch || 0;
  const track = counts.track || 0;
  const milliseconds = standard * settings.brickPlaceTimeMs
    + arch * settings.archPlaceTimeMs
    + track * settings.trackPlaceTimeMs;
  return {
    partCount: standard + arch + track,
    byClass: { standard, arch, track },
    milliseconds,
    seconds: milliseconds / 1000,
    minutes: milliseconds / 60000
  };
}

function buildRequiredCellSet(compiled, customDesign) {
  const set = new Set();
  for (const placement of compiled.placements) {
    for (let gridX = placement.gridX; gridX < placement.gridX + placement.lengthCells; gridX += 1) {
      set.add(`${gridX}:${placement.gridY}`);
    }
  }
  for (const placement of customDesign.masterPlacements) {
    if (placement.partClass === 'TRACK_SEGMENT') continue;
    for (const run of placement.reservedRuns || []) {
      for (let gridY = run.y0; gridY <= run.y1; gridY += 1) set.add(`${run.gridX}:${gridY}`);
    }
  }
  return set;
}

function initialNextEligible(compiled, customDesign, customPhysicalPlacements, settings) {
  const requiredCells = buildRequiredCellSet(compiled, customDesign);
  const standardPhysicalCount = compiled.placements.length * widthCells(settings);
  const layerPlacementIds = new Map();
  for (const placement of compiled.placements) {
    if (!layerPlacementIds.has(placement.layer)) layerPlacementIds.set(placement.layer, []);
    layerPlacementIds.get(placement.layer).push(placement.basePlacementId);
  }

  function physicalId(basePlacementId, sliceIndex) {
    return basePlacementId * widthCells(settings) + sliceIndex;
  }
  function standardPhysical(basePlacementId, sliceIndex) {
    const placement = compiled.placements[basePlacementId];
    return { ...placement, sliceIndex, physicalPlacementId: physicalId(basePlacementId, sliceIndex), custom: false };
  }
  function standardPhase(placement) {
    if (placement.role === 'deck' || placement.role === 'cap') return 4;
    const x0 = placement.gridX;
    const x1 = placement.gridX + placement.lengthCells - 1;
    for (const arch of customDesign.masterPlacements) {
      if (arch.partClass === 'TRACK_SEGMENT') continue;
      const left = arch.outerLeftGrid - 1;
      const right = arch.outerLeftGrid + arch.outerWidthCells;
      const footLayer = arch.supportFootprint?.length
        ? Math.min(...arch.supportFootprint.map((foot) => foot.layer))
        : arch.baseLayer;
      if (placement.gridY >= footLayer && x1 >= left && x0 <= right) return 3;
    }
    return 1;
  }
  const taskSortData = (task, actor) => {
    const placement = task.kind === 'preferred'
      ? standardPhysical(Math.floor(task.id / widthCells(settings)), task.id % widthCells(settings))
      : customPhysicalPlacements[task.id];
    const phase = placement.custom ? (placement.partClass === 'TRACK_SEGMENT' ? 5 : 2) : standardPhase(placement);
    const layer = placement.custom ? placement.baseLayer : placement.gridY;
    const x = placement.custom ? placement.worldX : placement.gridX * compiled.grid.dx + settings.anchorGroupX;
    return [phase, layer, actor === 'codex' ? -x : x, placement.sliceIndex >= 0 ? placement.sliceIndex : 0];
  };
  const compare = (actor) => (a, b) => {
    const left = taskSortData(a, actor);
    const right = taskSortData(b, actor);
    for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return left[index] - right[index];
    return String(a.id).localeCompare(String(b.id));
  };
  const actorOrders = { user: [], codex: [] };
  function append(task, assigned) {
    if (assigned === 'user') actorOrders.user.push(task);
    else if (assigned === 'codex') actorOrders.codex.push(task);
    else {
      actorOrders.user.push(task);
      actorOrders.codex.push(task);
    }
  }
  for (const placement of compiled.placements) {
    const assigned = assignedActorForStandard(placement, settings);
    for (let sliceIndex = 0; sliceIndex < widthCells(settings); sliceIndex += 1) {
      append({ kind: 'preferred', id: physicalId(placement.basePlacementId, sliceIndex) }, assigned);
    }
  }
  for (const placement of customPhysicalPlacements) {
    append({ kind: 'custom', id: placement.customPhysicalIndex }, assignedActorForCustom(placement, settings));
  }
  actorOrders.user.sort(compare('user'));
  actorOrders.codex.sort(compare('codex'));

  const structureHasTasks = standardPhysicalCount > 0 || customPhysicalPlacements.some((placement) => placement.partClass !== 'TRACK_SEGMENT');
  function supportReady(placement) {
    if (placement.custom) {
      if (placement.partClass === 'TRACK_SEGMENT') return !structureHasTasks;
      for (const foot of placement.supportFootprint || []) {
        if (requiredCells.has(`${foot.gridX}:${foot.layer - 1}`)) return false;
        if (!foot.terrainSupported) return false;
      }
      return true;
    }
    if (placement.layer <= 0) return true;
    for (let gridX = placement.gridX; gridX < placement.gridX + placement.lengthCells; gridX += 1) {
      if (requiredCells.has(`${gridX}:${placement.gridY - 1}`)) return false;
    }
    return true;
  }
  function sharedGateReady(placement) {
    if (settings.collaborationMode !== 'split_meet_middle') return true;
    if (placement.custom && placement.territory === 'shared_macro') return supportReady(placement);
    if (placement.custom) return true;
    const ids = layerPlacementIds.get(placement.layer) || [];
    return !ids.some((baseId) => compiled.placements[baseId].territoryCode !== TERRITORY.SHARED);
  }
  function actorCanTake(placement, actor) {
    if (actor === 'user' && settings.allowUserTakeoverAnywhere) return true;
    const assigned = placement.custom
      ? assignedActorForCustom(placement, settings)
      : assignedActorForStandard(placement, settings);
    return assigned === 'shared' || assigned === actor;
  }
  function eligible(task, actor) {
    const placement = task.kind === 'preferred'
      ? standardPhysical(Math.floor(task.id / widthCells(settings)), task.id % widthCells(settings))
      : customPhysicalPlacements[task.id];
    return Boolean(placement)
      && actorCanTake(placement, actor)
      && (!(placement.territory === 'shared' || placement.territory === 'shared_macro') || sharedGateReady(placement))
      && supportReady(placement);
  }
  const result = {};
  for (const actor of ['codex', 'user']) {
    result[actor] = actorOrders[actor].filter((task) => eligible(task, actor)).slice(0, 100).map((task) => task.id);
  }
  return result;
}

export function createV46StaticDesign({ compiled, settings, customDesign = null } = {}) {
  if (!compiled?.ok || !Array.isArray(compiled.placements)) {
    throw new BridgeCoreError('COMPILE_FAILED', 'A valid V4.6 compile result is required.');
  }
  const design = customDesign ?? createCustomDesign(compiled, settings);
  const anchors = derivedAnchors(settings);
  const slice = sliceInfo(settings);
  return {
    collaboration: {
      mode: settings.collaborationMode,
      splitAxis: 'x',
      userSide: 'left',
      codexSide: 'right',
      meetBandCells: settings.meetBandCells,
      splitRatio: settings.splitRatio,
      strictTerritories: settings.strictTerritories,
      allowUserTakeoverAnywhere: settings.allowUserTakeoverAnywhere,
      sharedMacroOwner: settings.sharedMacroOwner,
      trackOwner: settings.trackOwner
    },
    anchors,
    catalogue: {
      standardPartTypes: [
        { partType: '1x1x1', lengthCells: 1 },
        { partType: '1x2x1', lengthCells: 2 },
        { partType: '1x20x1', lengthCells: 20 }
      ],
      customDefinitions: design.definitions.map(serialisableCustomDefinition),
      rolePalette: {
        body: settings.bodyColor,
        deck: settings.deckColor,
        cap: settings.capColor,
        main: settings.mainArchColor,
        accent: settings.accentColor,
        trackSleepers: settings.trackColourSleepers,
        trackRails: settings.trackColourRails
      }
    },
    geometry: {
      family: settings.family,
      grid: { ...compiled.grid },
      masterSlice: {
        requiredRuns: cloneValue(compiled.requiredRuns),
        placements: compiled.placements.map((placement) => ({
          basePlacementId: placement.basePlacementId,
          placementKind: 'STANDARD_BRICK',
          partType: placement.partType,
          layer: placement.layer,
          x: placement.x,
          gridX: placement.gridX,
          gridY: placement.gridY,
          lengthCells: placement.lengthCells,
          role: placement.role,
          curve: placement.curve,
          territory: placement.territory,
          segmentId: placement.segmentId,
          dependsOn: cloneValue(placement.dependsOn)
        })),
        customPlacements: design.masterPlacements.map((placement) => ({
          masterCustomId: placement.masterCustomId,
          placementKind: placement.placementKind,
          definitionId: placement.definitionId,
          partClass: placement.partClass,
          centreX: round6(placement.centreX),
          baseY: round6(placement.baseY),
          baseLayer: placement.baseLayer,
          repeatAcrossSlices: placement.repeatAcrossSlices !== false,
          role: placement.role,
          territory: placement.territory,
          phase: placement.phase,
          trackIndex: placement.trackIndex ?? null,
          supportFootprint: placement.supportFootprint ? cloneValue(placement.supportFootprint) : [],
          topSupportMap: placement.topSupportMap ? cloneValue(placement.topSupportMap) : [],
          reservedRuns: placement.reservedRuns ? cloneValue(placement.reservedRuns) : []
        }))
      },
      sliceArray: {
        count: widthCells(settings),
        pitch: slice.pitch,
        width: slice.width,
        physicalPlacementIdFormula: 'standard: basePlacementId * sliceCount + sliceIndex; custom: standardPhysicalCount + customPhysicalIndex'
      },
      track: {
        routeLength: round6(design.track.routeLength),
        segmentCount: design.track.segmentCount,
        segmentLength: round6(design.track.segmentLength),
        definitionId: design.track.definition.definitionId
      }
    }
  };
}

export function createV46BuildPlan({ compiled, settings, designRevision, executionRevision = 0 } = {}) {
  if (!Number.isSafeInteger(designRevision) || designRevision < 0) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'designRevision must be a non-negative safe integer.', { designRevision });
  }
  if (!Number.isSafeInteger(executionRevision) || executionRevision < 0) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'executionRevision must be a non-negative safe integer.', { executionRevision });
  }
  const customDesign = createCustomDesign(compiled, settings);
  const customPhysicalPlacements = expandCustomPlacements(customDesign, compiled, settings);
  const staticDesign = createV46StaticDesign({ compiled, settings, customDesign });
  const designChecksum = checksumFNV(staticDesign);
  const billOfMaterials = buildBom(compiled, customPhysicalPlacements, settings);
  const initialCounts = {
    standard: billOfMaterials.byPartClass.STANDARD_BRICK,
    arch: billOfMaterials.byPartClass.CUSTOM_ARCH,
    track: billOfMaterials.byPartClass.TRACK_SEGMENT
  };
  const codexCounts = classCountsForActor(compiled, customPhysicalPlacements, settings, 'codex');
  const inventoryDelta = Object.fromEntries(Object.keys(billOfMaterials.spawnInventory).map((key) => [key, 0]));
  const customSnapshot = customPhysicalPlacements.map((placement, index) => ({
    physicalPlacementId: compiled.placements.length * widthCells(settings) + index,
    customPhysicalIndex: index,
    definitionId: placement.definitionId,
    partClass: placement.partClass,
    sliceIndex: placement.sliceIndex,
    state: 0,
    actor: null,
    phase: placement.phase,
    territory: placement.territory
  }));
  return {
    schemaVersion: '4.6',
    planId: `bp_${designChecksum}`,
    designRevision,
    executionRevision,
    designChecksum,
    billOfMaterials,
    timing: {
      brickPlaceTimeMs: settings.brickPlaceTimeMs,
      archPlaceTimeMs: settings.archPlaceTimeMs,
      trackPlaceTimeMs: settings.trackPlaceTimeMs,
      robotOnly: timingBlockFromCounts(initialCounts, settings),
      codexAssigned: timingBlockFromCounts(codexCounts, settings),
      codexRemaining: timingBlockFromCounts(codexCounts, settings)
    },
    collaboration: { ...staticDesign.collaboration },
    anchors: staticDesign.anchors,
    catalogue: staticDesign.catalogue,
    geometry: staticDesign.geometry,
    execution: {
      state: 'BUILD',
      completed: [],
      claims: [],
      retiredPlacements: [],
      dynamicPlacements: [],
      customPlacements: customSnapshot,
      inventoryRemaining: { ...billOfMaterials.spawnInventory },
      inventoryDelta,
      nextEligible: initialNextEligible(compiled, customDesign, customPhysicalPlacements, settings)
    }
  };
}

export function summariseBuildPlan(plan) {
  if (!plan) throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'A V4.6 BuildPlan is required.');
  return {
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    designRevision: plan.designRevision,
    executionRevision: plan.executionRevision,
    designChecksum: plan.designChecksum,
    family: plan.geometry?.family ?? null,
    totalPhysicalParts: plan.billOfMaterials?.totalPhysicalParts ?? 0,
    standardBrickCount: plan.billOfMaterials?.byPartClass?.STANDARD_BRICK ?? 0,
    physicalArchCount: plan.billOfMaterials?.byPartClass?.CUSTOM_ARCH ?? 0,
    trackSegmentCount: plan.billOfMaterials?.byPartClass?.TRACK_SEGMENT ?? 0,
    masterStandardPlacementCount: plan.geometry?.masterSlice?.placements?.length ?? 0,
    masterCustomPlacementCount: plan.geometry?.masterSlice?.customPlacements?.length ?? 0,
    customDefinitionCount: plan.catalogue?.customDefinitions?.length ?? 0,
    entry: cloneValue(plan.anchors?.entry ?? null),
    exit: cloneValue(plan.anchors?.exit ?? null)
  };
}

export const V46_SLICE_COUNT = 3; // Legacy default; use plan.geometry.sliceArray.count.
