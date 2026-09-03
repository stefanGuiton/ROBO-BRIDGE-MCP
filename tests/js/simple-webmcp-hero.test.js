import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FINAL_TOWER_REQUEST,
  FINAL_TOWER_SCENARIO,
  TEN_LAYER_TOWER_SCENARIO,
  simpleHarness,
  simplePlacements,
  SIMPLE_DEMO_SCENARIOS
} from '../helpers/simple-demo-harness.js';
import { selectHumanContributionGuide } from '../../apps/web/src/logo/simple-human-slot-guide.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';

async function adoptGuidedBlue(h, streamId) {
  const before = await h.call('get_placement_stream_status', { streamId, limit: 50 });
  const guide = selectHumanContributionGuide(before);
  assert.ok(guide, JSON.stringify(before));
  assert.equal(guide.status, 'PLANNED');
  assert.notEqual(guide.placementId, guide.robotNextPlacementId);
  assert.equal(before.activeQueue[1].placementId, guide.placementId);
  const blue = h.controller.getBricks().find(brick => brick.colour === 'blue' && !brick.heldBy && !brick.placementType);
  assert.ok(blue, 'a loose blue Human source is available');
  const preview = h.authority.preview({
    brickId: blue.id,
    position: guide.targetPosition,
    yawRad: guide.targetYawDeg * Math.PI / 180
  });
  assert.ok(preview.ok, preview.reason);
  const pickup = h.controller.beginHumanCarry(blue.id);
  assert.ok(pickup.ok, pickup.reason);
  assert.ok(pickup.worldRevision > before.worldRevision, 'Human pickup changes worldRevision');
  const placed = h.controller.commitHumanPlacement({
    brickId: blue.id,
    position: preview.candidate.position,
    yawRad: preview.candidate.yawRad
  });
  assert.ok(placed.ok, placed.reason);
  assert.ok(placed.worldRevision > pickup.worldRevision, 'Human placement changes worldRevision');
  const after = await h.call('get_placement_stream_status', { streamId, limit: 50 });
  const adopted = after.entries.find(entry => entry.placementId === guide.placementId);
  assert.equal(adopted.status, 'ADOPTED');
  assert.equal(adopted.actor, 'human');
  assert.equal(adopted.actualBrickId, blue.id);
  assert.equal(after.satisfiedPlacements, 1);
  assert.equal(after.activeQueue.some(entry => entry.placementId === guide.placementId), false, 'adopted slot is removed from robot work');
  return { guide, blue, placed, after };
}

for (const shape of [...SIMPLE_DEMO_SCENARIOS, { prefix: 'grid-regression', width: 2, depth: 2, height: 6 }]) {
  test(`WebMCP ${shape.prefix}: shared controller, board and generic placement stream complete`, async () => {
    const h = await simpleHarness();
    const workspace = await h.call('get_workspace', {});
    const placements = simplePlacements(shape, workspace);
    const planned = await h.call('plan_placement_queue', {
      streamId: shape.prefix,
      mode: 'replace',
      finalChunk: true,
      cycleTimeMs: 2000,
      placements,
      expectedWorldRevision: h.controller.worldRevision
    });
    assert.ok(planned.ok, JSON.stringify(planned));
    assert.equal(h.coordinator.getState().queue[0].brick.colour, 'red');
    const human = shape.prefix === 'tower' ? await adoptGuidedBlue(h, shape.prefix) : null;
    const result = await h.runner.run({ cycleTimeMs: 2000 });
    assert.ok(result.ok, JSON.stringify(result));
    const state = await h.call('get_placement_stream_status', { streamId: shape.prefix, limit: 50 });
    assert.equal(state.satisfiedPlacements, placements.length);
    assert.equal(new Set(state.entries.map(entry => entry.actualBrickId)).size, placements.length);
    assert.equal(h.board.getPlacements().length, placements.length);
    assert.equal(state.entries.some(entry => ['BLOCKED', 'WAITING_SOURCE', 'WAITING_DEPENDENCY', 'CANCELLED'].includes(entry.status)), false);
    const acceptedBricks = state.entries.map(entry => h.controller.getBricks().find(brick => brick.id === entry.actualBrickId));
    if (shape.prefix !== 'tower') assert.ok(acceptedBricks.every(brick => brick?.colour === 'red'));
    if (shape.prefix === 'tower') {
      assert.equal(placements.length, 12);
      const adopted = state.entries.filter(entry => entry.status === 'ADOPTED');
      assert.equal(adopted.length, 1);
      assert.equal(adopted[0].actor, 'human');
      assert.equal(adopted[0].actualBrickId, human.blue.id);
      assert.equal(h.controller.getBricks().find(brick => brick.id === adopted[0].actualBrickId).colour, 'blue');
      assert.equal(state.entries.filter(entry => entry.actualBrickId === human.blue.id).length, 1, 'Human brick satisfies only one target');
      assert.equal(result.completedPlacements, 11, 'robot places the other eleven targets');
      assert.deepEqual(state.counts, { ADOPTED: 1, COMPLETED: 11 });
      assert.ok(state.entries.slice(-2).every(entry => entry.status === 'COMPLETED'), 'dependencies continue through the final layer');
    }
  });
}

test('final recording request maps to six alternating layers and twelve ordinary placements', async () => {
  assert.equal(FINAL_TOWER_SCENARIO.request, 'Build a tower six layers tall using two red bricks per layer.');
  assert.equal(FINAL_TOWER_SCENARIO.request, FINAL_TOWER_REQUEST);
  const h = await simpleHarness();
  const placements = simplePlacements(FINAL_TOWER_SCENARIO, await h.call('get_workspace', {}));
  assert.equal(placements.length, 12);
  let footprint;
  for (let layer = 0; layer < 6; layer += 1) {
    const pair = placements.slice(layer * 2, layer * 2 + 2);
    assert.deepEqual(pair.map(placement => placement.yawDeg), [layer % 2 * 90, layer % 2 * 90]);
    const halfX = layer % 2 ? 8 : 16;
    const halfY = layer % 2 ? 16 : 8;
    const bounds = [
      Math.min(...pair.map(placement => placement.xMm - halfX)),
      Math.max(...pair.map(placement => placement.xMm + halfX)),
      Math.min(...pair.map(placement => placement.yMm - halfY)),
      Math.max(...pair.map(placement => placement.yMm + halfY))
    ];
    assert.equal(bounds[1] - bounds[0], 32);
    assert.equal(bounds[3] - bounds[2], 32);
    if (footprint) assert.deepEqual(bounds, footprint);
    footprint = bounds;
    assert.ok(pair.every(placement => Math.abs(placement.zMm - placements[0].zMm - layer * 9.6) < 1e-8));
    if (layer) {
      const lowerIds = placements.slice(layer * 2 - 2, layer * 2).map(placement => placement.placementId);
      for (const placement of pair) assert.deepEqual(placement.dependsOnPlacementIds, lowerIds);
    }
  }
});

test('generic planner preserves the ten-layer and twenty-placement tower capability', async () => {
  const h = await simpleHarness();
  const placements = simplePlacements(TEN_LAYER_TOWER_SCENARIO, await h.call('get_workspace', {}));
  assert.equal(placements.length, 20);
  for (let layer = 0; layer < 10; layer += 1) {
    const pair = placements.slice(layer * 2, layer * 2 + 2);
    assert.deepEqual(pair.map(placement => placement.yawDeg), [layer % 2 * 90, layer % 2 * 90]);
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
  const reserved = new Set(h.controller.getBricks().filter(brick => brick.colour === 'red').map(brick => brick.id));
  const anchor = h.controller.getState().tcp;
  assert.equal(h.coordinator.selectSource({ preferredColour: 'red' }, reserved, anchor).colour, 'blue');
  assert.equal(h.coordinator.selectSource({ colour: 'red', preferredColour: 'red' }, reserved, anchor), null);
});

test('picking up and previewing a blue source does not place or recolour it', async () => {
  const h = await simpleHarness();
  const adapter = new HumanBuildAdapter({ controller: h.controller, board: h.board, graph: h.graph, placementEngine: h.engine });
  const placements = simplePlacements(SIMPLE_DEMO_SCENARIOS[0], await h.call('get_workspace', {}));
  const planned = await h.call('plan_placement_queue', {
    streamId: 'pickup-only',
    mode: 'replace',
    finalChunk: true,
    placements,
    expectedWorldRevision: h.controller.worldRevision
  });
  assert.equal(planned.ok, true);
  const blue = h.controller.getBricks().find(brick => brick.colour === 'blue');
  assert.equal(adapter.pickup(blue.id).ok, true);
  const preview = h.authority.preview({
    brickId: blue.id,
    position: { xMm: placements[0].xMm, yMm: placements[0].yMm, zMm: placements[0].zMm },
    yawRad: 0
  });
  assert.equal(preview.ok, true);
  assert.equal(adapter.setPreview({ ...preview.candidate, carriedBrickId: blue.id }), true);
  h.coordinator.reconcileLogicalEntries('human_preview_only');
  assert.equal(h.board.getPlacements().length, 0);
  assert.equal(h.coordinator.summary().satisfiedPlacements, 0);
  const held = h.controller.getBricks().find(brick => brick.id === blue.id);
  assert.equal(held.heldBy, 'human');
  assert.equal(held.colour, 'blue');
  assert.equal(adapter.cancel().ok, true);
});
