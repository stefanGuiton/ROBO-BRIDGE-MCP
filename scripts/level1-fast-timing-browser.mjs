// Explicit native-WebMCP fast-mode regression; not the complete Level1 gate.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ChromiumSession } from '../tools/submission/cdp-browser.mjs';
import { createSimpleStructurePlan, toWebMcpPlacements } from '../apps/web/src/robot/simple-structure-planner.js';

const writeEvidence = process.argv.includes('--write-evidence');
const output = path.resolve(process.env.ROBO_FAST_OUTPUT ?? 'output/playwright/level1-fast-timing');
const url = process.env.ROBO_FAST_URL ?? 'http://127.0.0.1:8774/?demo=simple&level=1';
const report = { url, purpose: 'Native Simple smooth-cycle 3x4 wall regression, not full Level1 acceptance',
  ok: false, screenshots: [], toolCalls: [], visual: 'IMAGE REVIEW REQUIRED' };
if (writeEvidence) await mkdir(output, { recursive: true });
const browser = await ChromiumSession.launch({ viewport: [1440, 900], args: ['--enable-experimental-web-platform-features'] });
const evaluate = (fn, arg = null, options = {}) => browser.evaluate(`(${fn.toString()})(${JSON.stringify(arg)})`, options);
async function tool(name, input = {}) {
  report.toolCalls.push(name);
  const raw = await evaluate(({ name, input }) => (document.modelContextTesting ?? navigator.modelContextTesting)
    .executeTool(name, JSON.stringify(input)), { name, input }, { timeoutMs: 120000 });
  const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
  assert.ok(result?.ok !== false && !result?.error, JSON.stringify({ name, result }));
  return result;
}
async function state() {
  return evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    return { robot: r.robotController.getState(), pendingMoves: r.robotController.pendingMoveCount,
      bricks: r.robotController.getBricks(), board: r.board.progress(), events: r.board.eventLog,
      runner: r.placementCycleRunner.getState(), stream: r.fastPlacement.summary(),
      frames: window.__fastTimingFrames ?? null };
  });
}
async function capture(name) {
  if (!writeEvidence) return;
  const filename = path.join(output, `${name}.png`);
  await browser.screenshot(filename); report.screenshots.push(filename);
}
try {
  report.browser = browser.version.product;
  await browser.navigate(url);
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 90000 });
  report.tools = await evaluate(async () => (await (document.modelContextTesting ?? navigator.modelContextTesting).listTools()).map(t => t.name));
  assert.equal(report.tools.length, 31);
  assert.equal(new Set(report.tools).size, 31);
  const initial = await state();
  assert.equal(initial.runner.cycleTimeMs, 2000);
  const profile = await evaluate(() => {
    const p = window.__ROBO_BRIDGE__.fastPlacement.workcellProfile;
    return { workspace: p.workspace, buildZone: p.buildZone, matBounds: p.matBounds, placementSurfaceZMm: p.placementSurfaceZMm };
  });
  const plan = createSimpleStructurePlan({ structure: 'wall', width: 3, height: 4, depth: 1, colour: 'blue' }, { profile });
  assert.equal(plan.ok, true);
  assert.equal(plan.blockCount, 12);
  const placements = toWebMcpPlacements(plan), streamId = 'level1-fast-wall-3x4';
  report.plan = await tool('plan_placement_queue', { placements, streamId, mode: 'replace', finalChunk: true,
    cycleTimeMs: 1000, expectedWorldRevision: initial.robot.worldRevision });
  const beforeRefill = await state();
  report.availableBefore = beforeRefill.bricks.filter(b => b.colour === 'blue' && !b.heldBy && !b.placedTargetId && !b.placementType).length;
  if (report.availableBefore < 12) {
    report.refill = await tool('request_more_bricks', { expectedWorldRevision: beforeRefill.robot.worldRevision });
    assert.equal(report.refill.pressesCompleted, 2);
  }
  const prepared = await state();
  assert.ok(prepared.bricks.filter(b => b.colour === 'blue' && !b.heldBy && !b.placedTargetId && !b.placementType).length >= 12,
    'this short wall requires sufficient legitimate feeder inventory before the one continuous start');
  await evaluate(({ placements }) => {
    const r = window.__ROBO_BRIDGE__, renderer = r.renderer;
    const centre = ['xMm', 'yMm', 'zMm'].map(axis => placements.reduce((sum, p) => sum + p[axis], 0) / placements.length);
    const target = renderer.machineRoot.localToWorld(renderer.camera.position.clone().set(...centre));
    renderer.player.setEnabled(false); renderer.focus.copy(target);
    const offset = [240, -500, 260]; renderer.yaw = Math.atan2(offset[1], offset[0]);
    renderer.pitch = Math.atan2(offset[2], Math.hypot(offset[0], offset[1])); renderer.radius = Math.hypot(...offset);
    renderer.updateCamera(); renderer.render();
    window.__fastTimingFrames = { running: 0, moving: 0 };
    window.__fastTimingCleanup = renderer.addFrameListener(() => {
      if (!r.placementCycleRunner.getState().running) return;
      window.__fastTimingFrames.running += 1;
      if (r.robotController.getState().moving) window.__fastTimingFrames.moving += 1;
    });
  }, { placements });
  await capture('00-prefilled-wall-plan');
  report.priorPlayback = prepared.robot.simulationPlaybackMultiplier;
  report.start = await tool('control_placement_stream', { action: 'start', cycleTimeMs: 1000, maximumPlacements: 12,
    expectedWorldRevision: prepared.robot.worldRevision });
  await new Promise(resolve => setTimeout(resolve, 4200));
  await capture('01-smooth-wall-in-progress');
  await browser.waitFor(`!window.__ROBO_BRIDGE__.placementCycleRunner.getState().running`, { timeoutMs: 90000, intervalMs: 200 });
  report.status = await tool('get_placement_stream_status', { streamId, cursor: 0, limit: 50 });
  report.final = await state();
  await capture('02-completed-blue-wall');
  const result = report.final.runner.lastResult;
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.timingMode, 'simple-smooth');
  assert.equal(result.completedPlacements, 12);
  assert.equal(result.cycleTimeMs, 1000);
  assert.equal(report.status.entries.length, 12);
  assert.ok(report.status.entries.every(entry => entry.status === 'COMPLETED'));
  const ids = report.status.entries.map(entry => entry.actualBrickId);
  assert.equal(new Set(ids).size, 12);
  assert.equal(report.final.bricks.filter(b => ids.includes(b.id) && b.colour === 'blue').length, 12);
  for (const entry of report.status.entries) {
    const brick = report.final.bricks.find(b => b.id === entry.actualBrickId);
    const events = report.final.events.filter(event => event.type === 'placement' && event.brickId === brick.id);
    assert.equal(events.length, 1, 'each source has exactly one authoritative placement');
    assert.equal(events[0].actor, 'agent');
    assert.equal(events[0].colour, 'blue');
    assert.ok(['mat', 'brick-connection'].includes(brick.placementType));
    assert.equal(brick.heldBy, null);
    for (const axis of ['xMm', 'yMm', 'zMm']) {
      assert.ok(Math.abs(brick.position[axis] - entry.targetPosition[axis]) < 0.1);
      assert.equal(events[0].position[axis], brick.position[axis]);
    }
    assert.ok(Math.abs(brick.yawRad * 180 / Math.PI - entry.targetYawDeg) < 0.01);
    assert.equal(events[0].yawRad, brick.yawRad);
  }
  assert.equal(report.final.robot.simulationPlaybackMultiplier, report.priorPlayback);
  assert.equal(report.final.robot.operationState, 'idle');
  assert.equal(report.final.robot.heldBrickId, null);
  assert.equal(report.final.pendingMoves, 0);
  assert.ok(report.final.frames.moving > 12, 'observe actual moving rendered frames');
  assert.equal(result.results.length, 12);
  assert.ok(Number.isFinite(result.totalElapsedMs) && result.totalElapsedMs > 0);
  assert.deepEqual(result.results.map(cycle => cycle.placementId).sort(), report.status.entries.map(entry => entry.placementId).sort());
  assert.deepEqual(result.results.map(cycle => cycle.brickId).sort(), [...ids].sort());
  assert.equal(result.overruns, result.results.filter(cycle => cycle.overrunMs > 0).length);
  for (const cycle of result.results) {
    for (const key of ['executionElapsedMs', 'executionWallDurationMs', 'cycleElapsedMs', 'physicalDurationMs', 'playbackDurationMs']) {
      assert.ok(Number.isFinite(cycle[key]) && cycle[key] > 0, `${key} must report real positive timing`);
    }
    assert.ok(Number.isFinite(cycle.preparationElapsedMs) && cycle.preparationElapsedMs >= 0);
    assert.equal(cycle.cycleTimeMs, 1000);
    assert.equal(cycle.overrunMs, Math.max(0, cycle.executionElapsedMs - 1000));
    assert.ok(cycle.cycleElapsedMs >= cycle.executionElapsedMs);
    assert.ok(cycle.playbackMultiplier >= 1 && cycle.playbackMultiplier <= 40);
  }
  for (const kind of ['errors', 'warnings', 'exceptions']) assert.equal(browser.console[kind].length, 0, kind);
  report.ok = true;
  console.log(JSON.stringify({ ok: true, completed: 12, targetCycleMs: 1000,
    observedTotalMs: result.totalElapsedMs, overruns: result.overruns,
    maximumOverrunMs: Math.max(...result.results.map(cycle => cycle.overrunMs)),
    restoredPlayback: report.final.robot.simulationPlaybackMultiplier, movingFrames: report.final.frames.moving }));
} catch (error) {
  report.error = { message: error.message, stack: error.stack };
  try { report.final = await state(); await capture('99-failure'); } catch {}
  process.exitCode = 1; console.error(error);
} finally {
  try { await evaluate(() => window.__fastTimingCleanup?.()); } catch {}
  report.console = browser.console;
  try { if (writeEvidence) await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(report, null, 2)); }
  finally { await browser.close(); }
}
