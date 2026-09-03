'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createChallengeServiceAdapter,
  createConstructionServiceAdapter,
  createTrainServiceAdapter
} from '../../apps/web/src/mission/adapters/index.js';
import { createProductionHarness } from '../helpers/production-fakes.js';

function startIdentity(h) {
  return {
    schemaVersion: 'robo-bridge.mission-freeze.v1',
    missionId: 'mission-adapter-1',
    challengeId: 'EASY',
    designRevision: h.plan.designRevision,
    planId: h.plan.planId,
    designChecksum: h.plan.designChecksum,
    worldTransform: h.worldTransform,
    requiredPlacementIds: [],
    partRegistryRevision: null,
    partRegistryHash: null
  };
}

test('Challenge adapter reads dynamic preset IDs and maps getTrackRoute', async () => {
  const h = createProductionHarness();
  const adapter = createChallengeServiceAdapter({
    service: h.challengeService,
    presets: h.challengePresets,
    runtime: h.runtime,
    selectChallenge: h.selectionHook
  });
  const options = adapter.getOptions({ cursor: 0, limit: 10 });
  assert.deepEqual(options.options.map((item) => item.id), ['EASY', 'HARD_CUSTOM']);
  assert.equal(adapter.getActiveChallenge().challenge.bridgeChallengeId, 'terrain-easy');
  const selected = await adapter.selectChallenge({
    challengeId: 'HARD_CUSTOM',
    expectedWorldRevision: h.worldRevision
  });
  assert.equal(selected.challenge.id, 'HARD_CUSTOM');
  assert.deepEqual(adapter.getTrainRoute(), h.challengePresets.HARD_CUSTOM.trackRoute);
  assert.equal(h.challengeCalls.setPreset, 1);
});

test('Construction adapter maps the exact session method names and positional count', async () => {
  const h = createProductionHarness();
  const adapter = createConstructionServiceAdapter({
    session: h.constructionSession,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot,
    runtime: h.runtime,
    robotController: h.robotController
  });
  const started = await adapter.startBuild({
    identity: startIdentity(h),
    buildPlan: h.plan,
    worldTransform: h.worldTransform,
    expectedWorldRevision: h.worldRevision
  });
  assert.equal(started.ok, true);
  assert.deepEqual(started.requiredPlacementIds, h.requiredPlacementIds);
  assert.equal(started.partRegistryHash, 'parts_abc123');
  assert.equal(h.constructionCalls.startBuild, 1);

  const beforeReads = h.constructionCalls.getBuildProgress;
  const progress = await adapter.getProgress({ identity: started.identity });
  assert.equal(progress.accepted, 0);
  assert.equal(progress.acceptedSnapshot.supportSource, 'BUILD_BOARD');
  assert.ok(h.constructionCalls.getBuildProgress > beforeReads);

  const built = await adapter.buildNextParts({
    identity: started.identity,
    count: 2,
    expectedWorldRevision: h.worldRevision
  });
  assert.equal(built.completed, 2);
  assert.equal(h.constructionCalls.lastCount, 2);
  assert.equal(built.lastPlacement.sourceReassigned, true);

  const cancelled = await adapter.cancel({ identity: started.identity, reason: 'test_cancel' });
  assert.equal(cancelled.ok, true);
  assert.equal(h.constructionCalls.cancelBuild, 1);
});

test('Construction adapter rejects a stale mission or plan identity', async () => {
  const h = createProductionHarness();
  const adapter = createConstructionServiceAdapter({
    session: h.constructionSession,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot,
    runtime: h.runtime,
    robotController: h.robotController
  });
  const started = await adapter.startBuild({
    identity: startIdentity(h),
    buildPlan: h.plan,
    worldTransform: h.worldTransform,
    expectedWorldRevision: h.worldRevision
  });
  await assert.rejects(
    adapter.getProgress({ identity: { ...started.identity, missionId: 'mission-stale' } }),
    (error) => error?.code === 'STALE_PLAN'
  );
  await assert.rejects(
    adapter.getProgress({ identity: { ...started.identity, planId: 'plan-stale' } }),
    (error) => error?.code === 'STALE_PLAN'
  );
});

test('Train adapter calls startTest once and does not call prepareTest separately', async () => {
  const h = createProductionHarness();
  const construction = createConstructionServiceAdapter({
    session: h.constructionSession,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot,
    runtime: h.runtime,
    robotController: h.robotController
  });
  const started = await construction.startBuild({
    identity: startIdentity(h),
    buildPlan: h.plan,
    worldTransform: h.worldTransform,
    expectedWorldRevision: h.worldRevision
  });
  const progress = await construction.getProgress({ identity: started.identity });
  const train = createTrainServiceAdapter({
    service: h.trainService,
    runtime: h.runtime,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot
  });
  const testBinding = {
    testId: 'test-adapter-1',
    missionId: started.identity.missionId,
    challengeId: started.identity.challengeId,
    planId: started.identity.planId,
    designChecksum: started.identity.designChecksum,
    designRevision: started.identity.designRevision,
    worldTransform: started.identity.worldTransform,
    requiredPlacementIds: started.identity.requiredPlacementIds,
    partRegistryRevision: started.identity.partRegistryRevision,
    partRegistryHash: started.identity.partRegistryHash,
    sampledWorldRevision: h.worldRevision,
    supportSource: 'BUILD_BOARD',
    supportSnapshotId: progress.acceptedSnapshot.snapshotId,
    supportSnapshotChecksum: progress.acceptedSnapshot.checksum
  };
  const result = await train.test({
    identity: started.identity,
    testBinding,
    acceptedSnapshot: progress.acceptedSnapshot
  });
  assert.equal(result.outcome, 'TRAIN_FELL');
  assert.equal(h.trainCalls.startTest, 1);
  assert.equal(h.trainCalls.prepareTest, 1, 'prepareTest is called only inside startTest');
  assert.equal(h.trainCalls.runToTerminal, 1);
});

test('Train adapter returns CROSSED only from the real CROSSED terminal state', async () => {
  const h = createProductionHarness();
  const construction = createConstructionServiceAdapter({
    session: h.constructionSession,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot,
    runtime: h.runtime,
    robotController: h.robotController
  });
  const started = await construction.startBuild({
    identity: startIdentity(h),
    buildPlan: h.plan,
    worldTransform: h.worldTransform,
    expectedWorldRevision: h.worldRevision
  });
  await construction.buildNextParts({ identity: started.identity, count: 3, expectedWorldRevision: h.worldRevision });
  const progress = await construction.getProgress({ identity: started.identity });
  h.setOutcome('CROSSED');
  const train = createTrainServiceAdapter({
    service: h.trainService,
    runtime: h.runtime,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot
  });
  const result = await train.test({
    identity: started.identity,
    testBinding: {
      ...started.identity,
      testId: 'test-crossed-1',
      sampledWorldRevision: h.worldRevision,
      supportSource: 'BUILD_BOARD',
      supportSnapshotId: progress.acceptedSnapshot.snapshotId,
      supportSnapshotChecksum: progress.acceptedSnapshot.checksum
    },
    acceptedSnapshot: progress.acceptedSnapshot
  });
  assert.equal(result.state, 'CROSSED');
  assert.equal(result.outcome, 'CROSSED');
});

test('Train adapter rejects a stale full test binding before core execution', async () => {
  const h = createProductionHarness();
  const construction = createConstructionServiceAdapter({
    session: h.constructionSession,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot,
    runtime: h.runtime,
    robotController: h.robotController
  });
  const started = await construction.startBuild({
    identity: startIdentity(h),
    buildPlan: h.plan,
    worldTransform: h.worldTransform,
    expectedWorldRevision: h.worldRevision
  });
  const progress = await construction.getProgress({ identity: started.identity });
  const train = createTrainServiceAdapter({
    service: h.trainService,
    runtime: h.runtime,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot
  });
  await assert.rejects(
    train.test({
      identity: started.identity,
      testBinding: {
        ...started.identity,
        designRevision: started.identity.designRevision + 1,
        testId: 'test-stale-binding',
        sampledWorldRevision: h.worldRevision,
        supportSource: 'BUILD_BOARD',
        supportSnapshotId: progress.acceptedSnapshot.snapshotId,
        supportSnapshotChecksum: progress.acceptedSnapshot.checksum
      },
      acceptedSnapshot: progress.acceptedSnapshot
    }),
    (error) => error?.code === 'STALE_PLAN'
  );
  assert.equal(h.trainCalls.startTest, 0);
});
