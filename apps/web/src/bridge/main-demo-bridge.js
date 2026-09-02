'use strict';

import * as THREE from '../../vendor/three.module.min.js';
import {
  createBridgeHost,
  createHologramSnapshot,
  createThreeBridgeHologram,
  disposeThreeBridgeHologram
} from '../bridge-core/index.js';
import { createBridgeDesignPackage } from '../bridge-design/create-bridge-design-package.js';

export const MAIN_DEMO_BRIDGE_INITIAL_SETTINGS = Object.freeze({
  family: 'aqueduct',
  voxelSize: 8,
  brickHeightRatio: 0.6,
  aqTopCount: 4,
  aqMiddleCount: 3,
  aqBottomCount: 2
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

export async function createMainDemoBridge({ renderer, challenge, onHologramChanged = () => {} } = {}) {
  if (!renderer?.machineRoot?.add || typeof renderer.render !== 'function') {
    throw new TypeError('The MAIN_DEMO renderer machine frame is required.');
  }
  if (!challenge) throw new TypeError('The authoritative EASY bridge challenge is required.');

  const host = await createBridgeHost({
    initialSettings: MAIN_DEMO_BRIDGE_INITIAL_SETTINGS,
    challenge,
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
        // This MVP is an exact design hologram, not physical construction.
        // Keep every BuildPlan tier readable through the low EASY ravine and
        // existing solid workbench top until physical support is integrated.
        material.depthTest = false;
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
