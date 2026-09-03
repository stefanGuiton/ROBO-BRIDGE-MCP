import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeHost, expandBuildPlanPlacements } from '../../apps/web/src/bridge-core/index.js';
import { createBridgeDesignPackage } from '../../apps/web/src/bridge-design/create-bridge-design-package.js';

test('WebMCP width patch compiles two centred rows with exact BOM and stable identities', async () => {
  const host = await createBridgeHost({ initialSettings: { family: 'viaduct' }, compilerOptions: { preferWorker: false } });
  const api = createBridgeDesignPackage({ host });
  const old = host.buildPlan;
  const result = await api.invoke('update_bridge_design', { expectedDesignRevision: host.designRevision, patch: { common: { widthCells: 2 } } });
  assert.equal(result.ok, true, JSON.stringify(result));
  const plan = host.buildPlan;
  assert.equal(plan.geometry.sliceArray.count, 2);
  assert.equal(plan.anchors.bridgeWidth, host.settings.voxelSize * 2);
  assert.notEqual(plan.planId, old.planId);
  const parts = expandBuildPlanPlacements(plan).placements;
  assert.equal(new Set(parts.map(p => p.placementId)).size, parts.length);
  const standard = parts.filter(p => p.partClass === 'STANDARD_BRICK');
  const rows = [...new Set(standard.map(p => p.local.position.z))].sort((a,b)=>a-b);
  assert.deepEqual(rows, [host.settings.anchorGroupZ - host.settings.voxelSize / 2, host.settings.anchorGroupZ + host.settings.voxelSize / 2]);
  assert.equal(standard.length, plan.geometry.masterSlice.placements.length * 2);
  const stale = await api.invoke('update_bridge_design', { expectedDesignRevision: host.designRevision - 1, patch: { common: { widthCells: 3 } } });
  assert.equal(stale.ok, false);
  assert.equal(host.buildPlan.planId, plan.planId);
});
