import test from 'node:test';
import assert from 'node:assert/strict';

import { createChallengeService } from '../../apps/web/src/challenge/challenge-service.js';
import {
  createEasyBridgeChallenge,
  MAIN_DEMO_BRIDGE_MODEL_SCALE,
  MAIN_DEMO_EASY_DISPLAY_OFFSET
} from '../../apps/web/src/challenge/main-demo-easy.js';
import { MAIN_DEMO_MACHINE_MOUNT } from '../../apps/web/src/challenge/challenge-transforms.js';
import { transformPointToMainDemo } from '../../apps/web/src/bridge-core/world-transform.js';

function makeService() {
  return createChallengeService({
    machineMount: MAIN_DEMO_MACHINE_MOUNT,
    displayOffset: MAIN_DEMO_EASY_DISPLAY_OFFSET
  });
}

test('EASY terrain is deterministically rebased into the robot workspace', async () => {
  const service = makeService();
  const state = await service.load();
  assert.equal(state.presetId, 'EASY');
  assert.equal(state.familyHint, 'AQUEDUCT');
  assert.equal(state.terrainTransform.position.x, -98);
  assert.deepEqual(service.getEntry().position, { x: 650, y: -248, z: 56 });
  assert.deepEqual(service.getExit().position, { x: 650, y: 25.599999999999994, z: 56 });
  assert.equal(service.getTrackRoute().lengthMm, 273.6);
  assert.equal(service.getCollisionProxy().proxies.length, 2);
});

test('one EASY transform aligns bridge-local endpoints with terrain ENTRY and EXIT', async () => {
  const service = makeService();
  await service.load();
  const challenge = createEasyBridgeChallenge(service);
  const entry = transformPointToMainDemo(challenge.entry, challenge.worldTransform);
  const exit = transformPointToMainDemo(challenge.exit, challenge.worldTransform);
  assert.equal(MAIN_DEMO_BRIDGE_MODEL_SCALE, 2);
  assert.deepEqual(entry, { xMm: 650, yMm: -248, zMm: 56 });
  assert.equal(exit.xMm, 650);
  assert.ok(Math.abs(exit.yMm - 25.6) < 1e-9);
  assert.equal(exit.zMm, 56);
  assert.equal(challenge.worldTransform.yawDeg ?? challenge.worldTransform.yawRad * 180 / Math.PI, 90);
});

test('EASY service getters return isolated copies', async () => {
  const service = makeService();
  await service.load();
  const entry = service.getEntry();
  entry.position.x = 9999;
  assert.equal(service.getEntry().position.x, 650);
});
