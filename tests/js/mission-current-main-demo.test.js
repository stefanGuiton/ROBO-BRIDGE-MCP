import test from 'node:test';
import assert from 'node:assert/strict';
import { constructionHarness } from '../helpers/construction-harness.js';
import { createBridgeDesignPackage } from '../../apps/web/src/bridge-design/create-bridge-design-package.js';
import { createEasyBridgeChallenge } from '../../apps/web/src/challenge/main-demo-easy.js';
import { createMainDemoTrainIntegration } from '../../apps/web/src/train-integration/index.js';
import {
  createMainDemoConstructionSession,
  createProductionMissionRuntime,
  EXPECTED_FULL_TOOL_COUNT
} from '../../apps/web/src/mission/index.js';

function trainChallenge(service) {
  return Object.freeze({
    getActiveChallenge: () => service.getState(),
    getEntry: () => service.getEntry(),
    getExit: () => service.getExit(),
    getTrainRoute: () => service.getTrackRoute(),
    getBridgeTransform: () => structuredClone(createEasyBridgeChallenge(service).worldTransform),
    getCollisionProxy: () => service.getCollisionProxy()
  });
}

async function driveMissionTest(mission, train, input) {
  const pending = mission.testBridge(input);
  for (let index = 0; index < 100; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
    if (!['READY', 'UNCONFIGURED'].includes(train.getState().state)) {
      train.runToTerminal();
      break;
    }
  }
  return pending;
}

function sessionInput(state) {
  return {
    expectedMissionId: state.missionId,
    expectedMissionRevision: state.revisions.missionRevision,
    expectedWorldRevision: state.revisions.worldRevision
  };
}

test('current MAIN_DEMO Mission uses semantic Train integration and one authoritative BuildBoard', async () => {
  const h = await constructionHarness();
  const bridgeDesignPackage = createBridgeDesignPackage({ host: h.host });
  const train = createMainDemoTrainIntegration({
    challengeService: trainChallenge(h.challenge),
    preconditions: {
      isRobotExecuting: () => h.controller.operationState !== 'idle' || h.controller.pendingMoveCount > 0,
      isRobotIdle: () => h.controller.operationState === 'idle' && h.controller.pendingMoveCount === 0 && !h.controller.operationBlocked(),
      isGripperHoldingPart: () => Boolean(h.controller.heldBrick())
    }
  });
  const runtime = { robot: h.controller, getWorldRevision: () => h.controller.worldRevision };
  const bundle = await createProductionMissionRuntime({
    bridgeHost: h.host,
    bridgeDesignPackage,
    challengeService: h.challenge,
    challengeMetadata: {
      EASY: { label: 'Curated EASY', bridgeChallengeId: createEasyBridgeChallenge(h.challenge).id }
    },
    constructionSession: createMainDemoConstructionSession(h.service, runtime.getWorldRevision),
    getAcceptedBuildBoardSnapshot: () => h.board,
    trainIntegration: train,
    robotController: h.controller,
    runtime,
    idFactory: (() => { let id = 0; return () => `mission-current-${++id}`; })()
  });
  assert.equal(bundle.expectedToolCount, EXPECTED_FULL_TOOL_COUNT);
  assert.equal(bundle.additionalTools.length, 13);
  assert.equal(new Set(bundle.fullToolNames).size, 27);

  let state = await bundle.service.getMissionState();
  assert.equal(state.phase, 'DESIGN');
  const started = await bundle.service.startBridgeBuild({
    ...sessionInput(state),
    expectedDesignRevision: h.host.designRevision
  });
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(started.phase, 'BUILD');
  assert.equal(started.requiredPartCount, h.host.buildPlan.billOfMaterials.totalPhysicalParts);
  const frozenPlanId = started.plan.planId;
  train.prepare({ preparedBuild: h.service.preparedBuild, buildBoard: h.board });

  state = await bundle.service.getMissionState();
  const failed = await driveMissionTest(bundle.service, train, sessionInput(state));
  assert.equal(failed.ok, true, JSON.stringify(failed));
  assert.equal(failed.outcome, 'TRAIN_FELL');
  assert.equal(failed.phase, 'BUILD');
  assert.equal(failed.testedPlan.planId, frozenPlanId);

  for (const target of h.board.getTargets()) {
    const accepted = h.board.trySnapBrick({
      brickId: `mission_authority_${target.id}`,
      colour: target.colour,
      position: target.position,
      yawRad: target.yawRad,
      actor: target.partClass === 'TRACK_SEGMENT' ? 'human' : 'agent',
      targetId: target.id
    });
    assert.equal(accepted.ok, true, `${target.id}: ${accepted.reason}`);
  }

  state = await bundle.service.getMissionState();
  const crossed = await driveMissionTest(bundle.service, train, sessionInput(state));
  assert.equal(crossed.ok, true, JSON.stringify(crossed));
  assert.equal(crossed.outcome, 'CROSSED');
  assert.equal(crossed.phase, 'COMPLETE');
  assert.equal(crossed.missionComplete, true);
  assert.equal(crossed.testedPlan.planId, frozenPlanId);

  state = await bundle.service.getMissionState();
  const previousMissionId = state.missionId;
  const reset = await bundle.service.resetMission({ ...sessionInput(state), confirm: true });
  assert.equal(reset.ok, true, JSON.stringify(reset));
  assert.equal(reset.phase, 'DESIGN');
  assert.notEqual(reset.missionId, previousMissionId);
  assert.equal(h.board.progress().total, 0);
  train.dispose();
});
