import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileImageData } from '../../apps/web/src/logo/compiler.js';
import { makePattern } from '../../apps/web/src/logo/patterns.js';
import { challengeBoardLimits, createChallengeInventory, remapBlueprintToChallenge, validateBlueprintReachability } from '../../apps/web/src/logo/workcell-adapter.js';
import { CHALLENGE_LAYOUT, CHALLENGE_WORKSPACE } from '../../apps/web/src/robot/ur10-definition.js';


test('compiler output is explicitly transformed into the live UR10 board frame', () => {
  const local = compileImageData(makePattern('diagonal', 64), { brickBudget: 6, boardLimits: challengeBoardLimits(), seed: 173 }).blueprint;
  const live = remapBlueprintToChallenge(local);
  assert.equal(validateBlueprintReachability(live).ok, true);
  assert.ok(live.targets.every((target) => target.worldXmm >= CHALLENGE_LAYOUT.board.minX && target.worldXmm <= CHALLENGE_LAYOUT.board.maxX));
  assert.ok(live.targets.every((target) => target.worldYmm >= CHALLENGE_LAYOUT.board.minY && target.worldYmm <= CHALLENGE_LAYOUT.board.maxY));
  assert.ok(live.targets.every((target) => target.worldXmm >= CHALLENGE_WORKSPACE.xMinMm && target.worldXmm <= CHALLENGE_WORKSPACE.xMaxMm));
  assert.notDeepEqual(live.board.origin, local.board.origin);
});

test('generated live inventory is inside the tray with collision clearance and exact colours', () => {
  const live = remapBlueprintToChallenge(compileImageData(makePattern('diagonal', 64), { brickBudget: 6, boardLimits: challengeBoardLimits(), seed: 173 }).blueprint);
  const items = createChallengeInventory(live);
  assert.equal(items.length, live.brickCount);
  const targetCounts = Object.fromEntries(Object.entries(live.colourCounts).sort());
  const itemCounts = {};
  for (const item of items) {
    itemCounts[item.colour] = (itemCounts[item.colour] ?? 0) + 1;
    assert.ok(item.position.xMm > CHALLENGE_LAYOUT.tray.minX + 18 && item.position.xMm < CHALLENGE_LAYOUT.tray.maxX - 18);
    assert.ok(item.position.yMm > CHALLENGE_LAYOUT.tray.minY + 18 && item.position.yMm < CHALLENGE_LAYOUT.tray.maxY - 18);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(itemCounts).sort()), targetCounts);
});

test('compiler lab defaults fit the live six-brick tray', () => {
  const html = readFileSync(new URL('../../apps/web/compiler.html', import.meta.url), 'utf8');
  const debug = readFileSync(new URL('../../apps/web/src/logo/compiler-debug.js', import.meta.url), 'utf8');
  assert.match(html, /id="budget"[^>]*min="2"[^>]*value="6"/);
  assert.match(debug, /: 'diagonal';/);
  const source = compileImageData(makePattern('diagonal', 320), {
    brickBudget: 6,
    boardLimits: challengeBoardLimits(),
    fitMode: 'contain',
    seed: 173
  }).blueprint;
  const blueprint = remapBlueprintToChallenge(source);
  assert.doesNotThrow(() => createChallengeInventory(blueprint));
  assert.ok(blueprint.brickCount <= 6);
});
