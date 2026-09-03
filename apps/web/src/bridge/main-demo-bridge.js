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

// Type 2 hero. BridgeHost supplies the tested Viaduct family preset; the
// challenge still owns the authored 370mm span and water-to-deck height.
// Keep the production brick grid and one-layer deck, with no cap above track.
export const TERRAIN7_BRIDGE_INITIAL_SETTINGS = Object.freeze({
  family: 'viaduct',
  voxelSize: 8,
  brickHeightRatio: 0.6,
  // Six need >=384mm; five at the tested opening width have unsupported
  // feet. Four keep the tested proportions and pass the exact/support audit.
  viArchCount: 4,
  viPenetration: 0,
  capHeight: 0,
  deckThickness: 4.8
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

export async function createMainDemoBridge({ renderer, challenge, settingsStore = null, onHologramChanged = () => {} } = {}) {
  if (!renderer?.machineRoot?.add || typeof renderer.render !== 'function') {
    throw new TypeError('The MAIN_DEMO renderer machine frame is required.');
  }
  if (!challenge) throw new TypeError('The authoritative EASY bridge challenge is required.');

  const host = await createBridgeHost({
    initialSettings: challenge.id === 'terrain7-easy-aqueduct' ? TERRAIN7_BRIDGE_INITIAL_SETTINGS : MAIN_DEMO_BRIDGE_INITIAL_SETTINGS,
    challenge,
    challengePolicy: 'locked',
    compilerOptions: { preferWorker: true }
  });

  let hologramGroup = null;
  let hologramSnapshot = null;
  let constructionBoard = null;
  let visible = true;

  function refreshHologram() {
    const buildPlan = host.buildPlan;
    const snapshot = createHologramSnapshot(buildPlan, host.worldTransform, { limit: 5000 });
    // Slot IDs can repeat after regeneration: only the current plan's real,
    // correctly occupied BuildBoard targets remove pending shell instances.
    if (constructionBoard?.blueprintId === buildPlan.planId) {
      const accepted = new Set(constructionBoard.getTargets().filter(t => t.occupiedBy && t.correctness).map(t => t.id));
      snapshot.placements = snapshot.placements.filter(p => !accepted.has(p.placementId));
    }
    snapshot.summary.pendingPhysicalCount = snapshot.placements.length;
    snapshot.summary.acceptedPhysicalCount = snapshot.page.returnedCount - snapshot.placements.length;
    snapshot.page.returnedCount = snapshot.placements.length;
    const settings = settingsStore?.get?.() ?? {};
    const nextGroup = createThreeBridgeHologram({
      THREE,
      snapshot,
      buildPlan,
      opacity: settings.bridgeHologramOpacity ?? 0.3,
      colour: settings.bridgeHologramColor ?? null,
      depthPrepass: true,
      renderOrder: 3,
      name: 'V46_EXACT_BUILDPLAN_HOLOGRAM'
    });
    alignThreeYUpHologramToMachineZUp(nextGroup);
    nextGroup.visible = visible;
    disposeThreeBridgeHologram(hologramGroup);
    renderer.machineRoot.add(nextGroup);
    hologramGroup = nextGroup;
    hologramSnapshot = snapshot;
    renderer.render();
    onHologramChanged({
      source: structuredClone(snapshot.source),
      summary: structuredClone(snapshot.summary),
      worldTransform: structuredClone(snapshot.worldTransform),
      renderStats: structuredClone(nextGroup.userData.renderStats)
    });
  }

  refreshHologram();
  const unsubscribe = host.subscribe((event) => {
    if (event.type === 'compile_committed' && !event.initial) refreshHologram();
  });
  const unsubscribeSettings = settingsStore?.subscribe?.((key, _value, _settings, change) => {
    const changedKeys = key === '*' ? change?.changedKeys ?? [] : [key];
    if (changedKeys.some(name => name === 'bridgeHologramOpacity' || name === 'bridgeHologramColor')) refreshHologram();
  }) ?? (() => {});
  const bridgeDesign = createBridgeDesignPackage({ host });

  return Object.freeze({
    host,
    bridgeDesign,
    refreshHologram,
    setVisible(value) { visible = Boolean(value); if (hologramGroup) hologramGroup.visible = visible; },
    setConstructionBoard(board) { constructionBoard = board; refreshHologram(); },
    get hologramGroup() { return hologramGroup; },
    get hologramSnapshot() { return structuredClone(hologramSnapshot); },
    get hologramRenderStats() { return structuredClone(hologramGroup?.userData.renderStats ?? null); },
    dispose() {
      unsubscribe();
      unsubscribeSettings();
      disposeThreeBridgeHologram(hologramGroup);
      hologramGroup = null;
      hologramSnapshot = null;
    }
  });
}
