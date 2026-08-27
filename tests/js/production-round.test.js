import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveHarness, runToolOnlyRound } from '../helpers/live-harness.js';


test('a compiler-generated red/blue round completes through production primitive tool handlers only', async () => {
  const { handlers, board, controller } = createLiveHarness();
  const result = await runToolOnlyRound(handlers);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(board.isComplete(), true);
  assert.equal(result.results.length, 2);
  assert.deepEqual(board.getBuildState().contributions, { human: 0, agent: 2 });
  assert.equal(controller.getState().heldBrickId, null);
  assert.ok(controller.getBricks().every((brick) => brick.snapped));
});

test('stale target revision is rejected before a mutation', async () => {
  const { handlers, runtime } = createLiveHarness();
  const state = await handlers.getBuildState({ limit: 20 });
  const target = state.targets[0];
  runtime.human.moveLooseBrick(runtime.world.getSnapshotData().objects.find((object) => object.type === 'brick').id, { xMm: 500, yMm: -240, zMm: 34.8 });
  const claim = await handlers.claimTarget({ targetId: target.id, expectedWorldRevision: state.worldRevision });
  assert.equal(claim.ok, false);
  assert.equal(claim.reason, 'stale_state');
});
