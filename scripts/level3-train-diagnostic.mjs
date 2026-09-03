// Explicit real-runtime diagnostic, not a complete Level 3 acceptance gate.
// Native tools mutate only this isolated browser's simulator. Evidence opt-in.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ChromiumSession } from '../tools/submission/cdp-browser.mjs';

const writeEvidence = process.argv.includes('--write-evidence');
const output = path.resolve(process.env.ROBO_LEVEL3_OUTPUT ?? 'output/playwright/level3-train-diagnostic');
const url = process.env.ROBO_LEVEL3_URL ?? 'http://127.0.0.1:8774/?demo=train&level=3';
const report = { purpose: 'Current production TCP Train diagnostic; NOT full crossing acceptance',
  url, startedAt: new Date().toISOString(), checks: [], screenshots: [], diagnosticCompleted: false };
if (writeEvidence) await mkdir(output, { recursive: true });
const browser = await ChromiumSession.launch({ viewport: [1440, 900], args: ['--enable-experimental-web-platform-features'] });
const evaluate = (fn, argument = null, options = {}) => browser.evaluate(`(${fn.toString()})(${JSON.stringify(argument)})`, options);
async function nativeCall(name, input = {}) {
  const result = await evaluate(({ name, input }) => {
    const testing = document.modelContextTesting ?? navigator.modelContextTesting;
    if (!testing?.executeTool) throw new Error('Native WebMCP unavailable');
    return testing.executeTool(name, JSON.stringify(input));
  }, { name, input }, { timeoutMs: 120_000 });
  return typeof result === 'string' ? JSON.parse(result) : result;
}
const sessionInput = state => ({ expectedMissionId: state.missionId,
  expectedMissionRevision: state.revisions.missionRevision, expectedWorldRevision: state.revisions.worldRevision });
async function capture(name) {
  if (!writeEvidence) return;
  const file = path.join(output, `${name}.png`);
  await browser.screenshot(file); report.screenshots.push(file);
}
async function snapshot() {
  return evaluate(async () => {
    const r = window.__ROBO_BRIDGE__, train = r.train.getDetailedSnapshot();
    return { mission: await r.mission.getMissionState({ detail: 'detail' }), train,
      board: r.board.progress(), robot: r.robotController.getState(), pendingMoves: r.robotController.pendingMoveCount,
      pusher: r.train.getSubsystem()?.pusherAdapter.getSnapshot(), terrain: r.train.getTerrainDiagnostics(),
      statsText: document.querySelector('[data-level3-results]')?.textContent ?? null };
  });
}
try {
  report.browser = browser.version.product;
  await browser.navigate(url);
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 90_000 });
  report.nativeTools = await evaluate(async () => (await (document.modelContextTesting ?? navigator.modelContextTesting).listTools()).map(t => t.name));
  assert.equal(new Set(report.nativeTools).size, 31);
  const design = await nativeCall('get_bridge_design');
  const before = await nativeCall('get_mission_state');
  assert.equal(before.ok, true);
  report.freeze = await nativeCall('start_bridge_build', { ...sessionInput(before), expectedDesignRevision: design.designRevision });
  assert.equal(report.freeze.ok, true, JSON.stringify(report.freeze));
  report.initial = await snapshot();
  assert.equal(report.initial.train.motion.mode, 'tcp_contact');
  assert.equal(report.initial.terrain.fallbackFloor, false);
  assert.equal(report.initial.terrain.waterIsSupport, false);
  await evaluate(() => {
    const r = window.__ROBO_BRIDGE__, start = r.challenge.getEntry().position, end = r.challenge.getExit().position;
    const focus = r.renderer.machineRoot.localToWorld(r.renderer.camera.position.clone().set((start.x + end.x) / 2 - 90, start.y, start.z));
    r.renderer.player.setEnabled(false); r.renderer.focus.copy(focus);
    const offset = [520, -780, 450]; r.renderer.yaw = Math.atan2(offset[1], offset[0]);
    r.renderer.pitch = Math.atan2(offset[2], Math.hypot(offset[0], offset[1])); r.renderer.radius = Math.hypot(...offset);
    r.renderer.updateCamera(); r.renderer.render();
    const observations = window.__level3Diagnostic = { frames: 0, maximumPositionErrorMm: 0, samples: [] };
    window.__level3Unsubscribe = r.renderer.addFrameListener(() => {
      const train = r.train.getDetailedSnapshot(), robot = r.robotController.getState();
      if (!train) return;
      const tcp = robot.tcp, pose = train.pusher.pose.positionMm;
      observations.frames += 1;
      observations.maximumPositionErrorMm = Math.max(observations.maximumPositionErrorMm,
        Math.hypot(tcp.xMm - pose.xMm, tcp.yMm - pose.yMm, tcp.zMm - pose.zMm));
      if (observations.frames % 12 === 0 && observations.samples.length < 300) observations.samples.push({
        state: train.state, tcp, worldRevision: robot.worldRevision, train: train.poses ?? train.bodies,
        physics: train.counts, motion: train.motion, pusher: train.pusher.pose });
    });
    return true;
  });
  await capture('00-current-train-and-tcp-pusher');
  const mission = await nativeCall('get_mission_state');
  const pending = nativeCall('test_bridge', sessionInput(mission));
  await new Promise(resolve => setTimeout(resolve, 1200));
  await capture('01-tcp-test-in-progress');
  report.test = await pending;
  await new Promise(resolve => setTimeout(resolve, 550));
  report.final = await snapshot();
  report.readCosts = await evaluate(async () => {
    const r = window.__ROBO_BRIDGE__, costs = {};
    for (const [name, read] of Object.entries({ trainSnapshot: () => r.train.getDetailedSnapshot(),
      pusherSnapshot: () => r.train.getSubsystem().pusherAdapter.getSnapshot(),
      constructionProgress: () => r.construction.getBuildProgress(),
      missionState: () => r.mission.getMissionState({ detail: 'detail', eventLimit: 1 }) })) {
      const start = performance.now(); for (let i = 0; i < 5; i++) await read();
      costs[name] = (performance.now() - start) / 5;
    }
    return costs;
  });
  report.observations = await evaluate(() => { window.__level3Unsubscribe?.(); return window.__level3Diagnostic; });
  await capture('02-current-train-result');
  assert.equal(report.final.pendingMoves, 0);
  assert.equal(report.final.robot.operationState, 'idle');
  assert.equal(report.final.pusher.running, false);
  assert.equal(report.observations.maximumPositionErrorMm, 0);
  assert.equal(report.final.mission.missionId, before.missionId);
  assert.notEqual(report.final.mission.phase, 'COMPLETE', 'An empty board must not complete');
  report.diagnosticCompleted = true;
  console.log(JSON.stringify({ diagnosticCompleted: true, test: report.test, train: report.final.train.result,
    pusher: report.final.pusher.motion, alignmentErrorMm: report.observations.maximumPositionErrorMm }));
} catch (error) {
  report.error = { message: error.message, stack: error.stack };
  try { report.final = await snapshot(); await capture('99-diagnostic-failure'); } catch {}
  console.error(error); process.exitCode = 1;
} finally {
  report.console = browser.console;
  if (writeEvidence) await writeFile(path.join(output, 'diagnostic.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
