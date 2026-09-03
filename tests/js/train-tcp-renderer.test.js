import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { createTrainThreeRenderer } from '../../apps/web/src/train/train-three-renderer.js';

// Real Three.js scene graph, without a second WebGL renderer or browser loop.
// These fixtures verify the display adapter, not robot motion or Train success.
function harness() {
  const scene = new THREE.Group(), machineRoot = new THREE.Group();
  machineRoot.position.set(240, -160, 1200);
  machineRoot.rotation.set(0, 0, Math.PI / 4);
  scene.add(machineRoot);
  const renderer = createTrainThreeRenderer({ THREE, machineRoot });
  return { scene, machineRoot, renderer };
}

function snapshot(positionMm, yaw, visible = true) {
  return { poses: [], couplers: [], pusher: { visible,
    pose: { positionMm, rotationQuaternion: { x: Math.cos(yaw / 2), y: Math.sin(yaw / 2), z: 0, w: 0 } },
    sizeMm: { xMm: 12, yMm: 28, zMm: 20 } } };
}

test('real Train pusher mesh preserves TCP origin and orientation through the one machine mount', () => {
  const { scene, machineRoot, renderer } = harness();
  for (const [position, yaw] of [[{ xMm: 300, yMm: -111, zMm: 160 }, 0],
    [{ xMm: 365, yMm: -70, zMm: 190 }, Math.PI / 2], [{ xMm: 520, yMm: 80, zMm: 240 }, -0.6]]) {
    const value = snapshot(position, yaw);
    renderer.update(value);
    scene.updateMatrixWorld(true);
    const mesh = renderer.root.getObjectByName('PUSH_POSITION_BLOCK_PLACEHOLDER');
    const expectedPosition = machineRoot.localToWorld(new THREE.Vector3(position.xMm, position.yMm, position.zMm));
    const expectedRotation = machineRoot.getWorldQuaternion(new THREE.Quaternion())
      .multiply(new THREE.Quaternion().copy(value.pusher.pose.rotationQuaternion));
    assert.ok(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(expectedPosition) < 1e-8);
    assert.ok(mesh.getWorldQuaternion(new THREE.Quaternion()).angleTo(expectedRotation) < 1e-7);
    assert.deepEqual(mesh.scale.toArray(), [12, 28, 20]);
    const centre = mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox);
    assert.deepEqual(centre.getCenter(new THREE.Vector3()).toArray(), [0, 0, 0]);
  }
  assert.equal(renderer.getStats().pusherObjects, 1);
  assert.equal(renderer.getStats().createdCanvases, 0);
  assert.equal(renderer.getStats().ownsWebGLRenderer, false);
  renderer.dispose();
  assert.equal(machineRoot.children.length, 0);
});

test('debug visibility hides only the TCP mesh without changing its pose or creating another object', () => {
  const { renderer } = harness();
  const value = snapshot({ xMm: 500, yMm: 0, zMm: 200 }, 0.4);
  renderer.update(value);
  const mesh = renderer.root.getObjectByName('PUSH_POSITION_BLOCK_PLACEHOLDER');
  const before = [mesh.position.toArray(), mesh.quaternion.toArray()];
  renderer.update({ ...value, pusher: { ...value.pusher, visible: false } });
  assert.equal(mesh.visible, false);
  assert.equal(renderer.getStats().pusherObjects, 0);
  renderer.update(value);
  assert.equal(mesh.visible, true);
  assert.equal(renderer.getStats().pusherObjects, 1);
  assert.deepEqual([mesh.position.toArray(), mesh.quaternion.toArray()], before);
  assert.equal(renderer.root.getObjectByName('PUSH_POSITION_BLOCK').children.length, 1);
  renderer.dispose();
});
