import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerSettingsStore, PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { createSceneSettingsService, createSceneSettingsTools } from '../../apps/web/src/webmcp/scene-settings-tools.js';

function makeHarness({ listenerBumps = false, settings = {} } = {}) {
  const store = new PlayerSettingsStore({ ...PLAYER_FALLBACK_SETTINGS, tableColor: '#ffffff', ...settings });
  const clock = new RevisionClock(7);
  if (listenerBumps) store.subscribe((key) => { if (key === '*') clock.bump(); });
  return { store, clock, service: createSceneSettingsService({ settingsStore: store, revisionClock: clock }) };
}

test('get_scene_settings reads the existing PlayerSettingsStore without changing world revision', () => {
  const h = makeHarness({ settings: { exposure: 1.25, tableColor: '#abcdef' } });
  const before = h.clock.value;
  const result = h.service.getSceneSettings();
  assert.equal(result.ok, true);
  assert.deepEqual(result.settings, { brightness: 1.25, tableColor: '#abcdef' });
  assert.equal(result.brightness, 1.25);
  assert.equal(result.tableColor, '#abcdef');
  assert.equal(result.worldRevision, before);
  assert.equal(h.clock.value, before);
});

test('atomic presentation notification identifies only the changed settings for the existing renderer', () => {
  const h = makeHarness();
  const events = [];
  h.store.subscribe((key, _value, settings, change) => events.push({ key, settings: { ...settings }, change }));
  const result = h.service.updateSceneSettings({ brightness: 1.6, tableColor: '#444444', expectedWorldRevision: 7 });
  assert.equal(result.ok, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].key, '*');
  assert.deepEqual(events[0].change.changedKeys, ['exposure', 'tableColor']);
  assert.equal(events[0].settings.exposure, 1.6);
  assert.equal(events[0].settings.tableColor, '#444444');
});

test('update_scene_settings maps brightness to exposure and tableColor atomically, bumping exactly once', () => {
  const h = makeHarness({ settings: { exposure: 1.25, tableColor: '#abcdef' } });
  const result = h.service.updateSceneSettings({ brightness: 1.8, tableColor: 'dark grey', expectedWorldRevision: 7 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.changed, ['exposure', 'tableColor']);
  assert.equal(result.worldRevision, 8);
  assert.equal(h.clock.value, 8);
  assert.equal(h.store.get().exposure, 1.8);
  assert.equal(h.store.get().tableColor, '#444444');
});

test('production-style store subscriber and service together still bump only once', () => {
  const h = makeHarness({ listenerBumps: true });
  const result = h.service.updateSceneSettings({ brightness: 1.4, expectedWorldRevision: 7 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(h.clock.value, 8);
  assert.equal(result.worldRevision, 8);
});

test('stale scene-settings update is rejected without changing settings or revision', () => {
  const h = makeHarness({ settings: { exposure: 1.25, tableColor: '#abcdef' } });
  const before = structuredClone(h.store.get());
  const result = h.service.updateSceneSettings({ brightness: 2, expectedWorldRevision: 6 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale_state');
  assert.deepEqual(h.store.get(), before);
  assert.equal(h.clock.value, 7);
});

test('invalid or unknown patch is rejected atomically before setMany', () => {
  const h = makeHarness({ settings: { exposure: 1.25, tableColor: '#abcdef' } });
  const before = structuredClone(h.store.get());
  const invalid = h.service.updateSceneSettings({ brightness: 99, tableColor: '#123456', expectedWorldRevision: 7 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, 'invalid_input');
  assert.deepEqual(h.store.get(), before);
  assert.equal(h.clock.value, 7);
  const unknown = h.service.updateSceneSettings({ floorColor: '#000000', expectedWorldRevision: 7 });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'invalid_input');
  assert.deepEqual(h.store.get(), before);
  assert.equal(h.clock.value, 7);
});

test('cancelled scene-settings update has no effect before the synchronous commit boundary', () => {
  const h = makeHarness();
  const controller = new AbortController();
  controller.abort();
  const before = structuredClone(h.store.get());
  const result = h.service.updateSceneSettings({ brightness: 1.7, expectedWorldRevision: 7 }, { signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.deepEqual(h.store.get(), before);
  assert.equal(h.clock.value, 7);
});

test('cancellation raised by a synchronous subscriber reports the committed revision', () => {
  const h = makeHarness();
  const controller = new AbortController();
  h.store.subscribe(() => controller.abort());
  const result = h.service.updateSceneSettings({ brightness: 1.7, expectedWorldRevision: 7 }, { signal: controller.signal });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.cancellationBoundary, 'committed');
  assert.equal(result.worldRevision, 8);
  assert.equal(h.clock.value, 8);
  assert.equal(h.store.get().exposure, 1.7);
});

test('tool catalogue exposes exactly one read and one mutating generic settings tool', () => {
  const h = makeHarness();
  const tools = createSceneSettingsTools({ settingsStore: h.store, revisionClock: h.clock });
  assert.deepEqual(tools.map((tool) => tool.name), ['get_scene_settings', 'update_scene_settings']);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal(tools[1].annotations.readOnlyHint, false);
  const before = h.clock.value;
  assert.equal(tools[0].execute({}).worldRevision, before);
  const result = tools[1].execute({ tableColor: '#101010', expectedWorldRevision: before });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.tableColor, '#101010');
  assert.equal(h.clock.value, before + 1);
});
