'use strict';

import * as THREE from '../../vendor/three.module.min.js';
import { createChallengeService } from './challenge-service.js';

export const MAIN_DEMO_EASY_PRESET = 'EASY';
// X rebases the accepted bridge centre from machine X=820 to X=650.
// Z clears the existing 3.8 mm build-mat/stud envelope without moving any
// terrain, ENTRY/EXIT, route, collision, or bridge subsystem independently.
export const MAIN_DEMO_EASY_DISPLAY_OFFSET = Object.freeze({ x: -170, y: 0, z: 4 });
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
    terrainUrl: new URL('../../assets/terrain/Terrain_Optimised_10k.glb', import.meta.url),
    machineMount: machineMountFromSettings(playerSettings),
    displayOffset: MAIN_DEMO_EASY_DISPLAY_OFFSET
  });
  await service.load();
  service.setPreset(MAIN_DEMO_EASY_PRESET);
  const terrainGroup = service.getTerrainGroup();
  terrainGroup.name = 'MAIN_DEMO_EASY_CURATED_TERRAIN';
  renderer.scene.add(terrainGroup);
  renderer.setEnvironmentCollisionProxies?.(playerCollisionBoxes(service));
  renderer.webgl.shadowMap.needsUpdate = true;
  renderer.render();

  const bridgeChallenge = createEasyBridgeChallenge(service);
  return Object.freeze({
    bridgeChallenge,
    terrainGroup,
    getActiveChallenge: () => service.getState(),
    getBridgeTransform: () => structuredClone(bridgeChallenge.worldTransform),
    getEntry: () => service.getEntry(),
    getExit: () => service.getExit(),
    getTrainRoute: () => service.getTrackRoute(),
    getCollisionProxy: () => service.getCollisionProxy()
  });
}
