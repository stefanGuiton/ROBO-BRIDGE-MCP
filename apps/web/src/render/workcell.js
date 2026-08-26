import * as THREE from 'three';

function boxMesh(size, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.xMm, size.zMm, size.yMm), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeBin(object) {
  const group = new THREE.Group();
  group.name = object.id;
  const material = new THREE.MeshPhysicalMaterial({
    color: object.colour,
    roughness: 0.32,
    metalness: 0.08,
    clearcoat: 0.18,
    transparent: true,
    opacity: 0.9
  });
  const wall = 8;
  const height = object.size.zMm;
  const x = object.size.xMm;
  const y = object.size.yMm;
  const floor = boxMesh({ xMm: x, yMm: y, zMm: wall }, material);
  floor.position.y = -height / 2 + wall / 2;
  group.add(floor);
  const front = boxMesh({ xMm: x, yMm: wall, zMm: height }, material);
  front.position.z = y / 2 - wall / 2;
  group.add(front);
  const back = front.clone();
  back.position.z = -y / 2 + wall / 2;
  group.add(back);
  const side = boxMesh({ xMm: wall, yMm: y - 2 * wall, zMm: height }, material);
  side.position.x = x / 2 - wall / 2;
  group.add(side);
  const side2 = side.clone();
  side2.position.x = -x / 2 + wall / 2;
  group.add(side2);
  return group;
}

export function createWorkcell(sceneState) {
  const root = new THREE.Group();
  root.name = 'workcell';
  const objectMeshes = new Map();

  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xcbd1d8, roughness: 0.82, metalness: 0.02 });
  const tableMaterial = new THREE.MeshPhysicalMaterial({ color: 0x333b45, roughness: 0.37, metalness: 0.55, clearcoat: 0.1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2200, 1800), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2;
  floor.receiveShadow = true;
  root.add(floor);

  const table = new THREE.Mesh(new THREE.BoxGeometry(1000, 38, 850), tableMaterial);
  table.position.set(0, 17, 0);
  table.receiveShadow = true;
  table.castShadow = true;
  root.add(table);
  const tableTop = new THREE.MeshPhysicalMaterial({ color: 0x4c5662, roughness: 0.3, metalness: 0.62, clearcoat: 0.17 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(990, 8, 840), tableTop);
  top.position.y = 40;
  top.receiveShadow = true;
  root.add(top);

  const grid = new THREE.GridHelper(950, 38, 0x64748b, 0x556171);
  grid.position.y = 45;
  grid.material.transparent = true;
  grid.material.opacity = 0.24;
  grid.material.depthWrite = false;
  root.add(grid);

  function createObjectMesh(object) {
    let result;
    if (object.type === 'bin') {
      result = makeBin(object);
    } else {
      const material = object.semanticRole === 'obstacle'
        ? new THREE.MeshPhysicalMaterial({ color: object.colour, roughness: 0.42, metalness: 0.12, clearcoat: 0.2 })
        : new THREE.MeshPhysicalMaterial({ color: object.colour, roughness: 0.25, metalness: 0.02, clearcoat: 0.35 });
      result = boxMesh(object.size, material);
    }
    result.position.set(object.position.xMm, 45 + object.position.zMm, -object.position.yMm);
    result.userData.sceneObjectId = object.id;
    root.add(result);
    objectMeshes.set(object.id, result);
  }

  for (const object of sceneState.getState().objects) createObjectMesh(object);

  sceneState.subscribe((event, state) => {
    if (event.type === 'scene_reset') {
      for (const object of objectMeshes.values()) root.remove(object);
      objectMeshes.clear();
      for (const object of state.objects) createObjectMesh(object);
      return;
    }
    const object = state.objects.find((item) => item.id === event.objectId);
    const visual = objectMeshes.get(event.objectId);
    if (object && visual) {
      visual.position.set(object.position.xMm, 45 + object.position.zMm, -object.position.yMm);
      visual.visible = object.heldBy === null || object.heldBy === undefined;
    }
  });

  return {
    root,
    floor,
    table,
    grid,
    objectMeshes,
    setHeldObjectPose(objectId, worldPosition) {
      const visual = objectMeshes.get(objectId);
      if (!visual) return;
      visual.visible = true;
      visual.position.copy(worldPosition);
      visual.position.y -= 32;
    },
    clearHeldObjectPose(objectId) {
      const object = sceneState.getObject(objectId);
      const visual = objectMeshes.get(objectId);
      if (object && visual) {
        visual.position.set(object.position.xMm, 45 + object.position.zMm, -object.position.yMm);
        visual.visible = true;
      }
    }
  };
}
