'use strict';

import { BridgeCoreError, cloneValue } from './errors.js';

function requirePlan(plan) {
  if (!plan || plan.schemaVersion !== '4.6' || !plan.geometry?.masterSlice || !plan.catalogue) {
    throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'A valid V4.6 BuildPlan is required.');
  }
}

function safeId(plan, kind, first, second) {
  const id = `${plan.planId}.${kind}.${first}.${second}`;
  if (id.length > 64 || !/^[A-Za-z0-9_.:-]+$/.test(id)) {
    throw new BridgeCoreError('INTERNAL_ERROR', 'Generated placement ID is not stream-safe.', { id });
  }
  return id;
}

function roleColour(role, palette) {
  if (role === 'track') return null;
  return palette?.[role] ?? palette?.body ?? '#888888';
}

function standardPhase(placement, customMasters) {
  if (placement.role === 'deck' || placement.role === 'cap') return 4;
  const x0 = placement.gridX;
  const x1 = placement.gridX + placement.lengthCells - 1;
  for (const arch of customMasters) {
    if (arch.partClass === 'TRACK_SEGMENT') continue;
    const left = (arch.outerLeftGrid ?? Math.min(...(arch.reservedRuns || []).map((item) => item.gridX))) - 1;
    const right = (arch.outerLeftGrid ?? Math.max(...(arch.reservedRuns || []).map((item) => item.gridX))) + (arch.outerWidthCells ?? 1);
    const footLayer = arch.supportFootprint?.length
      ? Math.min(...arch.supportFootprint.map((foot) => foot.layer))
      : arch.baseLayer;
    if (placement.gridY >= footLayer && x1 >= left && x0 <= right) return 3;
  }
  return 1;
}

function territoryActor(territory, collaboration, partClass = null) {
  if (partClass === 'TRACK_SEGMENT') {
    if (collaboration.trackOwner === 'user') return 'user';
    if (collaboration.trackOwner === 'shared_open') return 'shared';
    return 'codex';
  }
  if (collaboration.mode === 'codex_all') return 'codex';
  if (collaboration.mode === 'shared_open') return 'shared';
  if (territory === 'user') return 'user';
  if (territory === 'codex') return 'codex';
  if (territory === 'shared_macro') {
    if (collaboration.sharedMacroOwner === 'user') return 'user';
    if (collaboration.sharedMacroOwner === 'first_available') return 'shared';
    return 'codex';
  }
  return 'shared';
}

export function expandBuildPlanPlacements(plan) {
  requirePlan(plan);
  const grid = plan.geometry.grid;
  const slice = plan.geometry.sliceArray;
  const palette = plan.catalogue.rolePalette;
  const collaboration = plan.collaboration;
  const standardMasters = plan.geometry.masterSlice.placements;
  const customMasters = plan.geometry.masterSlice.customPlacements;
  const definitions = new Map(plan.catalogue.customDefinitions.map((definition) => [definition.definitionId, definition]));
  const standardPhysicalCount = standardMasters.length * slice.count;

  const standardByCell = new Map();
  for (const master of standardMasters) {
    for (let x = master.gridX; x < master.gridX + master.lengthCells; x += 1) {
      standardByCell.set(`${x}:${master.gridY}`, master.basePlacementId);
    }
  }
  const customByReservedCell = new Map();
  for (let index = 0; index < customMasters.length; index += 1) {
    const master = customMasters[index];
    if (master.partClass === 'TRACK_SEGMENT') continue;
    for (const run of master.reservedRuns || []) {
      for (let y = run.y0; y <= run.y1; y += 1) customByReservedCell.set(`${run.gridX}:${y}`, index);
    }
  }

  const standard = [];
  const standardId = (baseId, sliceIndex) => safeId(plan, 's', baseId, sliceIndex);
  const customId = (masterIndex, sliceIndex) => safeId(plan, 'c', masterIndex, sliceIndex < 0 ? 't' : sliceIndex);
  for (const master of standardMasters) {
    for (let sliceIndex = 0; sliceIndex < slice.count; sliceIndex += 1) {
      const dependencies = new Set((master.dependsOn || []).map((baseId) => standardId(baseId, sliceIndex)));
      if (master.layer > 0) {
        for (let x = master.gridX; x < master.gridX + master.lengthCells; x += 1) {
          const customIndex = customByReservedCell.get(`${x}:${master.gridY - 1}`);
          if (customIndex !== undefined) dependencies.add(customId(customIndex, sliceIndex));
        }
      }
      const physicalPlacementId = master.basePlacementId * slice.count + sliceIndex;
      standard.push({
        placementId: standardId(master.basePlacementId, sliceIndex),
        physicalPlacementId,
        placementKind: 'STANDARD_BRICK',
        partClass: 'STANDARD_BRICK',
        partType: master.partType,
        definitionId: null,
        family: plan.geometry.family,
        role: master.role,
        colourHex: roleColour(master.role, palette),
        territory: master.territory,
        actorPreference: territoryActor(master.territory, collaboration),
        buildPhase: standardPhase(master, customMasters),
        local: {
          position: {
            x: plan.anchors.group.x + (master.gridX + master.lengthCells * 0.5) * grid.dx,
            y: (master.gridY + 0.5) * grid.dy,
            z: plan.anchors.group.z + (sliceIndex - (slice.count - 1) * 0.5) * slice.pitch
          },
          yawRad: 0,
          size: { x: master.lengthCells * grid.dx, y: grid.dy, z: grid.dx }
        },
        grid: {
          basePlacementId: master.basePlacementId,
          sliceIndex,
          gridX: master.gridX,
          gridY: master.gridY,
          lengthCells: master.lengthCells,
          segmentId: master.segmentId
        },
        dependencyIds: [...dependencies].sort(),
        support: {
          type: master.layer <= 0 ? 'base-or-terrain' : dependencies.size ? 'placements' : 'void-or-terrain',
          dependencyIds: [...dependencies].sort()
        },
        requiresStructureComplete: false,
        trackIndex: null
      });
    }
  }

  const custom = [];
  let customPhysicalIndex = 0;
  for (let masterIndex = 0; masterIndex < customMasters.length; masterIndex += 1) {
    const master = customMasters[masterIndex];
    const repeat = master.repeatAcrossSlices !== false;
    const count = repeat ? slice.count : 1;
    for (let instanceIndex = 0; instanceIndex < count; instanceIndex += 1) {
      const sliceIndex = repeat ? instanceIndex : -1;
      const dependencies = new Set();
      if (master.partClass !== 'TRACK_SEGMENT') {
        for (const foot of master.supportFootprint || []) {
          const below = `${foot.gridX}:${foot.layer - 1}`;
          const standardBaseId = standardByCell.get(below);
          if (standardBaseId !== undefined) dependencies.add(standardId(standardBaseId, sliceIndex));
          const supportingCustomIndex = customByReservedCell.get(below);
          if (supportingCustomIndex !== undefined && supportingCustomIndex !== masterIndex) {
            dependencies.add(customId(supportingCustomIndex, sliceIndex));
          }
        }
      } else if (master.trackIndex > 0) {
        const previousMasterIndex = customMasters.findIndex((candidate) => candidate.partClass === 'TRACK_SEGMENT' && candidate.trackIndex === master.trackIndex - 1);
        if (previousMasterIndex >= 0) dependencies.add(customId(previousMasterIndex, -1));
      }
      const physicalPlacementId = standardPhysicalCount + customPhysicalIndex;
      custom.push({
        placementId: customId(masterIndex, sliceIndex),
        physicalPlacementId,
        customPhysicalIndex,
        placementKind: master.placementKind,
        partClass: master.partClass,
        partType: master.partClass,
        definitionId: master.definitionId,
        definition: cloneValue(definitions.get(master.definitionId) ?? null),
        family: plan.geometry.family,
        role: master.role,
        colourHex: master.partClass === 'TRACK_SEGMENT' ? null : roleColour(master.role, palette),
        trackMaterials: master.partClass === 'TRACK_SEGMENT' ? {
          sleepers: palette.trackSleepers,
          rails: palette.trackRails
        } : null,
        territory: master.territory,
        actorPreference: territoryActor(master.territory, collaboration, master.partClass),
        buildPhase: master.partClass === 'TRACK_SEGMENT' ? 5 : 2,
        local: {
          position: {
            x: master.partClass === 'TRACK_SEGMENT' ? master.centreX : plan.anchors.group.x + master.centreX,
            y: master.baseY,
            z: repeat
              ? plan.anchors.group.z + (sliceIndex - (slice.count - 1) * 0.5) * slice.pitch
              : plan.anchors.group.z
          },
          yawRad: 0,
          size: null
        },
        grid: {
          masterCustomId: master.masterCustomId,
          masterCustomIndex: masterIndex,
          sliceIndex,
          baseLayer: master.baseLayer,
          trackIndex: master.trackIndex ?? null
        },
        dependencyIds: [...dependencies].sort(),
        support: {
          type: master.partClass === 'TRACK_SEGMENT' ? 'structure-barrier' : dependencies.size ? 'placements-or-terrain' : 'terrain',
          dependencyIds: [...dependencies].sort(),
          footprint: cloneValue(master.supportFootprint || [])
        },
        requiresStructureComplete: master.partClass === 'TRACK_SEGMENT',
        trackIndex: master.trackIndex ?? null
      });
      customPhysicalIndex += 1;
    }
  }

  const all = [...standard, ...custom];
  const byId = new Map(all.map((placement) => [placement.placementId, placement]));
  const indegree = new Map(all.map((placement) => [placement.placementId, 0]));
  const dependents = new Map(all.map((placement) => [placement.placementId, []]));
  for (const placement of all) {
    for (const dependencyId of placement.dependencyIds) {
      if (!byId.has(dependencyId)) continue;
      indegree.set(placement.placementId, indegree.get(placement.placementId) + 1);
      dependents.get(dependencyId).push(placement.placementId);
    }
  }
  const priority = (placement) => [
    placement.buildPhase,
    placement.local.position.y,
    placement.actorPreference === 'codex' ? -placement.local.position.x : placement.local.position.x,
    placement.grid.sliceIndex < 0 ? 0 : placement.grid.sliceIndex,
    placement.physicalPlacementId
  ];
  const compare = (left, right) => {
    const a = priority(left);
    const b = priority(right);
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
    return left.placementId.localeCompare(right.placementId);
  };
  const ready = all.filter((placement) => indegree.get(placement.placementId) === 0).sort(compare);
  const ordered = [];
  while (ready.length) {
    const placement = ready.shift();
    ordered.push(placement);
    for (const dependentId of dependents.get(placement.placementId)) {
      indegree.set(dependentId, indegree.get(dependentId) - 1);
      if (indegree.get(dependentId) === 0) {
        ready.push(byId.get(dependentId));
        ready.sort(compare);
      }
    }
  }
  if (ordered.length !== all.length) {
    throw new BridgeCoreError('COMPILE_FAILED', 'The expanded placement dependency graph contains a cycle.', {
      total: all.length,
      ordered: ordered.length
    });
  }
  ordered.forEach((placement, orderIndex) => { placement.orderIndex = orderIndex; });

  return {
    schemaVersion: 'robo-bridge.expanded-placements.v1',
    planId: plan.planId,
    designChecksum: plan.designChecksum,
    family: plan.geometry.family,
    standardPhysicalCount,
    customPhysicalCount: custom.length,
    totalPhysicalCount: all.length,
    definitions: cloneValue(plan.catalogue.customDefinitions),
    placements: ordered
  };
}
