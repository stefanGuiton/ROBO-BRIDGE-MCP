'use strict';

import {
  createCustomPartRegistry,
  normalizeWorldTransform
} from '../bridge-core/index.js';
import {
  cloneFrozen,
  deepFreeze,
  hashRecord,
  invariant
} from './internal.js';

export const BRIDGE_PART_REGISTRY_REVISION = 'bridge-part-registry.p0.v1';
export const HERO_STANDARD_PART_TYPES = Object.freeze(['1x1x1', '1x2x1', '1x20x1']);
export const HERO_CUSTOM_PART_CLASSES = Object.freeze(['ARCH_A', 'ARCH_B', 'TRACK_SEGMENT']);

const STANDARD_BODY_GAP_MM = 0.2;
const STANDARD_HEIGHT_MM = 9.6;
const STANDARD_CAPTURE_TCP_ABOVE_CENTRE_MM = 7.7;
const DIMENSION_TOLERANCE_MM = 1e-6;

function geometryBounds(geometry) {
  const positions = geometry.positions;
  invariant(positions && positions.length >= 9 && positions.length % 3 === 0, 'UNSUPPORTED_PART', 'Custom part geometry is empty or invalid.');
  const minimum = { x: Infinity, y: Infinity, z: Infinity };
  const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let index = 0; index < positions.length; index += 3) {
    minimum.x = Math.min(minimum.x, positions[index]);
    minimum.y = Math.min(minimum.y, positions[index + 1]);
    minimum.z = Math.min(minimum.z, positions[index + 2]);
    maximum.x = Math.max(maximum.x, positions[index]);
    maximum.y = Math.max(maximum.y, positions[index + 1]);
    maximum.z = Math.max(maximum.z, positions[index + 2]);
  }
  return {
    minimum,
    maximum,
    centre: {
      x: (minimum.x + maximum.x) / 2,
      y: (minimum.y + maximum.y) / 2,
      z: (minimum.z + maximum.z) / 2
    },
    size: {
      x: maximum.x - minimum.x,
      y: maximum.y - minimum.y,
      z: maximum.z - minimum.z
    }
  };
}

function standardRegistryKey(partType) {
  return `STANDARD_BRICK:${partType}`;
}

function customRegistryKey(partClass, definitionId) {
  return `${partClass}:${definitionId}`;
}

function physicalBodyLength(logicalLengthMm) {
  return Math.max(0.1, logicalLengthMm - STANDARD_BODY_GAP_MM);
}

function compatibilityKey(record) {
  const definition = record.definitionId ?? record.partType;
  return `bridge.part.${record.partClass}.${definition}.${record.materialPolicy}`;
}

function standardRecord(part, dimensions) {
  const lengthCells = Number(part.lengthCells);
  invariant(Number.isSafeInteger(lengthCells) && lengthCells > 0, 'UNSUPPORTED_PART', 'Standard part lengthCells is invalid.', { part });
  const logicalLengthMm = dimensions.logicalCellMm * lengthCells;
  const record = {
    registryKey: standardRegistryKey(part.partType),
    registryId: `bridge-part.standard.${part.partType}.v1`,
    revision: BRIDGE_PART_REGISTRY_REVISION,
    partClass: 'STANDARD_BRICK',
    partType: part.partType,
    definitionId: null,
    logicalFootprint: {
      lengthCells,
      widthCells: 1,
      heightLayers: 1,
      lengthMm: logicalLengthMm,
      widthMm: dimensions.logicalCellMm,
      heightMm: dimensions.layerHeightMm
    },
    physicalDimensions: {
      lengthMm: physicalBodyLength(logicalLengthMm),
      widthMm: physicalBodyLength(dimensions.logicalCellMm),
      heightMm: dimensions.layerHeightMm
    },
    render: {
      kind: 'standard-lego-body',
      bodyGapMm: STANDARD_BODY_GAP_MM,
      studPitchMm: 8,
      exactGeometrySource: 'MAIN_DEMO standard part renderer'
    },
    collisionProxy: {
      kind: 'oriented-box',
      conservative: false,
      sizeMm: {
        xMm: physicalBodyLength(logicalLengthMm),
        yMm: physicalBodyLength(dimensions.logicalCellMm),
        zMm: dimensions.layerHeightMm
      },
      note: 'Uses the physical standard-part body bounds. Logical occupancy remains on the 16 mm grid.'
    },
    captureProxy: {
      kind: 'centre-top',
      tcpAboveCentreMm: STANDARD_CAPTURE_TCP_ABOVE_CENTRE_MM,
      jawGapMm: 15.8,
      graspable: true
    },
    occupancy: {
      kind: 'logical-grid-box',
      lengthMm: logicalLengthMm,
      widthMm: dimensions.logicalCellMm,
      heightMm: dimensions.layerHeightMm
    },
    materialPolicy: 'role-colour',
    allowedActors: ['human', 'agent'],
    robotSupport: { enabled: true, reason: null, model: 'deterministic-simulator-proxy' }
  };
  record.compatibilityKeyBase = compatibilityKey(record);
  return deepFreeze(record);
}

function customRecord(definition, geometry, dimensions) {
  const bounds = geometryBounds(geometry);
  const scale = dimensions.worldScale;
  const physicalDimensions = {
    lengthMm: bounds.size.x * scale,
    widthMm: bounds.size.z * scale,
    heightMm: bounds.size.y * scale
  };
  const p = definition.parameters ?? {};
  const isTrack = definition.partClass === 'TRACK_SEGMENT';
  const logicalLengthMm = isTrack
    ? Number(p.segmentLength) * scale
    : Number(p.outerWidthCells) * dimensions.logicalCellMm;
  const logicalWidthMm = isTrack
    ? Number(p.widthWorld) * scale
    : Number(definition.widthCells ?? 1) * dimensions.logicalCellMm;
  const record = {
    registryKey: customRegistryKey(definition.partClass, definition.definitionId),
    registryId: `bridge-part.custom.${definition.definitionId}.v1`,
    revision: BRIDGE_PART_REGISTRY_REVISION,
    partClass: definition.partClass,
    partType: definition.partClass,
    definitionId: definition.definitionId,
    geometryHash: definition.geometryHash,
    geometryVersion: definition.geometryVersion,
    logicalFootprint: {
      lengthCells: isTrack ? null : Number(p.outerWidthCells),
      widthCells: Number(definition.widthCells ?? 1),
      heightLayers: isTrack ? null : Math.max(...(p.topLayers ?? [1])),
      lengthMm: logicalLengthMm,
      widthMm: logicalWidthMm,
      heightMm: physicalDimensions.heightMm
    },
    physicalDimensions,
    render: {
      kind: 'bridge-core-exact-custom-geometry',
      definitionId: definition.definitionId,
      geometryHash: definition.geometryHash,
      geometryVersion: definition.geometryVersion,
      exactGeometrySource: '../bridge-core/custom-part-geometry.js',
      materialSlots: isTrack ? ['masonry-unused', 'sleepers', 'rails'] : ['masonry']
    },
    geometryOriginToProxyCentreLocal: bounds.centre,
    collisionProxy: {
      kind: 'compound-profile-boxes',
      conservative: true,
      // Bounds of each exact front-face triangle, extruded through depth.
      // This preserves the stepped crown and opening instead of filling the
      // whole arch void with a single collision box. No actor-specific model.
      boxes: definition.partClass === 'TRACK_SEGMENT' ? null : Array.from({ length: geometry.positions.length / 9 }, (_, i) => {
        if (geometry.normals[i * 9 + 2] < 0.9) return null;
        const points = [0, 1, 2].map(j => Array.from(geometry.positions.slice(i * 9 + j * 3, i * 9 + j * 3 + 3)));
        const lo = [0, 1].map(a => Math.min(...points.map(v => v[a])));
        const hi = [0, 1].map(a => Math.max(...points.map(v => v[a])));
        return { position: { xMm: ((lo[0] + hi[0]) / 2 - bounds.centre.x) * scale, yMm: 0, zMm: ((lo[1] + hi[1]) / 2 - bounds.centre.y) * scale },
          sizeMm: { xMm: (hi[0] - lo[0]) * scale, yMm: physicalDimensions.widthMm, zMm: (hi[1] - lo[1]) * scale } };
      }).filter(Boolean),
      sizeMm: {
        xMm: physicalDimensions.lengthMm,
        yMm: physicalDimensions.widthMm,
        zMm: physicalDimensions.heightMm
      },
      note: 'Conservative exact-profile triangle boxes, without artificial inter-part margin. Track uses its exact AABB.'
    },
    captureProxy: {
      kind: 'centre-top',
      tcpAboveCentreMm: physicalDimensions.heightMm / 2 + 3,
      jawGapMm: 15.8,
      graspable: true,
      note: 'Deterministic simulator capture only; not calibrated physical hardware.'
    },
    occupancy: {
      kind: isTrack ? 'track-aabb' : 'custom-support-map',
      lengthMm: logicalLengthMm,
      widthMm: logicalWidthMm,
      heightMm: physicalDimensions.heightMm,
      supportFootprint: definition.supportFootprint ?? [],
      topSupportMap: definition.topSupportMap ?? []
    },
    materialPolicy: isTrack ? 'track-materials' : 'role-colour',
    allowedActors: ['human', 'agent'],
    robotSupport: { enabled: true, reason: null, model: 'deterministic-simulator-proxy' }
  };
  record.compatibilityKeyBase = compatibilityKey(record);
  return deepFreeze(record);
}

function registryIdentity(records, dimensions, buildPlan) {
  return {
    revision: BRIDGE_PART_REGISTRY_REVISION,
    planSchemaVersion: buildPlan.schemaVersion,
    logicalCellMm: dimensions.logicalCellMm,
    layerHeightMm: dimensions.layerHeightMm,
    standardBodyGapMm: STANDARD_BODY_GAP_MM,
    records: records.map((record) => ({
      registryKey: record.registryKey,
      registryId: record.registryId,
      partClass: record.partClass,
      partType: record.partType,
      definitionId: record.definitionId,
      geometryHash: record.geometryHash ?? null,
      logicalFootprint: record.logicalFootprint,
      physicalDimensions: record.physicalDimensions,
      robotSupport: record.robotSupport,
      allowedActors: record.allowedActors
    }))
  };
}

export function createBridgePartRegistry({ buildPlan, worldTransform = {}, strictHero = true } = {}) {
  invariant(buildPlan?.schemaVersion === '4.6', 'BUILDPLAN_UNAVAILABLE', 'A V4.6 BuildPlan is required for the PartRegistry.');
  const transform = normalizeWorldTransform(worldTransform);
  const grid = buildPlan.geometry?.grid;
  invariant(grid && Number.isFinite(grid.dx) && Number.isFinite(grid.dy), 'BUILDPLAN_UNAVAILABLE', 'BuildPlan grid dimensions are unavailable.');
  const dimensions = deepFreeze({
    worldScale: transform.scale,
    logicalCellMm: grid.dx * transform.scale,
    layerHeightMm: grid.dy * transform.scale
  });
  if (strictHero) {
    invariant(Math.abs(dimensions.logicalCellMm - 16) <= DIMENSION_TOLERANCE_MM, 'UNSUPPORTED_PART', 'The P0 registry requires a 16 mm logical cell.', dimensions);
    invariant(Math.abs(dimensions.layerHeightMm - STANDARD_HEIGHT_MM) <= DIMENSION_TOLERANCE_MM, 'UNSUPPORTED_PART', 'The P0 registry requires a 9.6 mm layer height.', dimensions);
  }

  const customGeometry = createCustomPartRegistry(buildPlan);
  const records = [];
  for (const part of buildPlan.catalogue.standardPartTypes ?? []) records.push(standardRecord(part, dimensions));
  for (const definition of buildPlan.catalogue.customDefinitions ?? []) {
    records.push(customRecord(definition, customGeometry.getGeometry(definition.definitionId), dimensions));
  }
  records.sort((left, right) => left.registryKey.localeCompare(right.registryKey));


  const byKey = new Map(records.map((record) => [record.registryKey, record]));
  const identity = registryIdentity(records, dimensions, buildPlan);
  const hash = hashRecord(identity, 'pr_');

  const resolveKey = (placement) => placement?.partClass === 'STANDARD_BRICK'
    ? standardRegistryKey(placement.partType)
    : customRegistryKey(placement?.partClass, placement?.customPartDefinitionId ?? placement?.definitionId);

  return Object.freeze({
    schemaVersion: 'robo-bridge.part-registry.v1',
    revision: BRIDGE_PART_REGISTRY_REVISION,
    hash,
    dimensions,
    size: records.length,
    list: () => records.map(cloneFrozen),
    hasPlacement: (placement) => byKey.has(resolveKey(placement)),
    supportsPart: (placement) => byKey.has(resolveKey(placement)),
    resolve(placement) {
      const key = resolveKey(placement);
      const record = byKey.get(key);
      invariant(record, 'UNSUPPORTED_PART', 'The bridge PartRegistry does not support this placement.', {
        placementId: placement?.placementId ?? null,
        partClass: placement?.partClass ?? null,
        partType: placement?.partType ?? null,
        definitionId: placement?.customPartDefinitionId ?? placement?.definitionId ?? null
      });
      return cloneFrozen(record);
    },
    get(registryKey) {
      const record = byKey.get(registryKey);
      return record ? cloneFrozen(record) : null;
    },
    getCustomGeometry(definitionId) {
      return customGeometry.getGeometry(definitionId);
    },
    identity: cloneFrozen(identity)
  });
}

export function createPlacementCompatibilityKey(registryRecord, material = {}) {
  invariant(registryRecord?.registryKey, 'UNSUPPORTED_PART', 'A PartRegistry record is required.');
  const materialKey = material.role === 'track'
    ? `${material.sleepersHex ?? 'none'}:${material.railsHex ?? 'none'}`
    : `${material.role ?? 'none'}:${material.colourHex ?? 'none'}`;
  return `${registryRecord.compatibilityKeyBase}.${materialKey}`.replaceAll('#', '');
}
