import test from 'node:test';
import assert from 'node:assert/strict';

import { createBridgeHost, createHologramSnapshot } from '../../apps/web/src/bridge-core/index.js';
import { createBridgeDesignPackage } from '../../apps/web/src/bridge-design/create-bridge-design-package.js';
import {
  MAIN_DEMO_BRIDGE_INITIAL_SETTINGS
} from '../../apps/web/src/bridge/main-demo-bridge.js';
import { createChallengeService } from '../../apps/web/src/challenge/challenge-service.js';
import {
  createEasyBridgeChallenge,
  MAIN_DEMO_EASY_DISPLAY_OFFSET
} from '../../apps/web/src/challenge/main-demo-easy.js';
import { MAIN_DEMO_MACHINE_MOUNT } from '../../apps/web/src/challenge/challenge-transforms.js';
import { registerWebMcpTools } from '../../apps/web/src/webmcp/register-tools.js';
import { createLiveHarness } from '../helpers/live-harness.js';

async function makeBridgePackage() {
  const challengeService = createChallengeService({
    machineMount: MAIN_DEMO_MACHINE_MOUNT,
    displayOffset: MAIN_DEMO_EASY_DISPLAY_OFFSET
  });
  await challengeService.load();
  const host = await createBridgeHost({
    initialSettings: MAIN_DEMO_BRIDGE_INITIAL_SETTINGS,
    challenge: createEasyBridgeChallenge(challengeService),
    challengePolicy: 'locked',
    compilerOptions: { preferWorker: false }
  });
  return { host, bridgeDesign: createBridgeDesignPackage({ host }) };
}

test('V4.6 Aqueduct design updates atomically and the exact hologram follows the committed BuildPlan', async () => {
  const { host, bridgeDesign } = await makeBridgePackage();
  const initial = await bridgeDesign.invoke('get_bridge_design', { includeCapabilities: false });
  assert.equal(initial.ok, true);
  assert.equal(initial.family, 'aqueduct');
  assert.equal(initial.designRevision, 1);
  assert.equal(initial.planId, host.buildPlan.planId);
  assert.equal(initial.designChecksum, host.buildPlan.designChecksum);

  const first = await bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: initial.designRevision,
    patch: { aqueduct: { topArchCount: 3, middleArchCount: 3, bottomArchCount: 2 } }
  });
  assert.equal(first.ok, true);
  assert.equal(first.designRevision, 2);
  assert.notEqual(first.planId, initial.planId);
  assert.notEqual(first.designChecksum, initial.designChecksum);

  const partial = await bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: first.designRevision,
    patch: { aqueduct: { topArchCount: 4, bottomArchCount: 2 } }
  });
  assert.equal(partial.ok, true);
  assert.equal(partial.designRevision, 3);
  assert.equal(partial.bridgeSpec.aqueduct.topArchCount, 4);
  assert.equal(partial.bridgeSpec.aqueduct.middleArchCount, 3);
  assert.equal(partial.bridgeSpec.aqueduct.bottomArchCount, 2);

  const committed = host.buildPlan;
  const hologram = createHologramSnapshot(committed, host.worldTransform, { limit: 5000 });
  assert.equal(hologram.source.planId, partial.planId);
  assert.equal(hologram.source.designChecksum, partial.designChecksum);
  assert.equal(hologram.page.totalAvailable, committed.billOfMaterials.totalPhysicalParts);
  assert.equal(hologram.page.truncated, false);
  assert.ok(hologram.placements.some((item) => item.partClass === 'STANDARD_BRICK'));
  assert.ok(hologram.placements.some((item) => item.partClass === 'ARCH_A' || item.partClass === 'ARCH_B'));
  assert.ok(hologram.placements.some((item) => item.partClass === 'TRACK_SEGMENT'));
  assert.ok(hologram.entryExit.entry.innerFace.yMm < hologram.entryExit.exit.innerFace.yMm);
  const mainDemoBrick = hologram.placements.find((item) => item.partType === '1x2x1');
  assert.deepEqual(mainDemoBrick.sizeMm, { xMm: 32, yMm: 16, zMm: 9.6 });
});

test('stale and invalid bridge patches reject without changing design or hologram source', async () => {
  const { host, bridgeDesign } = await makeBridgePackage();
  const initial = await bridgeDesign.invoke('get_bridge_design', { includeCapabilities: false });
  const committed = await bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: initial.designRevision,
    patch: { aqueduct: { topArchCount: 3, middleArchCount: 3, bottomArchCount: 2 } }
  });
  const before = {
    revision: host.designRevision,
    planId: host.buildPlan.planId,
    checksum: host.buildPlan.designChecksum,
    settings: host.settings
  };

  const stale = await bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: initial.designRevision,
    patch: { aqueduct: { topArchCount: 4 } }
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'STALE_DESIGN_REVISION');

  const invalid = await bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: committed.designRevision,
    patch: { aqueduct: { bottomArchCount: 99 } }
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'OUT_OF_RANGE');
  assert.equal(host.designRevision, before.revision);
  assert.equal(host.buildPlan.planId, before.planId);
  assert.equal(host.buildPlan.designChecksum, before.checksum);
  assert.deepEqual(host.settings, before.settings);
});

test('reset returns EASY Aqueduct to its calibrated MAIN_DEMO preset', async () => {
  const { host, bridgeDesign } = await makeBridgePackage();
  const changed = await bridgeDesign.invoke('update_bridge_design', {
    expectedDesignRevision: host.designRevision,
    patch: { aqueduct: { topArchCount: 3 } }
  });
  assert.equal(changed.ok, true);

  const reset = await bridgeDesign.invoke('reset_bridge_design', {
    expectedDesignRevision: changed.designRevision
  });
  assert.equal(reset.ok, true);
  assert.equal(reset.reset, true);
  assert.equal(reset.bridgeSpec.aqueduct.topArchCount, 4);
  assert.equal(reset.bridgeSpec.aqueduct.middleArchCount, 3);
  assert.equal(reset.bridgeSpec.aqueduct.bottomArchCount, 2);
  assert.equal(host.settings.voxelSize, 8);
  assert.equal(host.settings.brickHeightRatio, 0.6);
});

test('one native registrar preserves fourteen base tools and adds exactly five bounded bridge tools', async () => {
  const registered = [];
  globalThis.document = { modelContext: { async registerTool(tool, options) { registered.push({ tool, options }); } } };
  const { runtime } = createLiveHarness();
  const { bridgeDesign } = await makeBridgePackage();
  const result = await registerWebMcpTools(runtime, () => {}, bridgeDesign.tools);
  assert.equal(result.ok, true);
  assert.equal(result.toolCount, 19);
  assert.equal(registered.length, 19);
  assert.deepEqual(result.toolNames.slice(-5), [
    'get_bridge_design',
    'get_bridge_capabilities',
    'update_bridge_design',
    'get_bridge_build_plan',
    'reset_bridge_design'
  ]);
  assert.equal(new Set(registered.map(({ options }) => options.signal)).size, 1);
  const planTool = registered.find(({ tool }) => tool.name === 'get_bridge_build_plan').tool;
  const bounded = await planTool.execute({ detail: 'placements', cursor: 0, limit: 25 });
  assert.ok(bounded.length <= 12000);
  const parsed = JSON.parse(bounded);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.placements.length <= 20);

  const duplicate = await registerWebMcpTools(runtime, () => {}, [{
    name: 'get_scene_state',
    execute() { return { ok: true }; }
  }]);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'duplicate_tool_name');
});
