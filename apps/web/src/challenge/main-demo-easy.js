'use strict';

import * as THREE from '../../vendor/three.module.min.js';
import { createChallengeService } from './challenge-service.js';

export const MAIN_DEMO_EASY_PRESET = 'EASY';
// X rebases the accepted bridge centre from machine X=820 to X=650.
// Z clears the existing 3.8 mm build-mat/stud envelope without moving any
// terrain, ENTRY/EXIT, route, collision, or bridge subsystem independently.
export const MAIN_DEMO_EASY_DISPLAY_OFFSET = Object.freeze({ x: -170, y: 0, z: 4 });
export const MAIN_DEMO_EASY_CHALLENGE_YAW_DEG = -90;
export const MAIN_DEMO_BRIDGE_MODEL_SCALE = 2;

function machineMountFromSettings(settings) {
  return {
    position: {
      x: Number(settings.robotMountXmm),
      y: Number(settings.robotMountYmm),
      z: Number(settings.robotMountZmm)
    },
    yawDeg: Number(settings.robotMountYawDeg)
  };
}

function bridgeWorldTransform(source) {
  return Object.freeze({
    id: source.id,
    translationMm: Object.freeze({ ...source.translationMm }),
    yawRad: source.yawRad,
    scale: MAIN_DEMO_BRIDGE_MODEL_SCALE,
    sourceFrame: source.sourceFrame,
    targetFrame: source.targetFrame
  });
}

function bridgeLocalPoint(point) {
  return Object.freeze({
    x: point.x / MAIN_DEMO_BRIDGE_MODEL_SCALE,
    y: point.y / MAIN_DEMO_BRIDGE_MODEL_SCALE,
    z: point.z / MAIN_DEMO_BRIDGE_MODEL_SCALE
  });
}

export function createEasyBridgeChallenge(challengeService) {
  const input = challengeService.getBridgeChallengeInput?.();
  if (input?.id === 'terrain7-easy-aqueduct') return Object.freeze(input);
  const source = challengeService.getBridgeTransform();
  return Object.freeze({
    id: 'terrain-easy-aqueduct',
    entry: bridgeLocalPoint(source.localEntry),
    exit: bridgeLocalPoint(source.localExit),
    span: source.spanMm / MAIN_DEMO_BRIDGE_MODEL_SCALE,
    roadY: source.roadYmm / MAIN_DEMO_BRIDGE_MODEL_SCALE,
    worldTransform: bridgeWorldTransform(source),
    supportProfile: Object.freeze({ type: 'flat', heightY: 0 })
  });
}

function playerCollisionBoxes(challengeService) {
  return challengeService.getCollisionProxy().proxies.map((box) => ({
    kind: box.id,
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z
  }));
}

export async function createMainDemoEasyChallenge({ renderer, playerSettings } = {}) {
  if (!renderer?.scene?.add || !playerSettings) {
    throw new TypeError('The MAIN_DEMO renderer and player settings are required.');
  }
  const service = createChallengeService({
    THREE,
    terrain7: true,
    terrainUrl: new URL('../../assets/terrain/Terrain_7_Main.glb', import.meta.url),
    machineMount: machineMountFromSettings(playerSettings),
    displayOffset: MAIN_DEMO_EASY_DISPLAY_OFFSET,
    challengeYawDeg: MAIN_DEMO_EASY_CHALLENGE_YAW_DEG
  });
  await service.load();
  service.setPreset(MAIN_DEMO_EASY_PRESET);
  const terrainGroup = service.getTerrainGroup();
  terrainGroup.name = 'MAIN_DEMO_EASY_CURATED_TERRAIN';
  renderer.scene.add(terrainGroup);
  renderer.setTerrainOccluders?.(service.getTerrainOccluders());
  renderer.setEnvironmentCollisionProxies?.(playerCollisionBoxes(service));
  renderer.webgl.shadowMap.needsUpdate = true;
  renderer.render();

  return Object.freeze({
    get bridgeChallenge() { return createEasyBridgeChallenge(service); },
    terrainGroup,
    async updateEndpoints(bridgeHost, endpoints, { expectedDesignRevision = bridgeHost.designRevision, signal = null } = {}) {
      const candidate = service.previewEndpoints(endpoints);
      const challenge = createEasyBridgeChallenge({ getBridgeChallengeInput: () => candidate.bridgeChallengeInput, getBridgeTransform: () => candidate.bridgeTransform });
      await bridgeHost.applySettingsBatch(bridgeHost.settings, expectedDesignRevision, { signal, challenge });
      service.setEndpoints(endpoints);
      renderer.setEnvironmentCollisionProxies?.(playerCollisionBoxes(service));
      renderer.webgl.shadowMap.needsUpdate = true;
      renderer.render();
      return service.getState();
    },
    async elevateForConstruction(bridgeHost, buildElevationMm, options = {}) {
      const candidate = service.previewBuildElevation(buildElevationMm);
      const challenge = createEasyBridgeChallenge({ getBridgeChallengeInput: () => candidate.bridgeChallengeInput, getBridgeTransform: () => candidate.bridgeTransform });
      await bridgeHost.applySettingsBatch(bridgeHost.settings, bridgeHost.designRevision, { ...options, challenge });
      service.setBuildElevation(buildElevationMm);
      renderer.setEnvironmentCollisionProxies?.(playerCollisionBoxes(service));
      renderer.webgl.shadowMap.needsUpdate = true;
      return service.getState();
    },
    getActiveChallenge: () => service.getState(),
    getState: () => service.getState(),
    setPreset: (presetId) => service.setPreset(presetId),
    reset: () => service.reset(),
    getBridgeTransform: () => structuredClone(createEasyBridgeChallenge(service).worldTransform),
    getEntry: () => service.getEntry(),
    getExit: () => service.getExit(),
    getTrainRoute: () => service.getTrackRoute(),
    getCollisionProxy: () => service.getCollisionProxy(),
    getTerrainTravelPlane: () => service.getTerrainTravelPlane(),
    getTerrainOccluders: () => service.getTerrainOccluders()
  });
}
