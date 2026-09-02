'use strict';

import {
  assertFrozenPlanMatches,
  freezeBridgePlan,
  normalizeWorldTransform
} from '../bridge-core/index.js';
import { deepFreeze, hashRecord, invariant } from './internal.js';

export function freezeBridgeConstructionPlan({
  bridgeSpec,
  buildPlan,
  worldTransform,
  challenge = null,
  requiredPlacementIds,
  partRegistry
} = {}) {
  invariant(partRegistry?.revision && partRegistry?.hash, 'UNSUPPORTED_PART', 'A PartRegistry is required before BUILD can start.');
  invariant(Array.isArray(requiredPlacementIds) && requiredPlacementIds.length > 0, 'INVALID_SETTINGS', 'requiredPlacementIds are required before BUILD can start.');
  const base = freezeBridgePlan({ bridgeSpec, buildPlan, worldTransform, challenge });
  const unique = new Set(requiredPlacementIds);
  invariant(unique.size === requiredPlacementIds.length, 'INVALID_SETTINGS', 'requiredPlacementIds contain duplicates.');
  const frozen = {
    ...base,
    schemaVersion: 'robo-bridge.frozen-construction-plan.v1',
    bridgeSpec: base.frozenBridgeSpec,
    frozenBridgeSpec: base.frozenBridgeSpec,
    worldTransform: normalizeWorldTransform(base.worldTransform),
    requiredPlacementIds: [...requiredPlacementIds],
    challengeId: challenge?.id ?? null,
    partRegistryRevision: partRegistry.revision,
    partRegistryHash: partRegistry.hash
  };
  frozen.freezeChecksum = hashRecord({
    challengeId: frozen.challengeId,
    bridgeSpec: frozen.bridgeSpec,
    planId: frozen.planId,
    designChecksum: frozen.designChecksum,
    designRevision: frozen.designRevision,
    executionRevisionAtFreeze: frozen.executionRevisionAtFreeze,
    worldTransform: frozen.worldTransform,
    requiredPlacementIds: frozen.requiredPlacementIds,
    partRegistryRevision: frozen.partRegistryRevision,
    partRegistryHash: frozen.partRegistryHash
  }, 'freeze_');
  return deepFreeze(frozen);
}

export function assertFrozenConstructionPlanMatches(frozen, expected = {}) {
  invariant(frozen?.schemaVersion === 'robo-bridge.frozen-construction-plan.v1', 'BUILDPLAN_UNAVAILABLE', 'A frozen construction plan is required.');
  assertFrozenPlanMatches({ ...frozen, schemaVersion: 'robo-bridge.frozen-plan.v1' }, expected);
  invariant(expected.partRegistryRevision === undefined || expected.partRegistryRevision === frozen.partRegistryRevision,
    'STALE_DESIGN_REVISION', 'The frozen PartRegistry revision does not match.',
    { expected: frozen.partRegistryRevision, received: expected.partRegistryRevision });
  invariant(expected.partRegistryHash === undefined || expected.partRegistryHash === frozen.partRegistryHash,
    'STALE_DESIGN_REVISION', 'The frozen PartRegistry hash does not match.',
    { expected: frozen.partRegistryHash, received: expected.partRegistryHash });
  return true;
}
