// One active asset identity for the production loader, metadata and diagnostics.
// Terrain 9 retains the existing Terrain 7 ENTRY/EXIT and coordinate contract.
export const MAIN_DEMO_TERRAIN_ASSET = Object.freeze({
  repoPath: 'Scene_and_3D_Files/Terrain_9_Main.glb',
  packagePath: 'assets/terrain/Terrain_9_Main.glb',
  sha256: '1e0292fd5fb33fe22dc54e1772283a89232273be2ad793a7d896d21bb4a5b76c',
  bytes: 3486576,
  triangleCount: 8003
});

export const MAIN_DEMO_TERRAIN_URL = new URL(`../../${MAIN_DEMO_TERRAIN_ASSET.packagePath}`, import.meta.url);
