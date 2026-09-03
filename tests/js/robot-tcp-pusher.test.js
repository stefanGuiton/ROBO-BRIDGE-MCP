import test from 'node:test';
import assert from 'node:assert/strict';

import { createRobotTcpPusher } from '../../apps/web/src/train-integration/robot-tcp-pusher.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { V8_WORKSPACE } from '../../apps/web/src/workcell/v8-workcell-profile.js';
import { rotateVector } from '../../apps/web/src/train/math.js';

const pose = (positionMm = { xMm: 600, yMm: -80, zMm: 165 }, yaw = 0) => ({
  frame: 'main-demo-machine-mm', positionMm: { ...positionMm },
  rotationQuaternion: { x: Math.cos(yaw / 2), y: Math.sin(yaw / 2), z: 0, w: 0 }
});
const route = yaw => ({ forward: { x: Math.cos(yaw), y: Math.sin(yaw), z: 0 } });
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function harness(options = {}) {
  const clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock });
  const controller = new RobotController({ board, revisionClock: clock, bricks: [], timeScale: 0, workspace: V8_WORKSPACE,
    layout: { tableZMm: 0, tableBounds: { minX: -155, maxX: 1595, minY: -570, maxY: 630 }, tray: null, board: null, obstacles: [] } });
  let sampleTime = 0;
  const pusher = createRobotTcpPusher({ controller, nowSeconds: () => (sampleTime += 1 / 120), ...options });
  const input = (extra = {}) => ({ startPose: pose(), routeFrame: route(0), expectedWorldRevision: controller.worldRevision, pushDistanceMm: 40, speedMmS: 120, ...extra });
  return { controller, board, clock, pusher, input };
}

function idle(controller) {
  assert.equal(controller.operationState, 'idle');
  assert.equal(controller.moving, false);
  assert.equal(controller.pendingMoveCount, 0);
  assert.equal(controller.operationBlocked(), false);
}

test('TCP pusher reads exact live positions and fixed-down orientation without changing revisions', async t => {
  const h = harness();
  t.after(() => h.pusher.dispose());
  const before = h.controller.getState();
  const initial = h.pusher.getPose();
  assert.deepEqual(initial.positionMm, before.tcp);
  assert.deepEqual(rotateVector(initial.rotationQuaternion, { x: 0, y: 0, z: 1 }), { x: 0, y: 0, z: -1 });
  for (let index = 0; index < 5; index++) { h.pusher.getPose(); h.pusher.getSample(); h.pusher.getSnapshot(); }
  assert.deepEqual(h.controller.getState(), before);
  const samples = [];
  const stop = h.pusher.subscribe(sample => {
    assert.deepEqual(sample.positionMm, h.controller.getState().tcp);
    assert.equal(sample.worldRevision, h.controller.worldRevision);
    samples.push(sample);
  });
  await h.controller.moveTool({ xMm: 610, yMm: -50, zMm: 230, yawRad: 0.4, speedMmS: 120, expectedWorldRevision: h.controller.worldRevision });
  const current = h.pusher.getPose();
  const xAxis = rotateVector(current.rotationQuaternion, { x: 1, y: 0, z: 0 });
  near(xAxis.x, Math.cos(0.4)); near(xAxis.y, Math.sin(0.4)); near(xAxis.z, 0);
  assert.ok(samples.length > 2);
  for (let index = 1; index < samples.length; index++) {
    assert.ok(samples[index].sampleTimeSeconds > samples[index - 1].sampleTimeSeconds);
    assert.ok(samples[index].sequence > samples[index - 1].sequence);
  }
  const snapshot = h.pusher.getSample();
  snapshot.positionMm.xMm = -999;
  assert.deepEqual(h.pusher.getPose().positionMm, h.controller.getState().tcp);
  const reset = await h.controller.reset();
  assert.deepEqual(h.pusher.getPose().positionMm, reset.tcp);
  stop();
});

test('target, visibility and reset cannot teleport or force-ready the live TCP pusher', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const before = h.controller.getState();
  h.pusher.setTargetPose(pose());
  assert.equal(h.pusher.isAtTarget(), false);
  assert.equal(h.pusher.mode, 'tcp_contact');
  assert.equal(h.pusher.setPose, undefined);
  assert.equal(h.pusher.notifyReady, undefined);
  h.pusher.setVisible(false);
  h.pusher.reset(pose({ xMm: 400, yMm: 0, zMm: 160 }));
  assert.equal(h.pusher.getSnapshot().visible, false);
  assert.equal(h.pusher.getSnapshot().atTarget, false);
  assert.deepEqual(h.pusher.getPose().positionMm, before.tcp);
  assert.deepEqual(h.controller.getState(), before);
});

test('base-pose changes are reflected immediately without a display-mount offset', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const changed = h.controller.setBasePose({ xMm: 10, yMm: 0, zMm: 10, yawRad: 0.1, expectedWorldRevision: h.controller.worldRevision });
  assert.equal(changed.ok, true);
  assert.deepEqual(h.pusher.getPose().positionMm, h.controller.getState().tcp);
  const axis = rotateVector(h.pusher.getPose().rotationQuaternion, { x: 1, y: 0, z: 0 });
  near(axis.x, Math.cos(h.controller.toolYawRad)); near(axis.y, Math.sin(h.controller.toolYawRad));
});

test('bounded Cartesian run approaches, aligns, pushes, retracts and releases one trusted lease', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const requests = [], events = [];
  const move = h.controller.moveTool.bind(h.controller);
  h.controller.moveTool = request => {
    assert.equal(request.expectedWorldRevision, h.controller.worldRevision);
    assert.equal(request.signal.aborted, false);
    requests.push({ ...request });
    return move(request);
  };
  const stop = h.controller.subscribe(event => events.push(event.type));
  let witness, atStart = 0;
  const result = await h.pusher.run(h.input({
    onWitness(value) { witness = value; assert.equal(value.isValid({ requireComplete: false }), true); },
    async onAtStart({ pose: actual, signal }) {
      atStart++;
      near(actual.positionMm.xMm, 600, 0.1); near(actual.positionMm.yMm, -80, 0.1); near(actual.positionMm.zMm, 165, 0.1);
      assert.equal(signal.aborted, false);
      await assert.rejects(move({ xMm: 620, yMm: -80, zMm: 200, speedMmS: 120, expectedWorldRevision: h.controller.worldRevision }), error => error.code === 'operation_in_progress');
    }
  }));
  stop();
  assert.equal(result.ok, true); assert.equal(atStart, 1);
  assert.equal(requests.length, 6); assert.equal(result.movesCompleted, 6);
  assert.equal(events.filter(type => type === 'exclusive_operation_started').length, 1);
  assert.equal(events.filter(type => type === 'exclusive_operation_completed').length, 1);
  assert.ok(requests.every(request => request.operationToken === requests[0].operationToken));
  assert.equal(result.motionSampleCount, h.controller.worldRevision - result.startWorldRevision);
  assert.equal(result.witness, witness);
  assert.equal(witness.isValid({ sampledWorldRevision: result.startWorldRevision, finalWorldRevision: result.worldRevision }), true);
  assert.equal(h.pusher.isMotionWitnessValid(witness), true);
  assert.equal(h.pusher.isMotionWitnessValid({ isValid: () => true }), false);
  assert.equal(witness.isValid({ sampledWorldRevision: result.startWorldRevision + 1 }), false);
  near(h.controller.tcp.xMm, 620, 0.1); near(h.controller.tcp.yMm, -80, 0.1); near(h.controller.tcp.zMm, 245, 0.1);
  assert.equal(h.pusher.getSnapshot().motion.stage, 'complete');
  idle(h.controller);
  h.clock.bump();
  assert.equal(witness.isValid(), false, 'A later foreign revision cannot reuse completed motion evidence.');
});

test('route-aligned opposite yaw uses bounded intermediate Cartesian yaw steps', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const requests = [], move = h.controller.moveTool.bind(h.controller);
  h.controller.moveTool = request => { requests.push({ ...request }); return move(request); };
  const result = await h.pusher.run(h.input({ startPose: pose(undefined, Math.PI), routeFrame: route(Math.PI), pushDistanceMm: 20 }));
  assert.equal(result.ok, true);
  assert.equal(requests.length, 8);
  const axis = rotateVector(h.pusher.getPose().rotationQuaternion, { x: 1, y: 0, z: 0 });
  near(axis.x, -1); near(axis.y, 0);
  idle(h.controller);
});

test('stale, pre-aborted, invalid profile and unsupported waypoint inputs reject before any controller mutation', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const events = []; const stop = h.controller.subscribe(event => events.push(event.type));
  const before = h.controller.getState(), eventCount = events.length;
  const abort = new AbortController(); abort.abort();
  const cases = [
    [{ expectedWorldRevision: 99 }, 'STALE_WORLD_REVISION'],
    [{ signal: abort.signal }, 'CANCELLED'], [{ signal: {} }, 'INVALID_PARAMETER'],
    [{ pushDistanceMm: 0 }, 'INVALID_PARAMETER'], [{ pushDistanceMm: 1001 }, 'INVALID_PARAMETER'],
    [{ pushDistanceMm: 21, maxPushDistanceMm: 20 }, 'INVALID_PARAMETER'],
    [{ speedMmS: 651 }, 'INVALID_PARAMETER'], [{ approachClearanceMm: 301 }, 'INVALID_PARAMETER'],
    [{ startPose: pose({ xMm: NaN, yMm: 0, zMm: 100 }) }, 'INVALID_PUSH_POSE'],
    [{ startPose: { ...pose(), rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } } }, 'INVALID_PUSH_POSE'],
    [{ startPose: pose({ xMm: 255, yMm: 0, zMm: 100 }) }, 'INVALID_PUSH_POSE'],
    [{ routeFrame: { forward: { x: 2, y: 0, z: 0 } } }, 'INVALID_PUSH_POSE'],
    [{ routeFrame: { forward: { x: 0, y: 0, z: 1 } } }, 'INVALID_PUSH_POSE']
  ];
  for (const [extra, code] of cases) {
    await assert.rejects(h.pusher.run(h.input(extra)), error => error.code === code, code);
    assert.deepEqual(h.controller.getState(), before);
    assert.equal(events.length, eventCount);
    idle(h.controller);
  }
  stop();
});

test('the profile and signal configuration are captured before asynchronous run admission', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const input = h.input();
  const running = h.pusher.run(input);
  input.startPose.positionMm.xMm = -999;
  input.routeFrame.forward.x = -1;
  input.signal = {};
  input.pushDistanceMm = 1000;
  const result = await running;
  assert.equal(result.ok, true);
  near(h.controller.tcp.xMm, 620, 0.1);
  idle(h.controller);
});

test('a board revision change at start prevents the contact stroke and invalidates its witness', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  let witness;
  await assert.rejects(h.pusher.run(h.input({ onWitness: value => { witness = value; }, onAtStart: () => h.clock.bump() })), error => error.code === 'STALE_WORLD_REVISION');
  near(h.controller.tcp.xMm, 600, 0.1);
  assert.equal(witness.getSnapshot().movesCompleted, 3);
  assert.equal(witness.isValid(), false);
  idle(h.controller);
});

test('optional accepted-board fingerprint detects mutation even without a revision bump', async t => {
  let fingerprint = { accepted: ['one'] };
  const h = harness({ getBoardFingerprint: () => fingerprint }); t.after(() => h.pusher.dispose());
  let witness;
  await assert.rejects(h.pusher.run(h.input({ onWitness: value => { witness = value; }, onAtStart: () => { fingerprint = { accepted: ['two'] }; } })), error => error.code === 'STALE_WORLD_REVISION');
  assert.equal(witness.isValid(), false);
  near(h.controller.tcp.xMm, 600, 0.1);
  idle(h.controller);
});

test('unowned controller mutation during motion rejects the revision chain and stops further samples', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  h.controller.setBricks([{ id: 'loose', colour: 'red', position: { xMm: 450, yMm: 300, zMm: 15 }, yawRad: 0, heldBy: null, snapped: false }]);
  let witness, interfered = false;
  const stop = h.controller.subscribe(event => {
    if (event.type === 'motion_sample' && !interfered) {
      interfered = true;
      assert.equal(h.controller.moveLooseBrick('loose', { xMm: 450, yMm: 310, zMm: 15 }).ok, true);
    }
  });
  await assert.rejects(h.pusher.run(h.input({ onWitness: value => { witness = value; } })), error => error.code === 'STALE_WORLD_REVISION');
  stop();
  assert.equal(interfered, true); assert.equal(witness.isValid(), false);
  const before = h.controller.getState();
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(h.controller.getState(), before);
  idle(h.controller);
});

test('a silent world-clock gap between motion samples invalidates owned motion proof', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  let witness, interfered = false;
  const stop = h.controller.subscribe(event => { if (event.type === 'motion_sample' && !interfered) { interfered = true; h.clock.bump(); } });
  await assert.rejects(h.pusher.run(h.input({ onWitness: value => { witness = value; } })), error => error.code === 'STALE_WORLD_REVISION');
  stop(); assert.equal(witness.isValid(), false); idle(h.controller);
});

test('queued admission rechecks revisions before acquiring a lease', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const events = []; const stop = h.controller.subscribe(event => events.push(event.type));
  const before = h.controller.getState();
  const running = h.pusher.run(h.input());
  h.clock.bump();
  await assert.rejects(running, error => error.code === 'STALE_WORLD_REVISION');
  assert.deepEqual(h.controller.getState().tcp, before.tcp);
  assert.equal(events.includes('exclusive_operation_started'), false);
  stop(); idle(h.controller);
});

test('cancellation before admission never starts a robot move or lease', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const before = h.controller.getState();
  const running = h.pusher.run(h.input());
  const cancelled = h.pusher.cancel('before_admission');
  await assert.rejects(running, error => error.code === 'CANCELLED');
  assert.equal((await cancelled).ok, true);
  assert.deepEqual(h.controller.getState(), before);
  idle(h.controller);
});

test('active cancellation resolves only after the real controller has no pending motion', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  let cancelled = null, witness;
  const stop = h.controller.subscribe(event => {
    if (event.type === 'motion_sample' && !cancelled) cancelled = h.pusher.cancel('after_first_sample');
  });
  await assert.rejects(h.pusher.run(h.input({ onWitness: value => { witness = value; } })), error => error.code === 'CANCELLED');
  assert.equal((await cancelled).ok, true);
  stop(); idle(h.controller);
  const before = h.controller.getState();
  await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(h.controller.getState(), before);
  assert.equal(witness.isValid(), false);
  assert.equal(h.pusher.getSnapshot().motion.stage, 'cancelled');
});

test('external cancellation aborts a waiting callback without a late contact stroke', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const abort = new AbortController();
  let releaseCallback, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const running = h.pusher.run(h.input({ signal: abort.signal, onAtStart: () => {
    entered(); return new Promise(resolve => { releaseCallback = resolve; });
  } }));
  await started;
  abort.abort();
  await assert.rejects(running, error => error.code === 'CANCELLED');
  idle(h.controller);
  const before = h.controller.getState();
  releaseCallback(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(h.controller.getState(), before);
  near(before.tcp.xMm, 600, 0.1);
});

test('bounded timeout releases the lease when a start callback never resolves', async t => {
  const h = harness({ maximumRunTimeMs: 250 }); t.after(() => h.pusher.dispose());
  await assert.rejects(h.pusher.run(h.input({ onAtStart: () => new Promise(() => {}) })), error => error.code === 'PUSH_TIMEOUT');
  idle(h.controller);
  assert.equal(h.pusher.getSnapshot().motion.failureCode, 'PUSH_TIMEOUT');
});

test('explicit Train readiness rejection prevents the contact stroke', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  await assert.rejects(h.pusher.run(h.input({ onAtStart: () => ({ ok: false, reason: 'not_ready' }) })), error => error.code === 'PUSH_PRECONDITION_FAILED');
  near(h.controller.tcp.xMm, 600, 0.1);
  assert.equal(h.pusher.getSnapshot().motion.movesCompleted, 3);
  idle(h.controller);
});

test('dispose cancels an active run and removes only its own subscription', async () => {
  const h = harness();
  const existingCount = h.controller.listeners.size;
  const running = h.pusher.run(h.input());
  await assert.rejects(h.pusher.run(h.input()), error => error.code === 'ROBOT_BUSY');
  const disposing = h.pusher.dispose();
  await assert.rejects(running, error => error.code === 'CANCELLED');
  await disposing;
  idle(h.controller);
  assert.equal(h.controller.listeners.size, existingCount - 1);
  await assert.rejects(h.pusher.run(h.input()), error => error.code === 'PUSHER_DISPOSED');
});

test('real-controller collision failure preserves bounded diagnostics and does not leak pending motion', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  h.controller.layout = { ...h.controller.layout, obstacles: [{ id: 'push-route-blocker', position: { xMm: 620, yMm: -40, zMm: 200 }, bounds: { xMm: 180, yMm: 180, zMm: 200 } }] };
  await assert.rejects(h.pusher.run(h.input()), error => error.code === 'PUSH_MOTION_FAILED' && error.details.causeCode === 'collision');
  assert.match(h.pusher.getSnapshot().motion.obstacle, /push-route-blocker/);
  idle(h.controller);
});

test('queued controller validation decrements pending motion exactly once for invalid and stale requests', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const before = h.controller.getState();
  await assert.rejects(h.controller.moveTool({ xMm: NaN, yMm: 0, zMm: 200, speedMmS: 120, expectedWorldRevision: 0 }), error => error.code === 'invalid_input');
  idle(h.controller);
  const moving = h.controller.moveTool({ xMm: 620, yMm: -50, zMm: 230, speedMmS: 120, expectedWorldRevision: h.controller.worldRevision });
  h.clock.bump();
  await assert.rejects(moving, error => error.code === 'stale_state');
  idle(h.controller);
  assert.deepEqual(h.controller.getState().tcp, before.tcp);
  assert.equal(h.controller.robotRevision, before.robotRevision);
  await h.controller.moveTool({ xMm: 620, yMm: -50, zMm: 230, speedMmS: 120, expectedWorldRevision: h.controller.worldRevision });
  idle(h.controller);
});

test('a revision race after pusher enqueue cannot leak the controller pending count', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const move = h.controller.moveTool.bind(h.controller);
  h.controller.moveTool = request => { const result = move(request); h.clock.bump(); return result; };
  await assert.rejects(h.pusher.run(h.input()), error => error.code === 'STALE_WORLD_REVISION');
  idle(h.controller);
  assert.equal(h.pusher.getSnapshot().motion.motionSampleCount, 0);
});

test('a late world mutation while releasing the lease cannot turn into a successful run', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  const stop = h.controller.subscribe(event => { if (event.type === 'exclusive_operation_completed') h.clock.bump(); });
  await assert.rejects(h.pusher.run(h.input()), error => error.code === 'STALE_WORLD_REVISION');
  stop(); idle(h.controller);
  assert.equal(h.pusher.getSnapshot().motion.valid, false);
});

test('external controller reset invalidates a running witness without a late pose overwrite', async t => {
  const h = harness(); t.after(() => h.pusher.dispose());
  let resetting = null, witness;
  const stop = h.controller.subscribe(event => {
    if (event.type === 'motion_sample' && !resetting) resetting = h.controller.reset();
  });
  await assert.rejects(h.pusher.run(h.input({ onWitness: value => { witness = value; } })), error => ['CANCELLED', 'STALE_WORLD_REVISION'].includes(error.code));
  const resetState = await resetting;
  stop(); idle(h.controller);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(h.controller.getState().tcp, resetState.tcp);
  assert.deepEqual(h.pusher.getPose().positionMm, resetState.tcp);
  assert.equal(witness.isValid(), false);
});

test('a failed sample clock aborts owned motion without throwing through the controller event loop', async t => {
  let time = 0;
  const h = harness({ nowSeconds: () => time }); t.after(() => h.pusher.dispose());
  const stop = h.controller.subscribe(event => { if (event.type === 'motion_started') time = NaN; });
  await assert.rejects(h.pusher.run(h.input()), error => error.code === 'INVALID_CLOCK');
  stop(); idle(h.controller);
  assert.equal(h.pusher.getSnapshot().motion.failureCode, 'INVALID_CLOCK');
});
