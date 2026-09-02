export { createChallengeService } from './challenge-service.js';
export { CHALLENGE_PRESETS, CHALLENGE_CAMERA_RECOMMENDATIONS, DEFAULT_PRESET_ID, TERRAIN_ASSET, buildPreset } from './challenge-presets.js';
export { loadTerrainAsset, decodeTerrainArrayBuffer, parseGlb, applyTerrainTransform } from './terrain-loader.js';
export { configureTerrainMaterial, configureTerrainMesh } from './terrain-material.js';
export { createCollisionProxy } from './collision-proxy.js';
export * from './challenge-transforms.js';
