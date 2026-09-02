import test from 'node:test';
import assert from 'node:assert/strict';

import { createChallengeService } from '../../apps/web/src/challenge/challenge-service.js';
import {
  createEasyBridgeChallenge,
  MAIN_DEMO_BRIDGE_MODEL_SCALE,
  MAIN_DEMO_EASY_CHALLENGE_YAW_DEG,
  MAIN_DEMO_EASY_DISPLAY_OFFSET
} from '../../apps/web/src/challenge/main-demo-easy.js';
import { MAIN_DEMO_MACHINE_MOUNT } from '../../apps/web/src/challenge/challenge-transforms.js';
import { transformPointToMainDemo } from '../../apps/web/src/bridge-core/world-transform.js';
import { endpointToMachine, endpointToTable } from '../../apps/web/src/challenge/endpoint-settings.js';
import { sourceToDisplay } from '../../apps/web/src/challenge/challenge-transforms.js';

function makeService() {
  return createChallengeService({
    machineMount: MAIN_DEMO_MACHINE_MOUNT,
    displayOffset: MAIN_DEMO_EASY_DISPLAY_OFFSET,
    challengeYawDeg: MAIN_DEMO_EASY_CHALLENGE_YAW_DEG
  });
}

test('EASY terrain is deterministically rebased and rotated across the table width', async () => {
  const service = makeService();
  const state = await service.load();
  assert.equal(state.presetId, 'EASY');
  assert.equal(state.familyHint, 'AQUEDUCT');
  assert.equal(state.terrainTransform.yawDeg, -90);
  assert.ok(Math.abs(service.getEntry().position.x - 513.2) < 1e-9);
  assert.ok(Math.abs(service.getEntry().position.y - -111.2) < 1e-9);
  assert.ok(Math.abs(service.getExit().position.x - 786.8) < 1e-9);
  assert.ok(Math.abs(service.getExit().position.y - -111.2) < 1e-9);
  assert.equal(service.getEntry().position.z, 56);
  assert.equal(service.getExit().position.z, 56);
  assert.ok(Math.abs(service.getTrackRoute().lengthMm - 273.6) < 1e-9);
  assert.ok(state.bounds.terrain.max.x - state.bounds.terrain.min.x > state.bounds.terrain.max.y - state.bounds.terrain.min.y);
  assert.equal(service.getCollisionProxy().proxies.length, 2);
});

test('one EASY transform aligns bridge-local endpoints with terrain ENTRY and EXIT', async () => {
  const service = makeService();
  await service.load();
  const challenge = createEasyBridgeChallenge(service);
  const entry = transformPointToMainDemo(challenge.entry, challenge.worldTransform);
  const exit = transformPointToMainDemo(challenge.exit, challenge.worldTransform);
  assert.equal(MAIN_DEMO_BRIDGE_MODEL_SCALE, 2);
  assert.ok(Math.abs(entry.xMm - 513.2) < 1e-9);
  assert.ok(Math.abs(entry.yMm - -111.2) < 1e-9);
  assert.ok(Math.abs(exit.xMm - 786.8) < 1e-9);
  assert.ok(Math.abs(exit.yMm - -111.2) < 1e-9);
  assert.equal(exit.zMm, 56);
  assert.ok(Math.abs((challenge.worldTransform.yawDeg ?? challenge.worldTransform.yawRad * 180 / Math.PI)) < 1e-9);
});

test('EASY service getters return isolated copies', async () => {
  const service = makeService();
  await service.load();
  const entry = service.getEntry();
  entry.position.x = 9999;
  assert.ok(Math.abs(service.getEntry().position.x - 513.2) < 1e-9);
});

test('rotated terrain collision banks stay in the display frame when the machine mount yaw changes', async () => {
  const service = createChallengeService({
    machineMount: { position: { ...MAIN_DEMO_MACHINE_MOUNT.position }, yawDeg: 90 },
    displayOffset: MAIN_DEMO_EASY_DISPLAY_OFFSET,
    challengeYawDeg: MAIN_DEMO_EASY_CHALLENGE_YAW_DEG
  });
  await service.load();
  const [entryBank, exitBank] = service.getCollisionProxy().proxies;
  for (const bank of [entryBank, exitBank]) {
    assert.ok(bank.max.x - bank.min.x < bank.max.y - bank.min.y, 'display-X crossing must split banks along display X');
  }
  const route = service.getTrackRoute();
  assert.ok(Math.abs(route.direction.x) < 1e-9);
  assert.ok(Math.abs(route.direction.y + 1) < 1e-9);
});

test('editable endpoint XYZ moves the bridge, terrain anchors and route through one transform', () => {
  const service = makeService();
  const points = { entry: { x: 450, y: -160, z: 180 }, exit: { x: 810, y: 80, z: 180 } };
  const before = service.getState();
  service.previewEndpoints(points);
  assert.deepEqual(service.getState(), before, 'preview must not mutate challenge');
  service.setEndpoints(points);
  const challenge = createEasyBridgeChallenge(service), state = service.getState();
  for (const [name, sourceX] of [['entry', -0.30], ['exit', 0.46]]) {
    const p = transformPointToMainDemo(challenge[name], challenge.worldTransform);
    for (const a of ['x', 'y', 'z']) assert.ok(Math.abs(p[a + 'Mm'] - points[name][a]) < 1e-7);
    const terrainAnchor = sourceToDisplay({ x: sourceX, y: 0, z: -0.2 }, state.terrainTransform);
    assert.ok(Math.abs(terrainAnchor.x - state[name].displayPosition.x) < 1e-7);
    assert.ok(Math.abs(terrainAnchor.y - state[name].displayPosition.y) < 1e-7);
  }
  assert.deepEqual(service.getTrackRoute().start, service.getEntry().position);
  assert.deepEqual(service.getTrackRoute().end, service.getExit().position);
  assert.equal(challenge.worldTransform.scale, 2);
});

test('invalid or sloping endpoint requests preserve the active challenge', () => {
  const service = makeService(), before = service.getState();
  const entry = service.getEntry().position, exit = service.getExit().position;
  assert.throws(() => service.setEndpoints({ entry, exit: { ...exit, z: entry.z + 10 } }), /level/);
  assert.throws(() => service.setEndpoints({ entry, exit: entry }), /distance/);
  assert.throws(() => service.setEndpoints({ entry: { ...entry, x: NaN }, exit }), /finite/);
  assert.deepEqual(service.getState(), before);
});

test('endpoint controls use table-centred XY and height above tabletop with rotated mounts', () => {
  const settings = { tableXmm: 35, tableYmm: -20, tableYawDeg: 30, tableTopHeightMm: 1200,
    robotMountXmm: -820, robotMountYmm: 170, robotMountZmm: 1150, robotMountYawDeg: 80 };
  const table = { x: -230, y: 95, z: 180 };
  const machine = endpointToMachine(table, settings), roundtrip = endpointToTable(machine, settings);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(roundtrip[axis] - table[axis]) < 1e-7);
  assert.equal(machine.z, 230);
});
