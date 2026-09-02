export function configureTerrainMaterial(material, THREE) {
  if (!material) return material;
  material.name = 'ROBO_BRIDGE_TERRAIN_MATERIAL';
  material.side = THREE.DoubleSide;
  material.roughness = Number.isFinite(material.roughness) ? Math.max(0.72, material.roughness) : 0.88;
  material.metalness = 0;
  material.depthWrite = true;
  material.toneMapped = true;
  material.needsUpdate = true;
  return material;
}

export function configureTerrainMesh(mesh) {
  mesh.name = 'ROBO_BRIDGE_CURATED_TERRAIN';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  return mesh;
}
