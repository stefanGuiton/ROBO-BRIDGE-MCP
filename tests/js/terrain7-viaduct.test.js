import test from 'node:test';
import assert from 'node:assert/strict';
import { createMainDemoBridge, TERRAIN7_BRIDGE_INITIAL_SETTINGS } from '../../apps/web/src/bridge/main-demo-bridge.js';
import { createBridgeHost } from '../../apps/web/src/bridge-core/index.js';
import { createBridgeDesignPackage } from '../../apps/web/src/bridge-design/create-bridge-design-package.js';
import { buildTerrain7Preset } from '../../apps/web/src/challenge/terrain7-preset.js';
import { prepareBridgeBuild } from '../../apps/web/src/bridge-construction/bridge-build-session.js';
import { auditPreparedGeometry } from '../../scripts/audit-construction-geometry.mjs';
import { V8_WORKSPACE } from '../../apps/web/src/workcell/v8-workcell-profile.js';
import { partBounds } from '../../apps/web/src/bricks/part-spec.js';
import * as THREE from '../../apps/web/vendor/three.module.min.js';

const preset = () => buildTerrain7Preset('EASY');
const identity = host => ({ revision: host.designRevision, plan: host.buildPlan, settings: host.settings });
const unsupported = (prepared, datum) => prepared.normalisedBuild.placements.filter(p =>
  !p.requiresStructureComplete && !p.dependencyIds.length && partBounds(p).min.zMm > datum + .1);

test('Terrain7 default Viaduct has clean exact geometry/support and preserves physical grid and challenge', async () => {
  const challenge = preset(), machineRoot = new THREE.Group();
  const demo = await createMainDemoBridge({ renderer: { machineRoot, render() {} }, challenge: challenge.bridgeChallengeInput });
  try {
    const { host } = demo, prepared = prepareBridgeBuild({ host, workspace: V8_WORKSPACE });
    assert.equal(host.settings.family, 'viaduct');
    assert.equal(host.settings.viArchCount, 4);
    assert.ok(Math.abs(host.settings.anchorGapX * host.worldTransform.scale - 370) < .001);
    assert.equal(challenge.waterDatum.authoredZMm, -132.718);
    assert.equal(host.worldTransform.translationMm.zMm, challenge.waterDatum.machineZMm);
    assert.deepEqual(challenge.trackRoute.start, challenge.entry.position);
    assert.deepEqual(challenge.trackRoute.end, challenge.exit.position);
    assert.equal(auditPreparedGeometry(prepared).internalGeometryClear, true);
    assert.equal(unsupported(prepared, challenge.waterDatum.machineZMm).length, 0);
    assert.equal(prepared.inventory.count, host.buildPlan.billOfMaterials.totalPhysicalParts);
    assert.ok(prepared.inventory.count < 303, 'smaller than previous Aqueduct, never use its count as runtime truth');
    assert.equal(demo.hologramSnapshot.source.planId, host.buildPlan.planId);
    assert.equal(machineRoot.children.length, 1);
    for (const part of prepared.registry.list()) assert.deepEqual(part.allowedActors, ['human', 'agent']);
    const brick = demo.hologramSnapshot.placements.find(p => p.partType === '1x2x1');
    assert.deepEqual(brick.sizeMm, { xMm: 32, yMm: 16, zMm: 9.6 });
  } finally { demo.dispose(); }
});

test('existing WebMCP arch-count patch atomically replaces the exact scene hologram and resets to hero', async () => {
  const machineRoot = new THREE.Group();
  const demo = await createMainDemoBridge({ renderer: { machineRoot, render() {} }, challenge: preset().bridgeChallengeInput });
  try {
    const { host, bridgeDesign } = demo;
    const before = identity(host), group = demo.hologramGroup, transform = host.worldTransform;
    const changed = await bridgeDesign.invoke('update_bridge_design', {
      expectedDesignRevision: host.designRevision, patch: { viaduct: { archCount: 3 } }
    });
    assert.equal(changed.ok, true, JSON.stringify(changed));
    assert.equal(changed.designRevision, before.revision + 1);
    assert.notEqual(changed.planId, before.plan.planId);
    assert.notEqual(changed.designChecksum, before.plan.designChecksum);
    assert.notEqual(demo.hologramGroup, group);
    assert.equal(machineRoot.children.length, 1);
    assert.equal(demo.hologramSnapshot.source.planId, changed.planId);
    assert.deepEqual(host.settings, { ...before.settings, viArchCount: 3 });
    assert.deepEqual(host.worldTransform, transform);
    const prepared = prepareBridgeBuild({ host, workspace: V8_WORKSPACE });
    assert.equal(auditPreparedGeometry(prepared).internalGeometryClear, true);
    assert.equal(unsupported(prepared, 4).length, 0);
    const reset = await bridgeDesign.invoke('reset_bridge_design', { expectedDesignRevision: host.designRevision });
    assert.equal(reset.ok, true);
    assert.equal(host.settings.viArchCount, 4);
    assert.equal(host.buildPlan.planId, before.plan.planId);
    assert.equal(bridgeDesign.tools.length, 5, 'no new bridge registrar/tool');
  } finally { demo.dispose(); }
});

test('Viaduct rejects six arches at the fixed 370mm span, stale/invalid/cancelled/frozen changes without commit', async () => {
  const host = await createBridgeHost({ initialSettings: TERRAIN7_BRIDGE_INITIAL_SETTINGS,
    challenge: preset().bridgeChallengeInput, challengePolicy: 'locked', compilerOptions: { preferWorker: false } });
  const api = createBridgeDesignPackage({ host }), before = identity(host);
  for (const input of [
    { expectedDesignRevision: host.designRevision - 1, patch: { viaduct: { archCount: 3 } } },
    { expectedDesignRevision: host.designRevision, patch: { viaduct: { archCount: 99 } } },
    { expectedDesignRevision: host.designRevision, patch: { viaduct: { archCount: 6 } } }
  ]) {
    const result = await api.invoke('update_bridge_design', input);
    assert.equal(result.ok, false);
    assert.deepEqual(identity(host), before);
  }
  const abort = new AbortController(); abort.abort();
  assert.equal((await api.invoke('update_bridge_design', { expectedDesignRevision: host.designRevision,
    patch: { viaduct: { archCount: 3 } } }, { signal: abort.signal })).ok, false);
  assert.deepEqual(identity(host), before);
  const release = host.lockConstruction(host.buildPlan.planId);
  try {
    assert.equal((await api.invoke('update_bridge_design', { expectedDesignRevision: host.designRevision,
      patch: { viaduct: { archCount: 3 } } })).ok, false);
    assert.deepEqual(identity(host), before);
  } finally { release(); }
});
