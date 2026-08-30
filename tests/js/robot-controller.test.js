import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveHarness } from '../helpers/live-harness.js';
import { BRICK_SPEC } from '../../apps/web/src/bricks/brick-spec.js';
import { distance3 } from '../../apps/web/src/robot/math.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Cartesian move reaches target and enforces actual peak speed/acceleration limits', async () => {
  const { controller } = createLiveHarness();
  const target = { xMm: 492, yMm: -263, zMm: 400 };
  const result = await controller.moveTool({ ...target, speedMmS: 500 });
  assert.equal(result.ok, true);
  assert.ok(distance3(controller.getState().tcp, target) < 0.1);
  assert.ok(result.diagnostics.peakTcpSpeedMmS <= 500 + 1e-9);
  assert.ok(result.diagnostics.accelerationMmS2 <= controller.accelerationLimitMmS2 + 1e-9);
  assert.ok(result.diagnostics.estimatedMaxJointSpeedRadS <= controller.jointSpeedLimitRadS + 1e-9);
  assert.ok(result.diagnostics.estimatedMaxJointAccelerationRadS2 <= controller.jointAccelerationLimitRadS2 + 1e-9);
});

test('invalid and over-speed requests preserve the accepted pose', async () => {
  const { controller } = createLiveHarness();
  const before = controller.getState();
  await assert.rejects(controller.moveTool({ xMm: NaN, yMm: 0, zMm: 300, speedMmS: 100 }), (error) => error.code === 'invalid_input');
  await assert.rejects(controller.moveTool({ xMm: 580, yMm: 0, zMm: 300, speedMmS: 651 }), (error) => error.code === 'speed_limit');
  assert.deepEqual(controller.getState().tcp, before.tcp);
  assert.equal(controller.getState().robotRevision, before.robotRevision);
});

test('low-height lateral motion fails closed like the calibrated reference demo', () => {
  const { controller } = createLiveHarness();
  controller.tcp = { xMm: 600, yMm: 0, zMm: 42.5 };
  const before = controller.getState();
  const plan = controller.planMove({ xMm: 610, yMm: 0, zMm: 42.5, speedMmS: 100 });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'low_height_lateral_move');
  assert.deepEqual(controller.getState().tcp, before.tcp);
});

test('reset cancels active motion and stale operation cannot overwrite reset pose', async () => {
  const { controller, makeBricks } = createLiveHarness({ timeScale: 0.25 });
  const moving = controller.moveTool({ xMm: 492, yMm: -263, zMm: 400, speedMmS: 80 });
  const caught = moving.catch((error) => error);
  await sleep(10);
  const resetState = await controller.reset({ bricks: makeBricks() });
  const error = await caught;
  assert.equal(error.code, 'cancelled');
  assert.equal(controller.getState().operationState, 'idle');
  assert.deepEqual(controller.getState().tcp, resetState.tcp);
});

test('latch and unlatch reject while motion is planning or moving', async () => {
  const { controller } = createLiveHarness({ timeScale: 0.2 });
  const moving = controller.moveTool({ xMm: 492, yMm: -263, zMm: 400, speedMmS: 100 });
  const earlyLatch = await controller.latch();
  assert.equal(earlyLatch.reason, 'operation_in_progress');
  const earlyUnlatch = await controller.unlatch();
  assert.equal(earlyUnlatch.reason, 'operation_in_progress');
  controller.activeAbortController?.abort();
  await assert.rejects(moving, (error) => error.code === 'cancelled');
});

test('queued move with stale expected revision is rejected at execution time', async () => {
  const { controller } = createLiveHarness();
  const revision = controller.getState().worldRevision;
  const first = controller.moveTool({ xMm: 492, yMm: -263, zMm: 400, speedMmS: 400, expectedWorldRevision: revision });
  const second = controller.moveTool({ xMm: 530, yMm: -263, zMm: 400, speedMmS: 400, expectedWorldRevision: revision });
  const secondResult = second.catch((error) => error);
  assert.equal((await first).ok, true);
  const error = await secondResult;
  assert.equal(error.code, 'stale_state');
});

test('human loose-brick interference is rechecked during motion', async () => {
  const { controller } = createLiveHarness({ timeScale: 0.15 });
  const bricks = controller.getBricks();
  const red = bricks.find((brick) => brick.colour === 'red');
  const blue = bricks.find((brick) => brick.colour === 'blue');
  const pickup = { xMm: red.position.xMm, yMm: red.position.yMm, zMm: red.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm };
  await controller.moveTool({ ...pickup, zMm: 400, speedMmS: 400 });
  await controller.moveTool({ ...pickup, speedMmS: 180 });
  assert.equal((await controller.latch({ actor: 'agent' })).ok, true);
  await controller.moveTool({ ...pickup, zMm: 400, speedMmS: 250 });
  let interfered = false;
  const unsubscribe = controller.subscribe((event) => {
    if (!interfered && event.type === 'motion_sample') {
      interfered = true;
      controller.moveLooseBrick(blue.id, { xMm: 600, yMm: 0, zMm: 450 });
    }
  });
  const move = controller.moveTool({ xMm: 600, yMm: 0, zMm: 450, speedMmS: 120 });
  await assert.rejects(move, (error) => error.code === 'collision');
  unsubscribe();
  assert.equal(interfered, true);
  assert.equal(controller.getState().moving, false);
});

test('reset invalidates active and already-queued pre-reset moves', async () => {
  const { controller, makeBricks } = createLiveHarness({ timeScale: 0.2 });
  const first = controller.moveTool({ xMm: 492, yMm: -263, zMm: 400, speedMmS: 80 }).catch((error) => error);
  const second = controller.moveTool({ xMm: 530, yMm: -263, zMm: 400, speedMmS: 80 }).catch((error) => error);
  await sleep(10);
  const reset = await controller.reset({ bricks: makeBricks() });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.code, 'cancelled');
  assert.equal(secondResult.code, 'cancelled');
  assert.deepEqual(controller.getState().tcp, reset.tcp);
  assert.equal(controller.pendingMoveCount, 0);
});
