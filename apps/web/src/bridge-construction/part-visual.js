import * as THREE from '../../vendor/three.module.min.js';

export function createBridgePartVisual(brick, registry, { ghost = false, opacity = 0.3 } = {}) {
  const part = registry.get(brick.bridgePart.registryKey);
  if (!part) throw new Error('unregistered_bridge_part');
  const material = new THREE.MeshStandardMaterial({ color: brick.displayColour ?? '#cda86c', roughness: 0.72,
    transparent: ghost, opacity: ghost ? opacity : 1, depthWrite: !ghost });
  const root = new THREE.Group();
  root.userData = { bridgePart: true, material, ghost };
  if (part.definitionId) {
    const data = registry.getCustomGeometry(part.definitionId), geometry = new THREE.BufferGeometry();
    const centre = part.geometryOriginToProxyCentreLocal, scale = registry.dimensions.worldScale;
    // Rebase exact compiler mesh onto the simulator's capture/proxy centre;
    // swap Y/Z into machine Z-up and reverse reflected triangle winding.
    const positions = new Float32Array(data.positions.length), normals = new Float32Array(data.normals.length);
    for (let i = 0; i < positions.length; i += 9) for (let j = 0; j < 3; j++) {
      const from = i + [0, 2, 1][j] * 3, to = i + j * 3;
      positions.set([(data.positions[from] - centre.x) * scale, (data.positions[from + 2] - centre.z) * scale, (data.positions[from + 1] - centre.y) * scale], to);
      normals.set([data.normals[from], data.normals[from + 2], data.normals[from + 1]], to);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    const materials = [material];
    if (part.partClass === 'TRACK_SEGMENT') {
      materials.push(material.clone(), material.clone());
      materials[1].color.set(brick.bridgePart.material.sleepersHex ?? '#604831');
      materials[2].color.set(brick.bridgePart.material.railsHex ?? '#8b9299');
      for (let i = 0; i < data.materials.length; i += 3) geometry.addGroup(i, 3, data.materials[i]);
    }
    // Three draws a material array only through geometry groups. Arches have
    // one ungrouped material; tracks retain their explicit sleeper/rail groups.
    root.add(new THREE.Mesh(geometry, part.partClass === 'TRACK_SEGMENT' ? materials : material));
  } else {
    const d = part.physicalDimensions;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(d.lengthMm, d.widthMm, d.heightMm), material));
    const nx = Math.round(part.logicalFootprint.lengthMm / 8), ny = Math.round(part.logicalFootprint.widthMm / 8);
    const geometry = new THREE.CylinderGeometry(2.4, 2.4, 1.8, 16); geometry.rotateX(Math.PI / 2);
    const studs = new THREE.InstancedMesh(geometry, material, nx * ny), matrix = new THREE.Matrix4();
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) {
      matrix.makeTranslation((x - (nx - 1) / 2) * 8, (y - (ny - 1) / 2) * 8, d.heightMm / 2 + 0.9);
      studs.setMatrixAt(x * ny + y, matrix);
    }
    root.add(studs);
  }
  root.traverse(o => { if (o.isMesh) { o.castShadow = !ghost; o.receiveShadow = !ghost; } });
  return root;
}
