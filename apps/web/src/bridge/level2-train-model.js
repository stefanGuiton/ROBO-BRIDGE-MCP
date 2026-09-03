import * as THREE from '../../vendor/three.module.min.js';
import { loadTerrainAsset } from '../challenge/terrain-loader.js';

export async function loadLevel2TrainModel() {
  const { root } = await loadTerrainAsset({
    url: new URL('../../assets/models/train_full.glb', import.meta.url), THREE
  });
  // The export includes a reference cube; only the authored train is displayed.
  const referenceCube = root.getObjectByName('Cube');
  referenceCube?.removeFromParent();
  disposeTrainModel(referenceCube);
  root.rotation.x = Math.PI / 2; // glTF Y-up -> machine Z-up, long axis X.
  root.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  root.scale.setScalar(22 / size.y); // Fits the two-cell bridge rail corridor.
  root.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(root);
  const centre = bounds.getCenter(new THREE.Vector3());
  root.position.set(-centre.x, -centre.y, -bounds.min.z);
  root.name = 'LEVEL2_TRAIN_FULL';
  return root;
}

export function disposeTrainModel(root) {
  const resources = new Set();
  root?.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) {
    resource.image?.close?.();
    resource.dispose();
  }
}
