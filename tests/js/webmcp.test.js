import test from 'node:test';
import assert from 'node:assert/strict';
import { registerWebMcpTools } from '../../apps/web/src/webmcp/register-tools.js';

test('registers the bounded nine-tool WebMCP surface', async () => {
  const registered = [];
  globalThis.document = {
    modelContext: {
      async registerTool(tool, options) {
        registered.push({ tool, options });
      }
    }
  };
  const ok = (extra = {}) => ({ ok: true, ...extra });
  const api = {
    getSceneState: () => ({ revision: 0, objects: [] }),
    getRobotState: () => ({ revision: 0, joints: {}, cartesian: {}, gripper: {} }),
    analyseReachability: (input) => ok({ input }),
    moveEndEffector: (input) => ok({ input }),
    setGripper: (openFraction) => ok({ openFraction }),
    planPickAndPlace: (objectId, destinationId) => ok({ objectId, destinationId }),
    simulateCurrentPlan: async () => ok({ backend: 'test' }),
    executeCurrentPlan: async () => ok({ completed: true }),
    resetWorkcell: () => ok({ reset: true })
  };

  const result = await registerWebMcpTools(api);
  assert.equal(result.ok, true);
  assert.equal(result.toolCount, 9);
  assert.equal(registered.length, 9);
  assert.equal(new Set(result.toolNames).size, 9);
  for (const { tool, options } of registered) {
    assert.ok(tool.name.length <= 30, tool.name);
    assert.ok(tool.description.length <= 500, tool.name);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(typeof tool.execute, 'function');
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean');
    assert.ok(options.signal instanceof AbortSignal);
  }

  const sceneTool = registered.find(({ tool }) => tool.name === 'get_scene_state').tool;
  const output = await sceneTool.execute({});
  assert.doesNotThrow(() => JSON.parse(output));
});

test('returns a clear progressive-enhancement result without WebMCP', async () => {
  globalThis.document = {};
  const result = await registerWebMcpTools({});
  assert.equal(result.ok, false);
  assert.match(result.reason, /modelContext/);
});
