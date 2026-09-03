import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleHarness, simplePlacements, SIMPLE_DEMO_SCENARIOS } from '../helpers/simple-demo-harness.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';

for (const shape of [...SIMPLE_DEMO_SCENARIOS, { prefix: 'grid-regression', width: 2, depth: 2, height: 6 }]) {
  test(`WebMCP ${shape.prefix}: real controller and shared board, preferred red and human blue adoption`, async () => {
    let humanDone = false, h;
    h = await simpleHarness({ wait: async () => {
      if (shape.prefix !== 'tower' || humanDone) return;
      const entry = h.coordinator.stream.entries[1];
      assert.equal(entry.status, 'PLANNED');
      assert.ok(entry, 'human target is still pending');
      const blue = h.controller.getBricks().find(b => b.colour === 'blue' && !b.heldBy && !b.placementType);
      const preview = h.authority.preview({ brickId: blue.id, position: entry.request.position, yawRad: entry.request.yawRad });
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
      assert.equal(result.completedPlacements, 9);
    }
  });
}

test('Jenga-style tower has two parallel bricks per layer, fixed 32mm square footprint and alternating yaw', async () => {
  const h = await simpleHarness();
  const placements = simplePlacements(SIMPLE_DEMO_SCENARIOS[2], await h.call('get_workspace', {}));
  assert.equal(placements.length, 10);
  let footprint;
  for (let layer = 0; layer < 5; layer++) {
    const pair = placements.slice(layer * 2, layer * 2 + 2);
    assert.deepEqual(pair.map(p => p.yawDeg), [layer % 2 * 90, layer % 2 * 90]);
    const halfX = layer % 2 ? 8 : 16, halfY = layer % 2 ? 16 : 8;
    const bounds = [Math.min(...pair.map(p => p.xMm - halfX)), Math.max(...pair.map(p => p.xMm + halfX)),
      Math.min(...pair.map(p => p.yMm - halfY)), Math.max(...pair.map(p => p.yMm + halfY))];
    assert.equal(bounds[1] - bounds[0], 32);
    assert.equal(bounds[3] - bounds[2], 32);
    if (footprint) assert.deepEqual(bounds, footprint);
    footprint = bounds;
    assert.ok(pair.every(p => Math.abs(p.zMm - placements[0].zMm - layer * 9.6) < 1e-8));
    if (layer) for (const p of pair) assert.deepEqual(p.dependsOnPlacementIds, placements.slice(layer * 2 - 2, layer * 2).map(b => b.placementId));
  }
});

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

test('picking up and previewing a blue source does not place or recolour it', async () => {
  const h = await simpleHarness();
  const adapter = new HumanBuildAdapter({ controller: h.controller, board: h.board, graph: h.graph, placementEngine: h.engine });
  const placements = simplePlacements(SIMPLE_DEMO_SCENARIOS[0], await h.call('get_workspace', {}));
  const planned = await h.call('plan_placement_queue', { streamId: 'pickup-only', mode: 'replace', finalChunk: true, placements, expectedWorldRevision: h.controller.worldRevision });
  assert.equal(planned.ok, true);
  const blue = h.controller.getBricks().find(b => b.colour === 'blue');
  assert.equal(adapter.pickup(blue.id).ok, true);
  const preview = h.authority.preview({ brickId: blue.id, position: { xMm: placements[0].xMm, yMm: placements[0].yMm, zMm: placements[0].zMm }, yawRad: 0 });
  assert.equal(preview.ok, true);
  assert.equal(adapter.setPreview({ ...preview.candidate, carriedBrickId: blue.id }), true);
  h.coordinator.reconcileLogicalEntries('human_preview_only');
  assert.equal(h.board.getPlacements().length, 0);
  assert.equal(h.coordinator.summary().satisfiedPlacements, 0);
  const held = h.controller.getBricks().find(b => b.id === blue.id);
  assert.equal(held.heldBy, 'human');
  assert.equal(held.colour, 'blue');
  assert.equal(adapter.cancel().ok, true);
});
