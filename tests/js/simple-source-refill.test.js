import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleHarness } from '../helpers/simple-demo-harness.js';
import { createSimpleStructurePlan, toWebMcpPlacements } from '../../apps/web/src/robot/simple-structure-planner.js';
import { createSimpleSourceRefill, simpleRefillColours, readSimpleInventory } from '../../apps/web/src/workcell/simple-source-refill.js';

test('shared dispenser prioritizes remaining strict/preferred plan colours without changing sources', () => {
  const entries = Array.from({ length: 35 }, () => ({ status: 'PENDING', request: { colour: 'blue' } }));
  assert.deepEqual(simpleRefillColours(entries, { blue: 14, red: 14 }), Array(16).fill('blue'));
  assert.deepEqual(simpleRefillColours([{ status: 'ADOPTED', request: { colour: 'blue' } }, { status: 'PENDING', request: { preferredColour: 'yellow' } }], {}, 2), ['yellow', 'blue']);
});

test('two shared refills prioritize enough checked unique blue sources without accepting any target', async () => {
  const h = await simpleHarness();
  const plan = createSimpleStructurePlan({ structure: 'wall', width: 5, height: 7, colour: 'blue' }, { profile: h.profile });
  assert.equal(plan.ok, true);
  assert.equal((await h.call('plan_placement_queue', { placements: toWebMcpPlacements(plan), streamId: 'refill-wall', mode: 'replace', finalChunk: true, expectedWorldRevision: h.controller.worldRevision })).ok, true);
  const refill = createSimpleSourceRefill({ controller: h.controller, coordinator: h.coordinator, settings: h.engine.settings, profile: h.profile });
  const beforeFirst = h.controller.worldRevision;
  const first = refill({ actor: 'human' });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.ok(first.worldRevision > beforeFirst);
  const token = h.controller.beginExclusiveOperation('button-test').token;
  assert.equal(refill({ actor: 'agent' }).reason, 'operation_in_progress');
  const second = refill({ actor: 'agent', operationToken: token });
  h.controller.endExclusiveOperation(token);
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.ok(second.worldRevision > first.worldRevision);
  const sources = h.controller.getBricks();
  const sourcesById = new Map(sources.map(brick => [brick.id, brick]));
  const firstSources = first.spawnedIds.map(id => sourcesById.get(id));
  const secondSources = second.spawnedIds.map(id => sourcesById.get(id));
  const blueDeficitAfterFirst = 35 - first.inventoryAfter.availableByColour.blue;
  assert.ok(blueDeficitAfterFirst > 0, 'the second refill is required for the strict-blue plan');
  assert.ok(firstSources.every(brick => brick?.colour === 'blue'));
  assert.ok(secondSources.filter(brick => brick?.colour === 'blue').length >= blueDeficitAfterFirst);
  assert.equal(new Set([...first.spawnedIds, ...second.spawnedIds]).size, first.count + second.count);
  assert.equal(new Set(sources.map(b => b.id)).size, sources.length);
  assert.equal(h.board.getPlacements().length, 0);
  assert.ok(readSimpleInventory(h.controller).availableByColour.blue >= plan.blockCount);
  for (const brick of sources.filter(b => b.id.startsWith('simple-refill'))) {
    assert.ok(['red', 'blue'].includes(brick.colour));
    assert.equal(brick.position.zMm, h.profile.looseBrickCentreZMm);
    assert.equal(brick.reachability.reachable, true);
  }
  const before = h.controller.worldRevision;
  assert.equal(refill({ expectedWorldRevision: before - 1 }).reason, 'stale_state');
  assert.equal(h.controller.worldRevision, before);
});

test('35-blue wall completes through real controller and board with legitimate shared refills', async () => {
  const h = await simpleHarness();
  const plan = createSimpleStructurePlan({ structure: 'wall', width: 5, height: 7, depth: 1, colour: 'blue' }, { profile: h.profile });
  assert.equal(plan.blockCount, 35);
  assert.equal((await h.call('plan_placement_queue', { placements: toWebMcpPlacements(plan), streamId: 'blue-wall-35', mode: 'replace', finalChunk: true, expectedWorldRevision: h.controller.worldRevision })).ok, true);
  const refill = createSimpleSourceRefill({ controller: h.controller, coordinator: h.coordinator, settings: h.engine.settings, profile: h.profile });
  for (let batch = 0; batch < 5 && h.coordinator.summary().remainingPlacements; batch++) {
    assert.equal(refill().ok, true);
    assert.equal(refill().ok, true);
    const run = await h.runner.run({ cycleTimeMs: 2000, maximumPlacements: 35 });
    assert.ok(run.ok || run.reason === 'cycle_waiting', JSON.stringify(run));
  }
  assert.equal(h.coordinator.summary().satisfiedPlacements, 35, JSON.stringify(h.coordinator.summary()));
  const placed = h.board.getPlacements();
  assert.equal(placed.length, 35);
  assert.equal(new Set(placed.map(p => p.brickId)).size, 35);
  for (const p of placed) assert.equal(p.colour, 'blue');
  assert.equal(h.coordinator.stream.entries.filter(e => ['BLOCKED', 'WAITING_SOURCE', 'WAITING_DEPENDENCY'].includes(e.status)).length, 0);
});
