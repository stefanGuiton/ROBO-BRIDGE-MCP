import test from 'node:test';
import assert from 'node:assert/strict';
import { constructionHarness } from '../helpers/construction-harness.js';
import { createEasyBridgeChallenge } from '../../apps/web/src/challenge/main-demo-easy.js';
import { createMainDemoTrainIntegration } from '../../apps/web/src/train-integration/index.js';
import { partBounds } from '../../apps/web/src/bricks/part-spec.js';

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

function createTrain(harness) {
  return createMainDemoTrainIntegration({
    challengeService: trainChallenge(harness.challenge),
    preconditions: {
      isRobotExecuting: () => harness.controller.operationState !== 'idle' || harness.controller.pendingMoveCount > 0,
      isRobotIdle: () => harness.controller.operationState === 'idle' && harness.controller.pendingMoveCount === 0 && !harness.controller.operationBlocked(),
      isGripperHoldingPart: () => Boolean(harness.controller.heldBrick())
    }
  });
}

async function runTest(train) {
  const terminal = train.test();
  train.runToTerminal();
  return terminal;
}

for (const terrain7 of [false, true]) test(`current MAIN_DEMO road-plane route derives the exact live rail-top offset (terrain7=${terrain7})`, async () => {
  const harness = await constructionHarness({ terrain7 });
  harness.service.startBuild({ expectedWorldRevision: harness.controller.worldRevision });
  const train = createTrain(harness);
  const prepared = train.prepare({ preparedBuild: harness.service.preparedBuild, buildBoard: harness.board });
  assert.equal(prepared.evidence.routeContract.validation.ok, true);
  assert.equal(prepared.evidence.routeContract.validation.elevationReference, 'bridge_road');
  const track = harness.service.preparedBuild.normalisedBuild.placements.find(p => p.partClass === 'TRACK_SEGMENT');
  const expectedOffset = partBounds(track).max.zMm - harness.challenge.getEntry().position.z;
  assert.ok(Math.abs(prepared.evidence.routeContract.validation.roadToTrackOffsetMm - expectedOffset) < 1e-5);
  const result = await runTest(train);
  assert.equal(result.outcome, 'TRAIN_FELL');
  assert.equal(result.cause, 'SUPPORT_LOSS');
  assert.equal(train.reset({ instant: true }).state, 'READY');
  train.dispose();
});

test('current complete BuildBoard authority produces CROSSED and refresh disposes its prior subsystem', async () => {
  const harness = await constructionHarness();
  harness.service.startBuild({ expectedWorldRevision: harness.controller.worldRevision });
  for (const target of harness.board.getTargets()) {
    const accepted = harness.board.trySnapBrick({
      brickId: `authority_${target.id}`,
      colour: target.colour,
      position: target.position,
      yawRad: target.yawRad,
      actor: target.partClass === 'TRACK_SEGMENT' ? 'human' : 'agent',
      targetId: target.id
    });
    assert.equal(accepted.ok, true, `${target.id}: ${accepted.reason}`);
  }
  assert.equal(harness.board.isComplete(), true);
  const train = createTrain(harness);
  train.prepare({ preparedBuild: harness.service.preparedBuild, buildBoard: harness.board });
  const firstSubsystem = train.getSubsystem();
  const result = await runTest(train);
  assert.equal(result.outcome, 'CROSSED');
  assert.equal(result.success, true);
  assert.equal(result.planId, harness.service.preparedBuild.frozenPlan.planId);
  train.reset({ instant: true });
  train.refresh({ preparedBuild: harness.service.preparedBuild, buildBoard: harness.board });
  assert.notEqual(train.getSubsystem(), firstSubsystem);
  assert.equal(firstSubsystem.runtime.updateFrame(1 / 60).disposed, true);
  train.dispose();
});
