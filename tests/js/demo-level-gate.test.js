import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelGatedTrain } from '../../apps/web/src/train-integration/level-gated-train.js';
import { guardDemoLevelTools } from '../../apps/web/src/logo/demo-level-tools.js';
import { createDemoModeControl } from '../../apps/web/src/logo/simple-demo-mode.js';

test('Levels 1/2 never construct Train, physics, root or frame subscription', () => {
  let created = 0, frames = 0;
  const gate = createLevelGatedTrain({ createIntegration() { created++; }, subscribeFrame() { frames++; } });
  assert.equal(gate.getState().configured, false);
  assert.equal(gate.getState().enabled, false);
  assert.equal(gate.getSubsystem(), null);
  assert.equal(gate.reset().state, 'UNCONFIGURED');
  assert.equal(gate.updateFrame(1).fixedSteps, 0);
  assert.throws(() => gate.prepare({}), { code: 'LEVEL3_ONLY' });
  assert.throws(() => gate.test({}), { code: 'LEVEL3_ONLY' });
  assert.equal(created, 0); assert.equal(frames, 0);
});

test('Level 3 opt-in uses one factory and tears down the existing Train on exit', () => {
  let created = 0, activeFrames = 0, disposed = 0, steps = 0;
  const root = {}, integration = { prepare: input => input, getSubsystem: () => root,
    getState: () => ({ configured: true, state: 'READY' }), updateFrame() { steps++; }, dispose() { disposed++; } };
  const gate = createLevelGatedTrain({ createIntegration() { created++; return integration; },
    subscribeFrame(listener) { activeFrames++; listener(1 / 60); return () => { activeFrames--; }; } });
  gate.setEnabled(true);
  assert.equal(created, 0);
  const board = {}; assert.equal(gate.prepare({ board }).board, board);
  gate.prepare({ board });
  assert.equal(created, 1); assert.equal(activeFrames, 1); assert.equal(steps, 1);
  assert.equal(gate.getSubsystem(), root);
  gate.setEnabled(false);
  assert.equal(disposed, 1); assert.equal(activeFrames, 0);
  assert.equal(gate.getSubsystem(), null);
  assert.equal(gate.updateFrame(1).fixedSteps, 0);
});

test('Level 2 test_bridge rejects before invoking Mission or Train, while read projection is non-mutating', async () => {
  let calls = 0, mode = 'bridge';
  const original = { ok: true, nextActions: ['build_next_parts', 'test_bridge'],
    error: { code: 'CONSTRUCTION_ERROR', allowedNextActions: ['get_build_progress', 'test_bridge'] } };
  const tools = guardDemoLevelTools([
    { name: 'test_bridge', execute() { calls++; return { ok: true }; } },
    { name: 'get_mission_state', annotations: { readOnlyHint: true }, execute() { return original; } }
  ], () => mode, () => 17);
  assert.equal((await tools[0].execute({})).reason, 'LEVEL3_ONLY');
  assert.equal(calls, 0);
  assert.deepEqual((await tools[1].execute({})).nextActions, ['build_next_parts']);
  assert.deepEqual(original.nextActions, ['build_next_parts', 'test_bridge']);
  assert.deepEqual((await tools[1].execute({})).error.allowedNextActions, ['get_build_progress']);
  assert.deepEqual(original.error.allowedNextActions, ['get_build_progress', 'test_bridge']);
  mode = 'train'; assert.equal((await tools[0].execute({})).ok, true); assert.equal(calls, 1);
});

test('bridge-level switching preserves the same board and frozen build, with no reset', async () => {
  const previousDocument = globalThis.document;
  const select = {}, cycle = {};
  const html = { dataset: {} };
  globalThis.document = { documentElement: html, querySelector: key => key === 'select[data-demo-mode]' ? select : key === '[data-demo-mode]' ? html : cycle };
  try {
    let resets = 0, revision = 3;
    const prepared = {}, board = {}, enabled = [], received = [];
    const mode = createDemoModeControl({ controller: { operationState: 'idle', pendingMoveCount: 0,
      operationBlocked: () => false, getBricks: () => [], revisionClock: { bump() { revision++; } } }, board,
      runtime: { robot: { reset() { resets++; } } }, coordinator: {}, workcellProfile: {},
      streamControl: { stop: async () => {}, getState: () => ({ cycleTimeMs: 300 }) },
      train: { setEnabled: value => enabled.push(value), prepare: value => received.push(value), getSubsystem: () => null },
      getPreparedBuild: () => prepared, mission: { phase: 'BUILD', resetMission() { resets++; } },
      renderer: { setTerrainOccluders() {}, setEnvironmentCollisionProxies() {}, render() {}, webgl: { shadowMap: {} } },
      setMode() {}, originalBlueprint: {} });
    assert.equal((await mode.change('train')).mode, 'train');
    assert.equal(select.value, 'train');
    assert.equal(received[0].preparedBuild, prepared); assert.equal(received[0].buildBoard, board);
    assert.equal((await mode.change('bridge')).mode, 'bridge');
    assert.equal(select.value, 'bridge');
    assert.deepEqual(enabled, [true, false]);
    assert.equal(resets, 0); assert.equal(revision, 5);
  } finally { globalThis.document = previousDocument; }
});
