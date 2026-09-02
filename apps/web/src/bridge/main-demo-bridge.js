'use strict';

import * as THREE from '../../vendor/three.module.min.js';
import {
  createBridgeHost,
  createHologramSnapshot,
  createThreeBridgeHologram,
  disposeThreeBridgeHologram
} from '../bridge-core/index.js';
import { createBridgeDesignPackage } from '../bridge-design/create-bridge-design-package.js';

export const MAIN_DEMO_BRIDGE_WORLD_TRANSFORM = Object.freeze({
  id: 'v46-bridge-local-to-main-demo-machine',
  translationMm: Object.freeze({ xMm: 900, yMm: -120, zMm: -53.8 }),
  yawDeg: 0,
  scale: 2
});

export const MAIN_DEMO_BRIDGE_CHALLENGE = Object.freeze({
  id: 'main-demo-aqueduct-mvp',
  span: 320,
  roadY: 128,
  worldTransform: MAIN_DEMO_BRIDGE_WORLD_TRANSFORM,
  supportProfile: Object.freeze({ type: 'flat', heightY: 0 })
});

export const MAIN_DEMO_BRIDGE_INITIAL_SETTINGS = Object.freeze({
  family: 'aqueduct',
  voxelSize: 8,
  brickHeightRatio: 0.6,
  aqTopCount: 8,
  aqMiddleCount: 6,
  aqBottomCount: 4
});

function alignThreeYUpHologramToMachineZUp(group) {
  // Bridge Core's reusable Three adapter emits conventional Three.js Y-up
  // geometry. MAIN_DEMO renders its authoritative machine frame directly as
  // X/Y horizontal and Z up, so swap the adapter's Y/Z axes exactly once at
  // this integration boundary. The BuildPlan and hologram snapshot themselves
  // already remain in the required MAIN_DEMO Z-up machine coordinates.
  group.matrix.set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1
  );
  group.matrixAutoUpdate = false;
  group.updateMatrixWorld(true);
  return group;
}

export async function createMainDemoBridge({ renderer, onHologramChanged = () => {} } = {}) {
  if (!renderer?.machineRoot?.add || typeof renderer.render !== 'function') {
    throw new TypeError('The MAIN_DEMO renderer machine frame is required.');
  }

  const host = await createBridgeHost({
    initialSettings: MAIN_DEMO_BRIDGE_INITIAL_SETTINGS,
    challenge: MAIN_DEMO_BRIDGE_CHALLENGE,
    challengePolicy: 'locked',
    compilerOptions: { preferWorker: true }
  });

  let hologramGroup = null;
  let hologramSnapshot = null;

  function refreshHologram() {
    const buildPlan = host.buildPlan;
    const snapshot = createHologramSnapshot(buildPlan, host.worldTransform, { limit: 5000 });
    const nextGroup = createThreeBridgeHologram({
      THREE,
      snapshot,
      buildPlan,
      opacity: 0.46,
      name: 'V46_EXACT_BUILDPLAN_HOLOGRAM'
    });
    alignThreeYUpHologramToMachineZUp(nextGroup);
    nextGroup.renderOrder = 3;
    nextGroup.traverse((object) => {
      object.renderOrder = 3;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        material.depthWrite = false;
      }
    });
    disposeThreeBridgeHologram(hologramGroup);
    renderer.machineRoot.add(nextGroup);
    hologramGroup = nextGroup;
    hologramSnapshot = snapshot;
    renderer.render();
    onHologramChanged({
      source: structuredClone(snapshot.source),
      summary: structuredClone(snapshot.summary),
      worldTransform: structuredClone(snapshot.worldTransform)
    });
  }

  refreshHologram();
  const unsubscribe = host.subscribe((event) => {
    if (event.type === 'compile_committed' && !event.initial) refreshHologram();
  });
  const bridgeDesign = createBridgeDesignPackage({ host });

  return Object.freeze({
    host,
    bridgeDesign,
    refreshHologram,
    get hologramGroup() { return hologramGroup; },
    get hologramSnapshot() { return structuredClone(hologramSnapshot); },
    dispose() {
      unsubscribe();
      disposeThreeBridgeHologram(hologramGroup);
      hologramGroup = null;
      hologramSnapshot = null;
    }
  });
}
