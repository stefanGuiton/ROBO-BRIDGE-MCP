import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { constructionHarness } from '../helpers/construction-harness.js';
import { prepareBridgeBuild } from '../../apps/web/src/bridge-construction/bridge-build-session.js';
import { sourceToControllerBrick } from '../../apps/web/src/bridge-construction/bridge-part-inventory.js';
import { createV8BrickVisual, disposeV8BrickVisual } from '../../apps/web/src/player/v8-brick-visual.js';
import { inverseTransformPointFromMainDemo, transformPointToMainDemo } from '../../apps/web/src/bridge-core/world-transform.js';
import { captureBrickInTcp, heldBrickWorldPose } from '../../apps/web/src/robot/gripper-definition.js';

const fixtures = new Map();
function visualFixture(terrain7 = false) {
  if (!fixtures.has(terrain7)) fixtures.set(terrain7, constructionHarness({ terrain7 }).then(h => ({ ...h,
    prepared: prepareBridgeBuild({ host: h.host, workspace: h.controller.workspace })
  })));
  return fixtures.get(terrain7);
}

function visualFor(placement, prepared, options = {}) {
  const source = prepared.inventory.list().find(source => source.dedicatedPlacementId === placement.placementId);
  const brick = sourceToControllerBrick(source, source.storagePose);
  return { brick, root: createV8BrickVisual(brick, { ghostOpacity: 0.3 }, { partRegistry: prepared.registry }, options) };
}

function faceRayHits(root) {
  root.updateMatrixWorld(true);
  const mesh = root.children.find(object => object.isMesh && !object.isInstancedMesh);
  const positions = mesh.geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 3) {
    const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, index + offset).applyMatrix4(mesh.matrixWorld));
    const face = new THREE.Triangle(...vertices);
    if (face.getArea() < 1e-6) continue;
    const normal = face.getNormal(new THREE.Vector3()), centre = face.getMidpoint(new THREE.Vector3());
    const ray = new THREE.Raycaster(centre.clone().addScaledVector(normal, 1), normal.clone().negate(), 0, 2);
    // The bundled Three Mesh raycaster follows the same material-array group
    // selection rule as WebGLRenderer. An ungrouped material array has no faces.
    return ray.intersectObject(mesh, false);
  }
  return [];
}

test('ARCH_A and ARCH_B use drawable full-geometry materials for loose, held and accepted V8 visuals', async t => {
  const { prepared } = await visualFixture();
  for (const partClass of ['ARCH_A', 'ARCH_B']) {
    await t.test(partClass, () => {
      const placement = prepared.normalisedBuild.placements.find(placement => placement.partClass === partClass);
      assert.ok(placement, `${partClass} must come from the current compiler`);
      const { root } = visualFor(placement, prepared);
      const mesh = root.children[0];
      assert.ok(mesh.geometry.getAttribute('position').count > 0);
      assert.equal(Array.isArray(mesh.material), false, 'ungrouped arches must use the full-geometry single-material draw path');
      assert.equal(mesh.material.visible, true);
      assert.equal(mesh.material.opacity, 1);
      assert.equal(mesh.material.transparent, false);
      assert.equal(mesh.material.depthWrite, true);
      assert.equal(mesh.material, root.userData.material);
      assert.ok(faceRayHits(root).length > 0, 'exact arch triangles must be drawable and pickable');
      disposeV8BrickVisual(root);
    });
  }
});

test('Terrain7 accepted arch visual uses exact compiler geometry at the authoritative proxy pose, without scale or origin drift', async () => {
  const { prepared, controller, board } = await visualFixture(true);
  const placement = prepared.normalisedBuild.placements.find(placement => placement.placementId === 'bp_9453b510.c.0.1');
  assert.equal(placement?.partClass, 'ARCH_B', 'replay regression must use the measured current Viaduct arch');
  const revision = controller.worldRevision;
  const { root } = visualFor(placement, prepared);
  root.position.set(placement.position.xMm, placement.position.yMm, placement.position.zMm);
  root.rotation.z = placement.yawRad;
  root.updateMatrixWorld(true);
  const mesh = root.children[0], positions = mesh.geometry.getAttribute('position');
  const data = prepared.registry.getCustomGeometry(placement.customPartDefinitionId);
  const transform = prepared.normalisedBuild.worldTransform;
  const renderOrigin = inverseTransformPointFromMainDemo(placement.renderPose.position, transform);
  const localYaw = placement.renderPose.yawRad - transform.yawRad;
  assert.equal(positions.count * 3, data.positions.length);
  for (let triangle = 0; triangle < positions.count; triangle += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const from = (triangle + [0, 2, 1][corner]) * 3;
      const x = data.positions[from], y = data.positions[from + 1], z = data.positions[from + 2];
      const expected = transformPointToMainDemo({
        x: renderOrigin.x + x * Math.cos(localYaw) - z * Math.sin(localYaw),
        y: renderOrigin.y + y,
        z: renderOrigin.z + x * Math.sin(localYaw) + z * Math.cos(localYaw)
      }, transform);
      const actual = new THREE.Vector3().fromBufferAttribute(positions, triangle + corner).applyMatrix4(mesh.matrixWorld);
      assert.ok(Math.hypot(actual.x - expected.xMm, actual.y - expected.yMm, actual.z - expected.zMm) < 1e-4);
    }
  }
  assert.ok(faceRayHits(root).length > 0);
  assert.equal(root.scale.x, 1);
  assert.equal(root.scale.y, 1);
  assert.equal(root.scale.z, 1);
  assert.equal(controller.worldRevision, revision);
  assert.equal(board.worldRevision, revision);
  disposeV8BrickVisual(root);
});

test('held Terrain7 arch remains drawable at the existing TCP capture pose and retains its finite custom-part bounds', async () => {
  const { prepared } = await visualFixture(true);
  const placement = prepared.normalisedBuild.placements.find(placement => placement.partClass === 'ARCH_B');
  const { brick, root } = visualFor(placement, prepared);
  const tcp = { xMm: brick.position.xMm, yMm: brick.position.yMm, zMm: brick.position.zMm + placement.captureProxy.tcpAboveCentreMm };
  const captured = captureBrickInTcp(tcp, brick.yawRad, brick.position);
  const carriedTcp = { xMm: 480, yMm: 90, zMm: 391.3 };
  const pose = heldBrickWorldPose(carriedTcp, 0.4, captured, 0);
  root.position.set(pose.position.xMm, pose.position.yMm, pose.position.zMm);
  root.rotation.z = pose.yawRad;
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root), centre = bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(centre.x - pose.position.xMm) < 1e-4);
  assert.ok(Math.abs(centre.y - pose.position.yMm) < 1e-4);
  assert.ok(Math.abs(centre.z - pose.position.zMm) < 1e-4);
  assert.ok(Math.abs(bounds.max.z - (carriedTcp.zMm - 3)) < 1e-4, 'arch top must be the existing 3 mm capture gap below TCP');
  assert.ok(Math.abs(bounds.max.z - bounds.min.z - placement.physicalDimensions.heightMm) < 1e-4);
  assert.ok(faceRayHits(root).length > 0);
  disposeV8BrickVisual(root);
});

test('track preserves complete sleeper/rail material groups and arch ghosts retain their intended opacity', async () => {
  const { prepared } = await visualFixture(true);
  const track = prepared.normalisedBuild.placements.find(placement => placement.partClass === 'TRACK_SEGMENT');
  const { root } = visualFor(track, prepared);
  const mesh = root.children[0], positions = mesh.geometry.getAttribute('position');
  assert.equal(Array.isArray(mesh.material), true);
  assert.equal(mesh.material.length, 3);
  assert.equal(mesh.geometry.groups.reduce((count, group) => count + group.count, 0), positions.count);
  assert.deepEqual([...new Set(mesh.geometry.groups.map(group => group.materialIndex))].sort(), [1, 2]);
  assert.ok(mesh.geometry.groups.every(group => mesh.material[group.materialIndex]?.visible));
  assert.ok(faceRayHits(root).length > 0);
  disposeV8BrickVisual(root);
  const arch = prepared.normalisedBuild.placements.find(placement => placement.partClass === 'ARCH_B');
  const ghost = visualFor(arch, prepared, { ghost: true }).root;
  assert.equal(ghost.children[0].material.opacity, 0.3);
  assert.equal(ghost.children[0].material.transparent, true);
  assert.equal(ghost.children[0].material.depthWrite, false);
  assert.ok(faceRayHits(ghost).length > 0);
  disposeV8BrickVisual(ghost);
});
