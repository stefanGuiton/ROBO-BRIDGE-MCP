'use strict';

import { inverseTransformPointFromMainDemo } from '../bridge-core/world-transform.js';
import { deepFreeze, finite, invariant } from './internal.js';

// Presentation and scheduling advice only. PartRegistry/PlacementAuthority and
// the one BuildBoard still decide whether either actor can place a given part.
export function createBridgeCollaboration({ buildPlan } = {}) {
  const centreLocalZ = finite(buildPlan?.anchors?.bridgeCentreZ ?? buildPlan?.anchors?.group?.z, 'bridge centre local z');
  return deepFreeze({
    schemaVersion: 'robo-bridge.collaboration.v1',
    mode: 'lateral_advisory',
    advisoryOnly: true,
    axis: 'bridge_local_z',
    centreLocalZ,
    centrelineToleranceLocal: 1e-7,
    negativeSideActor: 'human',
    positiveSideActor: 'agent',
    centrelineActor: 'agent'
  });
}

export function classifyBridgeCollaboration({ renderPose, worldTransform, collaboration } = {}) {
  invariant(collaboration?.mode === 'lateral_advisory', 'INVALID_SETTINGS', 'The bridge lateral collaboration rule is required.');
  // Custom-part collision/capture proxies can have an offset origin. Classify
  // the exact BuildPlan render origin, never a proxy or a world-space axis.
  const localLateralZ = inverseTransformPointFromMainDemo(renderPose?.position, worldTransform).z;
  const relative = localLateralZ - collaboration.centreLocalZ;
  const relativeLateralZ = Math.abs(relative) <= collaboration.centrelineToleranceLocal ? 0 : relative;
  const side = relativeLateralZ < 0 ? 'negative' : relativeLateralZ > 0 ? 'positive' : 'centreline';
  return deepFreeze({
    mode: collaboration.mode,
    advisoryOnly: true,
    advisoryActor: side === 'negative' ? 'human' : 'agent',
    side,
    localLateralZ,
    relativeLateralZ,
    centreLocalZ: collaboration.centreLocalZ
  });
}

export function validateBridgeActorHint(actorHint) {
  invariant(actorHint === undefined || actorHint === 'human' || actorHint === 'agent',
    'INVALID_SETTINGS', 'actorHint must be human or agent when supplied.');
  return actorHint;
}

export function bridgeSchedulingSummary(placements, actorHint) {
  validateBridgeActorHint(actorHint);
  const fallbackPlacementIds = actorHint === undefined ? [] : placements
    .filter(placement => placement.collaboration?.advisoryActor !== actorHint)
    .map(placement => placement.placementId);
  return deepFreeze({
    actorHint: actorHint ?? null,
    advisoryOnly: true,
    preferredSelected: actorHint === undefined ? 0 : placements.length - fallbackPlacementIds.length,
    fallbackUsed: fallbackPlacementIds.length > 0,
    fallbackCount: fallbackPlacementIds.length,
    fallbackPlacementIds,
    fallbackReason: fallbackPlacementIds.length ? 'no_preferred_eligible_placement' : null
  });
}
