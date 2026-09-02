'use strict';

import { BridgeCoreError, cloneValue } from './errors.js';
import { normalizeWorldTransform } from './world-transform.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function freezeBridgePlan({ bridgeSpec, buildPlan, worldTransform, challenge = null } = {}) {
  if (!buildPlan || buildPlan.schemaVersion !== '4.6' || !buildPlan.planId || !buildPlan.designChecksum) {
    throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'A valid V4.6 BuildPlan is required before BUILD can start.');
  }
  if (!bridgeSpec || typeof bridgeSpec !== 'object' || Array.isArray(bridgeSpec)) {
    throw new BridgeCoreError('INVALID_SETTINGS', 'bridgeSpec is required before BUILD can start.');
  }
  const frozen = {
    schemaVersion: 'robo-bridge.frozen-plan.v1',
    frozenBridgeSpec: cloneValue(bridgeSpec),
    buildPlan: cloneValue(buildPlan),
    planId: buildPlan.planId,
    designChecksum: buildPlan.designChecksum,
    designRevision: buildPlan.designRevision,
    executionRevisionAtFreeze: buildPlan.executionRevision,
    worldTransform: cloneValue(normalizeWorldTransform(worldTransform ?? {})),
    challenge: challenge ? cloneValue(challenge) : null
  };
  return deepFreeze(frozen);
}

export function assertFrozenPlanMatches(frozen, { planId, designChecksum, designRevision } = {}) {
  if (!frozen || frozen.schemaVersion !== 'robo-bridge.frozen-plan.v1') {
    throw new BridgeCoreError('BUILDPLAN_UNAVAILABLE', 'A frozen bridge plan is required.');
  }
  if (planId !== undefined && frozen.planId !== planId) {
    throw new BridgeCoreError('STALE_DESIGN_REVISION', 'The frozen plan ID does not match the active plan.', { expected: frozen.planId, received: planId });
  }
  if (designChecksum !== undefined && frozen.designChecksum !== designChecksum) {
    throw new BridgeCoreError('STALE_DESIGN_REVISION', 'The frozen design checksum does not match the active design.', { expected: frozen.designChecksum, received: designChecksum });
  }
  if (designRevision !== undefined && frozen.designRevision !== designRevision) {
    throw new BridgeCoreError('STALE_DESIGN_REVISION', 'The frozen design revision does not match the active design.', { expected: frozen.designRevision, received: designRevision });
  }
  return true;
}
