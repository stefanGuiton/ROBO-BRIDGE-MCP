'use strict';

import { createBridgeCollisionSnapshot } from '../train/bridge-collision-snapshot.js';
import { createBuildBoardSupportMap } from '../train/buildboard-support-map.js';
import { cloneValue, checksumHex, deepFreezePlain, invariant, unwrapFrozenPlan } from './internal.js';
import { createTrainRouteFrameFromChallenge } from './challenge-route-adapter.js';
import { createAuthoritativeBuildBoardSnapshot } from './construction-identity-adapter.js';

export function createTrainTestEvidence({
  challengeService,
  frozenPlan,
  buildBoard = null,
  buildBoardSnapshot = null,
  normalisedBuild = null,
  targetSet = null,
  expectedPlacementIds = null,
  partRegistry = null,
  requirePartRegistry,
  routeValidation = {},
  supportSettings = {},
  includeMergedFaces = true,
  allowIdOnlySnapshot = false
} = {}) {
  const { buildPlan } = unwrapFrozenPlan(frozenPlan);
  const routeContract = createTrainRouteFrameFromChallenge(challengeService, {
    frozenPlan,
    ...routeValidation
  });
  invariant(routeContract.trainRouteFrame && routeContract.worldTransform,
    'INVALID_CHALLENGE_ROUTE', 'A BuildPlan-bound Challenge route is required.');
  const board = createAuthoritativeBuildBoardSnapshot({
    frozenPlan,
    buildBoard,
    buildBoardSnapshot,
    normalisedBuild,
    targetSet,
    expectedPlacementIds,
    partRegistry,
    requirePartRegistry,
    allowIdOnlySnapshot
  });
  const supportMap = createBuildBoardSupportMap({
    frozenBuildPlan: buildPlan,
    acceptedBuildBoardSnapshot: board,
    worldTransform: routeContract.worldTransform,
    ...supportSettings
  });
  const collisionSnapshot = createBridgeCollisionSnapshot({
    frozenBuildPlan: buildPlan,
    acceptedBuildBoardSnapshot: board,
    worldTransform: routeContract.worldTransform,
    includeMergedFaces
  });
  invariant(supportMap.routeIdentity === collisionSnapshot.routeIdentity,
    'TRAIN_EVIDENCE_ROUTE_MISMATCH', 'Support and collision evidence use different route identities.');
  invariant(supportMap.planIdentity.planId === collisionSnapshot.planIdentity.planId,
    'TRAIN_EVIDENCE_PLAN_MISMATCH', 'Support and collision evidence use different plan identities.');
  invariant(supportMap.buildBoard.worldRevision === collisionSnapshot.boardIdentity.worldRevision,
    'TRAIN_EVIDENCE_BOARD_MISMATCH', 'Support and collision evidence use different BuildBoard revisions.');

  const supportContract = deepFreezePlain({
    schemaVersion: 'robo-bridge.train-support-contract.v1',
    planId: buildPlan.planId,
    designChecksum: buildPlan.designChecksum,
    designRevision: buildPlan.designRevision,
    buildBoardWorldRevision: board.worldRevision,
    acceptedChecksum: board.acceptedChecksum,
    segmentCount: supportMap.segmentCount,
    supportedCount: supportMap.supportedCount,
    allSupported: supportMap.allSupported,
    firstUnsupportedSegment: supportMap.firstUnsupportedSegment,
    firstUnsupportedProgress: supportMap.firstUnsupportedProgress,
    segments: cloneValue(supportMap.segments),
    route: cloneValue(supportMap.route),
    routeIdentity: supportMap.routeIdentity,
    supportChecksum: supportMap.checksum,
    decisionAuthority: 'accepted BuildBoard target state',
    trackGraphicsCreateSupport: false,
    missionStateCreatesSupport: false
  });

  return Object.freeze({
    schemaVersion: 'robo-bridge.train-test-evidence.v1',
    identity: Object.freeze({
      planId: buildPlan.planId,
      designChecksum: buildPlan.designChecksum,
      designRevision: buildPlan.designRevision,
      buildBoardWorldRevision: board.worldRevision,
      acceptedChecksum: board.acceptedChecksum,
      routeIdentity: supportMap.routeIdentity,
      evidenceChecksum: checksumHex({
        planId: buildPlan.planId,
        designChecksum: buildPlan.designChecksum,
        boardRevision: board.worldRevision,
        acceptedChecksum: board.acceptedChecksum,
        routeIdentity: supportMap.routeIdentity,
        supportChecksum: supportMap.checksum,
        collisionChecksum: collisionSnapshot.checksum
      })
    }),
    buildPlan,
    frozenPlan,
    buildBoardSnapshot: board,
    routeContract,
    supportContract,
    supportMap,
    collisionSnapshot,
    collisionAuthority: Object.freeze({
      source: 'frozen V4.6 grid plus accepted BuildBoard placements',
      partRegistryIdentityVerified: Boolean(board.partRegistryHash),
      bridgeBodiesDynamic: false,
      oldFilledCellsUsed: false
    })
  });
}

export function createTrainEvidenceAdapter(options = {}) {
  let current = null;
  let cacheKey = null;
  return Object.freeze({
    prepare(overrides = {}) {
      const input = { ...options, ...overrides };
      const candidate = createTrainTestEvidence(input);
      const nextKey = candidate.identity.evidenceChecksum;
      if (current && cacheKey === nextKey && overrides.force !== true) return { evidence: current, reused: true };
      current = candidate;
      cacheKey = nextKey;
      return { evidence: current, reused: false };
    },
    invalidate() { current = null; cacheKey = null; },
    getEvidence() { return current; }
  });
}
