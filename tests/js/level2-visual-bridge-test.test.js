import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { createLevel2VisualBridgeTest } from '../../apps/web/src/bridge/level2-visual-bridge-test.js';

function harness(options = {}) {
  const listeners = new Set();
  let renderCount = 0;
  let complete = false;
  const renderer = {
    machineRoot: new THREE.Group(),
    addFrameListener(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    render() { renderCount += 1; }
  };
  const challenge = {
    getEntry: () => ({ id: 'ENTRY', position: { x: 10, y: 20, z: 30 } }),
    getExit: () => ({ id: 'EXIT', position: { x: 110, y: -30, z: 50 } })
  };
  const events = [];
  const visual = createLevel2VisualBridgeTest({ renderer, challenge, durationMs: 4500,
    loadModel: null, canStart: () => complete, onStateChanged: state => events.push(state), ...options });
  return {
    renderer, visual, events,
    setComplete(value) { complete = value; },
    frame(seconds) { for (const listener of listeners) listener(seconds); },
    get renderCount() { return renderCount; },
    get listenerCount() { return listeners.size; }
  };
}

test('overshoot extends the visual route by millimetres and can be disabled live', () => {
  const settings = { overshootMm: 192 };
  const h = harness({ getOffsets: () => settings, canStart: () => true });
  h.visual.setLevelActive(true);
  h.visual.start();
  h.frame(4.5);
  const exit = new THREE.Vector3(110, -30, 50);
  assert.ok(Math.abs(h.visual.visualRoot.position.distanceTo(exit) - 192) < 1e-8);
  assert.deepEqual(h.visual.getState().exit, { x: 110, y: -30, z: 50 });
  settings.overshootMm = 0;
  h.frame(0);
  assert.deepEqual(h.visual.visualRoot.position.toArray(), exit.toArray());
  h.visual.dispose();
});

test('train offsets apply live without changing authoritative endpoints', () => {
  const offsets = { x: 1, y: 2, z: 3 };
  const h = harness({ getOffsets: () => offsets, canStart: () => true });
  h.visual.setLevelActive(true);
  h.visual.start();
  assert.deepEqual(h.visual.visualRoot.position.toArray(), [11, 22, 33]);
  h.frame(4.5);
  offsets.z = 10;
  h.frame(0);
  assert.deepEqual(h.visual.visualRoot.position.toArray(), [111, -28, 60]);
  assert.deepEqual(h.visual.getState().exit, { x: 110, y: -30, z: 50 });
  h.visual.dispose();
});

test('train waits for model load and discards a model arriving after reset', async () => {
  let resolve;
  const h = harness({ loadModel: () => new Promise(r => { resolve = r; }), canStart: () => true });
  h.visual.setLevelActive(true);
  h.visual.start();
  h.frame(5);
  assert.equal(h.visual.getState().progress, 0);
  const model = new THREE.Group();
  resolve(model);
  await Promise.resolve();
  h.frame(4.5);
  assert.equal(h.visual.getState().status, 'complete');
  h.visual.reset();
  h.visual.start();
  h.visual.reset();
  resolve(new THREE.Group());
  await Promise.resolve();
  assert.equal(h.renderer.machineRoot.children.length, 0);
  h.visual.dispose();
});

test('Level 2 visual test uses authoritative ENTRY and EXIT on the existing frame loop', () => {
  const h = harness();
  assert.deepEqual(h.visual.start(), { ok: false, reason: 'level2_only' });
  h.visual.setLevelActive(true);
  assert.deepEqual(h.visual.start(), { ok: false, reason: 'bridge_incomplete' });
  h.setComplete(true);

  const started = h.visual.start();
  assert.equal(started.ok, true);
  assert.equal(started.status, 'running');
  assert.equal(h.renderer.machineRoot.children.length, 1);
  assert.equal(h.visual.visualRoot.name, 'LEVEL2_VISUAL_BRIDGE_TEST');
  assert.deepEqual(h.visual.visualRoot.position.toArray(), [10, 20, 30]);
  assert.deepEqual(h.visual.getState().entry, { x: 10, y: 20, z: 30 });
  assert.deepEqual(h.visual.getState().exit, { x: 110, y: -30, z: 50 });

  h.frame(2.25);
  assert.equal(h.visual.getState().progress, 0.5);
  assert.deepEqual(h.visual.visualRoot.position.toArray(), [60, -5, 40]);
  h.frame(2.25);
  assert.equal(h.visual.getState().status, 'complete');
  assert.equal(h.visual.getState().progress, 1);
  assert.deepEqual(h.visual.visualRoot.position.toArray(), [110, -30, 50]);
  assert.equal(h.events.at(-1).status, 'complete');
});

test('Level 2 visual test is repeatable and disposes when leaving Level 2', () => {
  const h = harness();
  h.setComplete(true);
  h.visual.setLevelActive(true);
  h.visual.start();
  const firstRoot = h.visual.visualRoot;
  h.frame(4.5);
  assert.equal(h.visual.getState().status, 'complete');

  h.visual.start();
  assert.equal(h.visual.visualRoot, firstRoot);
  assert.equal(h.visual.getState().status, 'running');
  h.visual.setLevelActive(false);
  assert.equal(h.visual.visualRoot, null);
  assert.equal(h.renderer.machineRoot.children.length, 0);
  assert.equal(h.visual.getState().status, 'idle');

  h.visual.dispose();
  assert.equal(h.listenerCount, 0);
  assert.equal(h.visual.getState().status, 'disposed');
});
