'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductionMissionRuntime,
  EXPECTED_FULL_TOOL_COUNT,
  LOW_LEVEL_TOOL_NAMES
} from '../../apps/web/src/mission/index.js';
import { createProductionHarness } from '../helpers/production-fakes.js';

async function makeBundle(h = createProductionHarness()) {
  const bundle = await createProductionMissionRuntime({
    bridgeHost: h.bridgeHost,
    bridgeDesignService: h.bridgeDesignService,
    bridgeTools: h.bridgeTools,
    challengeService: h.challengeService,
    challengePresets: h.challengePresets,
    selectChallenge: h.selectionHook,
    constructionSession: h.constructionSession,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot,
    trainService: h.trainService,
    robotController: h.robotController,
    runtime: h.runtime,
    idFactory: h.nextMissionId
  });
  return { h, bundle };
}

function mutationInput(state, extra = {}) {
  return {
    expectedMissionId: state.missionId,
    expectedMissionRevision: state.revisions.missionRevision,
    expectedWorldRevision: state.revisions.worldRevision,
    ...extra
  };
}

test('production package completes DESIGN -> BUILD, failed TEST -> BUILD, CROSSED -> COMPLETE, and reset -> new DESIGN', async () => {
  const { h, bundle } = await makeBundle();
  let state = await bundle.service.getMissionState();
  assert.equal(state.phase, 'DESIGN');

  let result = await bundle.service.startBridgeBuild(mutationInput(state, {
    expectedDesignRevision: state.bridge.designRevision
  }));
  assert.equal(result.ok, true);
  assert.equal(result.phase, 'BUILD');

  state = await bundle.service.getMissionState();
  h.setOutcome('TRAIN_FELL');
  result = await bundle.service.testBridge(mutationInput(state));
  assert.equal(result.ok, true);
  assert.equal(result.phase, 'BUILD');
  assert.equal(result.missionComplete, false);

  state = await bundle.service.getMissionState();
  result = await bundle.service.buildNextParts(mutationInput(state, { count: 3 }));
  assert.equal(result.ok, true);
  assert.equal(result.completed, 3);

  state = await bundle.service.getMissionState();
  h.setOutcome('CROSSED');
  result = await bundle.service.testBridge(mutationInput(state));
  assert.equal(result.ok, true);
  assert.equal(result.phase, 'COMPLETE');
  assert.equal(result.missionComplete, true);

  state = await bundle.service.getMissionState();
  const oldMissionId = state.missionId;
  result = await bundle.service.resetMission(mutationInput(state, { confirm: true }));
  assert.equal(result.ok, true);
  assert.equal(result.phase, 'DESIGN');
  assert.notEqual(result.missionId, oldMissionId);
  assert.equal(h.trainCalls.resetTrain, 2);
  assert.equal(h.constructionCalls.reset, 1);
});

test('a non-CROSSED outcome cannot complete the mission', async () => {
  const { h, bundle } = await makeBundle();
  let state = await bundle.service.getMissionState();
  await bundle.service.startBridgeBuild(mutationInput(state, { expectedDesignRevision: state.bridge.designRevision }));
  state = await bundle.service.getMissionState();
  await bundle.service.buildNextParts(mutationInput(state, { count: 3 }));
  state = await bundle.service.getMissionState();
  h.setOutcome('DERAILED');
  const result = await bundle.service.testBridge(mutationInput(state));
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'DERAILED');
  assert.equal(result.phase, 'BUILD');
  assert.equal(result.missionComplete, false);
});

test('production seams keep robot-busy and occupied-gripper gates', async () => {
  const busy = await makeBundle();
  busy.h.setRobotBusy(true);
  let state = await busy.bundle.service.getMissionState();
  let result = await busy.bundle.service.startBridgeBuild(mutationInput(state, { expectedDesignRevision: state.bridge.designRevision }));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ROBOT_BUSY');

  const held = await makeBundle();
  state = await held.bundle.service.getMissionState();
  await held.bundle.service.startBridgeBuild(mutationInput(state, { expectedDesignRevision: state.bridge.designRevision }));
  held.h.setHeldPart('held-part-1');
  state = await held.bundle.service.getMissionState();
  result = await held.bundle.service.testBridge(mutationInput(state));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'GRIPPER_NOT_EMPTY');
});

test('composition returns 14 + 5 + 8 tools and calls the existing registrar once', async () => {
  const { bundle } = await makeBundle();
  assert.equal(EXPECTED_FULL_TOOL_COUNT, 27);
  assert.equal(bundle.expectedToolCount, 27);
  assert.equal(bundle.additionalTools.length, 13);
  assert.equal(bundle.fullToolNames.length, 27);
  assert.equal(new Set(bundle.fullToolNames).size, 27);
  assert.deepEqual(bundle.fullToolNames.slice(0, 14), [...LOW_LEVEL_TOOL_NAMES]);

  let calls = 0;
  let supplied = null;
  const result = await bundle.registerWithExistingRegistrar((runtime, onLifecycle, additionalTools) => {
    calls += 1;
    supplied = additionalTools;
    return { ok: true, toolCount: 14 + additionalTools.length };
  });
  assert.equal(calls, 1);
  assert.equal(supplied, bundle.additionalTools);
  assert.equal(result.toolCount, 27);
});

test('duplicate bridge tool names fail before registration', async () => {
  const h = createProductionHarness();
  const duplicate = [...h.bridgeTools];
  duplicate[4] = { ...duplicate[4], name: duplicate[0].name };
  await assert.rejects(
    createProductionMissionRuntime({
      bridgeHost: h.bridgeHost,
      bridgeDesignService: h.bridgeDesignService,
      bridgeTools: duplicate,
      challengeService: h.challengeService,
      challengePresets: h.challengePresets,
      constructionSession: h.constructionSession,
      getAcceptedBuildBoardSnapshot: h.boardSnapshot,
      normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot,
      trainService: h.trainService,
      robotController: h.robotController,
      runtime: h.runtime
    }),
    (error) => error?.code === 'INVALID_PARAMETER'
  );
});
