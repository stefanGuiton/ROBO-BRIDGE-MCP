import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleHarness, simplePlacements } from '../helpers/simple-demo-harness.js';

for (const shape of [{ prefix: 'single', width: 1, depth: 1, height: 1 }, { prefix: 'wall', width: 3, depth: 1, height: 3 }, { prefix: 'tower', width: 2, depth: 2, height: 6 }]) {
  test(`WebMCP ${shape.prefix}: real controller and shared board, preferred red and human blue adoption`, async () => {
    let humanDone = false, h;
    h = await simpleHarness({ wait: async () => {
      if (shape.prefix !== 'tower' || humanDone) return;
      const entry = h.coordinator.stream.entries.find(e => e.status === 'PLANNED' && e.placementId.endsWith('z0.x1.y1'));
      assert.ok(entry, 'human target is still pending');
      const blue = h.controller.getBricks().find(b => b.colour === 'blue' && !b.heldBy && !b.placementType);
      const preview = h.authority.preview({ brickId: blue.id, position: entry.request.position, yawRad: 0 });
      assert.ok(preview.ok, preview.reason);
      assert.ok(h.controller.beginHumanCarry(blue.id).ok);
      const placed = h.controller.commitHumanPlacement({ brickId: blue.id, position: preview.candidate.position, yawRad: preview.candidate.yawRad });
      assert.ok(placed.ok, placed.reason);
      humanDone = true;
    } });
    const workspace = await h.call('get_workspace', {});
    const placements = simplePlacements(shape, workspace);
    const planned = await h.call('plan_placement_queue', { streamId: shape.prefix, mode: 'replace', finalChunk: true, cycleTimeMs: 2000, placements, expectedWorldRevision: h.controller.worldRevision });
    assert.ok(planned.ok, JSON.stringify(planned));
    assert.equal(h.coordinator.getState().queue[0].brick.colour, 'red');
    const result = await h.runner.run({ cycleTimeMs: 2000 });
    assert.ok(result.ok, JSON.stringify(result));
    const state = await h.call('get_placement_stream_status', { streamId: shape.prefix, limit: 50 });
    assert.equal(state.satisfiedPlacements, placements.length);
    assert.equal(new Set(state.entries.map(e => e.actualBrickId)).size, placements.length);
    assert.equal(h.board.getPlacements().length, placements.length);
    if (shape.prefix === 'tower') {
      assert.ok(humanDone);
      const adopted = state.entries.filter(e => e.status === 'ADOPTED');
      assert.equal(adopted.length, 1); assert.equal(adopted[0].actor, 'human');
      assert.equal(h.controller.getBricks().find(b => b.id === adopted[0].actualBrickId).colour, 'blue');
      assert.equal(result.completedPlacements, 23);
    }
  });
}

test('WebMCP cadence changes are revision guarded, capped and keep the same stream', async () => {
  const h = await simpleHarness();
  const call = args => h.control.tool.execute({ expectedWorldRevision: h.controller.worldRevision, ...args });
  assert.equal(h.control.getState().cycleTimeMs, 2000);
  assert.equal((await call({ action: 'set_speed', cycleTimeMs: Math.round(2000 / 1.5) })).cycleTimeMs, 1333);
  assert.equal((await call({ action: 'set_speed', cycleTimeMs: Math.round(1333 / 1.5) })).cycleTimeMs, 1000);
  assert.equal((await call({ action: 'set_speed', cycleTimeMs: 2000, expectedWorldRevision: -1 })).reason, 'stale_state');
  assert.equal(h.control.getState().cycleTimeMs, 1000);
  assert.equal((await call({ action: 'set_speed', cycleTimeMs: 10001 })).reason, 'invalid_input');
  assert.equal((await call({ action: 'start' })).reason, 'proposal_required');
  assert.equal((await call({ action: 'stop' })).running, false);
});

test('preferred colour falls back to blue without weakening a strict red request', async () => {
  const h = await simpleHarness();
  const reserved = new Set(h.controller.getBricks().filter(b => b.colour === 'red').map(b => b.id));
  const anchor = h.controller.getState().tcp;
  assert.equal(h.coordinator.selectSource({ preferredColour: 'red' }, reserved, anchor).colour, 'blue');
  assert.equal(h.coordinator.selectSource({ colour: 'red', preferredColour: 'red' }, reserved, anchor), null);
});
