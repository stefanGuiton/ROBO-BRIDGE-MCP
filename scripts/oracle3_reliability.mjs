import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixtureRuntime } from '../tests/fixtures/logo-robo-runtime.js';
import { createRuntimeBridge } from '../apps/web/src/webmcp/runtime-bridge.js';
import { createLogoRoboToolHandlers } from '../apps/web/src/webmcp/tool-handlers.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidenceDir = path.join(root, 'evidence', 'oracle3');
fs.mkdirSync(evidenceDir, { recursive: true });

function harness() {
  const runtime = createFixtureRuntime();
  return { runtime, h: createLogoRoboToolHandlers({ bridge: createRuntimeBridge(runtime) }) };
}

async function one(h, transcript = null) {
  const call = async (name, args) => {
    const result = await h[name](args);
    transcript?.push({ tool: name, input: args ?? {}, result });
    if (result?.ok === false) throw new Error(`${name}:${result.reason}`);
    return result;
  };
  const build = await call('getBuildState', { status: 'unfilled', colour: 'white', limit: 10 });
  const target = build.targets[0];
  await call('claimTarget', { targetId: target.id });
  const observation = await call('observeCamera', { cameraId: 'tray_camera', colour: 'white', type: 'brick', limit: 20 });
  const brick = observation.detections[0];
  await call('moveTool', { xMm: brick.worldXmm, yMm: brick.worldYmm, zMm: brick.worldZmm + 100, speedMmS: 500 });
  await call('moveTool', { xMm: brick.worldXmm, yMm: brick.worldYmm, zMm: brick.worldZmm, speedMmS: 180 });
  await call('latch');
  await call('moveTool', { xMm: brick.worldXmm, yMm: brick.worldYmm, zMm: brick.worldZmm + 140, speedMmS: 500 });
  await call('observeCamera', { cameraId: 'canvas_camera', type: 'target', limit: 20 });
  await call('moveTool', { xMm: target.position.xMm, yMm: target.position.yMm, zMm: target.position.zMm + 120, speedMmS: 500 });
  await call('moveTool', { xMm: target.position.xMm, yMm: target.position.yMm, zMm: target.position.zMm, speedMmS: 180 });
  await call('unlatch');
  const final = await call('getBuildState', { limit: 20 });
  if (final.targets.find((candidate) => candidate.id === target.id)?.status !== 'filled') throw new Error('target_not_filled');
  return final;
}

let passed = 0;
const failures = [];
for (let round = 0; round < 50; round += 1) {
  const { h } = harness();
  try {
    await one(h);
    passed += 1;
  } catch (error) {
    failures.push({ round: round + 1, error: String(error) });
  }
}

const recovery = {};
{
  const { runtime, h } = harness();
  const observation = await h.observeCamera({ cameraId: 'tray_camera', colour: 'white', type: 'brick' });
  const brick = observation.detections[0];
  runtime.fixture.takeBrick(brick.objectId);
  const stale = await h.moveTool({ xMm: brick.worldXmm, yMm: brick.worldYmm, zMm: brick.worldZmm, speedMmS: 180 });
  const fresh = await h.observeCamera({ cameraId: 'tray_camera', colour: 'white', type: 'brick' });
  recovery.humanInterference = { pass: stale.reason === 'stale_state' && !fresh.detections.some((candidate) => candidate.objectId === brick.objectId), error: stale.reason };
}
{
  const { h } = harness();
  const result = await h.latch();
  recovery.failedLatch = { pass: result.reason === 'no_brick_in_capture', error: result.reason };
}
{
  const { runtime, h } = harness();
  const before = runtime.robot.getState().tcp;
  const result = await h.moveTool({ xMm: 90, yMm: 120, zMm: 60, speedMmS: 200 });
  recovery.collision = { pass: result.reason === 'collision' && JSON.stringify(runtime.robot.getState().tcp) === JSON.stringify(before), error: result.reason };
}
{
  const { runtime, h } = harness();
  await h.claimTarget({ targetId: 't_001' });
  runtime.fixture.fillTarget('t_001');
  const state = await h.getBuildState({ limit: 20 });
  recovery.targetOccupied = { pass: state.targets.find((target) => target.id === 't_001').status === 'filled' && state.targets.some((target) => target.id === 't_002' && target.status === 'unfilled') };
}

const transcript = [];
{
  const { h } = harness();
  await one(h, transcript);
}
const compactTranscript = transcript.map((entry) => ({
  tool: ({ getBuildState: 'get_build_state', claimTarget: 'claim_target', observeCamera: 'observe_camera', moveTool: 'move_tool', latch: 'latch', unlatch: 'unlatch' })[entry.tool],
  input: entry.input,
  summary: entry.result?.ok === false
    ? entry.result.reason
    : entry.result?.targetSnap?.targetId
      ? `placed ${entry.result.targetSnap.targetId}`
      : entry.result?.heldBrickId
        ? `held ${entry.result.heldBrickId}`
        : entry.result?.detections
          ? `${entry.result.detections.length} detections`
          : entry.result?.accepted === true ? 'accepted' : 'ok'
}));
const output = { generatedAt: new Date().toISOString(), rounds: 50, passed, failed: 50 - passed, passRate: passed / 50, recovery, failures };
fs.writeFileSync(path.join(evidenceDir, 'reliability-results.json'), `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(path.join(evidenceDir, 'tool-transcript.md'), `# Oracle 3 primitive agent loop transcript\n\n${compactTranscript.map((entry, index) => `${index + 1}. \`${entry.tool}\` — ${entry.summary}`).join('\n')}\n\nNo high-level pick/place/build tool was used.\n`);
console.log(JSON.stringify(output, null, 2));
