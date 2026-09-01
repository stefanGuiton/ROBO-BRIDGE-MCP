import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeDesignPackage } from '../src/create-bridge-design-package.js';
import { FakeV46Adapter } from './fake-v46-adapter.mjs';

function hostFromAdapter(adapter) {
  return {
    get ready() { return adapter.ready; },
    get settings() { return adapter.getInternalSettings(); },
    get buildPlan() { return adapter.getBuildPlan(); },
    get compiled() { return { metadata: adapter.getRendererSnapshot().metadata }; },
    get renderer() { return { renderStats: adapter.getRendererSnapshot().renderStats }; },
    exportPlan: () => adapter.getBuildPlan(),
    getFamilyPreset: (family) => adapter.getFamilyDefaults(family),
    getCompileState: () => adapter.getCompileState(),
    applySettingsBatch: (candidate, revision, options) => adapter.applyInternalSettings(candidate, revision, options),
    compileExpectedRevision: (revision, options) => adapter.compileCurrent(revision, options)
  };
}

test('package factory creates one service and one five-tool runtime over the supplied host', async () => {
  const source = new FakeV46Adapter();
  const packageRuntime = createBridgeDesignPackage({ host: hostFromAdapter(source), modelContext: null });
  assert.equal(packageRuntime.tools.length, 5);
  const state = await packageRuntime.invoke('get_bridge_design', { includeCapabilities: false });
  assert.equal(state.ok, true);
  assert.equal(state.family, 'aqueduct');
  const registration = await packageRuntime.register();
  assert.equal(registration.ok, false);
  assert.equal(registration.reason, 'native_webmcp_unavailable');
});
