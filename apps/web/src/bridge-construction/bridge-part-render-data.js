'use strict';

import { deepFreeze, invariant } from './internal.js';

export function createBridgePartRenderData({ preparedBuild, buildBoard } = {}) {
  invariant(preparedBuild?.registry && preparedBuild?.normalisedBuild, 'INVALID_SETTINGS', 'A prepared bridge build is required.');
  invariant(buildBoard && typeof buildBoard.getTargets === 'function', 'INVALID_SETTINGS', 'The existing BuildBoard is required.');
  const targetState = new Map(buildBoard.getTargets().map((target) => [target.targetId ?? target.id, target]));
  const records = preparedBuild.normalisedBuild.placements.map((placement) => {
    const target = targetState.get(placement.placementId);
    const part = preparedBuild.registry.resolve(placement);
    return deepFreeze({
      placementId: placement.placementId,
      targetId: placement.placementId,
      brickId: target?.occupiedBy ?? null,
      status: target?.occupiedBy ? 'placed' : 'planned',
      completedBy: target?.completedBy ?? null,
      partClass: placement.partClass,
      partType: placement.partType,
      definitionId: placement.customPartDefinitionId,
      material: placement.displayMaterial,
      renderPose: placement.renderPose,
      physicalDimensions: part.physicalDimensions,
      geometry: part.render.kind === 'bridge-core-exact-custom-geometry'
        ? { kind: part.render.kind, definitionId: part.definitionId, geometryHash: part.geometryHash }
        : { kind: part.render.kind, bodyGapMm: part.render.bodyGapMm }
    });
  });
  return deepFreeze({
    schemaVersion: 'robo-bridge.part-render-data.v1',
    planId: preparedBuild.frozenPlan.planId,
    designChecksum: preparedBuild.frozenPlan.designChecksum,
    partRegistryHash: preparedBuild.registry.hash,
    records
  });
}
