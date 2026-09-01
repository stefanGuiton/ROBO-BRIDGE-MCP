import test from 'node:test';
import assert from 'node:assert/strict';
import { registerWebMcpTools, getLogoRoboToolDefinitions } from '../../apps/web/src/webmcp/register-tools.js';
import { createLiveHarness } from '../helpers/live-harness.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parse(value) { return typeof value === 'string' ? JSON.parse(value) : value; }

test('registers one bounded primitive production surface with exact controller limits', async () => {
  const registered = [];
  globalThis.document = { modelContext: { async registerTool(tool, options) { registered.push({ tool, options }); } } };
  const { runtime, handlers } = createLiveHarness();
  const result = await registerWebMcpTools(runtime);
  assert.equal(result.ok, true);
  assert.deepEqual(result.toolNames, ['get_scene_state','get_build_state','get_robot_state','get_workspace','observe_camera','preview_placement','get_placement_stream_status','plan_placement_queue','execute_next_placement','move_tool','latch','unlatch','claim_target','reset_workcell']);
  assert.equal(registered.length, 14);
  const definitions = getLogoRoboToolDefinitions(handlers);
  const move = definitions.find((tool) => tool.name === 'move_tool');
  const observe = definitions.find((tool) => tool.name === 'observe_camera');
  const queue = definitions.find((tool) => tool.name === 'plan_placement_queue');
  const streamStatus = definitions.find((tool) => tool.name === 'get_placement_stream_status');
  const execute = definitions.find((tool) => tool.name === 'execute_next_placement');
  assert.equal(move.inputSchema.properties.xMm.minimum, 470);
  assert.equal(move.inputSchema.properties.xMm.maximum, 710);
  assert.equal(move.inputSchema.properties.speedMmS.maximum, 650);
  assert.equal(move.inputSchema.properties.yawDeg.minimum, -360);
  assert.equal(move.inputSchema.properties.yawDeg.maximum, 360);
  assert.ok(move.inputSchema.required.includes('expectedWorldRevision'));
  assert.deepEqual(observe.inputSchema.properties.cameraId.enum, [
    'tray_camera','canvas_camera','top_camera','left_camera','right_camera','user_camera'
  ]);
  assert.equal(queue.inputSchema.properties.placements.maxItems, 50);
  assert.equal(queue.inputSchema.properties.placements.items.properties.dependsOnPlacementIds.maxItems, 20);
  assert.equal(queue.inputSchema.properties.placements.items.properties.dependsOnPlacementIds.uniqueItems, true);
  assert.equal(queue.inputSchema.properties.mode.enum.length, 2);
  assert.equal(queue.inputSchema.properties.cycleTimeMs.default, 1000);
  assert.equal(queue.inputSchema.properties.cycleTimeMs.minimum, 250);
  assert.equal(queue.annotations.readOnlyHint, true);
  assert.equal(streamStatus.inputSchema.properties.limit.maximum, 50);
  assert.equal(streamStatus.annotations.readOnlyHint, true);
  assert.equal(execute.annotations.readOnlyHint, false);
  assert.ok(execute.inputSchema.required.includes('expectedWorldRevision'));
  for (const { tool, options } of registered) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('authoritative scene read is bounded and preserves the world revision', async () => {
  const registered = [];
  globalThis.document = { modelContext: { async registerTool(tool, options) { registered.push({ tool, options }); } } };
  const { runtime } = createLiveHarness();
  await registerWebMcpTools(runtime);
  const before = runtime.getWorldRevision();
  const scene = parse(await registered.find(({ tool }) => tool.name === 'get_scene_state').tool.execute({ type: 'brick', limit: 3 }));
  assert.equal(scene.ok, true);
  assert.equal(scene.worldRevision, before);
  assert.equal(scene.objects.length, Math.min(3, scene.totalAvailable));
  assert.ok(scene.objects.every((object) => object.type === 'brick'));
  assert.equal(runtime.getWorldRevision(), before);
});

test('native tool-call abort signal reaches the production controller and cancels motion', async () => {
  const registered = [];
  globalThis.document = { modelContext: { async registerTool(tool, options) { registered.push({ tool, options }); } } };
  const { runtime, controller } = createLiveHarness({ timeScale: 0.25 });
  await registerWebMcpTools(runtime);
  const observe = registered.find(({ tool }) => tool.name === 'observe_camera').tool;
  const move = registered.find(({ tool }) => tool.name === 'move_tool').tool;
  const observation = parse(await observe.execute({ cameraId: 'tray_camera', type: 'brick', limit: 20 }));
  const brick = observation.detections[0];
  const aborter = new AbortController();
  const promise = move.execute({ ...brick.recommendedTcp, zMm: 400, speedMmS: 60, expectedWorldRevision: observation.snapshotRevision }, { signal: aborter.signal });
  await sleep(15);
  aborter.abort();
  const result = parse(await promise);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(controller.getState().moving, false);
  assert.equal(controller.getState().operationState, 'idle');
});

test('registration failure is contained and aborts partial registrations', async () => {
  let count = 0;
  globalThis.document = { modelContext: { async registerTool() { count += 1; if (count === 3) throw new Error('synthetic registration failure'); } } };
  const { runtime } = createLiveHarness();
  const result = await registerWebMcpTools(runtime);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tool_registration_failed');
  assert.equal(result.registeredNames.length, 2);
});

test('without modelContext the application gets a clean progressive-enhancement result', async () => {
  globalThis.document = {};
  const { runtime } = createLiveHarness();
  const result = await registerWebMcpTools(runtime);
  assert.equal(result.ok, false);
  assert.match(result.reason, /modelContext/);
});

test('runtime internal exceptions are not mislabeled as runtime unavailable and do not expose raw details', async () => {
  const { runtime, bridge } = createLiveHarness();
  const original = runtime.robot.moveTool;
  runtime.robot.moveTool = async () => { throw new Error('secret internal stack detail'); };
  const result = await bridge.robot.moveTool({ xMm: 600, yMm: 0, zMm: 400, speedMmS: 100 });
  runtime.robot.moveTool = original;
  assert.equal(result.reason, 'internal_error');
  assert.doesNotMatch(result.message, /secret/);
});

test('large valid read output is truncated without being relabeled invalid input', async () => {
  const registered = [];
  globalThis.document = { modelContext: { async registerTool(tool, options) { registered.push({ tool, options }); } } };
  const { runtime } = createLiveHarness();
  await registerWebMcpTools(runtime);
  const buildTool = registered.find(({ tool }) => tool.name === 'get_build_state').tool;
  const original = runtime.game.getBuildState;
  runtime.game.getBuildState = async () => ({
    ok: true,
    worldRevision: runtime.getWorldRevision(),
    progress: { correctTargets: 0, totalTargets: 200, percent: 0 },
    targets: Array.from({ length: 200 }, (_, index) => ({ id: `t_${index}`, status: 'unfilled', colour: 'red', padding: 'x'.repeat(180) }))
  });
  try {
    const result = parse(await buildTool.execute({ limit: 20 }));
    assert.equal(result.ok, true);
    assert.equal(result.truncated, true);
    assert.ok(result.returnedCount < result.totalAvailable);
  } finally {
    runtime.game.getBuildState = original;
  }
});
