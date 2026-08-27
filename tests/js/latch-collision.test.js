import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardAdapter } from '../../apps/web/src/bricks/board-adapter.js';
import { makeBrick } from '../../apps/web/src/bricks/brick-spec.js';
import { findLatchCandidate } from '../../apps/web/src/bricks/latch.js';
import { validateCollision } from '../../apps/web/src/robot/collision.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { CHALLENGE_LAYOUT } from '../../apps/web/src/robot/ur10-definition.js';

function fixture() {
  const board = new BoardAdapter([{ id: 'target', colour: 'white', position: { xMm: 655, yMm: 220, zMm: 34.8 }, yawRad: 0 }]);
  const brick = makeBrick({ id: 'brick', colour: 'white', xMm: 520, yMm: -230, zMm: 34.8 });
  return { board, brick, robot: new RobotController({ board, bricks: [brick], timeScale: 0 }) };
}

test('clear collision check passes and table collision rejects', () => {
  assert.equal(validateCollision({ tcp: { xMm: 580, yMm: 0, zMm: 250 } }).ok, true);
  const hit = validateCollision({ tcp: { xMm: 580, yMm: 0, zMm: 1 } });
  assert.equal(hit.reason, 'collision');
  assert.equal(hit.obstacle, 'table');
});

test('placed brick collision rejects but valid target vertical approach passes', () => {
  const placed = makeBrick({ id: 'placed', colour: 'white', xMm: 590, yMm: 0, zMm: 34.8 });
  placed.snapped = true;
  assert.equal(validateCollision({ tcp: { xMm: 590, yMm: 0, zMm: 35 }, placedBricks: [placed] }).reason, 'collision');
  const targetPlaced = makeBrick({ id: 'target-brick', colour: 'white', xMm: 655, yMm: 220, zMm: 34.8 });
  targetPlaced.snapped = true;
  assert.equal(validateCollision({ tcp: { xMm: 655, yMm: 220, zMm: 130 }, placedBricks: [targetPlaced], approach: 'target' }).ok, true);
});

test('centred latch succeeds; offset and second latch fail', async () => {
  const { robot } = fixture();
  await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 500 });
  await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupTcp, speedMmS: 250 });
  assert.equal(robot.latch().success, true);
  assert.equal(robot.latch().reason, 'already_holding');

  const brick2 = makeBrick({ id: 'brick2', colour: 'white', xMm: 520, yMm: -230, zMm: 34.8 });
  const miss = findLatchCandidate({ xMm: 530, yMm: -230, zMm: 41.4 }, [brick2]);
  assert.equal(miss.reason, 'no_brick_in_capture');
});

test('unlatch while empty fails', () => {
  assert.equal(fixture().robot.unlatch().reason, 'not_holding');
});

test('release near target snaps and release far from target stays free', async () => {
  const near = fixture();
  await near.robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 500 });
  await near.robot.moveTool({ ...CHALLENGE_LAYOUT.pickupTcp, speedMmS: 250 });
  near.robot.latch();
  await near.robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 300 });
  await near.robot.moveTool({ ...CHALLENGE_LAYOUT.targetAboveTcp, speedMmS: 500 });
  await near.robot.moveTool({ ...CHALLENGE_LAYOUT.targetTcp, speedMmS: 250 });
  const snap = near.robot.unlatch();
  assert.equal(snap.snapped, true);
  assert.equal(snap.targetId, 'target');

  const far = fixture();
  await far.robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 500 });
  await far.robot.moveTool({ ...CHALLENGE_LAYOUT.pickupTcp, speedMmS: 250 });
  far.robot.latch();
  await far.robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 300 });
  await far.robot.moveTool({ xMm: 590, yMm: 0, zMm: 105, speedMmS: 400 });
  const released = far.robot.unlatch();
  assert.equal(released.snapped, false);
});

test('occupied target rejects a second snap', () => {
  const board = new BoardAdapter([{ id: 'target', colour: 'white', position: { xMm: 655, yMm: 220, zMm: 34.8 }, yawRad: 0, placedBrickId: 'first' }]);
  const result = board.trySnapBrick({ brickId: 'second', colour: 'white', position: { xMm: 655, yMm: 220, zMm: 34.8 }, yawRad: 0 });
  assert.equal(result.reason, 'target_occupied');
});
