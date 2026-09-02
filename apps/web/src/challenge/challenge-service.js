import { CHALLENGE_PRESETS, DEFAULT_PRESET_ID, buildPreset } from './challenge-presets.js';
import { MAIN_DEMO_MACHINE_MOUNT, deepClone } from './challenge-transforms.js';
import { applyTerrainTransform, loadTerrainAsset } from './terrain-loader.js';

export function createChallengeService({ THREE = null, terrainUrl = null, fetchImpl = globalThis.fetch, machineMount = MAIN_DEMO_MACHINE_MOUNT, displayOffset = {} } = {}) {
  let presetId = DEFAULT_PRESET_ID;
  let loaded = false;
  let terrainRoot = null;
  let terrainMetrics = null;
  const canonicalOffset = Number(displayOffset?.x ?? 0) === 0
    && Number(displayOffset?.y ?? 0) === 0
    && Number(displayOffset?.z ?? 0) === 0;
  const useCanonicalPresets = machineMount === MAIN_DEMO_MACHINE_MOUNT && canonicalOffset;
  const presets = useCanonicalPresets
    ? CHALLENGE_PRESETS
    : Object.freeze({
      EASY: buildPreset('EASY', { machineMount, displayOffset }),
      CHALLENGING: buildPreset('CHALLENGING', { machineMount, displayOffset })
    });

  const current = () => presets[presetId];
  const requireLoadedScene = () => {
    if (!terrainRoot) throw new Error('terrain_scene_not_loaded');
    return terrainRoot;
  };

  return Object.freeze({
    async load() {
      if (loaded) return this.getState();
      if (THREE && terrainUrl) {
        const loadedTerrain = await loadTerrainAsset({ url: terrainUrl, THREE, fetchImpl });
        terrainRoot = loadedTerrain.root;
        terrainMetrics = loadedTerrain.metrics;
        applyTerrainTransform(terrainRoot, current().terrainTransform);
      }
      loaded = true;
      return this.getState();
    },
    setPreset(nextPresetId) {
      if (!presets[nextPresetId]) throw new Error(`unknown_preset:${nextPresetId}`);
      presetId = nextPresetId;
      if (terrainRoot) applyTerrainTransform(terrainRoot, current().terrainTransform);
      return this.getState();
    },
    getState() { return deepClone({ ...current(), loaded, terrainMetrics }); },
    getEntry() { return deepClone(current().entry); },
    getExit() { return deepClone(current().exit); },
    getBridgeCorridor() { return deepClone(current().bridgeCorridor); },
    getTrackRoute() { return deepClone(current().trackRoute); },
    getBridgeTransform() { return deepClone(current().bridgeTransform); },
    getBridgeChallengeInput() { return deepClone(current().bridgeChallengeInput); },
    getCollisionProxy() { return deepClone(current().collisionProxy); },
    getTerrainGroup() { return requireLoadedScene(); },
    reset() {
      presetId = DEFAULT_PRESET_ID;
      if (terrainRoot) applyTerrainTransform(terrainRoot, current().terrainTransform);
      return this.getState();
    }
  });
}
