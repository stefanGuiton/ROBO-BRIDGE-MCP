import test from 'node:test';
import assert from 'node:assert/strict';
import { registerWebMcpTools } from '../../apps/web/src/webmcp/register-tools.js';

test('registers the bounded nine-tool WebMCP surface', async () => {
  const registered = [];
  const lifecycle = [];
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
    moveEndEffector: (input) => input.xMm > 900 ? { ok: false, reason: 'outside_workspace' } : ok({ input }),
    setGripper: (openFraction) => ok({ openFraction }),
    planPickAndPlace: (objectId, destinationId) => ok({ objectId, destinationId }),
    simulateCurrentPlan: async () => ok({ backend: 'test' }),
    executeCurrentPlan: async () => ok({ completed: true }),
    resetWorkcell: () => ok({ reset: true })
  };

  const result = await registerWebMcpTools(api, (event) => lifecycle.push(event));
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
  assert.equal(lifecycle.filter((event) => event.status === 'discovered').length, 9);
  assert.ok(lifecycle.some((event) => event.status === 'executing' && event.toolName === 'get_scene_state'));
  assert.ok(lifecycle.some((event) => event.status === 'succeeded' && event.toolName === 'get_scene_state'));

  const moveTool = registered.find(({ tool }) => tool.name === 'move_end_effector').tool;
  const rejected = JSON.parse(await moveTool.execute({ xMm: 1000, yMm: 0, zMm: 200 }));
  assert.equal(rejected.ok, false);
  assert.ok(lifecycle.some((event) => event.status === 'rejected' && event.toolName === 'move_end_effector'));
});

test('returns a clear progressive-enhancement result without WebMCP', async () => {
  globalThis.document = {};
  const result = await registerWebMcpTools({});
  assert.equal(result.ok, false);
  assert.match(result.reason, /modelContext/);
});
