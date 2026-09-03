'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createMainDemoTrainIntegration } from '../../apps/web/src/train-integration/main-demo-train-integration.js';
import { createLevelGatedTrain } from '../../apps/web/src/train-integration/level-gated-train.js';
import { normalizeMissionErrorCode } from '../../apps/web/src/mission/errors.js';
import { createFullIntegrationFixture } from '../helpers/train-integration-fixtures.js';

// The real Train integration/service run here with a controllable pusher double.
// These lifecycle tests do not establish native WebMCP or visual acceptance.
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function authorityInput(fixture) {
  return {
    frozenPlan: fixture.construction.frozenPlan,
    buildBoard: fixture.board,
    normalisedBuild: fixture.construction.normalisedBuild,
    targetSet: fixture.construction.targetSet,
    partRegistry: fixture.construction.registry
  };
}

function controlledTcp({ initiallyAtStart = false, delayedCleanup = false, integrationOptions = {} } = {}) {
  const fixture = createFullIntegrationFixture({ boardOptions: { supportedColumns: 16 } });
  const motion = deferred();
  const cleanup = deferred();
  if (!delayedCleanup) cleanup.resolve();
  const calls = [];
  const witness = Object.freeze({ privateToken: Symbol('owned-motion') });
  const sampledWorldRevision = fixture.board.worldRevision;
  let worldRevision = sampledWorldRevision;
  let request = null, running = false, moving = false, complete = false, cancelled = false;
  let pose = { frame: 'main-demo-machine-mm', positionMm: { xMm: -1000, yMm: 0, zMm: 200 },
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } };
  let target = null, sequence = 0, clockSeconds = 0, sampleTimeSeconds = 0;
  const listeners = new Set();
  const advanceClock = seconds => {
    assert.ok(Number.isFinite(seconds) && seconds >= 0, 'Fixture time must be finite and monotonic.');
    clockSeconds += seconds;
  };
  // Pose endpoints and idle observations share this explicitly advanced clock.
  // Reads neither publish a source endpoint nor advance either timestamp.
  const getSample = () => ({ ...structuredClone(pose), sampleTimeSeconds,
    observedTimeSeconds: clockSeconds, moving, sequence, worldRevision, robotRevision: worldRevision });
  const moveTo = next => {
    advanceClock(1 / 120);
    pose = structuredClone(next); sampleTimeSeconds = clockSeconds; sequence += 1;
    for (const listener of listeners) listener(getSample());
  };
  const robotPusher = {
    mode: 'tcp_contact',
    getPose: () => structuredClone(pose),
    getSample,
    subscribe(listener) {
      listeners.add(listener);
      listener(getSample());
      return () => listeners.delete(listener);
    },
    getSnapshot: () => ({ mode: 'tcp_contact', running, pushing: running,
      pose: structuredClone(pose), visible: true, targetPose: structuredClone(target),
      motion: { stage: complete ? 'complete' : running ? 'approach' : 'idle' } }),
    setTargetPose(next) { target = structuredClone(next); if (initiallyAtStart) moveTo(next); },
    getTargetPose: () => structuredClone(target),
    reset(next) { target = structuredClone(next); if (initiallyAtStart) moveTo(next); return this.getPose(); },
    setVisible() {}, onPushStart() {}, onPushEnd() {},
    run(input) {
      calls.push('run'); request = input; running = true; moving = true;
      input.onWitness(witness);
      return motion.promise;
    },
    async cancel(reason) {
      calls.push(`cancel:${reason}`);
      await cleanup.promise;
      if (running) {
        running = false; moving = false; cancelled = true;
        motion.reject(Object.assign(new Error('Owned motion cancelled.'), { code: 'CANCELLED' }));
      }
      return { ok: true };
    },
    async dispose() { calls.push('dispose'); await this.cancel('disposed'); calls.push('disposed'); },
    isMotionWitnessValid(value, binding) {
      calls.push('validate');
      return value === witness && complete && !cancelled
        && binding.sampledWorldRevision === sampledWorldRevision
        && binding.finalWorldRevision === worldRevision && binding.requireComplete === true;
    }
  };
  const integration = createMainDemoTrainIntegration({
    challengeService: fixture.challenge.service,
    motionMode: 'tcp_contact', robotPusher, pusher: { adapter: robotPusher },
    ...integrationOptions
  });
  const input = { ...authorityInput(fixture), testId: 'test-owned-integration' };
  return {
    integration, robotPusher, fixture, input, calls,
    get request() { return request; },
    get running() { return running; },
    get binding() { return { testId: input.testId, sampledWorldRevision, finalWorldRevision: worldRevision }; },
    arrive() { moving = false; moveTo(request.startPose); return request.onAtStart(); },
    completeMotion() {
      complete = true; running = false; moving = false;
      worldRevision = sampledWorldRevision + 4;
      fixture.board.worldRevision = worldRevision;
      motion.resolve({ ok: true, worldRevision, witness });
    },
    advanceClock,
    releaseCleanup: cleanup.resolve,
    async dispose() { cleanup.resolve(); await integration.cancelMotion('test_cleanup'); await integration.dispose(); }
  };
}

test('TCP Train result waits for owned motion after Train reaches a terminal state', { timeout: 2000 }, async t => {
  const h = controlledTcp(); t.after(() => h.dispose());
  let settled = false;
  const pending = h.integration.test(h.input).finally(() => { settled = true; });
  const subsystem = h.integration.getSubsystem();
  subsystem.service.stopTest();
  await nextTurn();
  assert.equal(h.integration.getState().state, 'STOPPED');
  assert.equal(settled, false);
  assert.equal(h.integration.validateTestMotion(h.binding), false);
  assert.throws(() => h.integration.prepare(h.input), { code: 'TRAIN_TEST_ACTIVE' });
  assert.throws(() => h.integration.test(h.input), { code: 'TRAIN_TEST_ACTIVE' });
  assert.throws(() => h.integration.reset({ instant: true }), { code: 'TRAIN_TEST_ACTIVE' });
  h.completeMotion();
  const result = await pending;
  assert.equal(result.outcome, 'STOPPED');
  assert.equal(result.worldRevision, h.binding.finalWorldRevision);
  assert.equal(h.integration.validateTestMotion(h.binding), true);
  for (const field of ['testId', 'sampledWorldRevision', 'finalWorldRevision']) {
    assert.equal(h.integration.validateTestMotion({ ...h.binding,
      [field]: field === 'testId' ? 'test-stale' : h.binding[field] + 1 }), false);
  }
});

test('TCP cancellation waits for robot cleanup before allowing train reset', { timeout: 2000 }, async t => {
  const h = controlledTcp({ delayedCleanup: true }); t.after(() => h.dispose());
  let testSettled = false, cancelSettled = false;
  const pending = h.integration.test(h.input).finally(() => { testSettled = true; });
  const cancelled = h.integration.cancelMotion('user_cancel').finally(() => { cancelSettled = true; });
  await nextTurn();
  assert.equal(h.integration.getState().state, 'STOPPED');
  assert.equal(h.running, true);
  assert.equal(testSettled, false);
  assert.equal(cancelSettled, false);
  assert.throws(() => h.integration.reset({ instant: true }), { code: 'TRAIN_TEST_ACTIVE' });
  h.releaseCleanup();
  assert.equal((await pending).error.code, 'CANCELLED');
  assert.equal((await cancelled).ok, true);
  assert.equal(h.running, false);
  assert.equal(h.integration.reset({ instant: true }).state, 'READY');
  assert.equal(h.integration.validateTestMotion(h.binding), false);
});

test('a physical contact failure is a completed failed test, not a missing transport result', { timeout: 2000 }, async t => {
  let contactQueries = 0;
  const h = controlledTcp({ integrationOptions: {
    createSolidContactProvider: () => ({ queryBodyContacts() {
      contactQueries += 1;
      throw new Error('contact query failed');
    } })
  } });
  t.after(() => h.dispose());
  const pending = h.integration.test(h.input);
  assert.equal(h.arrive().ok, true);
  h.completeMotion();
  const stationarySample = h.robotPusher.getSample();
  assert.equal(stationarySample.moving, false);
  assert.equal(h.integration.updateFrame(1 / 60).fixedSteps, 0, 'Frame delta alone cannot advance TCP physics.');
  assert.deepEqual(h.robotPusher.getSample(), stationarySample, 'Polling leaves source time and observation time unchanged.');
  h.advanceClock(1 / 60);
  const observedSample = h.robotPusher.getSample();
  assert.equal(observedSample.sequence, stationarySample.sequence);
  assert.equal(observedSample.sampleTimeSeconds, stationarySample.sampleTimeSeconds);
  assert.equal(observedSample.observedTimeSeconds, stationarySample.observedTimeSeconds + 1 / 60);
  h.integration.updateFrame(1 / 60);
  const result = await pending;
  assert.ok(contactQueries > 0, 'The contact query must run rather than failing TCP sample validation.');
  assert.equal(result.ok, true);
  assert.equal(result.success, false);
  assert.equal(result.outcome, 'TRAIN_CONTACT_FAILED');
  assert.equal(result.state, 'FAILED');
  assert.equal(result.worldRevision, h.binding.finalWorldRevision);
});

test('post-stroke Train abort remains a recognized Mission cancellation', { timeout: 2000 }, async t => {
  const h = controlledTcp(); t.after(() => h.dispose());
  const abort = new AbortController();
  let settled = false;
  const pending = h.integration.test({ ...h.input, signal: abort.signal })
    .finally(() => { settled = true; });
  assert.equal(h.arrive().ok, true);
  h.completeMotion();
  await nextTurn();
  assert.equal(h.running, false);
  assert.equal(settled, false, 'Train terminal state is still required after the robot stroke.');
  abort.abort('cancel_after_robot_stroke');
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'STOPPED');
  assert.equal(normalizeMissionErrorCode(result.error.code), 'CANCELLED');
});

test('TCP disposal waits for cleanup, disables frame stepping and is idempotent while pending', { timeout: 2000 }, async t => {
  const h = controlledTcp({ delayedCleanup: true }); t.after(() => h.dispose());
  const pending = h.integration.test(h.input);
  let disposed = false;
  const first = h.integration.dispose();
  const second = h.integration.dispose();
  assert.equal(first, second);
  const completed = first.finally(() => { disposed = true; });
  await nextTurn();
  assert.equal(disposed, false);
  assert.notEqual(h.integration.getSubsystem(), null);
  assert.equal(h.integration.updateFrame(1).fixedSteps, 0);
  h.releaseCleanup();
  assert.equal((await pending).ok, false);
  assert.equal((await completed).disposed, true);
  assert.equal(h.integration.getSubsystem(), null);
  assert.equal(h.integration.getEvidence(), null);
});

test('an idle integration rejects new TEST admission as soon as asynchronous disposal begins', { timeout: 2000 }, async t => {
  const h = controlledTcp({ delayedCleanup: true }); t.after(() => h.dispose());
  h.integration.prepare(h.input);
  const disposing = h.integration.dispose();
  let admissionError = null, lateTest = null;
  try { lateTest = h.integration.test({ testId: 'test-after-dispose' }); }
  catch (error) { admissionError = error; }
  h.releaseCleanup();
  if (lateTest) await h.integration.cancelMotion('cleanup_illegal_admission');
  await lateTest;
  await disposing;
  assert.equal(admissionError?.code, 'TRAIN_INTEGRATION_DISPOSED');
  assert.equal(h.calls.includes('run'), false);
});

test('an already aligned TCP is armed once by the owned run, not before its approach', { timeout: 2000 }, async t => {
  const h = controlledTcp({ initiallyAtStart: true }); t.after(() => h.dispose());
  const pending = h.integration.test(h.input);
  const stateBeforeOwnedReadiness = h.integration.getState().state;
  const armed = h.arrive();
  await h.integration.cancelMotion('readiness_probe_complete');
  await pending;
  assert.notEqual(stateBeforeOwnedReadiness, 'PUSHING');
  assert.equal(armed.ok, true);
});

function gateFixture() {
  const cleanup = deferred();
  const calls = [];
  let created = 0;
  const gate = createLevelGatedTrain({
    createIntegration() {
      const id = ++created;
      calls.push(`create:${id}`);
      return {
        prepare: input => input,
        getState: () => ({ state: 'READY', configured: true }),
        updateFrame() {},
        async dispose() { calls.push(`dispose:${id}`); await cleanup.promise; calls.push(`disposed:${id}`); }
      };
    },
    subscribeFrame() { calls.push('subscribe'); return () => calls.push('unsubscribe'); }
  });
  gate.setEnabled(true); gate.prepare({});
  return { gate, calls, releaseCleanup: cleanup.resolve, get created() { return created; } };
}

test('repeated Level 3 clear calls all await the same in-flight teardown', { timeout: 2000 }, async t => {
  const h = gateFixture(); t.after(async () => { h.releaseCleanup(); await h.gate.dispose(); });
  let secondSettled = false;
  const first = Promise.resolve(h.gate.clear());
  const second = Promise.resolve(h.gate.clear()).finally(() => { secondSettled = true; });
  await nextTurn();
  const settledBeforeCleanup = secondSettled;
  h.releaseCleanup();
  await Promise.all([first, second]);
  assert.equal(settledBeforeCleanup, false);
  assert.equal(h.calls.filter(call => call.startsWith('dispose:')).length, 1);
});

test('Level 3 cancelMotion waits for an already detached integration teardown', { timeout: 2000 }, async t => {
  const h = gateFixture(); t.after(async () => { h.releaseCleanup(); await h.gate.dispose(); });
  const clearing = Promise.resolve(h.gate.clear());
  let cancelled = false;
  const cancellation = Promise.resolve(h.gate.cancelMotion('mission_reset'))
    .finally(() => { cancelled = true; });
  await nextTurn();
  const settledBeforeCleanup = cancelled;
  h.releaseCleanup();
  await Promise.all([clearing, cancellation]);
  assert.equal(settledBeforeCleanup, false);
});

test('Level 3 re-enable cannot create a second integration before prior teardown finishes', { timeout: 2000 }, async t => {
  const h = gateFixture(); t.after(async () => { h.releaseCleanup(); await h.gate.dispose(); });
  const stopping = Promise.resolve(h.gate.setEnabled(false));
  const enabling = Promise.resolve(h.gate.setEnabled(true));
  try { h.gate.prepare({}); } catch {}
  const createdBeforeCleanup = h.created;
  h.releaseCleanup();
  await Promise.all([stopping, enabling]);
  h.gate.prepare({});
  assert.equal(createdBeforeCleanup, 1);
  assert.equal(h.created, 2);
});
