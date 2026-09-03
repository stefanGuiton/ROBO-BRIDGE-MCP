import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { createChallengeService } from '../../apps/web/src/challenge/challenge-service.js';
import { terrainOccludesPoint } from '../../apps/web/src/player/terrain-occlusion.js';
import { TERRAIN7_ASSET, TERRAIN7_OCCLUDERS, TERRAIN7_WATER_DATUM_MM } from '../../apps/web/src/challenge/terrain7-preset.js';
import { constructionHarness } from '../helpers/construction-harness.js';
import { partsOverlap } from '../../apps/web/src/bricks/part-spec.js';
import { auditPreparedGeometry } from '../../scripts/audit-construction-geometry.mjs';
import { MAIN_DEMO_TERRAIN_URL } from '../../apps/web/src/challenge/terrain-asset.js';

test('current Terrain9 GLB preserves Terrain7 anchors, water material and UV normal transform', async t => {
  const bytes = await readFile(MAIN_DEMO_TERRAIN_URL);
  assert.equal(bytes.byteLength, TERRAIN7_ASSET.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), TERRAIN7_ASSET.sha256);
  // Node has no pixel decoder: verify asset/material binding, not appearance.
  const originalDecoder = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1 });
  t.after(() => { if (originalDecoder) globalThis.createImageBitmap = originalDecoder; else delete globalThis.createImageBitmap; });
  const service = createChallengeService({ terrain7: true, THREE, terrainUrl: 'fixture',
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) });
  const state = await service.load(), root = service.getTerrainGroup();
  assert.equal(state.terrainAsset.packagePath, 'assets/terrain/Terrain_9_Main.glb');
  assert.equal(state.terrainMetrics.triangleCount, TERRAIN7_ASSET.triangleCount);
  const entry = root.getObjectByName('ENTRY').getWorldPosition(new THREE.Vector3());
  const exit = root.getObjectByName('EXIT').getWorldPosition(new THREE.Vector3());
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(entry[axis] - state.entry.displayPosition[axis]) < 1e-5);
    assert.ok(Math.abs(exit[axis] - state.exit.displayPosition[axis]) < 1e-5);
  }
  assert.ok(Math.abs(entry.distanceTo(exit) - 370) < .001);
  const water = root.getObjectByName('Plane').children[0];
  assert.ok(water.material.normalMap);
  assert.deepEqual(water.material.normalMap.repeat.toArray(), [1.5, 1.5]);
  assert.deepEqual(water.material.normalMap.offset.toArray(), [0, -.5]);
  assert.ok(Math.abs(water.material.opacity - .7227273) < 1e-6);
  const occluders = service.getTerrainOccluders();
  assert.deepEqual([...new Set(occluders.map(m => m.parent.name))].sort(), [...TERRAIN7_OCCLUDERS].sort());
  assert.ok(!occluders.includes(water));
});

test('Terrain7 has one constant water datum and coherent route/compiler transform after endpoint edits', () => {
  const service = createChallengeService({ terrain7: true });
  service.setEndpoints({ entry: { x: 480, y: -100, z: 140 }, exit: { x: 800, y: 0, z: 140 } });
  const state = service.getState(), challenge = service.getBridgeChallengeInput();
  assert.equal(state.waterDatum.authoredZMm, TERRAIN7_WATER_DATUM_MM);
  assert.equal(challenge.supportProfile.type, 'flat');
  assert.equal(challenge.supportProfile.heightY, 0);
  assert.equal(challenge.worldTransform.translationMm.zMm, 140 - 132.718);
  assert.deepEqual(state.trackRoute.start, state.entry.position);
  assert.deepEqual(state.trackRoute.end, state.exit.position);
  assert.equal(challenge.roadY * challenge.worldTransform.scale + state.waterDatum.machineZMm, 140);
});

test('solid terrain blocks human rays from either side, water exclusion and clear view stay read-only', () => {
  const rock = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  rock.position.z = 5; rock.updateMatrixWorld(true);
  const v = z => new THREE.Vector3(0, 0, z);
  const check = (a, b, meshes = [rock]) => terrainOccludesPoint({ origin: v(a), point: v(b), occluders: meshes }).blocked;
  assert.equal(check(0, 10), true);
  assert.equal(check(10, 0), true);
  assert.equal(check(0, 4), false);
  assert.equal(check(0, 5.5), false, 'one mm precision allowance');
  assert.equal(check(0, 10, []), false, 'water is excluded by explicit collection');
  assert.equal(rock.material.side, THREE.FrontSide);
  assert.equal(rock.material.opacity, 0);
});

test('final Terrain7 builds dynamic inventory with all classes shared and no target/table or feeder overlaps', async () => {
  const h = await constructionHarness({ terrain7: true });
  const workspace = structuredClone(h.controller.workspace);
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const p = h.service.preparedBuild;
  assert.equal(auditPreparedGeometry(p).internalGeometryClear, true);
  assert.equal(p.frozenPlan.planId, h.host.buildPlan.planId);
  assert.equal(p.inventory.count, h.host.buildPlan.billOfMaterials.totalPhysicalParts);
  assert.equal(p.inventory.count, h.board.getTargets().length);
  assert.equal(h.service.getPhysicalReport().invalidTargets.length, 0);
  assert.ok(Math.abs(h.service.getPhysicalReport().physicalBoundsMm.min.zMm - 4) < .001);
  for (const record of p.registry.list()) assert.deepEqual(record.allowedActors, ['human', 'agent']);
  for (const track of p.normalisedBuild.placements.filter(b => b.partClass === 'TRACK_SEGMENT')) {
    for (const other of p.normalisedBuild.placements) if (other !== track) assert.equal(partsOverlap(track, other), false, `track overlaps ${other.placementId}`);
  }
  const live = h.controller.getBricks();
  for (let i = 0; i < live.length; i++) for (let j = 0; j < i; j++) assert.equal(partsOverlap(live[i], live[j]), false);
  assert.deepEqual(h.controller.workspace, workspace);
  await h.service.reset({ expectedWorldRevision: h.controller.worldRevision });
});
