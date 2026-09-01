import test from 'node:test';
import assert from 'node:assert/strict';
import { BridgeDesignService } from '../src/bridge-design-service.js';
import {
  boundedJson,
  createBridgeToolRuntime,
  getBridgeDesignToolDefinitions,
  registerBridgeWebMcpTools
} from '../src/webmcp-bridge-tools.js';
import { FakeV46Adapter } from './fake-v46-adapter.mjs';

test('surface has five composable tools, strict schemas, and correct read-only hints', () => {
  const service = new BridgeDesignService(new FakeV46Adapter());
  const tools = getBridgeDesignToolDefinitions(service);
  assert.equal(tools.length, 5);
  assert.deepEqual(tools.map((tool) => tool.name), [
    'get_bridge_design',
    'get_bridge_capabilities',
    'update_bridge_design',
    'get_bridge_build_plan',
    'reset_bridge_design'
  ]);
  for (const tool of tools) assert.equal(tool.inputSchema.additionalProperties, false);
  assert.equal(tools.find((tool) => tool.name === 'get_bridge_design').annotations.readOnlyHint, true);
  assert.equal(tools.find((tool) => tool.name === 'update_bridge_design').annotations.readOnlyHint, false);
  assert.equal(tools.find((tool) => tool.name === 'update_bridge_design').inputSchema.properties.patch.properties.aqueduct.additionalProperties, false);
});

test('direct runtime invokes generic structured handlers, not fixed demo scripts', async () => {
  const adapter = new FakeV46Adapter();
  const service = new BridgeDesignService(adapter);
  const runtime = createBridgeToolRuntime(service);
  const state = await runtime.invoke('get_bridge_design', { includeCapabilities: false });
  const update = await runtime.invoke('update_bridge_design', {
    expectedDesignRevision: state.designRevision,
    patch: { aqueduct: { topArchCount: 10 } }
  });
  assert.equal(update.ok, true);
  assert.equal(update.bridgeSpec.aqueduct.topArchCount, 10);
  assert.equal(runtime.tools.some((tool) => /makeAqueductDemo|makeViaductDemo/.test(tool.name)), false);
});

test('registration code uses document.modelContext-compatible registerTool and bounded JSON results', async () => {
  const service = new BridgeDesignService(new FakeV46Adapter());
  const registered = [];
  const modelContext = {
    async registerTool(tool, options) {
      registered.push({ tool, options });
    }
  };
  const lifecycle = [];
  const result = await registerBridgeWebMcpTools({ service, modelContext, onLifecycle: (event) => lifecycle.push(event) });
  assert.equal(result.ok, true);
  assert.equal(registered.length, 5);
  assert.equal(typeof registered[0].tool.execute, 'function');
  const text = await registered[0].tool.execute({ includeCapabilities: false }, {});
  const parsed = JSON.parse(text);
  assert.equal(parsed.ok, true);
  assert.ok(text.length < 16000);
  assert.equal(lifecycle.filter((event) => event.status === 'discovered').length, 5);
});

test('native registration reports unavailable without pretending it passed', async () => {
  const service = new BridgeDesignService(new FakeV46Adapter());
  const result = await registerBridgeWebMcpTools({ service, modelContext: null });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'native_webmcp_unavailable');
});

test('boundedJson reduces oversized placement pages', () => {
  const text = boundedJson({
    ok: true,
    cursor: 0,
    totalAvailable: 100,
    placements: Array.from({ length: 100 }, (_, index) => ({ index, text: 'x'.repeat(300) }))
  }, 3000);
  const result = JSON.parse(text);
  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
  assert.ok(text.length <= 3000);
});

test('direct handlers reject unknown properties and invalid read input types', async () => {
  const runtime = createBridgeToolRuntime(new BridgeDesignService(new FakeV46Adapter()));
  const unknown = await runtime.invoke('get_bridge_design', { extra: true });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'INVALID_PARAMETER');
  const badBoolean = await runtime.invoke('get_bridge_design', { includeCapabilities: 'yes' });
  assert.equal(badBoolean.ok, false);
  assert.equal(badBoolean.error.code, 'INVALID_PARAMETER');
  const missingPatch = await runtime.invoke('update_bridge_design', { expectedDesignRevision: 1 });
  assert.equal(missingPatch.ok, false);
  assert.equal(missingPatch.error.code, 'INVALID_PARAMETER');
});
