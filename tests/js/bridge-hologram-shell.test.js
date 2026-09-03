import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import {
  createBridgeHost, createCustomPartRegistry, createHologramSnapshot,
  createThreeBridgeHologram, disposeThreeBridgeHologram
} from '../../apps/web/src/bridge-core/index.js';
import { createMainDemoBridge, TERRAIN7_BRIDGE_INITIAL_SETTINGS } from '../../apps/web/src/bridge/main-demo-bridge.js';
import { buildTerrain7Preset } from '../../apps/web/src/challenge/terrain7-preset.js';
import { prepareBridgeBuild } from '../../apps/web/src/bridge-construction/bridge-build-session.js';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { V8_WORKSPACE } from '../../apps/web/src/workcell/v8-workcell-profile.js';

const challenge = buildTerrain7Preset('EASY').bridgeChallengeInput;
const host = await createBridgeHost({ initialSettings: TERRAIN7_BRIDGE_INITIAL_SETTINGS,
  challenge, challengePolicy: 'locked', compilerOptions: { preferWorker: false } });
const buildPlan = host.buildPlan;
const snapshot = createHologramSnapshot(buildPlan, host.worldTransform);
const makeHologram = (options = {}) => createThreeBridgeHologram({ THREE, buildPlan, snapshot, ...options });
const meshes = (group, pass) => group.children.filter(mesh => mesh.userData.renderPass === pass);
const materials = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const placementIds = (group, pass = 'colour') => meshes(group, pass).flatMap(mesh => mesh.userData.placementIds).sort();
const colourHex = material => `#${material.color.getHexString()}`;

test('exact shell retains every pending placement, custom opening vertex, track material and transform', () => {
  const before = JSON.stringify({ buildPlan, snapshot });
  const group = makeHologram({ depthPrepass: true, opacity: .74 });
  const registry = createCustomPartRegistry(buildPlan);
  try {
    const expectedIds = snapshot.placements.map(p => p.placementId).sort();
    assert.deepEqual(placementIds(group), expectedIds);
    assert.deepEqual(placementIds(group, 'depth'), expectedIds);
    assert.equal(new Set(placementIds(group)).size, snapshot.placements.length);
    const byId = new Map(snapshot.placements.map(p => [p.placementId, p]));
    for (const mesh of meshes(group, 'colour')) {
      const first = byId.get(mesh.userData.placementIds[0]);
      if (mesh.userData.geometryKind === 'custom-definition') {
        const exact = registry.getGeometry(first.definitionId);
        assert.equal(mesh.userData.definitionId, first.definitionId);
        assert.deepEqual(mesh.geometry.getAttribute('position').array, exact.positions);
        assert.deepEqual(mesh.geometry.getAttribute('normal').array, exact.normals);
        assert.ok(mesh.geometry.groups.every(g => g.count > 0));
        if (mesh.userData.partClass === 'TRACK_SEGMENT') {
          assert.equal(colourHex(mesh.material[1]), first.trackMaterials.sleepers.toLowerCase());
          assert.equal(colourHex(mesh.material[2]), first.trackMaterials.rails.toLowerCase());
          assert.deepEqual(mesh.geometry.groups.map(g => g.materialIndex), [1, 2]);
        } else {
          assert.equal(colourHex(mesh.material[0]), first.colourHex.toLowerCase());
          assert.ok(['ARCH_A', 'ARCH_B'].includes(mesh.userData.partClass));
        }
      } else {
        assert.equal(mesh.geometry.parameters.width, first.localSizeMm.xMm);
        assert.equal(mesh.geometry.parameters.height, first.localSizeMm.yMm);
        assert.equal(mesh.geometry.parameters.depth, first.localSizeMm.zMm);
        assert.equal(colourHex(mesh.material), first.colourHex.toLowerCase());
      }
      mesh.userData.placementIds.forEach((id, index) => {
        const p = byId.get(id), actual = new THREE.Matrix4();
        mesh.getMatrixAt(index, actual);
        const expected = new THREE.Matrix4().compose(
          new THREE.Vector3(p.targetTransform.position.xMm, p.targetTransform.position.zMm, p.targetTransform.position.yMm),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.targetTransform.yawRad),
          new THREE.Vector3().setScalar(p.geometryKind === 'box' ? 1 : p.targetTransform.uniformScale)
        );
        actual.elements.forEach((value, i) => assert.ok(Math.abs(value - expected.elements[i]) < .0001, `${id} matrix element ${i}`));
      });
    }
    assert.equal(JSON.stringify({ buildPlan, snapshot }), before, 'rendering does not mutate construction truth');
  } finally { disposeThreeBridgeHologram(group); }
});

test('all exact opaque depth prepasses precede depth-tested transparent colour passes with shared buffers', () => {
  const group = makeHologram({ depthPrepass: true, opacity: .74, renderOrder: 3 });
  try {
    const colour = meshes(group, 'colour'), depth = meshes(group, 'depth');
    assert.equal(depth.length, colour.length);
    assert.ok(Math.max(...depth.map(m => m.renderOrder)) < Math.min(...colour.map(m => m.renderOrder)));
    for (const mesh of colour) {
      const prepass = depth.find(m => m.userData.hologramMeshIndex === mesh.userData.hologramMeshIndex);
      assert.equal(prepass.geometry, mesh.geometry);
      assert.equal(prepass.instanceMatrix, mesh.instanceMatrix);
      assert.equal(prepass.count, mesh.count);
      assert.deepEqual(prepass.userData.placementIds, mesh.userData.placementIds);
      assert.equal(prepass.material.colorWrite, false);
      assert.equal(prepass.material.depthWrite, true);
      assert.equal(prepass.material.depthTest, true);
      assert.equal(prepass.material.transparent, false);
      assert.equal(prepass.material.blending, THREE.NoBlending);
      assert.equal(prepass.material.depthFunc, THREE.LessEqualDepth);
      for (const item of materials(mesh)) {
        assert.equal(item.colorWrite, true);
        assert.equal(item.depthWrite, false);
        assert.equal(item.depthTest, true);
        assert.equal(item.transparent, true);
        assert.equal(item.opacity, .74);
        assert.equal(item.depthFunc, THREE.LessEqualDepth);
      }
    }
  } finally { disposeThreeBridgeHologram(group); }
});

test('render-cost counters distinguish shared geometry from the additional exact depth workload', () => {
  const legacy = makeHologram({ opacity: .46 });
  const shell = makeHologram({ opacity: .74, depthPrepass: true });
  try {
    const before = legacy.userData.renderStats, after = shell.userData.renderStats;
    assert.equal(before.mode, 'transparent');
    assert.equal(before.depthMeshCount, 0);
    assert.equal(before.depthDrawCalls, 0);
    assert.equal(before.totalTriangles, before.colourTriangles);
    assert.equal(after.mode, 'exact-depth-prepass');
    assert.equal(after.placementCount, snapshot.placements.length);
    assert.equal(after.colourMeshCount, before.colourMeshCount);
    assert.equal(after.uniqueGeometryCount, before.uniqueGeometryCount);
    assert.equal(after.instanceMatrixBytes, before.instanceMatrixBytes);
    assert.equal(after.colourDrawCalls, before.colourDrawCalls);
    assert.equal(after.depthDrawCalls, before.colourMeshCount);
    assert.equal(after.colourTriangles, before.colourTriangles);
    assert.equal(after.depthTriangles, before.colourTriangles);
    assert.equal(after.totalTriangles, before.totalTriangles * 2);
    assert.equal(after.totalDrawCalls, before.totalDrawCalls + before.colourMeshCount);
    const geometries = new Set(shell.children.map(mesh => mesh.geometry));
    assert.equal(geometries.size, after.uniqueGeometryCount);
    assert.equal('fps' in after, false, 'counters are geometry workload, not a measured performance claim');
  } finally { disposeThreeBridgeHologram(legacy); disposeThreeBridgeHologram(shell); }
});

test('shared geometry, materials and instanced resources dispose once across shell replacement', () => {
  const parent = new THREE.Group(), group = makeHologram({ depthPrepass: true });
  parent.add(group);
  const resources = new Set(group.children.flatMap(mesh => [mesh, mesh.geometry, ...materials(mesh)]));
  const counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  disposeThreeBridgeHologram(group);
  disposeThreeBridgeHologram(group);
  disposeThreeBridgeHologram(null);
  assert.equal(parent.children.length, 0);
  assert.ok([...counts.values()].every(count => count === 1));
});

test('hidden or empty holograms create no invisible depth occluder and reject invalid opacity', () => {
  const hidden = makeHologram({ depthPrepass: true, opacity: 0 });
  const empty = makeHologram({ depthPrepass: true, snapshot: { ...snapshot, placements: [] } });
  try {
    assert.equal(meshes(hidden, 'depth').length, 0);
    assert.ok(meshes(hidden, 'colour').every(mesh => materials(mesh).every(item => item.opacity === 0 && !item.depthWrite)));
    assert.equal(empty.children.length, 0);
    assert.equal(empty.userData.renderStats.totalDrawCalls, 0);
    assert.equal(empty.userData.renderStats.totalTriangles, 0);
    for (const opacity of [-1, 1.1, Infinity, NaN]) assert.throws(() => makeHologram({ opacity }), /opacity/);
  } finally { disposeThreeBridgeHologram(hidden); disposeThreeBridgeHologram(empty); }
});

test('MAIN_DEMO shows only pending current-plan targets and refresh never changes live board revisions', async () => {
  const machineRoot = new THREE.Group(), notifications = [];
  const demo = await createMainDemoBridge({ renderer: { machineRoot, render() {} }, challenge,
    onHologramChanged: event => notifications.push(event) });
  try {
    const prepared = prepareBridgeBuild({ host: demo.host, workspace: V8_WORKSPACE });
    const board = new BuildBoard(prepared.targetSet);
    const target = board.getTargets().find(t => !t.dependencyIds.length && !t.requiresStructureComplete);
    assert.ok(target, 'real prepared plan has a foundation target');
    const accepted = board.trySnapBrick({ brickId: 'unit-human-source', colour: target.colour,
      position: target.position, yawRad: target.yawRad, actor: 'human', targetId: target.id });
    assert.equal(accepted.ok, true);
    const boardBefore = board.getBuildState(), revision = board.worldRevision;
    demo.setConstructionBoard(board);
    assert.equal(board.worldRevision, revision);
    assert.deepEqual(board.getBuildState(), boardBefore);
    assert.equal(board.getTarget(target.id).completedBy, 'human');
    assert.equal(demo.hologramSnapshot.placements.some(p => p.placementId === target.id), false);
    assert.equal(placementIds(demo.hologramGroup).includes(target.id), false);
    assert.equal(placementIds(demo.hologramGroup, 'depth').includes(target.id), false);
    assert.equal(demo.hologramSnapshot.summary.acceptedPhysicalCount, 1);
    assert.equal(demo.hologramSnapshot.summary.pendingPhysicalCount, snapshot.placements.length - 1);
    assert.equal(demo.hologramRenderStats.placementCount, snapshot.placements.length - 1);
    assert.deepEqual(notifications.at(-1).renderStats, demo.hologramRenderStats);
    assert.equal(demo.hologramRenderStats.mode, 'exact-depth-prepass');
    const statsCopy = demo.hologramRenderStats;
    statsCopy.placementCount = -1;
    assert.notEqual(demo.hologramRenderStats.placementCount, -1);
    board.removeBrick('unit-human-source', 'human');
    const removedRevision = board.worldRevision;
    demo.refreshHologram();
    assert.equal(board.worldRevision, removedRevision);
    assert.ok(placementIds(demo.hologramGroup).includes(target.id));
    assert.equal(machineRoot.children.length, 1);
    assert.equal(demo.hologramGroup.matrixAutoUpdate, false);
    assert.deepEqual(demo.hologramGroup.matrix.elements, [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  } finally { demo.dispose(); }
  assert.equal(machineRoot.children.length, 0);
});

test('incorrect occupancy and stale plan slot IDs cannot hide regenerated exact targets', async () => {
  const machineRoot = new THREE.Group();
  const demo = await createMainDemoBridge({ renderer: { machineRoot, render() {} }, challenge });
  try {
    const sourcePlanId = demo.host.buildPlan.planId;
    const id = demo.hologramSnapshot.placements[0].placementId;
    // Readback fixtures only: no ADOPTED/complete state is injected into any
    // live authority. These exercise what the presentation filter may hide.
    const readback = [{ id, occupiedBy: 'fixture-source', correctness: false }];
    demo.setConstructionBoard({ blueprintId: sourcePlanId, getTargets: () => structuredClone(readback) });
    assert.ok(placementIds(demo.hologramGroup).includes(id));
    readback[0].correctness = true;
    demo.refreshHologram();
    assert.equal(placementIds(demo.hologramGroup).includes(id), false);
    const previous = demo.hologramGroup;
    const oldGeometries = new Set(previous.children.map(mesh => mesh.geometry));
    let disposals = 0;
    for (const geometry of oldGeometries) geometry.addEventListener('dispose', () => { disposals += 1; });
    const changed = await demo.bridgeDesign.invoke('update_bridge_design', {
      expectedDesignRevision: demo.host.designRevision, patch: { viaduct: { archCount: 3 } }
    });
    assert.equal(changed.ok, true, JSON.stringify(changed));
    assert.notEqual(demo.host.buildPlan.planId, sourcePlanId);
    assert.equal(disposals, oldGeometries.size);
    assert.equal(previous.parent, null);
    assert.equal(machineRoot.children.length, 1);
    assert.equal(demo.hologramSnapshot.summary.acceptedPhysicalCount, 0);
    assert.equal(demo.hologramRenderStats.placementCount, demo.host.buildPlan.billOfMaterials.totalPhysicalParts);
    assert.deepEqual(placementIds(demo.hologramGroup), demo.hologramSnapshot.placements.map(p => p.placementId).sort());
    assert.equal(demo.hologramSnapshot.source.planId, changed.planId);
    demo.setVisible(false);
    demo.refreshHologram();
    assert.equal(demo.hologramGroup.visible, false);
  } finally { demo.dispose(); }
});
