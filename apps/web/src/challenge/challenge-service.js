import { CHALLENGE_PRESETS, DEFAULT_PRESET_ID, buildPreset } from './challenge-presets.js';
import { MAIN_DEMO_MACHINE_MOUNT, deepClone } from './challenge-transforms.js';
import { applyTerrainTransform, loadTerrainAsset } from './terrain-loader.js';
import { buildTerrain7Preset, inspectTerrain7, TERRAIN7_OCCLUDERS } from './terrain7-preset.js';

export function createChallengeService({ THREE = null, terrainUrl = null, fetchImpl = globalThis.fetch, machineMount = MAIN_DEMO_MACHINE_MOUNT, displayOffset = {}, challengeYawDeg = 0, terrain7 = false } = {}) {
  let presetId = DEFAULT_PRESET_ID;
  let loaded = false;
  let terrainRoot = null;
  let terrainMetrics = null;
  let authored;
  const build = (id, options = {}) => terrain7 ? buildTerrain7Preset(id, { machineMount, authored, ...options }) : buildPreset(id, { machineMount, displayOffset, challengeYawDeg, ...options });
  const canonicalOffset = Number(displayOffset?.x ?? 0) === 0
    && Number(displayOffset?.y ?? 0) === 0
    && Number(displayOffset?.z ?? 0) === 0;
  const useCanonicalPresets = machineMount === MAIN_DEMO_MACHINE_MOUNT && canonicalOffset && challengeYawDeg === 0;
  let presets = terrain7 ? { EASY: build('EASY') } : useCanonicalPresets
    ? CHALLENGE_PRESETS
    : Object.freeze({
      EASY: buildPreset('EASY', { machineMount, displayOffset, challengeYawDeg }),
      CHALLENGING: buildPreset('CHALLENGING', { machineMount, displayOffset, challengeYawDeg })
    });

  const current = () => presets[presetId];
  const requireLoadedScene = () => {
    if (!terrainRoot) throw new Error('terrain_scene_not_loaded');
    return terrainRoot;
  };

  return Object.freeze({
    previewEndpoints(endpoints) {
      return deepClone(build(presetId, { endpoints }));
    },
    setEndpoints(endpoints) {
      const next = build(presetId, { endpoints });
      presets = Object.freeze({ ...presets, [presetId]: next });
      if (terrainRoot) applyTerrainTransform(terrainRoot, next.terrainTransform);
      return this.getState();
    },
    previewBuildElevation(buildElevationMm) {
      return deepClone(build(presetId, { buildElevationMm, endpoints: current().tuning.endpoints }));
    },
    setBuildElevation(buildElevationMm) {
      const next = build(presetId, { buildElevationMm, endpoints: current().tuning.endpoints });
      presets = Object.freeze({ ...presets, [presetId]: next });
      if (terrainRoot) applyTerrainTransform(terrainRoot, next.terrainTransform);
      return this.getState();
    },
    async load() {
      if (loaded) return this.getState();
      if (THREE && terrainUrl) {
        const loadedTerrain = await loadTerrainAsset({ url: terrainUrl, THREE, fetchImpl });
        terrainRoot = loadedTerrain.root;
        terrainMetrics = loadedTerrain.metrics;
        if (terrain7) {
          authored = inspectTerrain7(terrainRoot);
          presets = { EASY: build('EASY') };
        }
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
    getTerrainOccluders() {
      const meshes = [];
      if (terrain7 && terrainRoot) for (const name of TERRAIN7_OCCLUDERS) terrainRoot.getObjectByName(name)?.traverse(object => { if (object.isMesh) meshes.push(object); });
      return meshes;
    },
    reset() {
      presetId = DEFAULT_PRESET_ID;
      if (terrainRoot) applyTerrainTransform(terrainRoot, current().terrainTransform);
      return this.getState();
    }
  });
}
