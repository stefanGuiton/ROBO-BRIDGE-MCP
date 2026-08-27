import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardAdapter } from '../../apps/web/src/bricks/board-adapter.js';
import { makeBrick } from '../../apps/web/src/bricks/brick-spec.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { CHALLENGE_LAYOUT } from '../../apps/web/src/robot/ur10-definition.js';

test('hard-coded complete pick/place loop reaches exact snapped target', async () => {
  const board = new BoardAdapter([{ id: 'target', colour: 'white', position: { xMm: 655, yMm: 220, zMm: 34.8 }, yawRad: 0 }]);
  const robot = new RobotController({ board, bricks: [makeBrick({ id: 'brick', colour: 'white', xMm: 520, yMm: -230, zMm: 34.8 })], timeScale: 0 });
  await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 560 });
  await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupTcp, speedMmS: 260 });
  assert.equal(robot.latch().success, true);
  await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 300 });
  await robot.moveTool({ ...CHALLENGE_LAYOUT.targetAboveTcp, speedMmS: 560 });
  await robot.moveTool({ ...CHALLENGE_LAYOUT.targetTcp, speedMmS: 250 });
  const release = robot.unlatch();
  assert.equal(release.snapped, true);
  assert.deepEqual(robot.getBricks()[0].position, { xMm: 655, yMm: 220, zMm: 34.8 });
});
