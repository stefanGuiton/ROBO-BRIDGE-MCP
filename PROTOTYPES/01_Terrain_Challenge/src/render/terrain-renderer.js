import * as THREE from "three";

const PALETTE = Object.freeze({
  grassLow: new THREE.Color(0x6f9560),
  grassHigh: new THREE.Color(0xa7bb72),
  rock: new THREE.Color(0x887c70),
  rockLight: new THREE.Color(0xaaa094),
  soil: new THREE.Color(0x86644a),
  soilLight: new THREE.Color(0xb18a63),
  base: new THREE.Color(0x3c3835)
});

function vertexColors(result) {
  const { positions, materialIds, vertexCount, topVertexCount, bottomY } = result.meshData;
  const colors = new Float32Array(vertexCount * 3);
  const topRange = Math.max(1, result.settings.sharedTopY - result.settings.valleyFloorY);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const y = positions[offset + 1];
    const material = materialIds[vertex];
    let color;
    if (material === 0) {
      const amount = THREE.MathUtils.clamp((y - result.settings.valleyFloorY) / topRange, 0, 1);
      color = PALETTE.grassLow.clone().lerp(PALETTE.grassHigh, amount);
    } else if (material === 1) {
      const variation = 0.5 + 0.5 * Math.sin(positions[offset] * 0.21 + positions[offset + 2] * 0.13 + result.settings.seed * 0.01);
      color = PALETTE.rock.clone().lerp(PALETTE.rockLight, variation * 0.42);
    } else if (material === 2) {
      const relative = Math.max(0, y - bottomY);
      const strata = 0.5 + 0.5 * Math.sin(relative * 1.05 + result.settings.seed * 0.017);
      color = PALETTE.soil.clone().lerp(PALETTE.soilLight, strata * 0.38);
    } else color = PALETTE.base.clone();
    if (vertex >= topVertexCount && y <= bottomY + 1e-5) color = PALETTE.base.clone();
    colors[offset] = color.r; colors[offset + 1] = color.g; colors[offset + 2] = color.b;
  }
  return colors;
}

export function createTerrainObject(result) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(result.meshData.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(result.meshData.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors(result), 3));
  geometry.setIndex(new THREE.BufferAttribute(result.meshData.indices, 1));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "terrain-volume";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createWaterObject(result) {
  if (!result.waterMeshData) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(result.waterMeshData.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(result.waterMeshData.indices, 1));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0x67bfe1,
    transparent: true,
    opacity: 0.72,
    roughness: 0.28,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "river-water-ribbon";
  mesh.renderOrder = 2;
  return mesh;
}
