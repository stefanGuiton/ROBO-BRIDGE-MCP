import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentDistance, segmentIntersectsAabb, validateCollision } from '../../apps/web/src/robot/collision.js';
import { createLiveHarness } from '../helpers/live-harness.js';

const box = { min: { xMm: -5, yMm: -5, zMm: -5 }, max: { xMm: 5, yMm: 5, zMm: 5 } };

test('capsule/AABB and segment distance helpers catch swept geometry', () => {
  assert.equal(segmentIntersectsAabb({ xMm: -20, yMm: 0, zMm: 0 }, { xMm: 20, yMm: 0, zMm: 0 }, box, 1), true);
  assert.equal(segmentIntersectsAabb({ xMm: -20, yMm: 20, zMm: 0 }, { xMm: 20, yMm: 20, zMm: 0 }, box, 1), false);
  assert.ok(segmentDistance({ xMm: 0, yMm: 0, zMm: 0 }, { xMm: 10, yMm: 0, zMm: 0 }, { xMm: 5, yMm: -10, zMm: 0 }, { xMm: 5, yMm: 10, zMm: 0 }) < 1e-8);
});

test('self collision rejects non-adjacent crossing links', () => {
  const points = [
    { xMm: 0, yMm: 0, zMm: 100 }, { xMm: 100, yMm: 0, zMm: 100 },
    { xMm: 100, yMm: 100, zMm: 100 }, { xMm: 0, yMm: -10, zMm: 100 },
    { xMm: 100, yMm: 10, zMm: 100 }
  ];
  const result = validateCollision({ tcp: { xMm: 600, yMm: 0, zMm: 400 }, jointPositions: points, bricks: [] });
  assert.equal(result.reason, 'collision');
  assert.match(result.obstacle, /^self:/);
});

test('free brick in the tool path is a collision obstacle', () => {
  const brick = { id: 'free', position: { xMm: 580, yMm: 0, zMm: 316 }, heldBy: null, snapped: false };
  const result = validateCollision({ tcp: { xMm: 580, yMm: 0, zMm: 300 }, bricks: [brick] });
  assert.equal(result.reason, 'collision');
  assert.equal(result.obstacle, 'brick:free');
});

test('occupied target blocks a second held brick before release', async () => {
  const { controller, board } = createLiveHarness();
  const firstTarget = board.getTargets()[0];
  const first = controller.getBricks().find((brick) => brick.colour === firstTarget.colour);
  first.position = { ...firstTarget.position };
  first.snapped = true;
  first.placedTargetId = firstTarget.id;
  board.trySnapBrick({ brickId: first.id, colour: first.colour, position: first.position, yawRad: 0, actor: 'human' });
  const held = { id: 'extra', colour: first.colour, position: { xMm: 600, yMm: 0, zMm: 200 }, yawRad: 0, heldBy: 'robot', placedTargetId: null, snapped: false, graspable: true };
  controller.bricks.push(held);
  controller.heldBrickId = held.id;
  const targetTcp = { xMm: firstTarget.position.xMm, yMm: firstTarget.position.yMm, zMm: firstTarget.position.zMm + 6.6 };
  await assert.rejects(controller.moveTool({ ...targetTcp, speedMmS: 180 }), (error) => error.code === 'collision');
});
