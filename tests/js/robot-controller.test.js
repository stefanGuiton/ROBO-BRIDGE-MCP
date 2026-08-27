import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardAdapter } from '../../apps/web/src/bricks/board-adapter.js';
import { makeBrick } from '../../apps/web/src/bricks/brick-spec.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { CHALLENGE_LAYOUT } from '../../apps/web/src/robot/ur10-definition.js';
import { distance3 } from '../../apps/web/src/robot/math.js';

function fixture(options = {}) {
  const board = new BoardAdapter([{ id: 'target', colour: 'white', position: { xMm: 655, yMm: 220, zMm: 34.8 }, yawRad: 0 }]);
  const brick = makeBrick({ id: 'brick', colour: 'white', xMm: 520, yMm: -230, zMm: 34.8 });
  return { board, brick, robot: new RobotController({ board, bricks: [brick], timeScale: 0, ...options }) };
}

test('straight Cartesian move reaches requested TCP and increments revision', async () => {
  const { robot } = fixture();
  const before = robot.getState();
  const target = { xMm: 580, yMm: -90, zMm: 330 };
  const result = await robot.moveTool({ ...target, speedMmS: 500 });
  assert.equal(result.ok, true);
  assert.ok(distance3(robot.getState().tcp, target) < 0.1);
  assert.ok(robot.getState().robotRevision > before.robotRevision);
  assert.ok(robot.getState().worldRevision > before.worldRevision);
  assert.ok(result.diagnostics.samples > 2);
});

test('speed cap rejects without changing accepted pose', async () => {
  const { robot } = fixture();
  const before = robot.getState();
  await assert.rejects(
    robot.moveTool({ xMm: 580, yMm: 0, zMm: 300, speedMmS: 9999 }),
    (error) => error.code === 'speed_limit'
  );
  assert.deepEqual(robot.getState().tcp, before.tcp);
  assert.equal(robot.getState().robotRevision, before.robotRevision);
});

test('invalid target fails closed', async () => {
  const { robot } = fixture();
  const before = robot.getState();
  await assert.rejects(robot.moveTool({ xMm: NaN, yMm: 0, zMm: 250, speedMmS: 100 }), (error) => error.code === 'invalid_input');
  assert.deepEqual(robot.getState().tcp, before.tcp);
});

test('cancellation preserves last accepted safe pose', async () => {
  const { robot } = fixture({ timeScale: 0.25 });
  const target = { xMm: 500, yMm: -230, zMm: 255 };
  const aborter = new AbortController();
  const promise = robot.moveTool({ ...target, speedMmS: 120, signal: aborter.signal });
  setTimeout(() => aborter.abort(), 25);
  await assert.rejects(promise, (error) => error.code === 'cancelled');
  const state = robot.getState();
  assert.equal(state.moving, false);
  assert.ok(distance3(state.tcp, target) > 1);
});

test('held brick follows the accepted TCP during transfer', async () => {
  const { robot } = fixture();
  await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 500 });
  await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupTcp, speedMmS: 250 });
  assert.equal(robot.latch().success, true);
  await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 300 });
  const state = robot.getState();
  const brick = robot.getBricks()[0];
  near(brick.position.xMm, state.tcp.xMm, 1e-6);
  near(brick.position.yMm, state.tcp.yMm, 1e-6);
  near(brick.position.zMm, state.tcp.zMm - 6.6, 1e-6);
});

function near(a, b, tolerance) {
  assert.ok(Math.abs(a - b) <= tolerance, a + ' != ' + b);
}
