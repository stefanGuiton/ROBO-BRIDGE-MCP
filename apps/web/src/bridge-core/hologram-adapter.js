'use strict';

import { BridgeCoreError, cloneValue } from './errors.js';
import { expandBuildPlanPlacements } from './placement-expansion.js';
import { normalizeWorldTransform, transformAnchorToMainDemo, transformBoxToMainDemo, transformPointToMainDemo, transformYawToMainDemo } from './world-transform.js';

function pageArguments(options) {
  const cursor = options.cursor ?? 0;
  const limit = options.limit ?? 5000;
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'cursor must be a non-negative safe integer.', { cursor });
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'limit must be an integer from 1 to 5000.', { limit });
  }
  return { cursor, limit };
}

export function createHologramSnapshot(buildPlan, worldTransform = {}, options = {}) {
  const transform = normalizeWorldTransform(worldTransform);
  const expanded = expandBuildPlanPlacements(buildPlan);
  const { cursor, limit } = pageArguments(options);
  const selected = expanded.placements.slice(cursor, cursor + limit);
  const placements = selected.map((placement) => {
    const position = transformPointToMainDemo(placement.local.position, transform);
    const yawRad = transformYawToMainDemo(placement.local.yawRad, transform);
    const common = {
      placementId: placement.placementId,
      physicalPlacementId: placement.physicalPlacementId,
      orderIndex: placement.orderIndex,
      placementKind: placement.placementKind,
      partClass: placement.partClass,
      partType: placement.partType,
      definitionId: placement.definitionId,
      family: placement.family,
      role: placement.role,
      colourHex: placement.colourHex,
      trackMaterials: cloneValue(placement.trackMaterials),
      territory: placement.territory,
      actorPreference: placement.actorPreference,
      targetTransform: {
        position,
        yawRad,
        yawDeg: yawRad * 180 / Math.PI,
        uniformScale: transform.scale
      },
      dependencyIds: cloneValue(placement.dependencyIds),
      requiresStructureComplete: placement.requiresStructureComplete
    };
    if (placement.partClass === 'STANDARD_BRICK') {
      const box = transformBoxToMainDemo({ centre: placement.local.position, size: placement.local.size, yawRad: placement.local.yawRad }, transform);
      return {
        ...common,
        targetTransform: { ...common.targetTransform, position: box.position, yawRad: box.yawRad, yawDeg: box.yawRad * 180 / Math.PI },
        sizeMm: box.sizeMm,
        localSizeMm: {
          xMm: placement.local.size.x * transform.scale,
          yMm: placement.local.size.y * transform.scale,
          zMm: placement.local.size.z * transform.scale
        },
        geometryKind: 'box'
      };
    }
    return {
      ...common,
      geometryKind: 'custom-definition',
      customDefinition: options.includeDefinitionsPerPlacement ? cloneValue(placement.definition) : undefined
    };
  });
  const total = expanded.totalPhysicalCount;
  return {
    schemaVersion: 'robo-bridge.hologram.v1',
    source: {
      planId: buildPlan.planId,
      designChecksum: buildPlan.designChecksum,
      designRevision: buildPlan.designRevision,
      buildPlanSchemaVersion: buildPlan.schemaVersion,
      family: buildPlan.geometry.family
    },
    coordinateFrame: transform.targetFrame,
    worldTransform: cloneValue(transform),
    entryExit: {
      entry: transformAnchorToMainDemo(buildPlan.anchors.entry, transform),
      exit: transformAnchorToMainDemo(buildPlan.anchors.exit, transform),
      roadCentreStart: transformPointToMainDemo({ x: buildPlan.anchors.bridgeStartX, y: buildPlan.anchors.roadY, z: buildPlan.anchors.bridgeCentreZ }, transform),
      roadCentreEnd: transformPointToMainDemo({ x: buildPlan.anchors.bridgeEndX, y: buildPlan.anchors.roadY, z: buildPlan.anchors.bridgeCentreZ }, transform)
    },
    customDefinitions: options.includeDefinitions === false ? [] : cloneValue(buildPlan.catalogue.customDefinitions),
    page: {
      cursor,
      limit,
      returnedCount: placements.length,
      totalAvailable: total,
      nextCursor: cursor + placements.length < total ? cursor + placements.length : null,
      truncated: cursor + placements.length < total
    },
    summary: {
      totalPhysicalCount: total,
      standardPhysicalCount: expanded.standardPhysicalCount,
      customPhysicalCount: expanded.customPhysicalCount,
      trackSegmentCount: buildPlan.billOfMaterials.byPartClass.TRACK_SEGMENT,
      physicalArchCount: buildPlan.billOfMaterials.byPartClass.CUSTOM_ARCH
    },
    placements
  };
}
