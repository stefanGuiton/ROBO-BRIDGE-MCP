'use strict';

import { BridgeCoreError, cloneValue } from './errors.js';
import { expandBuildPlanPlacements } from './placement-expansion.js';
import { normalizeWorldTransform, transformPointToMainDemo, transformYawToMainDemo } from './world-transform.js';

function materialRecord(placement) {
  return placement.partClass === 'TRACK_SEGMENT'
    ? { role: 'track', sleepersHex: placement.trackMaterials?.sleepers ?? null, railsHex: placement.trackMaterials?.rails ?? null }
    : { role: placement.role, colourHex: placement.colourHex };
}

export function createConstructionPlacementStream(buildPlan, worldTransform = {}, options = {}) {
  const transform = normalizeWorldTransform(worldTransform);
  const expanded = expandBuildPlanPlacements(buildPlan);
  const resolveColour = typeof options.resolveColour === 'function'
    ? options.resolveColour
    : () => null;
  const entries = expanded.placements.map((placement) => {
    const position = transformPointToMainDemo(placement.local.position, transform);
    const yawRad = transformYawToMainDemo(placement.local.yawRad, transform);
    const colour = resolveColour({
      colourHex: placement.colourHex,
      role: placement.role,
      family: placement.family,
      partClass: placement.partClass,
      definitionId: placement.definitionId
    });
    if (colour !== null && (typeof colour !== 'string' || !colour)) {
      throw new BridgeCoreError('INVALID_SETTINGS', 'resolveColour must return a non-empty string or null.', {
        placementId: placement.placementId,
        colour
      });
    }
    return {
      placementId: placement.placementId,
      logicalIndex: placement.orderIndex,
      physicalPlacementId: placement.physicalPlacementId,
      planId: buildPlan.planId,
      designChecksum: buildPlan.designChecksum,
      family: placement.family,
      partClass: placement.partClass,
      partType: placement.partType,
      customPartDefinitionId: placement.definitionId,
      material: materialRecord(placement),
      colour,
      position,
      yawRad,
      dependencyIds: cloneValue(placement.dependencyIds),
      supportPlacementId: placement.dependencyIds[0] ?? null,
      supportBrickId: null,
      supportSide: 'M',
      carriedSide: null,
      territory: placement.territory,
      actorPreference: placement.actorPreference,
      buildPhase: placement.buildPhase,
      support: cloneValue(placement.support),
      requiresStructureComplete: placement.requiresStructureComplete,
      sourceRequirement: {
        partClass: placement.partClass,
        partType: placement.partType,
        definitionId: placement.definitionId,
        material: materialRecord(placement)
      }
    };
  });
  return {
    schemaVersion: 'robo-bridge.construction-stream.v1',
    streamId: `bridge.${buildPlan.designChecksum}`,
    planId: buildPlan.planId,
    designChecksum: buildPlan.designChecksum,
    designRevision: buildPlan.designRevision,
    family: buildPlan.geometry.family,
    coordinateFrame: transform.targetFrame,
    worldTransform: cloneValue(transform),
    customDefinitions: cloneValue(buildPlan.catalogue.customDefinitions),
    summary: {
      totalPlacements: entries.length,
      standardPlacements: expanded.standardPhysicalCount,
      customPlacements: expanded.customPhysicalCount,
      maximumExistingStreamBatch: 50,
      requiresCustomPartRegistry: entries.some((entry) => entry.partClass !== 'STANDARD_BRICK'),
      requiresPartDimensionCalibration: true
    },
    entries
  };
}

export function pageConstructionPlacementStream(stream, { cursor = 0, limit = 50 } = {}) {
  if (!stream?.entries || !Array.isArray(stream.entries)) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'A construction placement stream is required.');
  }
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'cursor must be a non-negative safe integer.', { cursor });
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'limit must be an integer from 1 to 50.', { limit });
  }
  const entries = stream.entries.slice(cursor, cursor + limit).map(cloneValue);
  return {
    schemaVersion: 'robo-bridge.construction-page.v1',
    streamId: stream.streamId,
    planId: stream.planId,
    designChecksum: stream.designChecksum,
    cursor,
    limit,
    entries,
    returnedCount: entries.length,
    totalAvailable: stream.entries.length,
    nextCursor: cursor + entries.length < stream.entries.length ? cursor + entries.length : null,
    finalPage: cursor + entries.length >= stream.entries.length
  };
}

export function createBuildBoardTargets(stream) {
  if (!stream?.entries || !Array.isArray(stream.entries)) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'A construction placement stream is required.');
  }
  return {
    blueprintId: stream.planId,
    schemaVersion: 'robo-bridge.buildboard-targets.v1',
    planId: stream.planId,
    designChecksum: stream.designChecksum,
    targets: stream.entries.map((entry) => ({
      id: entry.placementId,
      targetId: entry.placementId,
      colour: entry.colour,
      position: cloneValue(entry.position),
      yawRad: entry.yawRad,
      yawDeg: entry.yawRad * 180 / Math.PI,
      partClass: entry.partClass,
      partType: entry.partType,
      customPartDefinitionId: entry.customPartDefinitionId,
      dependencyIds: cloneValue(entry.dependencyIds),
      territory: entry.territory,
      actorPreference: entry.actorPreference,
      planId: stream.planId,
      designChecksum: stream.designChecksum
    }))
  };
}

export function createExistingPlacementQueueChunks(stream, options = {}) {
  if (!stream?.entries || !Array.isArray(stream.entries)) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'A construction placement stream is required.');
  }
  const supportsPart = options.supportsPart;
  const resolveBrickId = options.resolveBrickId;
  if (typeof supportsPart !== 'function' || typeof resolveBrickId !== 'function') {
    throw new BridgeCoreError('UNSUPPORTED_PART', 'supportsPart() and resolveBrickId() are required for the current MAIN_DEMO placement stream.');
  }
  const batchSize = options.batchSize ?? 50;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'batchSize must be an integer from 1 to 50.', { batchSize });
  }
  const unsupported = stream.entries.filter((entry) => !supportsPart(cloneValue(entry)));
  if (unsupported.length) {
    throw new BridgeCoreError('UNSUPPORTED_PART', 'The current MAIN_DEMO placement stream cannot execute one or more V4.6 parts.', {
      unsupportedCount: unsupported.length,
      examples: unsupported.slice(0, 10).map((entry) => ({
        placementId: entry.placementId,
        partClass: entry.partClass,
        partType: entry.partType,
        definitionId: entry.customPartDefinitionId
      }))
    });
  }
  const placements = stream.entries.map((entry) => {
    const brickId = resolveBrickId(cloneValue(entry));
    if (brickId !== null && (typeof brickId !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(brickId))) {
      throw new BridgeCoreError('INVALID_SETTINGS', 'resolveBrickId returned an invalid brick ID.', {
        placementId: entry.placementId,
        brickId
      });
    }
    return {
      placementId: entry.placementId,
      brickId,
      colour: entry.colour,
      position: cloneValue(entry.position),
      yawRad: entry.yawRad,
      supportBrickId: entry.supportBrickId,
      supportPlacementId: entry.supportPlacementId,
      supportSide: entry.supportSide,
      carriedSide: entry.carriedSide
    };
  });
  const chunks = [];
  for (let cursor = 0; cursor < placements.length; cursor += batchSize) {
    const chunk = placements.slice(cursor, cursor + batchSize);
    chunks.push({
      streamId: stream.streamId,
      mode: cursor === 0 ? 'replace' : 'append',
      finalChunk: cursor + chunk.length >= placements.length,
      placements: chunk
    });
  }
  return chunks;
}
