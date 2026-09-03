'use strict';

import * as THREE from '../../vendor/three.module.min.js';
import { loadLevel2TrainModel, disposeTrainModel } from './level2-train-model.js';

const DEFAULT_DURATION_MS = 4500;
const CUBE_SIZE_MM = Object.freeze({ x: 18, y: 14, z: 12 });

function point(value, label) {
  const source = value?.position ?? value;
  const result = {
    x: Number(source?.x),
    y: Number(source?.y),
    z: Number(source?.z)
  };
  if (!Object.values(result).every(Number.isFinite)) throw new TypeError(`Level 2 ${label} is unavailable.`);
  return result;
}

function cloneState(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

// Presentation-only Level 2 crossing. It deliberately owns no physics,
// BuildBoard, mission, train or revision state and runs on the existing frame loop.
export function createLevel2VisualBridgeTest({ renderer, challenge, durationMs = DEFAULT_DURATION_MS,
  canStart = () => true, onStateChanged = () => {}, getOffsets = () => ({}), loadModel = loadLevel2TrainModel } = {}) {
  if (!renderer?.machineRoot?.add || typeof renderer.addFrameListener !== 'function') {
    throw new TypeError('The existing MAIN_DEMO renderer is required.');
  }
  if (!challenge?.getEntry || !challenge?.getExit) throw new TypeError('The authoritative challenge endpoints are required.');
  if (!Number.isFinite(durationMs) || durationMs < 1) throw new RangeError('durationMs must be positive.');

  let active = false;
  let elapsedMs = 0;
  let root = null;
  let body = null;
  let modelReady = !loadModel;
  let state = { status: 'idle', progress: 0, durationMs, entry: null, exit: null };

  const publish = () => {
    const snapshot = cloneState(state);
    onStateChanged(snapshot);
    return snapshot;
  };

  function ensureVisual() {
    if (root) return root;
    root = new THREE.Group();
    root.name = 'LEVEL2_VISUAL_BRIDGE_TEST';
    root.userData = Object.freeze({ presentationOnly: true, physics: false, level: 2 });
    const geometry = new THREE.BoxGeometry(CUBE_SIZE_MM.x, CUBE_SIZE_MM.y, CUBE_SIZE_MM.z);
    const material = new THREE.MeshStandardMaterial({ color: 0xff5a36, roughness: 0.38, metalness: 0.08 });
    body = new THREE.Mesh(geometry, material);
    body.name = 'LEVEL2_VISUAL_TEST_CUBE';
    body.position.z = CUBE_SIZE_MM.z / 2;
    body.castShadow = true;
    root.add(body);
    if (loadModel) {
      modelReady = false;
      body.visible = false;
      const owner = root;
      loadModel().then(model => {
        if (root !== owner) { disposeTrainModel(model); return; }
        owner.remove(body);
        disposeTrainModel(body);
        body = model;
        owner.add(model);
        modelReady = true;
        renderer.render();
      }).catch(error => {
        if (root !== owner) return;
        state = { ...state, status: 'error', error: String(error.message ?? error) };
        publish();
      });
    }
    renderer.machineRoot.add(root);
    return root;
  }

  function disposeVisual() {
    if (!root) return;
    root.removeFromParent();
    disposeTrainModel(root);
    root = null;
    body = null;
  }

  function reset({ dispose = true } = {}) {
    elapsedMs = 0;
    state = { status: 'idle', progress: 0, durationMs, entry: null, exit: null };
    if (dispose) disposeVisual();
    else if (root) root.visible = false;
    renderer.render();
    return publish();
  }

  function setLevelActive(value) {
    active = Boolean(value);
    if (!active) reset({ dispose: true });
    return active;
  }

  function start() {
    if (!active) return { ok: false, reason: 'level2_only' };
    if (!canStart()) return { ok: false, reason: 'bridge_incomplete' };
    const entry = point(challenge.getEntry(), 'ENTRY');
    const exit = point(challenge.getExit(), 'EXIT');
    const visual = ensureVisual();
    elapsedMs = 0;
    visual.visible = true;
    const offsets = getOffsets();
    visual.position.set(entry.x + (offsets.x || 0), entry.y + (offsets.y || 0), entry.z + (offsets.z || 0));
    const yawRad = Math.atan2(exit.y - entry.y, exit.x - entry.x);
    visual.rotation.set(0, 0, yawRad);
    state = { status: 'running', progress: 0, durationMs, entry, exit };
    renderer.render();
    return { ok: true, ...publish() };
  }

  const unsubscribeFrame = renderer.addFrameListener((deltaSeconds) => {
    if (!root) return;
    const offsets = getOffsets();
    // World/machine XYZ offset, independent of route yaw.
    // Extend only the presentation route; authoritative ENTRY/EXIT stay intact.
    if (!state.entry || !state.exit) return;
    const direction = new THREE.Vector3(state.exit.x - state.entry.x, state.exit.y - state.entry.y, state.exit.z - state.entry.z).normalize();
    const overshoot = Number.isFinite(offsets.overshootMm) ? Math.max(0, offsets.overshootMm) : 0;
    const end = {
      x: state.exit.x + direction.x * overshoot,
      y: state.exit.y + direction.y * overshoot,
      z: state.exit.z + direction.z * overshoot
    };
    if (state.status === 'complete') {
      root.position.set(end.x + (offsets.x || 0), end.y + (offsets.y || 0), end.z + (offsets.z || 0));
    }
    if (state.status !== 'running' || !modelReady) return;
    elapsedMs += Math.max(0, Number(deltaSeconds) || 0) * 1000;
    const progress = Math.min(1, elapsedMs / durationMs);
    const eased = progress * progress * (3 - 2 * progress);
    root.position.set(
      state.entry.x + (end.x - state.entry.x) * eased + (offsets.x || 0),
      state.entry.y + (end.y - state.entry.y) * eased + (offsets.y || 0),
      state.entry.z + (end.z - state.entry.z) * eased + (offsets.z || 0)
    );
    state = { ...state, progress };
    if (progress >= 1) {
      state = { ...state, status: 'complete', progress: 1 };
      publish();
    }
  });

  return Object.freeze({
    start,
    reset,
    setLevelActive,
    getState: () => cloneState(state),
    get visualRoot() { return root; },
    dispose() {
      unsubscribeFrame();
      active = false;
      disposeVisual();
      state = { status: 'disposed', progress: 0, durationMs, entry: null, exit: null };
    }
  });
}
