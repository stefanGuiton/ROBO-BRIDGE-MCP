'use strict';

import { cloneFrozen, deepFreeze, fnv1a32, invariant } from './internal.js';
import { partBounds, boundsOverlap } from '../bricks/part-spec.js';

export const DEFAULT_STORAGE_LAYOUT = deepFreeze({
  // Inactive warehouse poses are in the machine world frame but outside the workcell.
  // A 400 mm pitch exceeds the largest hero part proxy in either planar axis.
  origin: { xMm: -8500, yMm: -5000, supportZmm: 30 },
  columns: 20,
  rows: 25,
  spacingXmm: 400,
  spacingYmm: 400,
  layerSpacingMm: 400
});

// Shared feeder in the forward work area, away from the robot's inner
// singularity region. Allocation checks each current part's physical footprint.
export const DEFAULT_FEEDER_SLOTS = deepFreeze(Array.from({ length: 18 }, (_, index) => ({
  xMm: 480 + (index % 6) * 100, yMm: 90 + Math.floor(index / 6) * 60, yawRad: 0
})));

export function allocateFeederSources(sources, existing = [], slots = DEFAULT_FEEDER_SLOTS, { excludedBounds = [], tableBounds = null, tableZMm = null } = {}) {
  const placed = [], occupied = [...existing];
  for (const source of sources) {
    for (const slot of slots) {
      // Long beams run across the table, not into the adjacent feeder row.
      const pose = { ...slot, ...(Number.isFinite(tableZMm) ? { zMm: Math.max(4, tableZMm) + source.physicalDimensions.heightMm / 2 } : {}), yawRad: source.physicalDimensions.lengthMm > 170 ? 0 : slot.yawRad };
      const brick = sourceToControllerBrick(source, pose), bounds = partBounds(brick);
      const expanded = { min: { ...bounds.min }, max: { ...bounds.max } };
      for (const axis of ['xMm', 'yMm']) { expanded.min[axis] -= 18; expanded.max[axis] += 18; }
      if (bounds.min.xMm < 300 || bounds.max.xMm > 1030 || bounds.max.yMm > 225 || bounds.min.yMm < -65) continue;
      if (tableBounds && (bounds.min.xMm < tableBounds.minX || bounds.max.xMm > tableBounds.maxX || bounds.min.yMm < tableBounds.minY || bounds.max.yMm > tableBounds.maxY)) continue;
      if (excludedBounds.some(box => boundsOverlap(expanded, box, 0))) continue;
      if (occupied.some(other => boundsOverlap(expanded, partBounds(other), 0))) continue;
      placed.push(brick); occupied.push(brick); break;
    }
  }
  return placed;
}

function sourceId(placementId, index) {
  return `bridge-src.${fnv1a32(placementId)}.${String(index).padStart(3, '0')}`;
}

function storagePose(index, layout, physicalDimensions) {
  const perLayer = layout.columns * layout.rows;
  const layer = Math.floor(index / perLayer);
  const positionInLayer = index % perLayer;
  const column = positionInLayer % layout.columns;
  const row = Math.floor(positionInLayer / layout.columns);
  return {
    xMm: layout.origin.xMm + column * layout.spacingXmm,
    yMm: layout.origin.yMm + row * layout.spacingYmm,
    zMm: layout.origin.supportZmm + physicalDimensions.heightMm / 2 + layer * layout.layerSpacingMm,
    yawRad: Math.PI / 2
  };
}

function makeSource(placement, index, layout) {
  return deepFreeze({
    sourceId: sourceId(placement.placementId, index),
    brickId: sourceId(placement.placementId, index),
    dedicatedPlacementId: placement.placementId,
    registryKey: placement.registryKey,
    registryId: placement.registryId,
    partClass: placement.partClass,
    partType: placement.partType,
    definitionId: placement.customPartDefinitionId,
    compatibilityKey: placement.compatibilityKey,
    material: placement.displayMaterial,
    physicalDimensions: placement.physicalDimensions,
    collisionProxy: placement.collisionProxy,
    captureProxy: placement.captureProxy,
    renderPoseTemplate: placement.renderPose,
    storagePose: storagePose(index, layout, placement.physicalDimensions),
    storageState: 'inactive-off-workcell',
    graspableState: placement.captureProxy.graspable ? 'defined' : 'not-graspable',
    assignmentState: 'unassigned',
    allowedActors: ['human', 'agent'],
    robotEligible: true
  });
}

export function sourceToControllerBrick(source, pose, {
  graspable = true,
  reachable = true,
  reachabilityReason = null
} = {}) {
  invariant(source?.sourceId && pose, 'INVALID_SETTINGS', 'A source record and pose are required.');
  return {
    id: source.sourceId,
    colour: source.compatibilityKey,
    displayColour: source.material?.colourHex ?? source.material?.sleepersHex ?? '#888888',
    position: { xMm: pose.xMm, yMm: pose.yMm, zMm: pose.zMm ?? (4 + source.physicalDimensions.heightMm / 2) },
    yawRad: Number(pose.yawRad ?? 0),
    heldBy: null,
    ownership: null,
    placedTargetId: null,
    placementType: null,
    connection: null,
    snapped: false,
    graspable: Boolean(graspable),
    bridgePart: {
      allowedActors: ['human', 'agent'],
      registryKey: source.registryKey,
      registryId: source.registryId,
      partClass: source.partClass,
      partType: source.partType,
      definitionId: source.definitionId,
      dedicatedPlacementId: source.dedicatedPlacementId,
      compatibilityKey: source.compatibilityKey,
      material: source.material,
      physicalDimensions: source.physicalDimensions,
      collisionProxy: source.collisionProxy,
      captureProxy: source.captureProxy,
      renderPoseTemplate: source.renderPoseTemplate
    },
    collisionProxy: source.collisionProxy,
    captureProxy: source.captureProxy,
    reachability: { reachable: Boolean(reachable), reason: reachable ? null : (reachabilityReason ?? 'inactive_off_workcell_storage') }
  };
}


function planarHalfExtents(source) {
  const yaw = Number(source.storagePose.yawRad ?? 0);
  const cosine = Math.abs(Math.cos(yaw));
  const sine = Math.abs(Math.sin(yaw));
  const halfLength = source.physicalDimensions.lengthMm / 2;
  const halfWidth = source.physicalDimensions.widthMm / 2;
  return {
    xMm: cosine * halfLength + sine * halfWidth,
    yMm: sine * halfLength + cosine * halfWidth
  };
}

function storageSourcesOverlap(left, right, clearanceMm = 0.2) {
  if (Math.abs(left.storagePose.zMm - right.storagePose.zMm)
      >= (left.physicalDimensions.heightMm + right.physicalDimensions.heightMm) / 2 + clearanceMm) return false;
  const leftHalf = planarHalfExtents(left);
  const rightHalf = planarHalfExtents(right);
  return Math.abs(left.storagePose.xMm - right.storagePose.xMm) < leftHalf.xMm + rightHalf.xMm + clearanceMm
    && Math.abs(left.storagePose.yMm - right.storagePose.yMm) < leftHalf.yMm + rightHalf.yMm + clearanceMm;
}

function validateStorageSources(sources) {
  for (let leftIndex = 0; leftIndex < sources.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sources.length; rightIndex += 1) {
      invariant(!storageSourcesOverlap(sources[leftIndex], sources[rightIndex]), 'INVALID_SETTINGS',
        'The bridge source warehouse layout overlaps two part proxies.', {
          leftSourceId: sources[leftIndex].sourceId,
          rightSourceId: sources[rightIndex].sourceId
        });
    }
  }
  return true;
}

export function createBridgePartInventory({ normalisedBuild, storageLayout = DEFAULT_STORAGE_LAYOUT } = {}) {
  invariant(Array.isArray(normalisedBuild?.placements), 'INVALID_SETTINGS', 'A normalised bridge construction is required.');
  const sources = normalisedBuild.placements.map((placement, index) => makeSource(placement, index, storageLayout));
  validateStorageSources(sources);
  const byId = new Map(sources.map((source) => [source.sourceId, source]));
  const byCompatibility = new Map();
  for (const source of sources) {
    if (!byCompatibility.has(source.compatibilityKey)) byCompatibility.set(source.compatibilityKey, []);
    byCompatibility.get(source.compatibilityKey).push(source);
  }
  const required = {};
  for (const source of sources) required[source.registryKey] = (required[source.registryKey] ?? 0) + 1;

  return Object.freeze({
    schemaVersion: 'robo-bridge.part-inventory.v1',
    planId: normalisedBuild.planId,
    designChecksum: normalisedBuild.designChecksum,
    count: sources.length,
    storageLayout: cloneFrozen(storageLayout),
    storageNoOverlap: true,
    required: deepFreeze(required),
    list: () => sources.map(cloneFrozen),
    get: (id) => byId.has(id) ? cloneFrozen(byId.get(id)) : null,
    compatibleSources(compatibilityKey) {
      return (byCompatibility.get(compatibilityKey) ?? []).map(cloneFrozen);
    },
    createWarehouseSnapshot() {
      return sources.map((source) => sourceToControllerBrick(source, source.storagePose, {
        graspable: false,
        reachable: false,
        reachabilityReason: 'inactive_off_workcell_storage'
      }));
    },
    createInitialActiveBatch({
      perCompatibilityKey = 2,
      maximumSources = 50,
      feederSlots = DEFAULT_FEEDER_SLOTS,
      robotOnly = false
    } = {}) {
      invariant(Number.isSafeInteger(perCompatibilityKey) && perCompatibilityKey >= 1 && perCompatibilityKey <= 5, 'INVALID_SETTINGS', 'perCompatibilityKey must be from 1 to 5.');
      invariant(Number.isSafeInteger(maximumSources) && maximumSources >= 1 && maximumSources <= 50, 'INVALID_SETTINGS', 'maximumSources must be from 1 to 50.');
      const selected = [];
      for (const key of [...byCompatibility.keys()].sort()) {
        const matches = byCompatibility.get(key).filter((source) => !robotOnly || source.robotEligible);
        selected.push(...matches.slice(0, perCompatibilityKey));
        if (selected.length >= maximumSources) break;
      }
      const bounded = selected.slice(0, Math.min(maximumSources, feederSlots.length));
      return allocateFeederSources(bounded, [], feederSlots);
    }
  });
}
