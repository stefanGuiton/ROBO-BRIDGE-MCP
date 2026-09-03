import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../apps/web/vendor/three.module.min.js';
import { measureTerrain7TravelPlane } from '../../apps/web/src/challenge/terrain7-preset.js';
import { createTerrainTravelPolicy } from '../../apps/web/src/robot/terrain-travel-policy.js';
import { movingBodyAabb } from '../../apps/web/src/robot/collision.js';
import { partCollisionBounds, boundsOverlap } from '../../apps/web/src/bricks/part-spec.js';
import { constructionHarness } from '../helpers/construction-harness.js';

test('travel plane uses transformed solid vertices only and excludes water/markers/helpers', () => {
  const root = new THREE.Group();
  const add = (name, z) => {
    const group = new THREE.Group(); group.name = name; group.position.z = z;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2))); root.add(group);
  };
  add('Terrain', 10); add('Tunnel', 20); add('Entry_Structure', 30);
  for (const name of ['Plane', 'ENTRY', 'EXIT', 'hologram', 'debug']) add(name, 10000);
  root.position.z = 1200; root.scale.z = 2;
  const mount = { position: { x: 0, y: 0, z: 1200 } };
  assert.equal(measureTerrain7TravelPlane(root, mount).terrainMaxZMm, 62);
  root.position.z += 15;
  assert.equal(measureTerrain7TravelPlane(root, mount).terrainMaxZMm, 77);
  assert.throws(() => measureTerrain7TravelPlane(new THREE.Group(), mount), /terrain_solid_geometry_unavailable/);
});

test('one frozen travel plane clears actual tool and all payload envelopes without widening workspace', () => {
  const parts = [{ collisionProxy: { sizeMm: { xMm: 30, yMm: 15, zMm: 40 } }, captureProxy: { tcpAboveCentreMm: 23 } }];
  const workspace = { zMinMm: 10, zMaxMm: 600 };
  const before = structuredClone(workspace);
  const policy = createTerrainTravelPolicy({ terrainMaxZMm: 350 }, parts, workspace);
  assert.equal(policy.toolClearanceMm, 2);
  assert.equal(policy.payloadClearanceMm, 43);
  assert.equal(policy.safeTcpTravelZMm, 393.1);
  for (const part of [null, ...parts]) {
    const bounds = movingBodyAabb({ xMm: 0, yMm: 0, zMm: policy.safeTcpTravelZMm }, part);
    assert.ok(bounds.min.zMm > policy.terrainMaxZMm);
  }
  assert.throws(() => createTerrainTravelPolicy({ terrainMaxZMm: 600 }, parts, workspace), { code: 'terrain_travel_plane_outside_workspace' });
  assert.deepEqual(workspace, before);
  assert.equal(createTerrainTravelPolicy(null, parts, workspace), null);
});

test('real Terrain7 placement lifts vertically, transfers on global plane, and restores policy on reset', async () => {
  const h = await constructionHarness({ terrain7: true });
  const workspace = structuredClone(h.controller.workspace);
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const policy = h.coordinator.travelPolicy;
  assert.ok(Number.isFinite(policy.terrainMaxZMm));
  assert.deepEqual(policy.solidNames, ['Terrain', 'Tunnel', 'Entry_Structure']);
  const calls = [], moveTool = h.controller.moveTool.bind(h.controller);
  h.controller.moveTool = request => {
    calls.push({ start: h.controller.getState(), request: { ...request } });
    return moveTool(request);
  };
  const result = await h.service.buildNextParts(1, { expectedWorldRevision: h.controller.worldRevision });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(h.service.getBuildProgress().completed, 1);
  assert.equal(calls.length, 7);
  for (const index of [0, 3, 6]) {
    const { start, request } = calls[index];
    assert.equal(request.xMm, start.tcp.xMm);
    assert.equal(request.yMm, start.tcp.yMm);
    assert.equal(request.yawRad, start.toolYawRad);
    assert.equal(request.zMm, policy.safeTcpTravelZMm);
    assert.equal(request.expectedWorldRevision, start.worldRevision);
  }
  for (const index of [1, 4]) {
    assert.ok(Math.abs(calls[index].start.tcp.zMm - policy.safeTcpTravelZMm) < 0.1);
    assert.equal(calls[index].request.zMm, policy.safeTcpTravelZMm);
  }
  await h.service.reset({ expectedWorldRevision: h.controller.worldRevision });
  assert.equal(h.coordinator.travelPolicy, null);
  assert.deepEqual(h.controller.workspace, workspace);
  h.coordinator.dispose?.();
});

test('out-of-workspace terrain travel plane rejects BUILD before changing authorities', async () => {
  const h = await constructionHarness({ terrain7: true });
  const endpoints = h.challenge.getState();
  h.challenge.setEndpoints({ entry: { ...endpoints.entry.position, z: 700 }, exit: { ...endpoints.exit.position, z: 700 } });
  const revision = h.controller.worldRevision, blueprintId = h.board.blueprintId;
  assert.throws(() => h.service.startBuild({ expectedWorldRevision: revision }), { code: 'terrain_travel_plane_outside_workspace' });
  assert.equal(h.controller.worldRevision, revision);
  assert.equal(h.board.blueprintId, blueprintId);
  assert.equal(h.coordinator.travelPolicy, null);
  assert.equal(h.service.getBuildState().started, false);
});

test('current narrow masonry seat cannot evade the supporting arch by raising only the retreat destination', async () => {
  const h = await constructionHarness({ terrain7: true });
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const placements = h.service.preparedBuild.normalisedBuild.placements;
  const seat = placements.find(p => p.placementId.endsWith('.s.12.0'));
  const arch = placements.find(p => p.placementId === seat.dependencyIds[0]);
  assert.equal(arch.partType, 'ARCH_B');
  const intersects = dz => {
    const tcp = { ...seat.robotTarget.requiredTcp, zMm: seat.robotTarget.requiredTcp.zMm + dz };
    return partCollisionBounds(arch).some(box => boundsOverlap(movingBodyAabb(tcp, null), box));
  };
  assert.equal(intersects(0), true, 'empty gripper intersects an already required support at release');
  assert.equal(intersects(6), true, 'first vertical motion sample remains obstructed');
  assert.equal(intersects(12), false, 'a clear destination does not make the intervening motion safe');
});
