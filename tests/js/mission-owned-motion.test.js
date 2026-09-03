'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createMissionHarness } from '../helpers/mission-fakes.js';
import { createMissionTrainAdapter } from '../../apps/web/src/train-integration/mission-train-adapter.js';

// These are contract tests with injected services, not native/browser or real
// RobotController acceptance. The controller-owned witness has its own tests.
const witnessFields = ['testId', 'sampledWorldRevision', 'finalWorldRevision'];

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function expectRejected(harness, result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  assert.equal(harness.service.phase, 'BUILD');
  assert.equal(harness.service.lastTest, null);
  assert.equal(harness.service.active, null);
}

async function completedMission(options = {}) {
  const harness = createMissionHarness({ trainOutcome: 'CROSSED', ...options });
  assert.equal((await harness.startBuild()).ok, true);
  harness.constructionService.acceptHuman(harness.service.frozen.requiredPlacementIds.length);
  return harness;
}

function installOwnedMotion(harness, { witnessPatch = () => ({}), resultPatch = result => result } = {}) {
  let witness = null;
  const validationInputs = [];
  const originalTest = harness.trainService.test;
  harness.trainService.test = async request => {
    const result = await originalTest(request);
    const sampledWorldRevision = request.testBinding.sampledWorldRevision;
    harness.setWorldRevision(sampledWorldRevision + 4);
    const binding = {
      testId: request.testBinding.testId,
      sampledWorldRevision,
      finalWorldRevision: harness.worldRevision
    };
    witness = Object.freeze({ ...binding, ...witnessPatch(binding) });
    return resultPatch({
      ...result,
      worldRevision: harness.worldRevision,
      robotMotion: {
        stage: 'complete', valid: true, movesCompleted: 4, motionSampleCount: 4,
        startWorldRevision: sampledWorldRevision, finalWorldRevision: harness.worldRevision
      }
    });
  };
  harness.trainService.validateTestMotion = input => {
    validationInputs.push(structuredClone(input));
    return witness !== null && witnessFields.every(field => input[field] === witness[field]);
  };
  return { validationInputs, get witness() { return witness; } };
}

function adapterIntegration(harness, overrides = {}) {
  return {
    getState: () => ({ state: 'READY', configured: true }),
    refresh() {},
    getEvidence: () => ({
      identity: {
        planId: harness.service.frozen.planId,
        designChecksum: harness.service.frozen.designChecksum,
        buildBoardWorldRevision: harness.worldRevision
      },
      buildBoardSnapshot: { acceptedPlacementIds: [...harness.constructionService.state.accepted] }
    }),
    test: async () => ({ ok: true, outcome: 'CROSSED', worldRevision: harness.worldRevision }),
    reset: () => ({ ok: true, state: 'READY' }),
    ...overrides
  };
}

test('Mission TEST accepts an advanced clock only with the exact trusted motion binding', async () => {
  const h = await completedMission();
  const sampledWorldRevision = h.worldRevision;
  const motion = installOwnedMotion(h);
  const frozen = structuredClone(h.service.frozen);
  const accepted = [...h.constructionService.state.accepted];
  const result = await h.service.testBridge(h.sessionInput());
  assert.equal(result.ok, true);
  assert.equal(result.phase, 'COMPLETE');
  assert.equal(result.missionComplete, true);
  assert.equal(result.revisions.worldRevision, sampledWorldRevision + 4);
  assert.deepEqual(motion.validationInputs, [{
    testId: result.testId, sampledWorldRevision, finalWorldRevision: h.worldRevision
  }]);
  assert.deepEqual(h.service.frozen, frozen);
  assert.deepEqual(h.constructionService.state.accepted, accepted);
});

test('forged raw robotMotion counters cannot authorize an advanced Mission clock', async () => {
  const h = await completedMission();
  installOwnedMotion(h);
  delete h.trainService.validateTestMotion;
  const result = await h.service.testBridge(h.sessionInput());
  expectRejected(h, result, 'STALE_WORLD_REVISION');
  assert.equal(h.trainService.state.calls.cancel, 1);
  assert.equal(h.trainService.state.calls.reset, 1);
});

for (const [name, value] of [
  ['false', false], ['undefined', undefined], ['number', 1],
  ['string', 'true'], ['object', { valid: true }], ['promise', Promise.resolve(true)]
]) {
  test(`Mission requires literal true when the motion validator returns ${name}`, async () => {
    const h = await completedMission();
    installOwnedMotion(h);
    h.trainService.validateTestMotion = () => value;
    expectRejected(h, await h.service.testBridge(h.sessionInput()), 'STALE_WORLD_REVISION');
  });
}

for (const field of witnessFields) {
  test(`a motion witness bound to the wrong ${field} is rejected`, async () => {
    const h = await completedMission();
    const motion = installOwnedMotion(h, {
      witnessPatch: binding => ({ [field]: field === 'testId' ? 'test-another-run' : binding[field] + 1 })
    });
    expectRejected(h, await h.service.testBridge(h.sessionInput()), 'STALE_WORLD_REVISION');
    assert.equal(motion.validationInputs.length, 1);
    assert.notEqual(motion.validationInputs[0][field], motion.witness[field]);
  });
}

test('trusted motion cannot bypass a train result from a different testId', async () => {
  const h = await completedMission();
  const motion = installOwnedMotion(h, {
    resultPatch: result => ({ ...result, identity: { ...result.identity, testId: 'test-another-run' } })
  });
  expectRejected(h, await h.service.testBridge(h.sessionInput()), 'STALE_TRAIN_RESULT');
  assert.deepEqual(motion.validationInputs, []);
});

for (const [name, revision, code] of [
  ['stale', result => result.worldRevision - 1, 'INVALID_TRAIN_RESULT'],
  ['future', result => result.worldRevision + 1, 'INVALID_TRAIN_RESULT'],
  ['string', result => String(result.worldRevision), 'INVALID_TRAIN_RESULT'],
  ['missing', () => undefined, 'INVALID_TRAIN_RESULT'],
  ['null', () => null, 'INVALID_TRAIN_RESULT']
]) {
  test(`trusted motion still rejects a ${name} raw final worldRevision`, async () => {
    const h = await completedMission();
    const motion = installOwnedMotion(h, {
      resultPatch: result => ({ ...result, worldRevision: revision(result) })
    });
    expectRejected(h, await h.service.testBridge(h.sessionInput()), code);
    assert.equal(motion.validationInputs.length, 1);
  });
}

test('a world revision change during trusted validation is still rejected', async () => {
  const h = await completedMission();
  installOwnedMotion(h);
  const validate = h.trainService.validateTestMotion;
  h.trainService.validateTestMotion = input => {
    const valid = validate(input);
    h.setWorldRevision(h.worldRevision + 1);
    return valid;
  };
  expectRejected(h, await h.service.testBridge(h.sessionInput()), 'STALE_WORLD_REVISION');
});

test('valid owned motion preserves a failed train outcome and leaves Mission in BUILD', async () => {
  const h = await completedMission({ trainOutcome: 'TRAIN_FELL' });
  const motion = installOwnedMotion(h);
  const result = await h.service.testBridge(h.sessionInput());
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'TRAIN_FELL');
  assert.equal(result.phase, 'BUILD');
  assert.equal(result.missionComplete, false);
  assert.equal(result.revisions.worldRevision, motion.witness.finalWorldRevision);
  assert.equal(result.firstUnsupportedSegment, 'rail-segment-2');
});

for (const [condition, changeRobot, code] of [
  ['busy robot', h => h.setRobotBusy(), 'ROBOT_BUSY'],
  ['held part', h => h.setHeldPart(), 'GRIPPER_NOT_EMPTY']
]) {
  test(`trusted motion cannot complete Mission with a ${condition}`, async () => {
    const h = await completedMission();
    installOwnedMotion(h, { resultPatch: result => { changeRobot(h); return result; } });
    expectRejected(h, await h.service.testBridge(h.sessionInput()), code);
  });
}

for (const outcome of ['CROSSED', 'TRAIN_FELL']) {
  test(`legacy ${outcome} tests keep working without a motion validator when the clock is unchanged`, async () => {
    const h = await completedMission({ trainOutcome: outcome });
    const before = h.worldRevision;
    assert.equal(h.trainService.validateTestMotion, undefined);
    const result = await h.service.testBridge(h.sessionInput());
    assert.equal(result.ok, true);
    assert.equal(result.outcome, outcome);
    assert.equal(result.phase, outcome === 'CROSSED' ? 'COMPLETE' : 'BUILD');
    assert.equal(result.revisions.worldRevision, before);
    assert.equal(h.worldRevision, before);
  });
}

test('unchanged-clock Mission tests never invoke an optional motion validator', async () => {
  const h = await completedMission();
  let calls = 0;
  h.trainService.validateTestMotion = () => { calls += 1; throw new Error('no owned motion'); };
  assert.equal((await h.service.testBridge(h.sessionInput())).ok, true);
  assert.equal(calls, 0);
});

test('Mission Train adapter forwards the exact witness query and accepts only literal true', () => {
  const input = Object.freeze({ testId: 'test-owned', sampledWorldRevision: 17, finalWorldRevision: 21 });
  let received = null;
  let validationResult = true;
  const integration = {
    getState: () => ({ state: 'READY', configured: true }),
    test: () => ({ ok: true }), reset: () => ({ ok: true }),
    validateTestMotion(value) { received = value; return validationResult; }
  };
  const adapter = createMissionTrainAdapter(integration);
  assert.equal(adapter.validateTestMotion(input), true);
  assert.equal(received, input);
  for (const value of [false, undefined, null, 1, 'true', { valid: true }, Promise.resolve(true)]) {
    validationResult = value;
    assert.equal(adapter.validateTestMotion(input), false);
  }
  delete integration.validateTestMotion;
  assert.equal(adapter.validateTestMotion(input), false);
});

test('the full Mission adapter seam preserves the final revision, testId and cancellation signal', async () => {
  const h = await completedMission();
  const sampledWorldRevision = h.worldRevision;
  const abort = new AbortController();
  let request = null;
  let witness = null;
  const queries = [];
  const integration = adapterIntegration(h, {
    async test(input) {
      request = input;
      h.setWorldRevision(sampledWorldRevision + 4);
      witness = { testId: input.testId, sampledWorldRevision, finalWorldRevision: h.worldRevision };
      return { ok: true, outcome: 'CROSSED', worldRevision: h.worldRevision, buildBoardWorldRevision: sampledWorldRevision };
    },
    validateTestMotion(input) {
      queries.push(structuredClone(input));
      return witnessFields.every(field => input[field] === witness[field]);
    }
  });
  Object.assign(h.trainService, createMissionTrainAdapter(integration));
  const result = await h.service.testBridge(h.sessionInput(), { signal: abort.signal });
  assert.equal(result.ok, true);
  assert.equal(result.revisions.worldRevision, sampledWorldRevision + 4);
  assert.equal(request.testId, result.testId);
  assert.equal(request.signal.aborted, false);
  assert.deepEqual(queries, [witness]);
  abort.abort('signal-forwarding-probe');
  assert.equal(request.signal.aborted, true);
  assert.equal(request.signal.reason, 'signal-forwarding-probe');
});

for (const method of ['cancel', 'reset']) {
  for (const configured of [true, false]) {
    test(`adapter ${method} waits for robot cleanup even when configured=${configured}`, { timeout: 2000 }, async () => {
      const cleanup = deferred();
      const calls = [];
      const adapter = createMissionTrainAdapter({
        test: async () => ({ ok: true }),
        getState: () => ({ state: 'READY', configured }),
        async cancelMotion(reason) { calls.push(['cleanup', reason]); await cleanup.promise; calls.push(['clean']); },
        reset(input) { calls.push(['reset', input]); return { ok: true, state: 'READY' }; }
      });
      let settled = false;
      const pending = Promise.resolve(adapter[method]({ reason: 'stop-owned-motion', identity: {} }))
        .finally(() => { settled = true; });
      try {
        await nextTurn();
        assert.equal(settled, false);
        assert.deepEqual(calls, [['cleanup', 'stop-owned-motion']]);
      } finally {
        cleanup.resolve();
      }
      const result = await pending;
      assert.equal(result.ok, true);
      assert.equal(result.state, configured ? 'READY' : 'UNCONFIGURED');
      assert.deepEqual(calls, [
        ['cleanup', 'stop-owned-motion'], ['clean'],
        ...(configured ? [['reset', { instant: true, reason: 'stop-owned-motion' }]] : [])
      ]);
    });
  }
}

test('adapter does not reset train state after robot cleanup rejects', async () => {
  let resets = 0;
  const adapter = createMissionTrainAdapter({
    test: async () => ({ ok: true }),
    getState: () => ({ state: 'READY', configured: true }),
    async cancelMotion() { throw Object.assign(new Error('cleanup failed'), { code: 'ROBOT_CLEANUP_FAILED' }); },
    reset() { resets += 1; return { ok: true }; }
  });
  for (const method of ['cancel', 'reset']) {
    const result = await adapter[method]();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'ROBOT_CLEANUP_FAILED');
  }
  assert.equal(resets, 0);
});

test('cancelled Mission TEST settles only after adapter robot cleanup and train reset', { timeout: 2000 }, async () => {
  const h = await completedMission();
  const started = deferred();
  const cleanupStarted = deferred();
  const cleanup = deferred();
  const abort = new AbortController();
  const calls = [];
  let receivedSignal = null;
  const integration = adapterIntegration(h, {
    test({ signal }) {
      receivedSignal = signal;
      h.setRobotBusy();
      started.resolve();
      return new Promise(resolve => {
        signal.addEventListener('abort', () => {
          calls.push('test-aborted');
          resolve({ ok: false, error: { code: 'CANCELLED', message: 'Test cancelled.' } });
        }, { once: true });
      });
    },
    async cancelMotion() {
      calls.push('cleanup-start');
      cleanupStarted.resolve();
      await cleanup.promise;
      h.setRobotBusy(false);
      calls.push('cleanup-done');
    },
    reset() {
      assert.equal(h.robot.moving, false);
      calls.push('train-reset');
      return { ok: true, state: 'READY' };
    }
  });
  Object.assign(h.trainService, createMissionTrainAdapter(integration));
  let settled = false;
  const pending = h.service.testBridge(h.sessionInput(), { signal: abort.signal })
    .finally(() => { settled = true; });
  try {
    await started.promise;
    abort.abort('cancel-owned-test');
    await cleanupStarted.promise;
    await nextTurn();
    assert.equal(receivedSignal.aborted, true);
    assert.equal(receivedSignal.reason, 'cancel-owned-test');
    assert.equal(settled, false);
    assert.equal(h.robot.moving, true);
    assert.equal(h.service.active.type, 'test');
    assert.deepEqual(calls, ['test-aborted', 'cleanup-start']);
  } finally {
    cleanup.resolve();
  }
  expectRejected(h, await pending, 'CANCELLED');
  assert.equal(h.robot.moving, false);
  assert.deepEqual(calls, [
    'test-aborted', 'cleanup-start', 'cleanup-done', 'train-reset',
    'cleanup-start', 'cleanup-done', 'train-reset'
  ]);
});
