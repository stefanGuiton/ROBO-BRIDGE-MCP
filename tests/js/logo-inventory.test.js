import test from 'node:test';
import assert from 'node:assert/strict';
import { compileImageData } from '../../apps/web/src/logo/compiler.js';
import { makePattern } from '../../apps/web/src/logo/patterns.js';
import { createInventory, countRequiredByColour, inventoryHasNoOverlap } from '../../apps/web/src/bricks/inventory.js';

const blueprint = compileImageData(makePattern('six', 96), { brickBudget: 48, seed: 55 }).blueprint;
const options = { seed: 55, trayOrigin: { xMm: 100, yMm: 100, zMm: 4.8 } };

test('generic inventory requires an explicit caller coordinate origin', () => {
  assert.throws(() => createInventory(blueprint, { seed: 55 }), /tray_origin_required/);
});

test('inventory has exact required colour counts and no overlap', () => {
  const inventory = createInventory(blueprint, options);
  const counts = {};
  for (const item of inventory.items) counts[item.colour] = (counts[item.colour] ?? 0) + 1;
  assert.deepEqual(counts, countRequiredByColour(blueprint));
  assert.equal(inventory.items.length, blueprint.brickCount);
  assert.equal(inventoryHasNoOverlap(inventory.items), true);
  assert.equal(inventory.coordinateFrame, 'caller-supplied-mm');
});

test('same seed reproduces exact inventory and different seed changes jitter', () => {
  const a = createInventory(blueprint, options);
  const b = createInventory(blueprint, options);
  const c = createInventory(blueprint, { ...options, seed: 56 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.items.map((item) => item.spawnPose), c.items.map((item) => item.spawnPose));
});
