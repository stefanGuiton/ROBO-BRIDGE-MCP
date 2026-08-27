import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixtureRuntime } from '../tests/fixtures/logo-robo-runtime.js';
import { createRuntimeBridge } from '../apps/web/src/webmcp/runtime-bridge.js';
import { createLogoRoboToolHandlers } from '../apps/web/src/webmcp/tool-handlers.js';
import { projectWorldPoint, topFaceWorldCorners } from '../apps/web/src/perception/projection.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidenceDir = path.join(root, 'evidence', 'oracle3');
fs.mkdirSync(evidenceDir, { recursive: true });

function polygonFor(object, camera) {
  return topFaceWorldCorners(object).map((point) => projectWorldPoint(point, camera)).filter(Boolean).map((point) => [point.xPx, point.yPx]);
}

async function makeScenario(name) {
  const runtime = createFixtureRuntime();
  const bridge = createRuntimeBridge(runtime);
  const handlers = createLogoRoboToolHandlers({ bridge });
  let selected = null;
  let target = null;
  async function select(latch = false) {
    const observation = await handlers.observeCamera({ cameraId: 'tray_camera', colour: 'white', type: 'brick', limit: 20 });
    selected = observation.detections[0];
    await handlers.moveTool({ xMm: selected.worldXmm, yMm: selected.worldYmm, zMm: selected.worldZmm + 100, speedMmS: 500 });
    if (latch) {
      await handlers.moveTool({ xMm: selected.worldXmm, yMm: selected.worldYmm, zMm: selected.worldZmm, speedMmS: 180 });
      await handlers.latch();
    }
  }
  if (name === 'observe') await handlers.observeCamera({ cameraId: 'tray_camera', limit: 50 });
  if (name === 'target' || name === 'move') await select(false);
  if (name === 'latched') await select(true);
  if (name === 'canvas') {
    await handlers.claimTarget({ targetId: 't_001' });
    target = 't_001';
    await handlers.observeCamera({ cameraId: 'canvas_camera', type: 'target', limit: 20 });
  }
  if (name === 'placed') {
    const build = await handlers.getBuildState({ status: 'unfilled', colour: 'white', limit: 10 });
    const selectedTarget = build.targets[0];
    target = selectedTarget.id;
    await handlers.claimTarget({ targetId: selectedTarget.id });
    await select(true);
    await handlers.moveTool({ xMm: selected.worldXmm, yMm: selected.worldYmm, zMm: selected.worldZmm + 140, speedMmS: 500 });
    await handlers.moveTool({ xMm: selectedTarget.position.xMm, yMm: selectedTarget.position.yMm, zMm: selectedTarget.position.zMm + 120, speedMmS: 500 });
    await handlers.moveTool({ xMm: selectedTarget.position.xMm, yMm: selectedTarget.position.yMm, zMm: selectedTarget.position.zMm, speedMmS: 180 });
    await handlers.unlatch();
    await handlers.getBuildState({ limit: 20 });
    await handlers.observeCamera({ cameraId: 'canvas_camera', limit: 20 });
    await handlers.observeCamera({ cameraId: 'tray_camera', limit: 20 });
  }
  if (name === 'recovery') {
    const observation = await handlers.observeCamera({ cameraId: 'tray_camera', colour: 'white', type: 'brick' });
    selected = observation.detections[0];
    runtime.fixture.takeBrick(selected.objectId);
    await handlers.moveTool({ xMm: selected.worldXmm, yMm: selected.worldYmm, zMm: selected.worldZmm, speedMmS: 180 });
    await handlers.observeCamera({ cameraId: 'tray_camera', colour: 'white', type: 'brick' });
  }
  const tray = handlers.observationService.getSnapshot('tray_camera') ?? await handlers.observeCamera({ cameraId: 'tray_camera', limit: 50 });
  const canvas = handlers.observationService.getSnapshot('canvas_camera') ?? await handlers.observeCamera({ cameraId: 'canvas_camera', type: 'target', limit: 50 });
  const state = runtime.fixture.getState();
  const trayCamera = handlers.observationService.cameraRig.getCamera('tray_camera', runtime.getWorldRevision());
  const canvasCamera = handlers.observationService.cameraRig.getCamera('canvas_camera', runtime.getWorldRevision());
  return {
    name,
    worldRevision: runtime.getWorldRevision(),
    robot: runtime.robot.getState(),
    state,
    tray,
    canvas,
    active: handlers.observationService.getActiveDetection(),
    activity: handlers.activity.list(),
    target,
    trayPolygons: state.bricks.filter((brick) => brick.visible !== false).map((object) => ({ id: object.id, colour: object.colour, state: object.state, points: polygonFor(object, trayCamera) })),
    canvasPolygons: state.targets.map((object) => ({ id: object.id, colour: object.colour, status: object.status, claimOwner: object.claimOwner, points: polygonFor(object, canvasCamera) }))
  };
}

const names = ['observe', 'target', 'latched', 'canvas', 'placed', 'recovery'];
const output = { generatedAt: new Date().toISOString(), scenarios: {} };
for (const name of names) output.scenarios[name] = await makeScenario(name);
fs.writeFileSync(path.join(evidenceDir, 'visual-scenarios.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(names.map((name) => `${name}: rev ${output.scenarios[name].worldRevision}, phase ${output.scenarios[name].activity[0]?.state}`).join('\n'));
