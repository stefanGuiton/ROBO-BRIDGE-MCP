import test from 'node:test';
import assert from 'node:assert/strict';
import { compileImageData } from '../../apps/web/src/logo/compiler.js';
import { makePattern } from '../../apps/web/src/logo/patterns.js';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';

function setup() {
  const blueprint = compileImageData(makePattern('ring', 96), { brickBudget: 30 }).blueprint;
  return { blueprint, board: new BuildBoard(blueprint) };
}

test('nearest matching target snaps within tolerance and records actor', () => {
  const { blueprint, board } = setup();
  const target = blueprint.targets[0];
  const result = board.trySnapBrick({ brickId: 'b1', colour: target.colour, position: { xMm: target.worldXmm + 2, yMm: target.worldYmm - 1, zMm: target.worldZmm + 1 }, yawDeg: 0, actor: 'human' });
  assert.equal(result.ok, true);
  assert.equal(result.targetId, target.targetId);
  assert.deepEqual(board.getBuildState().contributions, { human: 1, agent: 0 });
});

test('outside tolerance and wrong colour fail without occupancy mutation', () => {
  const { blueprint, board } = setup();
  const target = blueprint.targets[0];
  const before = board.worldRevision;
  const far = board.trySnapBrick({ brickId: 'b1', colour: target.colour, position: { xMm: target.worldXmm + 100, yMm: target.worldYmm, zMm: target.worldZmm }, yawDeg: 0 });
  assert.equal(far.ok, false);
  assert.equal(board.worldRevision, before);
  const wrong = target.colour === 'red' ? 'blue' : 'red';
  const wrongResult = board.trySnapBrick({ brickId: 'b2', colour: wrong, position: { xMm: target.worldXmm, yMm: target.worldYmm, zMm: target.worldZmm }, yawDeg: 0 });
  assert.equal(wrongResult.reason, 'wrong_colour');
  assert.equal(board.getTarget(target.targetId).occupiedBy, null);
});

test('duplicate occupancy and duplicate brick are rejected', () => {
  const { blueprint, board } = setup();
  const [a, b] = blueprint.targets;
  assert.equal(board.trySnapBrick({ brickId: 'b1', colour: a.colour, position: { xMm: a.worldXmm, yMm: a.worldYmm, zMm: a.worldZmm }, yawDeg: 0 }).ok, true);
  assert.equal(board.trySnapBrick({ brickId: 'b1', colour: b.colour, position: { xMm: b.worldXmm, yMm: b.worldYmm, zMm: b.worldZmm }, yawDeg: 0 }).reason, 'brick_already_placed');
  assert.equal(board.trySnapBrick({ brickId: 'b2', colour: a.colour, position: { xMm: a.worldXmm, yMm: a.worldYmm, zMm: a.worldZmm }, yawDeg: 0 }).reason, 'target_occupied');
});

test('removal clears occupancy, actor contribution, and records correction', () => {
  const { blueprint, board } = setup();
  const target = blueprint.targets[0];
  board.trySnapBrick({ brickId: 'b1', colour: target.colour, position: { xMm: target.worldXmm, yMm: target.worldYmm, zMm: target.worldZmm }, yawDeg: 0, actor: 'human' });
  assert.equal(board.removeBrick('b1', 'human').ok, true);
  assert.equal(board.getTarget(target.targetId).occupiedBy, null);
  assert.equal(board.getBuildState().corrections, 1);
  assert.deepEqual(board.getBuildState().contributions, { human: 0, agent: 0 });
});
