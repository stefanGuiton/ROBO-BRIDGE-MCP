import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardAdapter } from '../../apps/web/src/bricks/board-adapter.js';
import { makeBrick } from '../../apps/web/src/bricks/brick-spec.js';
import { createObservationService } from '../../apps/web/src/perception/observation-service.js';
import { createLogoRoboRuntime } from '../../apps/web/src/logo/runtime.js';
import { createRuntimeBridge } from '../../apps/web/src/webmcp/runtime-bridge.js';
import { createLogoRoboToolHandlers } from '../../apps/web/src/webmcp/tool-handlers.js';
import { BRICK_SPEC } from '../../apps/web/src/bricks/brick-spec.js';
import { CHALLENGE_LAYOUT } from '../../apps/web/src/robot/ur10-definition.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';

function makeHarness() {
  const brick = makeBrick({
    id: 'brick-white-001',
    colour: 'white',
    xMm: CHALLENGE_LAYOUT.pickupTcp.xMm,
    yMm: CHALLENGE_LAYOUT.pickupTcp.yMm,
    zMm: CHALLENGE_LAYOUT.tray.floorZ + 4.8
  });
  const target = {
    id: 'target-white-001',
    colour: 'white',
    position: {
      xMm: CHALLENGE_LAYOUT.targetTcp.xMm,
      yMm: CHALLENGE_LAYOUT.targetTcp.yMm,
      zMm: CHALLENGE_LAYOUT.board.surfaceZ + 4.8
    },
    yawRad: 0
  };
  const board = new BoardAdapter([target]);
  const controller = new RobotController({ board, bricks: [brick], timeScale: 0 });
  const runtime = createLogoRoboRuntime({ controller, board });
  const bridge = createRuntimeBridge(runtime);
  const handlers = createLogoRoboToolHandlers({ bridge });
  return { board, controller, runtime, handlers };
}

test('production adapter exposes the same authoritative robot, board, and cameras', async () => {
  const { controller, runtime, handlers } = makeHarness();
  assert.equal(runtime.getWorldRevision(), controller.getState().worldRevision);
  const build = await handlers.getBuildState({ limit: 10 });
  assert.equal(build.ok, true);
  assert.equal(build.targets[0].id, 'target-white-001');
  const tray = await handlers.observeCamera({ cameraId: 'tray_camera', type: 'brick', limit: 10 });
  const canvas = await handlers.observeCamera({ cameraId: 'canvas_camera', type: 'target', limit: 10 });
  assert.equal(tray.ok, true);
  assert.equal(canvas.ok, true);
  assert.equal(tray.detections[0].objectId, 'brick-white-001');
  assert.equal(canvas.detections[0].objectId, 'target-white-001');
});

test('Oracle 3 primitive handlers execute a complete move, latch, place, and verify loop on the live controller', async () => {
  const { controller, runtime, handlers } = makeHarness();
  const target = (await handlers.getBuildState({ status: 'unfilled', limit: 10 })).targets[0];
  assert.equal((await handlers.claimTarget({ targetId: target.id })).ok, true);
  const observation = await handlers.observeCamera({ cameraId: 'tray_camera', type: 'brick', limit: 10 });
  const brick = observation.detections[0];
  assert.ok(brick);
  assert.equal((await handlers.moveTool({ xMm: brick.worldXmm, yMm: brick.worldYmm, zMm: brick.worldZmm + 100, speedMmS: 500 })).ok, true);
  assert.equal((await handlers.moveTool({ xMm: brick.worldXmm, yMm: brick.worldYmm, zMm: brick.worldZmm + BRICK_SPEC.capture.tcpAboveCentreMm, speedMmS: 220 })).ok, true);
  assert.equal((await handlers.latch()).ok, true);
  assert.equal(controller.getState().heldBrickId, 'brick-white-001');
  assert.equal((await handlers.moveTool({ xMm: brick.worldXmm, yMm: brick.worldYmm, zMm: brick.worldZmm + 140, speedMmS: 500 })).ok, true);
  assert.equal((await handlers.moveTool({ xMm: target.position.xMm, yMm: target.position.yMm, zMm: target.position.zMm + 120, speedMmS: 500 })).ok, true);
  assert.equal((await handlers.moveTool({ xMm: target.position.xMm, yMm: target.position.yMm, zMm: target.position.zMm + BRICK_SPEC.capture.tcpAboveCentreMm, speedMmS: 180 })).ok, true);
  const release = await handlers.unlatch();
  assert.equal(release.ok, true);
  assert.equal(release.targetSnap.targetId, target.id);
  assert.equal(release.correctness, true);
  const final = await handlers.getBuildState({ status: 'filled', limit: 10 });
  assert.equal(final.progress.correctTargets, 1);
  assert.equal(final.targets[0].status, 'filled');
  assert.equal((await runtime.world.getObjectById('brick-white-001')).state, 'snapped');
});

test('production adapter preserves the accepted pose after invalid motion', async () => {
  const { controller, handlers } = makeHarness();
  const before = controller.getState().tcp;
  const result = await handlers.moveTool({ xMm: 9999, yMm: 0, zMm: 300, speedMmS: 200 });
  assert.equal(result.ok, false);
  assert.deepEqual(controller.getState().tcp, before);
  assert.equal(result.reason, 'invalid_input');
});
