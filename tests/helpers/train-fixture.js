'use strict';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function createFixtureBuildPlan() {
  const width = 16;
  const height = 3;
  const sliceCount = 3;
  const dx = 20;
  const dy = 12;
  const placements = [];
  let basePlacementId = 0;
  const ids = Array.from({ length: height }, () => new Array(width).fill(null));
  for (let layer = 0; layer < height; layer += 1) {
    for (let gridX = 0; gridX < width; gridX += 1) {
      const id = basePlacementId++;
      ids[layer][gridX] = id;
      placements.push({
        basePlacementId: id,
        placementKind: 'STANDARD_BRICK',
        partType: '1x1x1',
        layer,
        x: gridX,
        gridX,
        gridY: layer,
        lengthCells: 1,
        role: layer === height - 1 ? 'deck' : 'body',
        curve: false,
        territory: 'shared',
        segmentId: layer * width + gridX,
        dependsOn: layer > 0 ? [ids[layer - 1][gridX]] : []
      });
    }
  }
  const trackDefinition = {
    definitionId: 'track_fixture',
    partClass: 'TRACK_SEGMENT',
    geometryVersion: 1,
    geometryHash: 'fixture',
    widthCells: 3,
    parameters: {
      partClass: 'TRACK_SEGMENT',
      segmentLength: 40,
      widthWorld: 60,
      sleeperCount: 4,
      sleeperWidth: 12,
      sleeperDepth: 60,
      sleeperHeight: 3,
      sleeperEndInset: 5,
      railGauge: 32,
      railWidth: 4,
      railHeight: 4,
      railBase: 3,
      cellX: dx,
      cellY: dy,
      cellZ: dx
    },
    materialRole: 'track'
  };
  const customPlacements = Array.from({ length: 8 }, (_, trackIndex) => ({
    masterCustomId: `track_${trackIndex}`,
    placementKind: 'TRACK_SEGMENT',
    definitionId: trackDefinition.definitionId,
    partClass: 'TRACK_SEGMENT',
    centreX: 20 + trackIndex * 40,
    baseY: 36,
    baseLayer: 3,
    repeatAcrossSlices: false,
    role: 'track',
    territory: 'codex',
    phase: 'TRACK',
    trackIndex,
    supportFootprint: [],
    topSupportMap: [],
    reservedRuns: []
  }));
  const plan = {
    schemaVersion: '4.6',
    planId: 'bp_train_fixture',
    designRevision: 1,
    executionRevision: 0,
    designChecksum: 'fixture-design-v1',
    billOfMaterials: {
      totalPhysicalParts: placements.length * sliceCount + customPlacements.length,
      byPartClass: { STANDARD_BRICK: placements.length * sliceCount, CUSTOM_ARCH: 0, TRACK_SEGMENT: customPlacements.length }
    },
    timing: {},
    collaboration: {
      mode: 'shared_open',
      splitAxis: 'x',
      userSide: 'left',
      codexSide: 'right',
      meetBandCells: 0,
      splitRatio: 0.5,
      strictTerritories: true,
      allowUserTakeoverAnywhere: true,
      sharedMacroOwner: 'first_available',
      trackOwner: 'codex'
    },
    anchors: {
      group: { x: 0, y: 0, z: 0 },
      roadY: 36,
      deckBottomY: 24,
      bridgeStartX: 0,
      bridgeEndX: 320,
      bridgeCentreZ: 0,
      bridgeWidth: 60,
      entry: {
        centre: { x: -40, y: 20, z: 0 },
        size: { x: 80, y: 40, z: 60 },
        innerFaceX: 0
      },
      exit: {
        centre: { x: 360, y: 20, z: 0 },
        size: { x: 80, y: 40, z: 60 },
        innerFaceX: 320
      }
    },
    catalogue: {
      standardPartTypes: [{ partType: '1x1x1', lengthCells: 1 }],
      customDefinitions: [trackDefinition],
      rolePalette: { body: '#777777', deck: '#999999', trackSleepers: '#444444', trackRails: '#222222' }
    },
    geometry: {
      family: 'aqueduct',
      grid: { width, height, gridMinX: 0, gridMinY: 0, dx, dy },
      masterSlice: { requiredRuns: [], placements, customPlacements },
      sliceArray: {
        count: sliceCount,
        pitch: dx,
        width: sliceCount * dx,
        physicalPlacementIdFormula: 'standard: basePlacementId * 3 + sliceIndex; custom: standardPhysicalCount + customPhysicalIndex'
      },
      track: {
        routeLength: 320,
        segmentCount: 8,
        segmentLength: 40,
        definitionId: trackDefinition.definitionId
      }
    },
    execution: { state: 'BUILD', completed: [], claims: [], retiredPlacements: [], dynamicPlacements: [], customPlacements: [] }
  };
  return deepFreeze(plan);
}

export function fixturePlacementId(plan, basePlacementId, sliceIndex) {
  return `${plan.planId}.s.${basePlacementId}.${sliceIndex}`;
}

export function fixtureTrackPlacementId(plan, trackIndex) {
  const masterIndex = plan.geometry.masterSlice.customPlacements.findIndex((item) => item.trackIndex === trackIndex);
  return `${plan.planId}.c.${masterIndex}.t`;
}

export function createFixtureBoardSnapshot(plan, { supportedColumns = 16, includeTrack = false, worldRevision = 1, useTargets = false } = {}) {
  const acceptedPlacementIds = [];
  for (const placement of plan.geometry.masterSlice.placements) {
    if (placement.gridX >= supportedColumns) continue;
    for (let sliceIndex = 0; sliceIndex < plan.geometry.sliceArray.count; sliceIndex += 1) {
      acceptedPlacementIds.push(fixturePlacementId(plan, placement.basePlacementId, sliceIndex));
    }
  }
  if (includeTrack) {
    for (let index = 0; index < plan.geometry.track.segmentCount; index += 1) acceptedPlacementIds.push(fixtureTrackPlacementId(plan, index));
  }
  const snapshot = {
    schemaVersion: 'fixture-board.v1',
    blueprintId: plan.planId,
    designChecksum: plan.designChecksum,
    worldRevision,
    acceptedPlacementIds
  };
  if (useTargets) {
    snapshot.targets = acceptedPlacementIds.map((id, index) => ({
      id,
      targetId: id,
      occupiedBy: `brick_${index}`,
      correctness: true,
      status: 'correct'
    }));
    delete snapshot.acceptedPlacementIds;
  }
  return snapshot;
}

export function createFixtureWorldTransform(yawDeg = 0) {
  return {
    id: `fixture-yaw-${yawDeg}`,
    translationMm: { xMm: 100, yMm: -50, zMm: 20 },
    yawDeg,
    scale: 1
  };
}

export function createFixtureSurfaceProvider() {
  return {
    sample() {
      return {
        heightMm: -140,
        normal: { x: 0, y: 1, z: 0 },
        kind: 'ravine-floor'
      };
    }
  };
}
