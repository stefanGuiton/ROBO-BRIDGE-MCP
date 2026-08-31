import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservationService } from '../../apps/web/src/perception/observation-service.js';
import { createRuntimeBridge } from '../../apps/web/src/webmcp/runtime-bridge.js';
import { createLiveHarness } from '../helpers/live-harness.js';


test('production observation is atomic, bounded, actionable, and excludes structure occluders', async () => {
  const { handlers } = createLiveHarness();
  const result = await handlers.observeCamera({ cameraId: 'tray_camera', type: 'brick', limit: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.approximateOcclusion, true);
  assert.equal(result.camera.coordinateFrame, 'machine-mm-rad');
  assert.equal(result.camera.matrixConvention, 'row-major; column-vector; clip=P*V*point');
  assert.ok(['orthographic', 'perspective'].includes(result.camera.projection));
  assert.ok(result.detections.length >= 2);
  assert.ok(result.detections.every((detection) => detection.type === 'brick'));
  assert.ok(result.detections.every((detection) => Number.isFinite(detection.recommendedTcp?.zMm)));
  assert.ok(result.detections.every((detection) => detection.recommendedTcp.zMm > detection.worldZmm));
  assert.ok(result.detections.every((detection) => detection.visibilityModel === 'five-ray-aabb-approximation'));
});

test('runtime-unavailable observation fails instead of reporting an empty camera', async () => {
  const service = createObservationService({ bridge: createRuntimeBridge(null) });
  const result = await service.observe({ cameraId: 'tray_camera' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'runtime_unavailable');
});

test('authoritative user camera fails closed when the renderer camera is unavailable', async () => {
  const bridge = {
    runtimeCameraAuthority: true,
    getCamera: () => null,
    world: { async getSnapshotData() { return { worldRevision: 4, objects: [] }; } }
  };
  const result = await createObservationService({ bridge }).observe({ cameraId: 'user_camera' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'camera_unavailable');
});

test('observation uses one atomic runtime snapshot revision', async () => {
  let externalRevision = 1;
  const bridge = {
    getWorldRevision: () => externalRevision,
    getCamera: () => null,
    world: {
      async getSnapshotData() {
        const snapshot = {
          worldRevision: 7,
          objects: [{ id: 'b', type: 'brick', colour: 'red', position: { xMm: 430, yMm: -180, zMm: 20 }, bounds: { xMm: 32, yMm: 16, zMm: 9.6 }, visible: true, occluder: true }]
        };
        externalRevision = 99;
        return snapshot;
      }
    }
  };
  const service = createObservationService({ bridge });
  const result = await service.observe({ cameraId: 'tray_camera' });
  assert.equal(result.ok, true);
  assert.equal(result.snapshotRevision, 7);
  assert.equal(result.detections[0].objectId, 'b');
});

test('read-only perception and build-state calls do not mutate activity/world state', async () => {
  const { handlers, controller } = createLiveHarness();
  const before = controller.getState().worldRevision;
  await handlers.getBuildState({ limit: 20 });
  await handlers.observeCamera({ cameraId: 'tray_camera', limit: 20 });
  assert.equal(controller.getState().worldRevision, before);
  assert.deepEqual(handlers.activity.list(), []);
});
