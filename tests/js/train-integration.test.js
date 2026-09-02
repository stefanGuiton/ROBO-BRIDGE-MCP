'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRAIN_FIXED_DT_SECONDS,
  TRAIN_STATES,
  createRouteFrame
} from '../../apps/web/src/train/index.js';
import {
  TrainIntegrationError,
  createAuthoritativeBuildBoardSnapshot,
  createChallengeTerrainSurfaceAdapter,
  createMainDemoTrainIntegration,
  createMissionTrainAdapter,
  createTrainRouteFrameFromChallenge,
  createTrainTestEvidence,
  validatePlacementIdentityCompatibility
} from '../../apps/web/src/train-integration/index.js';
import {
  createBuildBoardFixture,
  createChallengeServiceFixture,
  createConstructionFixture,
  createFullIntegrationFixture,
  createIntegrationPlan,
  createIntegrationTransform,
  createPartRegistryFixture,
  listPlanPlacementIds
} from '../helpers/train-integration-fixtures.js';

function authorityInput(fixture, overrides = {}) {
  return {
    frozenPlan: fixture.construction.frozenPlan,
    buildBoard: fixture.board,
    normalisedBuild: fixture.construction.normalisedBuild,
    targetSet: fixture.construction.targetSet,
    partRegistry: fixture.construction.registry,
    ...overrides
  };
}

function driveToTerminal(integration, { maximumFrames = 2400, frameDeltaSeconds = 1 / 60 } = {}) {
  for (let frame = 0; frame < maximumFrames; frame += 1) {
    const state = integration.getState().state;
    if ([TRAIN_STATES.CROSSED, TRAIN_STATES.FAILED, TRAIN_STATES.STOPPED].includes(state)) return frame;
    integration.updateFrame(frameDeltaSeconds);
  }
  throw new Error(`train did not reach a terminal state: ${integration.getState().state}`);
}

test('Construction placement identity stays stable through plan, targets and registry', () => {
  const fixture = createFullIntegrationFixture();
  const result = validatePlacementIdentityCompatibility({
    frozenPlan: fixture.construction.frozenPlan,
    normalisedBuild: fixture.construction.normalisedBuild,
    targetSet: fixture.construction.targetSet,
    partRegistry: fixture.construction.registry
  });
  assert.equal(result.planId, fixture.plan.planId);
  assert.equal(result.placementCount, listPlanPlacementIds(fixture.plan).length);
  assert.equal(result.checkedSources.length, 3);
  assert.equal(result.partRegistry.verified, true);
});

test('Construction identity rejects a changed placement ID', () => {
  const fixture = createFullIntegrationFixture();
  const targetSet = structuredClone(fixture.construction.targetSet);
  targetSet.targets[0].id = 'different';
  targetSet.targets[0].targetId = 'different';
  targetSet.targets[0].placementId = 'different';
  assert.throws(() => validatePlacementIdentityCompatibility({
    frozenPlan: fixture.construction.frozenPlan,
    normalisedBuild: fixture.construction.normalisedBuild,
    targetSet,
    partRegistry: fixture.construction.registry
  }), (error) => error instanceof TrainIntegrationError && error.code === 'PLACEMENT_IDENTITY_MISMATCH');
});

test('Construction identity rejects a stale PartRegistry', () => {
  const fixture = createFullIntegrationFixture();
  const registry = createPartRegistryFixture(fixture.plan, { hash: 'wrong' });
  assert.throws(() => validatePlacementIdentityCompatibility({
    frozenPlan: fixture.construction.frozenPlan,
    normalisedBuild: fixture.construction.normalisedBuild,
    targetSet: fixture.construction.targetSet,
    partRegistry: registry
  }), (error) => error instanceof TrainIntegrationError && error.code === 'STALE_PART_REGISTRY');
});

for (const testCase of [
  { name: 'yaw 0 degrees', transform: createIntegrationTransform({ yawDeg: 0 }) },
  { name: 'yaw 90 degrees', transform: createIntegrationTransform({ yawDeg: 90 }) },
  { name: 'translated route', transform: createIntegrationTransform({ yawDeg: 27, xMm: 840, yMm: -320 }) },
  { name: 'elevated route', transform: createIntegrationTransform({ yawDeg: -34, zMm: 275 }) }
]) {
  test(`Challenge route adapter supports ${testCase.name}`, () => {
    const plan = createIntegrationPlan();
    const construction = createConstructionFixture(plan, testCase.transform);
    const challenge = createChallengeServiceFixture({ plan, transform: testCase.transform });
    const contract = createTrainRouteFrameFromChallenge(challenge.service, { frozenPlan: construction.frozenPlan });
    const expected = createRouteFrame({ frozenBuildPlan: plan, worldTransform: testCase.transform });
    assert.equal(contract.validation.ok, true);
    assert.ok(Math.abs(contract.trainRouteFrame.forward.x - expected.forward.x) < 1e-9);
    assert.ok(Math.abs(contract.trainRouteFrame.forward.y - expected.forward.y) < 1e-9);
    assert.ok(Math.abs(contract.trainRouteFrame.originMm.zMm - expected.originMm.zMm) < 1e-9);
  });
}

test('Challenge route adapter supports the production getTrackRoute name', () => {
  const fixture = createFullIntegrationFixture({ challengeOptions: { routeMethod: 'getTrackRoute' } });
  const contract = createTrainRouteFrameFromChallenge(fixture.challenge.service, { frozenPlan: fixture.construction.frozenPlan });
  assert.equal(contract.sources.route, 'getTrackRoute');
});

test('Challenge route adapter supports getTrainRoute without a world-axis assumption', () => {
  const transform = createIntegrationTransform({ yawDeg: 90, xMm: -240, yMm: 700 });
  const fixture = createFullIntegrationFixture({ transform, challengeOptions: { routeMethod: 'getTrainRoute' } });
  const contract = createTrainRouteFrameFromChallenge(fixture.challenge.service, { frozenPlan: fixture.construction.frozenPlan });
  assert.equal(contract.sources.route, 'getTrainRoute');
  assert.ok(Math.abs(contract.trainRouteFrame.forward.x) < 1e-9);
  assert.ok(Math.abs(contract.trainRouteFrame.forward.y - 1) < 1e-9);
});

test('Challenge route adapter derives the transform when ChallengeService omits it', () => {
  const transform = createIntegrationTransform({ yawDeg: 63, xMm: 510, yMm: 220, zMm: 80, scale: 1.25 });
  const fixture = createFullIntegrationFixture({ transform, challengeOptions: { includeBridgeTransform: false } });
  const contract = createTrainRouteFrameFromChallenge(fixture.challenge.service, { frozenPlan: fixture.construction.frozenPlan });
  assert.equal(contract.transformSource, 'derived-from-challenge-route');
  assert.equal(contract.validation.ok, true);
  assert.ok(Math.abs(contract.worldTransform.scale - 1.25) < 1e-9);
});

test('Challenge route adapter rejects an incoherent final transform', () => {
  const fixture = createFullIntegrationFixture({ challengeOptions: { routeOffset: { xMm: 8 } } });
  assert.throws(() => createTrainRouteFrameFromChallenge(fixture.challenge.service, {
    frozenPlan: fixture.construction.frozenPlan
  }), (error) => error instanceof TrainIntegrationError && error.code === 'TRAIN_ROUTE_TRANSFORM_MISMATCH');
});

test('BuildBoard adapter derives an immutable partial support map', () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 8 } });
  const evidence = createTrainTestEvidence({ challengeService: fixture.challenge.service, ...authorityInput(fixture) });
  assert.equal(evidence.supportContract.segmentCount, 8);
  assert.ok(evidence.supportContract.supportedCount < 8);
  assert.equal(evidence.supportContract.allSupported, false);
  assert.ok(Number.isInteger(evidence.supportContract.firstUnsupportedSegment));
  assert.ok(evidence.supportContract.firstUnsupportedProgress >= 0);
  assert.equal(evidence.supportContract.trackGraphicsCreateSupport, false);
  assert.equal(evidence.supportContract.missionStateCreatesSupport, false);
  assert.equal(Object.isFrozen(evidence.collisionSnapshot), true);
});

test('BuildBoard adapter derives complete support only from accepted structure', () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 16, includeTrack: false } });
  const evidence = createTrainTestEvidence({ challengeService: fixture.challenge.service, ...authorityInput(fixture) });
  assert.equal(evidence.supportContract.supportedCount, 8);
  assert.equal(evidence.supportContract.allSupported, true);
  assert.equal(evidence.supportContract.firstUnsupportedSegment, null);
});

test('BuildBoard adapter rejects a board from another frozen plan', () => {
  const fixture = createFullIntegrationFixture();
  const board = createBuildBoardFixture(fixture.plan, { blueprintId: 'wrong-plan' });
  assert.throws(() => createAuthoritativeBuildBoardSnapshot({
    ...authorityInput(fixture, { buildBoard: board })
  }), (error) => error instanceof TrainIntegrationError && error.code === 'STALE_BUILD_BOARD_PLAN');
});

test('BuildBoard adapter rejects a different design checksum', () => {
  const fixture = createFullIntegrationFixture();
  const board = createBuildBoardFixture(fixture.plan, { designChecksum: 'wrong-checksum' });
  assert.throws(() => createAuthoritativeBuildBoardSnapshot({
    ...authorityInput(fixture, { buildBoard: board })
  }), (error) => error instanceof TrainIntegrationError && error.code === 'STALE_BUILD_BOARD_CHECKSUM');
});

test('BuildBoard adapter rejects a stale incomplete target set', () => {
  const fixture = createFullIntegrationFixture();
  const board = createBuildBoardFixture(fixture.plan, { omitLastTarget: true });
  assert.throws(() => createAuthoritativeBuildBoardSnapshot({
    ...authorityInput(fixture, { buildBoard: board })
  }), (error) => error instanceof TrainIntegrationError && error.code === 'STALE_BUILD_BOARD_TARGETS');
});

test('Challenge route adapter rejects ENTRY that is stale relative to its route', () => {
  const fixture = createFullIntegrationFixture();
  const base = fixture.challenge.service;
  const challengeService = {
    ...base,
    getEntry() {
      const entry = base.getEntry();
      entry.position.x += 5;
      return entry;
    }
  };
  assert.throws(() => createTrainRouteFrameFromChallenge(challengeService, {
    frozenPlan: fixture.construction.frozenPlan
  }), (error) => error instanceof TrainIntegrationError && error.code === 'INVALID_CHALLENGE_ROUTE');
});

test('BuildBoard adapter rejects an accepted placement outside the frozen target set', () => {
  const fixture = createFullIntegrationFixture();
  const board = createBuildBoardFixture(fixture.plan, { addUnknownAccepted: true, includeExplicitAcceptedIds: true });
  assert.throws(() => createAuthoritativeBuildBoardSnapshot({
    ...authorityInput(fixture, { buildBoard: board })
  }), (error) => error instanceof TrainIntegrationError && error.code === 'BUILD_BOARD_ACCEPTED_STATE_CONFLICT');
});

test('Refresh replaces READY evidence with the new BuildBoard revision', () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 16, worldRevision: 4 } });
  const integration = createMainDemoTrainIntegration({ challengeService: fixture.challenge.service });
  integration.prepare(authorityInput(fixture));
  assert.equal(integration.getState().support.allSupported, true);
  const partialBoard = createBuildBoardFixture(fixture.plan, { supportedColumns: 8, worldRevision: 5 });
  const refreshed = integration.refresh(authorityInput(fixture, { buildBoard: partialBoard }));
  assert.equal(refreshed.state.buildBoard.worldRevision, 5);
  assert.equal(refreshed.state.support.allSupported, false);
  integration.dispose();
});

test('Collision evidence is deterministic for the same frozen authority state', () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 11 } });
  const first = createTrainTestEvidence({ challengeService: fixture.challenge.service, ...authorityInput(fixture) });
  const second = createTrainTestEvidence({ challengeService: fixture.challenge.service, ...authorityInput(fixture) });
  assert.equal(first.collisionSnapshot.checksum, second.collisionSnapshot.checksum);
  assert.equal(first.supportMap.checksum, second.supportMap.checksum);
  assert.equal(first.identity.evidenceChecksum, second.identity.evidenceChecksum);
});

test('Curated terrain adapter samples ChallengeService machine proxies', () => {
  const plan = createIntegrationPlan();
  const transform = createIntegrationTransform({ yawDeg: 0, zMm: 50 });
  const frame = createRouteFrame({ frozenBuildPlan: plan, worldTransform: transform });
  const boxes = [{
    id: 'curated-bank',
    min: { x: frame.originMm.xMm - 5, y: frame.originMm.yMm - 5, z: frame.trackTopMachineZMm - 40 },
    max: { x: frame.originMm.xMm + 30, y: frame.originMm.yMm + 5, z: frame.trackTopMachineZMm - 10 },
    tags: ['terrain', 'bank']
  }];
  const challenge = createChallengeServiceFixture({ plan, transform, collisionBoxes: boxes });
  const surface = createChallengeTerrainSurfaceAdapter({ challengeService: challenge.service, routeFrame: frame });
  const bank = surface.sample({ forwardMm: 10, rightMm: 0 });
  const ravine = surface.sample({ forwardMm: 150, rightMm: 0 });
  assert.equal(bank.kind, 'curated-terrain-proxy');
  assert.equal(bank.sourceId, 'curated-bank');
  assert.equal(bank.heightMm, -10);
  assert.equal(ravine.kind, 'challenge-support-floor');
  assert.equal(surface.getDiagnostics().proceduralTerrainUsed, false);
});

test('Mission test waits for MAIN_DEMO frame updates and returns CROSSED', async () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 16 } });
  const integration = createMainDemoTrainIntegration({ challengeService: fixture.challenge.service });
  const mission = createMissionTrainAdapter(integration);
  let settled = false;
  const pending = mission.test(authorityInput(fixture)).finally(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.ok([TRAIN_STATES.PUSHING, TRAIN_STATES.RUNNING_SUPPORTED].includes(mission.getState().state));
  driveToTerminal(integration);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.success, true);
  assert.equal(result.outcome, 'CROSSED');
  assert.equal(mission.getState().state, TRAIN_STATES.CROSSED);
  integration.dispose();
});

test('Mission test returns TRAIN_FELL with unsupported evidence', async () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 8 } });
  const integration = createMainDemoTrainIntegration({ challengeService: fixture.challenge.service });
  const mission = createMissionTrainAdapter(integration);
  const pending = mission.test(authorityInput(fixture));
  driveToTerminal(integration);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.success, false);
  assert.equal(result.outcome, 'TRAIN_FELL');
  assert.ok(Number.isInteger(result.firstUnsupportedSegment));
  assert.ok(result.firstUnsupportedProgress >= 0);
  integration.dispose();
});

test('Mission cancellation is bounded and stops active train physics', async () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 16 } });
  const integration = createMainDemoTrainIntegration({ challengeService: fixture.challenge.service });
  const mission = createMissionTrainAdapter(integration);
  const controller = new AbortController();
  const pending = mission.test(authorityInput(fixture, { signal: controller.signal }));
  controller.abort('test_cancelled');
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'STOPPED');
  assert.equal(result.error.code, 'TRAIN_TEST_CANCELLED');
  assert.equal(mission.getState().state, TRAIN_STATES.STOPPED);
  integration.dispose();
});

test('Mission reset wraps the accepted staged and instant reset paths', async () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 16 } });
  const integration = createMainDemoTrainIntegration({ challengeService: fixture.challenge.service });
  const mission = createMissionTrainAdapter(integration);
  const first = mission.test(authorityInput(fixture));
  driveToTerminal(integration);
  assert.equal((await first).outcome, 'CROSSED');
  const reset = mission.reset({ instant: true });
  assert.equal(reset.ok, true);
  assert.equal(reset.state, TRAIN_STATES.READY);
  assert.equal(integration.updateFrame(1).fixedSteps, 0);
  const second = mission.test();
  driveToTerminal(integration);
  assert.equal((await second).outcome, 'CROSSED');
  integration.dispose();
});

test('External pusher mode waits for readiness and then crosses', async () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 16 } });
  let targetPose = null;
  const integration = createMainDemoTrainIntegration({
    challengeService: fixture.challenge.service,
    pusher: {
      mode: 'external',
      setTargetPose(pose) { targetPose = pose; },
      getPose() {
        return {
          frame: 'main-demo-machine-mm',
          positionMm: { xMm: 0, yMm: 0, zMm: 0 },
          rotationDeg: { xDeg: 0, yDeg: 0, zDeg: 0 }
        };
      }
    }
  });
  const pending = integration.test(authorityInput(fixture));
  assert.equal(integration.getState().state, TRAIN_STATES.POSITIONING_PUSHER);
  assert.ok(targetPose);
  for (let index = 0; index < 20; index += 1) integration.updateFrame(1 / 60);
  assert.equal(integration.getState().state, TRAIN_STATES.POSITIONING_PUSHER);
  integration.notifyPusherReady(targetPose);
  driveToTerminal(integration);
  const result = await pending;
  assert.equal(result.outcome, 'CROSSED');
  integration.dispose();
});

test('Mission adapter returns a bounded useful error envelope', async () => {
  const fixture = createFullIntegrationFixture();
  const board = createBuildBoardFixture(fixture.plan, { blueprintId: 'stale' });
  const integration = createMainDemoTrainIntegration({ challengeService: fixture.challenge.service });
  const mission = createMissionTrainAdapter(integration);
  const result = await mission.test(authorityInput(fixture, { buildBoard: board }));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'STALE_BUILD_BOARD_PLAN');
  assert.ok(JSON.stringify(result).length < 2000);
  integration.dispose();
});

test('Fixed 120 Hz explicit run seam reaches terminal without another page loop', async () => {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 16 } });
  const integration = createMainDemoTrainIntegration({ challengeService: fixture.challenge.service });
  const pending = integration.test(authorityInput(fixture));
  const snapshot = integration.runToTerminal(20);
  assert.equal(snapshot.performance.fixedDtSeconds, TRAIN_FIXED_DT_SECONDS);
  assert.equal(snapshot.performance.targetPhysicsHz, 120);
  assert.equal((await pending).outcome, 'CROSSED');
  integration.dispose();
});
