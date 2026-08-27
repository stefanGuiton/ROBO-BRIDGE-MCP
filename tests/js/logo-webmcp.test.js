import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardAdapter } from '../../apps/web/src/bricks/board-adapter.js';
import { makeBrick } from '../../apps/web/src/bricks/brick-spec.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { CHALLENGE_LAYOUT } from '../../apps/web/src/robot/ur10-definition.js';
import { registerLogoWebMcpTools } from '../../apps/web/src/webmcp/register-logo-tools.js';

test('registers the primitive LOGO ROBO WebMCP surface against the shared API', async () => {
  const registered = [];
  const lifecycle = [];
  globalThis.document = {
    modelContext: {
      async registerTool(tool, options) {
        registered.push({ tool, options });
      }
    }
  };
  const api = {
    getSceneState: () => ({ schemaVersion: 'test', bricks: [] }),
    getRobotState: () => ({ tcp: { xMm: 600, yMm: 0, zMm: 450 } }),
    getWorkspace: () => ({ xMinMm: 470, xMaxMm: 710 }),
    moveTool: async (input) => input.xMm > 700
      ? { ok: false, reason: 'outside_workspace' }
      : { ok: true, state: { tcp: input } },
    latch: () => ({ ok: true, success: true, brickId: 'brick' }),
    unlatch: () => ({ ok: false, success: false, reason: 'not_holding' }),
    resetScene: () => ({ ok: true, robot: { robotRevision: 1 } })
  };

  const result = await registerLogoWebMcpTools(api, (event) => lifecycle.push(event));
  assert.equal(result.ok, true);
  assert.equal(result.toolCount, 7);
  assert.deepEqual(result.toolNames, [
    'get_scene_state', 'get_robot_state', 'get_workspace', 'move_tool', 'latch', 'unlatch', 'reset_workcell'
  ]);
  assert.equal(registered.length, 7);
  for (const { tool, options } of registered) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(typeof tool.execute, 'function');
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean');
    assert.ok(options.signal instanceof AbortSignal);
  }

  const names = registered.map(({ tool }) => tool.name);
  assert.equal(names.includes('set_joint_targets'), false);
  assert.equal(names.includes('place_brick'), false);

  const readTool = registered.find(({ tool }) => tool.name === 'get_robot_state').tool;
  assert.deepEqual(await readTool.execute({}), api.getRobotState());
  const moveTool = registered.find(({ tool }) => tool.name === 'move_tool').tool;
  assert.equal((await moveTool.execute({ xMm: 600, yMm: 0, zMm: 300, speedMmS: 500 })).ok, true);
  const rejected = await moveTool.execute({ xMm: 701, yMm: 0, zMm: 300, speedMmS: 500 });
  assert.equal(rejected.ok, false);
  assert.ok(lifecycle.some((event) => event.status === 'discovered' && event.toolName === 'move_tool'));
  assert.ok(lifecycle.some((event) => event.status === 'executing' && event.toolName === 'move_tool'));
  assert.ok(lifecycle.some((event) => event.status === 'succeeded' && event.toolName === 'move_tool'));
  assert.ok(lifecycle.some((event) => event.status === 'rejected' && event.toolName === 'move_tool'));
});

test('returns a clear progressive-enhancement result without WebMCP', async () => {
  globalThis.document = {};
  const result = await registerLogoWebMcpTools({});
  assert.equal(result.ok, false);
  assert.match(result.reason, /modelContext/);
});

test('WebMCP move and latch calls mutate the same controller state used by the UI', async () => {
  const registered = [];
  const board = new BoardAdapter([{ id: 'target', colour: 'white', position: { xMm: 655, yMm: 220, zMm: 34.8 }, yawRad: 0 }]);
  const brick = makeBrick({ id: 'brick', colour: 'white', xMm: 520, yMm: -230, zMm: 34.8 });
  const controller = new RobotController({ board, bricks: [brick], timeScale: 0 });
  globalThis.document = {
    modelContext: {
      async registerTool(tool, options) {
        registered.push({ tool, options });
      }
    }
  };
  const api = {
    getSceneState: () => ({ bricks: controller.getBricks(), targets: board.getTargets() }),
    getRobotState: () => controller.getState(),
    getWorkspace: () => controller.getWorkspace(),
    moveTool: async (input, options) => controller.moveTool({ ...input, signal: options.signal }),
    latch: () => controller.latch(),
    unlatch: () => controller.unlatch(),
    resetScene: () => controller.reset({ bricks: [makeBrick({ id: 'brick', colour: 'white', xMm: 520, yMm: -230, zMm: 34.8 })] })
  };
  await registerLogoWebMcpTools(api);
  const move = registered.find(({ tool }) => tool.name === 'move_tool').tool;
  const latch = registered.find(({ tool }) => tool.name === 'latch').tool;
  const before = controller.getState();
  const moved = await move.execute({ ...CHALLENGE_LAYOUT.pickupTcp, speedMmS: 250 });
  assert.equal(moved.ok, true);
  assert.notDeepEqual(controller.getState().tcp, before.tcp);
  assert.equal((await latch.execute({})).ok, true);
  assert.equal(controller.getState().heldBrickId, 'brick');
});
