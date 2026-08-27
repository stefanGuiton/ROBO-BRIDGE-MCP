import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveHarness } from '../helpers/live-harness.js';


test('board claims, occupancy, contribution, and robot state share one revision clock', async () => {
  const { board, controller } = createLiveHarness();
  const target = board.getTargets()[0];
  const initial = controller.getState().worldRevision;
  const claimed = board.claimTarget(target.id, 'agent');
  assert.equal(claimed.ok, true);
  assert.ok(claimed.worldRevision > initial);
  const sameClaim = board.claimTarget(target.id, 'agent');
  assert.equal(sameClaim.reason, 'already_claimed');
  assert.equal(sameClaim.worldRevision, claimed.worldRevision);
  await controller.moveTool({ xMm: 492, yMm: -263, zMm: 400, speedMmS: 300 });
  assert.ok(controller.getState().worldRevision > claimed.worldRevision);
  assert.equal(board.worldRevision, controller.getState().worldRevision);
});

test('wrong-colour snap is rejected and does not create ghost occupancy', () => {
  const { board } = createLiveHarness();
  const target = board.getTargets()[0];
  const wrong = target.colour === 'red' ? 'blue' : 'red';
  const before = board.worldRevision;
  const result = board.trySnapBrick({ brickId: 'wrong', colour: wrong, position: target.position, yawRad: 0, actor: 'agent' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'wrong_colour');
  assert.equal(board.getTarget(target.id).occupiedBy, null);
  assert.equal(board.worldRevision, before);
});

test('physical placement records the real actor exactly once', () => {
  const { board } = createLiveHarness();
  const [a, b] = board.getTargets();
  assert.equal(board.trySnapBrick({ brickId: 'human-brick', colour: a.colour, position: a.position, yawRad: 0, actor: 'human' }).ok, true);
  assert.equal(board.trySnapBrick({ brickId: 'agent-brick', colour: b.colour, position: b.position, yawRad: 0, actor: 'agent' }).ok, true);
  const state = board.getBuildState();
  assert.deepEqual(state.contributions, { human: 1, agent: 1 });
});
