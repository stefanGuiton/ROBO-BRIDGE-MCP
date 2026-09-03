import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SIMPLE_DEMO_COLOURS } from '../../apps/web/src/logo/simple-demo-mode.js';
import { PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { makeReachableV8Spawn } from '../../apps/web/src/player/v8-spawn.js';
import { createV8WorkcellProfile } from '../../apps/web/src/workcell/v8-workcell-profile.js';

test('Simple starts with 28 interleaved sources, equally red and blue', () => {
  assert.equal(Object.isFrozen(SIMPLE_DEMO_COLOURS), true);
  assert.equal(SIMPLE_DEMO_COLOURS.length, 28);
  assert.equal(SIMPLE_DEMO_COLOURS.filter(colour => colour === 'red').length, 14);
  assert.equal(SIMPLE_DEMO_COLOURS.filter(colour => colour === 'blue').length, 14);
  for (let index = 0; index < SIMPLE_DEMO_COLOURS.length; index++) {
    assert.equal(SIMPLE_DEMO_COLOURS[index], index % 2 ? 'blue' : 'red');
  }
});

test('balanced Simple sources retain unique identities and validated reachable poses', async () => {
  const supplied = JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url), 'utf8'));
  const settings = { ...PLAYER_FALLBACK_SETTINGS, ...supplied };
  const profile = createV8WorkcellProfile(settings);
  const generated = makeReachableV8Spawn(settings, profile, {
    count: SIMPLE_DEMO_COLOURS.length, colours: SIMPLE_DEMO_COLOURS, yawRad: 0
  });
  assert.equal(generated.ok, true, generated.reason);
  assert.equal(generated.records.length, 28);
  assert.equal(new Set(generated.records.map(brick => brick.id)).size, 28);
  assert.deepEqual(generated.diagnostics.guaranteedColours, { red: 14, blue: 14 });
  for (const [index, brick] of generated.records.entries()) {
    assert.equal(brick.colour, SIMPLE_DEMO_COLOURS[index]);
    assert.equal(brick.reachability.reachable, true);
    assert.ok(brick.reachability.validationSamples > 0);
    assert.ok(Object.values(brick.position).every(Number.isFinite));
  }
});
