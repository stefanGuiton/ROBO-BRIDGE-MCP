import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveHarness } from '../helpers/live-harness.js';
import { distance3 } from '../../apps/web/src/robot/math.js';

const request = controller => ({ ...controller.getState().tcp,
  xMm: controller.getState().tcp.xMm + 24, speedMmS: 120,
  expectedWorldRevision: controller.worldRevision, timingMode: 'realtime' });

test('realtime contact samples retain physical profile intervals after a stalled observer', async t => {
  const { controller } = createLiveHarness({ timeScale: 1 / 3 });
  const input = request(controller), plan = controller.planMove(input);
  assert.equal(plan.ok, true);
  const initial = controller.getState(), samples = [];
  const stop = controller.subscribe(event => {
    if (event.type !== 'motion_sample') return;
    samples.push({ at: performance.now(), tcp: event.state.tcp, revision: event.worldRevision });
    if (samples.length === 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 220);
  });
  t.after(stop);
  const result = await controller.moveTool(input);
  assert.equal(samples.length, plan.points.length);
  for (let i = 1; i < samples.length; i++) {
    const measuredMs = samples[i].at - samples[i - 1].at;
    const profileMs = plan.points[i].targetElapsedMs - plan.points[i - 1].targetElapsedMs;
    assert.ok(measuredMs >= profileMs - 1, `sample ${i}: ${measuredMs} ms < ${profileMs} ms`);
    assert.ok(distance3(samples[i].tcp, samples[i - 1].tcp) / (measuredMs / 1000) < 121);
    assert.equal(samples[i].revision, samples[i - 1].revision + 1);
  }
  assert.equal(result.durationMs, plan.durationMs, 'the validated physical profile is not stretched or replaced');
  assert.equal(controller.getState().simulationPlaybackMultiplier, initial.simulationPlaybackMultiplier);
  assert.equal(controller.pendingMoveCount, 0);
  assert.equal(controller.operationState, 'idle');
});

test('realtime pacing rejects invalid mode and stale revision before changing accepted state', async () => {
  const { controller } = createLiveHarness();
  const before = controller.getState();
  for (const timingMode of ['instant', '', null, true]) {
    await assert.rejects(controller.moveTool({ ...request(controller), timingMode }), error => error.code === 'invalid_input');
    assert.deepEqual(controller.getState(), before);
    assert.equal(controller.pendingMoveCount, 0);
  }
  await assert.rejects(controller.moveTool({ ...request(controller), expectedWorldRevision: before.worldRevision + 1 }), error => error.code === 'stale_state');
  assert.deepEqual(controller.getState(), before);
});

test('realtime pacing cancellation interrupts a wait without another accepted sample', async t => {
  const { controller } = createLiveHarness({ timeScale: 1 / 40 });
  const abort = new AbortController();
  let samples = 0, abortAt = null, timer;
  const stop = controller.subscribe(event => {
    if (event.type !== 'motion_sample') return;
    samples += 1;
    if (samples === 1) timer = setTimeout(() => { abortAt = performance.now(); abort.abort(); }, 2);
  });
  t.after(() => { stop(); clearTimeout(timer); });
  await assert.rejects(controller.moveTool({ ...request(controller), signal: abort.signal }), error => error.code === 'cancelled');
  assert.equal(samples, 1);
  assert.ok(performance.now() - abortAt < 100, 'existing bounded cancellation remains responsive');
  assert.equal(controller.pendingMoveCount, 0);
  assert.equal(controller.operationState, 'idle');
  assert.equal(controller.getState().simulationPlaybackMultiplier, 40);
});

test('ordinary moves retain their existing zero-time fixture playback without realtime opt-in', async () => {
  const { controller } = createLiveHarness({ timeScale: 0 });
  const { timingMode, ...input } = request(controller);
  const profile = controller.planMove(input);
  const result = await controller.moveTool(input);
  assert.equal(result.ok, true);
  assert.equal(result.durationMs, profile.durationMs);
  assert.equal(controller.timeScale, 0);
});

test('realtime contact refuses nonzero yaw with a zero-duration existing profile', async () => {
  const { controller } = createLiveHarness({ timeScale: 1 / 3 });
  const before = controller.getState();
  const input = { ...before.tcp, yawRad: 0.2, speedMmS: 120,
    expectedWorldRevision: before.worldRevision, timingMode: 'realtime' };
  const plan = controller.planMove(input);
  assert.equal(plan.ok, true);
  assert.equal(plan.durationMs, 0, 'document the pre-existing pure-yaw planning limitation');
  await assert.rejects(controller.moveTool(input), error => error.code === 'invalid_motion_timing');
  assert.deepEqual(controller.getState().tcp, before.tcp);
  assert.equal(controller.getState().toolYawRad, before.toolYawRad);
  assert.equal(controller.worldRevision, before.worldRevision);
  assert.equal(controller.pendingMoveCount, 0);
  assert.equal(controller.operationState, 'idle');
  assert.equal(controller.getState().simulationPlaybackMultiplier, 3);
});
