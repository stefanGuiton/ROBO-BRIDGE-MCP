// Bounded Level 1 launch acceptance.  This exercises the real localhost
// MAIN_DEMO through native WebMCP callbacks and real canvas pointer input.
// It intentionally leaves visual grading to the operator: --write-evidence
// captures the rendered checkpoints for later inspection.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ChromiumSession } from '../tools/submission/cdp-browser.mjs';
import { createSimpleStructurePlan, toWebMcpPlacements } from '../apps/web/src/robot/simple-structure-planner.js';

const argv = process.argv.slice(2);
const writeEvidence = argv.includes('--write-evidence');
const debug = argv.includes('--debug');
const towerOnly = argv.includes('--tower-only');
const url = process.env.ROBO_LEVEL1_URL
  ?? process.env.ROBO_SIMPLE_URL
  ?? 'http://127.0.0.1:8774/?demo=simple&level=1';
const output = path.resolve(process.env.ROBO_LEVEL1_OUTPUT ?? 'output/playwright/launch-level1');
const MAX_PLACEMENTS = 50;
const MAX_NATIVE_CALLS = 80;
const FULL_GATES = [
  'native_boot', 'balanced_inventory', 'blue_single', 'physical_double_contact',
  'blue_wall_35', 'speed_configuration', 'measured_smooth_cadence',
  'human_adoption', 'tower_12', 'settings', 'authority_and_registrar', 'console'
];
const PARTIAL_SKIPS = ['blue_single', 'physical_double_contact', 'blue_wall_35', 'speed_configuration'];

const report = {
  browser: null,
  url,
  scope: towerOnly ? 'partial-tower-settings' : 'full-level1',
  requiredGates: FULL_GATES.filter((gate) => !towerOnly || !PARTIAL_SKIPS.includes(gate)),
  skippedGates: towerOnly ? [...PARTIAL_SKIPS] : [],
  completedGates: [],
  automatedStatus: 'NOT_COMPLETED',
  fullAutomatedRunPassed: false,
  nativeCalls: { count: 0, limit: MAX_NATIVE_CALLS, byName: {} },
  visual: 'INDEPENDENT IMAGE REVIEW REQUIRED',
  screenshots: [],
  checks: [],
  console: null,
  ok: false
};

function check(name, details = {}) {
  report.checks.push({ name, ...details });
  console.log(JSON.stringify({ check: name, ...details }));
}

function markGate(name) {
  assert.ok(FULL_GATES.includes(name), `unknown acceptance gate: ${name}`);
  if (!report.completedGates.includes(name)) report.completedGates.push(name);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseToolResult(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return { ok: false, reason: 'invalid_tool_result', raw: value }; }
  }
  return value;
}

function isSuccess(result) {
  return result?.ok !== false && result?.error === undefined;
}

const preload = `(() => {
  window.__level1Tools = new Map();
  window.__level1DuplicateTools = [];
  const context = document.modelContext ?? navigator.modelContext;
  if (!context) return;
  const prototype = Object.getPrototypeOf(context);
  const original = prototype && prototype.registerTool;
  if (typeof original !== 'function') return;
  prototype.registerTool = function(tool, options) {
    if (window.__level1Tools.has(tool?.name)) window.__level1DuplicateTools.push(tool?.name ?? null);
    else window.__level1Tools.set(tool?.name, tool);
    return original.call(this, tool, options);
  };
})();`;

const browser = await ChromiumSession.launch({
  preloadScript: preload,
  viewport: [1440, 900],
  args: ['--enable-experimental-web-platform-features']
});
report.browser = browser.version.product;

const evaluate = (fn, argument = null, options = {}) => browser.evaluate(`(${fn.toString()})(${JSON.stringify(argument)})`, options);
const nativeCall = async (name, input = {}) => {
  assert.ok(report.nativeCalls.count < MAX_NATIVE_CALLS, 'native tool-call budget exhausted');
  report.nativeCalls.count += 1;
  report.nativeCalls.byName[name] = (report.nativeCalls.byName[name] ?? 0) + 1;
  return parseToolResult(await evaluate(async ({ name, input }) => {
    const testing = document.modelContextTesting ?? navigator.modelContextTesting;
    if (!testing?.executeTool) throw new Error('native_model_context_testing_unavailable');
    return testing.executeTool(name, JSON.stringify(input));
  }, { name, input }));
};

async function capture(name, dataUrl = null) {
  if (!writeEvidence) return null;
  const file = path.join(output, `${name}.png`);
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,')) {
    await writeFile(file, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
  } else {
    await browser.screenshot(file);
  }
  report.screenshots.push(file);
  return file;
}

async function readRuntimeState() {
  return evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    const bricks = r.robotController.getBricks();
    const loose = bricks.filter((brick) => !brick.heldBy && !brick.snapped && !brick.placedTargetId && !brick.placementType);
    const byColour = Object.fromEntries([...new Set(bricks.map((brick) => brick.colour))].map((colour) => [
      colour, loose.filter((brick) => brick.colour === colour).length
    ]));
    return {
      worldRevision: r.robotController.worldRevision,
      bricks: bricks.length,
      looseBricks: loose.length,
      byColour,
      board: r.board.progress(),
      stream: r.fastPlacement?.summary?.() ?? null,
      player: r.renderer.player.getState(),
      mode: r.demoModeControl?.getState?.().mode ?? document.documentElement.dataset.demoMode ?? null
    };
  });
}

let initialToolNames = null;
async function verifyAuthorities(label, initialize = false) {
  const state = await evaluate(({ initialize }) => {
    const r = window.__ROBO_BRIDGE__;
    const current = { runtime: r, controller: r.robotController, board: r.board,
      clock: r.robotController.revisionClock, coordinator: r.fastPlacement,
      human: r.humanBuildAdapter, renderer: r.renderer };
    // Harness-only references: no authority object or revision is changed.
    if (initialize) window.__level1AuthorityIdentity = current;
    const original = window.__level1AuthorityIdentity;
    return {
      stable: Object.fromEntries(Object.entries(current).map(([key, value]) => [key, original?.[key] === value])),
      shared: {
        controllerBoard: current.controller.board === current.board,
        revisionClock: current.board.revisionClock === current.clock,
        humanController: current.human.controller === current.controller,
        humanBoard: current.human.board === current.board,
        plannerController: current.coordinator.controller === current.controller,
        plannerBoard: current.coordinator.placementAuthority.board === current.board,
        rendererController: current.renderer.controller === current.controller
      },
      names: [...window.__level1Tools.keys()].sort(),
      duplicates: [...window.__level1DuplicateTools]
    };
  }, { initialize });
  assert.ok(Object.values(state.stable).every(Boolean), JSON.stringify({ label, state }));
  assert.ok(Object.values(state.shared).every(Boolean), JSON.stringify({ label, state }));
  assert.deepEqual(state.duplicates, [], JSON.stringify({ label, state }));
  if (initialize) initialToolNames = state.names;
  else assert.deepEqual(state.names, initialToolNames, 'native registrar changed after boot');
  check(`authority and registrar identity (${label})`, { stable: state.stable, shared: state.shared, toolCount: state.names.length });
}

async function readAuthoritySnapshot() {
  return evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    const worldRevision = r.robotController.worldRevision;
    const bricks = r.robotController.getBricks();
    const placements = r.board.getPlacements();
    if (bricks.length > 256 || placements.length > 50) throw new Error('level1_snapshot_bound_exceeded');
    const sources = bricks.map((brick) => ({ id: brick.id, colour: brick.colour,
      position: brick.position, yawRad: brick.yawRad, heldBy: brick.heldBy ?? null,
      snapped: Boolean(brick.snapped), placedTargetId: brick.placedTargetId ?? null,
      placementType: brick.placementType ?? null, reachable: brick.reachability?.reachable === true }));
    const loose = sources.filter((brick) => !brick.heldBy && !brick.snapped && !brick.placedTargetId && !brick.placementType);
    const availableByColour = {};
    for (const brick of loose) availableByColour[brick.colour] = (availableByColour[brick.colour] ?? 0) + 1;
    if (r.robotController.worldRevision !== worldRevision) throw new Error('level1_read_mutated_world');
    return { worldRevision, bricks: sources, placements, availableByColour,
      looseBrickCentreZMm: r.fastPlacement.workcellProfile.looseBrickCentreZMm,
      buttonAnchor: r.moreBricksButton.getAnchor() };
  });
}

function assertCheckedSources(bricks, centreZMm) {
  assert.ok(Number.isFinite(centreZMm), 'loose source centre height unavailable');
  assert.equal(new Set(bricks.map((brick) => brick.id)).size, bricks.length, 'duplicate source identity');
  for (const brick of bricks) {
    assert.ok(typeof brick.id === 'string' && brick.id.length > 0);
    assert.ok([brick.position?.xMm, brick.position?.yMm, brick.position?.zMm, brick.yawRad].every(Number.isFinite), JSON.stringify(brick));
    assert.equal(brick.reachable, true, JSON.stringify(brick));
    assert.ok(Math.abs(brick.position.zMm - centreZMm) <= 1e-6, JSON.stringify(brick));
    assert.ok(!brick.heldBy && !brick.snapped && !brick.placedTargetId && !brick.placementType, JSON.stringify(brick));
  }
}

async function verifyInitialInventory() {
  const state = await readAuthoritySnapshot();
  assert.equal(state.bricks.length, 28);
  assert.deepEqual(state.availableByColour, { red: 14, blue: 14 });
  assert.equal(state.placements.length, 0);
  assertCheckedSources(state.bricks, state.looseBrickCentreZMm);
  check('balanced Simple inventory', { worldRevision: state.worldRevision, colours: state.availableByColour, sources: state.bricks });
  markGate('balanced_inventory');
}

async function resetSimple() {
  const result = await evaluate(() => window.__ROBO_BRIDGE__.demoModeControl.change('simple', { reset: true }));
  assert.equal(result?.ok, true, JSON.stringify(result));
  await browser.waitFor(`document.documentElement.dataset.demoMode === 'simple'`, { timeoutMs: 10_000 });
  await verifyAuthorities('Simple reset');
  await verifyInitialInventory();
  return readRuntimeState();
}

async function currentProfile() {
  const profile = await evaluate(() => {
    const p = window.__ROBO_BRIDGE__.fastPlacement?.workcellProfile;
    if (!p) return null;
    return {
      workspace: p.workspace,
      buildZone: p.buildZone,
      matBounds: p.matBounds,
      placementSurfaceZMm: p.placementSurfaceZMm
    };
  });
  assert.ok(profile?.buildZone && profile?.workspace && Number.isFinite(profile.placementSurfaceZMm), 'simple profile is unavailable');
  return profile;
}

function makePlacements(profile, spec, { openColour = false } = {}) {
  const plan = createSimpleStructurePlan(spec, { profile });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  const placements = toWebMcpPlacements(plan).map((placement) => openColour
    ? { ...placement, colour: null, preferredColour: spec.colour }
    : placement);
  assert.equal(placements.length, plan.blockCount);
  return { plan, placements };
}

async function planStream(streamId, placements, cycleTimeMs = 1000) {
  const before = await readRuntimeState();
  const result = await nativeCall('plan_placement_queue', {
    streamId,
    mode: 'replace',
    finalChunk: true,
    cycleTimeMs,
    placements,
    expectedWorldRevision: before.worldRevision
  });
  assert.equal(isSuccess(result), true, JSON.stringify(result));
  return result;
}

async function startStream(streamId, count, cycleTimeMs = 1000) {
  assert.ok(Number.isInteger(count) && count >= 1 && count <= MAX_PLACEMENTS);
  const before = await readRuntimeState();
  const result = await nativeCall('control_placement_stream', {
    action: 'start',
    cycleTimeMs,
    maximumPlacements: count,
    expectedWorldRevision: before.worldRevision
  });
  assert.equal(isSuccess(result), true, JSON.stringify(result));
  await browser.waitFor(`!__ROBO_BRIDGE__.placementCycleRunner.getState().running`, {
    timeoutMs: Math.max(120_000, count * (cycleTimeMs + 3_000)),
    intervalMs: 150
  });
  const finished = await evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    const robot = r.robotController.getState();
    return { runner: r.placementCycleRunner.getState(), stream: r.fastPlacement.summary(),
      moving: robot.moving, operationState: robot.operationState, pendingMoveCount: r.robotController.pendingMoveCount };
  });
  const run = finished.runner.lastResult;
  assert.equal(finished.runner.running, false);
  assert.equal(finished.moving, false);
  assert.equal(finished.operationState, 'idle');
  assert.equal(finished.pendingMoveCount, 0);
  assert.equal(finished.stream.streamId, streamId);
  assert.ok(run && (run.ok === true || run.reason === 'cycle_waiting'), JSON.stringify(finished));
  assert.equal(run.timingMode, 'simple-smooth', JSON.stringify(run));
  assert.equal(run.cycleTimeMs, cycleTimeMs);
  assert.ok(Array.isArray(run.results) && run.results.length <= count, JSON.stringify(run));
  assert.equal(run.completedPlacements, run.results.length);
  assert.ok(Number.isFinite(run.totalElapsedMs) && run.totalElapsedMs > 0);
  for (const sample of run.results) {
    assert.equal(sample.timingMode, 'simple-smooth');
    assert.equal(sample.cycleTimeMs, cycleTimeMs);
    for (const field of ['physicalDurationMs', 'playbackDurationMs', 'executionWallDurationMs', 'executionElapsedMs', 'cycleElapsedMs']) {
      assert.ok(Number.isFinite(sample[field]) && sample[field] > 0, JSON.stringify({ field, sample }));
    }
    assert.ok(sample.cycleElapsedMs + 1e-6 >= sample.executionElapsedMs, JSON.stringify(sample));
  }
  // These are the existing runner's monotonic wall-clock measurements, not
  // the start acknowledgement or an independently measured speedup baseline.
  check('completed-run smooth cadence', { streamId, requestedCycleTimeMs: cycleTimeMs,
    measurementSource: 'placementCycleRunner.lastResult', pairedBaselineMeasured: false, run });
  if (run.results.length > 1) markGate('measured_smooth_cadence');
  return { ...result, completedRun: run };
}

async function streamEntries(streamId) {
  // The native response can cap pages below the requested limit. Follow its
  // cursor with explicit page/entry bounds instead of assuming one full page.
  const entries = [];
  let cursor = 0, totalAvailable = null;
  for (let page = 0; page < 5; page += 1) {
    const result = await nativeCall('get_placement_stream_status', { streamId, cursor, limit: 20 });
    assert.equal(isSuccess(result), true, JSON.stringify(result));
    assert.equal(result.streamId, streamId);
    assert.ok(Array.isArray(result.entries) && result.entries.length <= 20, JSON.stringify(result));
    assert.equal(result.returnedCount, result.entries.length);
    assert.ok(Number.isInteger(result.totalAvailable) && result.totalAvailable <= MAX_PLACEMENTS);
    if (totalAvailable === null) totalAvailable = result.totalAvailable;
    assert.equal(result.totalAvailable, totalAvailable, 'stream size changed during read');
    entries.push(...result.entries);
    assert.ok(entries.length <= MAX_PLACEMENTS);
    assert.equal(new Set(entries.map(entry => entry.placementId)).size, entries.length, 'duplicate status entry');
    if (result.nextCursor === null) {
      assert.equal(entries.length, totalAvailable);
      return entries;
    }
    assert.ok(Number.isInteger(result.nextCursor) && result.nextCursor > cursor && result.nextCursor <= MAX_PLACEMENTS);
    cursor = result.nextCursor;
  }
  assert.fail('Level 1 status page budget exhausted');
}

async function completeStream(streamId, expectedCount) {
  const entries = await streamEntries(streamId);
  const satisfied = entries.filter((entry) => ['COMPLETED', 'ADOPTED'].includes(entry.status));
  assert.equal(entries.length, expectedCount, JSON.stringify(entries));
  assert.equal(satisfied.length, expectedCount, JSON.stringify(entries));
  assert.equal(entries.filter((entry) => entry.status === 'BLOCKED').length, 0, JSON.stringify(entries));
  assert.equal(new Set(entries.map((entry) => entry.actualBrickId)).size, expectedCount, JSON.stringify(entries));
  return entries;
}

function poseResidual(position, yawRad, targetPosition, targetYawRad) {
  assert.ok([position?.xMm, position?.yMm, position?.zMm, yawRad,
    targetPosition?.xMm, targetPosition?.yMm, targetPosition?.zMm, targetYawRad].every(Number.isFinite), 'non-finite accepted pose');
  const yawDelta = (yawRad - targetYawRad) * 2;
  return {
    xyMm: Math.hypot(position.xMm - targetPosition.xMm, position.yMm - targetPosition.yMm),
    zMm: Math.abs(position.zMm - targetPosition.zMm),
    yawDeg: Math.abs(Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta))) * 90 / Math.PI
  };
}

async function verifyAcceptedPlacements(streamId, placements, entries, { colour = null, coloursByActor = null } = {}) {
  const state = await readAuthoritySnapshot();
  const bricks = new Map(state.bricks.map((brick) => [brick.id, brick]));
  const board = new Map(state.placements.map((placement) => [placement.brickId, placement]));
  const requested = new Map(placements.map((placement) => [placement.placementId, placement]));
  assert.equal(state.placements.length, entries.length, 'same live board must contain exactly the accepted sources');
  assert.equal(board.size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.actualBrickId)).size, entries.length);
  const accepted = entries.map((entry) => {
    const brick = bricks.get(entry.actualBrickId), placed = board.get(entry.actualBrickId);
    const request = requested.get(entry.placementId);
    assert.ok(brick && placed && request, JSON.stringify({ entry, brick, placed, request }));
    assert.ok(['COMPLETED', 'ADOPTED'].includes(entry.status));
    assert.equal(brick.heldBy, null);
    assert.equal(placed.actor, entry.actor);
    assert.equal(placed.colour, brick.colour);
    const expectedColour = colour ?? coloursByActor?.[entry.actor];
    assert.ok(expectedColour, `missing colour expectation for ${entry.actor}`);
    assert.equal(brick.colour, expectedColour, JSON.stringify({ entry, brick }));
    const authorityResidual = poseResidual(brick.position, brick.yawRad, placed.position, placed.yawRad);
    assert.ok(Object.values(authorityResidual).every((value) => value <= 1e-6), JSON.stringify({ entry, authorityResidual }));
    const requestedPosition = { xMm: request.xMm, yMm: request.yMm, zMm: request.zMm };
    const requestResidual = poseResidual(brick.position, brick.yawRad, requestedPosition, request.yawDeg * Math.PI / 180);
    const targetResidual = poseResidual(brick.position, brick.yawRad, entry.targetPosition, entry.targetYawDeg * Math.PI / 180);
    // Match the live co-build occupancy contract (3mm XY, 2mm Z, 2deg,
    // half-turn brick symmetry), while retaining exact measured residuals.
    for (const residual of [requestResidual, targetResidual]) {
      assert.ok(residual.xyMm <= 3 && residual.zMm <= 2 && residual.yawDeg <= 2, JSON.stringify({ entry, brick, residual }));
    }
    return { placementId: entry.placementId, actualBrickId: brick.id, status: entry.status,
      actor: placed.actor, colour: brick.colour, position: brick.position, yawRad: brick.yawRad,
      requestedPosition, targetPosition: entry.targetPosition, authorityResidual, requestResidual, targetResidual };
  });
  check('actual accepted controller/board placements', { streamId, worldRevision: state.worldRevision, accepted });
  return accepted;
}

function streamPlanFingerprint(entries) {
  const stableNumber = (value) => Number.isFinite(Number(value))
    ? Math.round(Number(value) * 1000) / 1000
    : null;
  const stablePosition = (position) => position ? {
    xMm: stableNumber(position.xMm),
    yMm: stableNumber(position.yMm),
    zMm: stableNumber(position.zMm)
  } : null;
  return entries.map((entry) => ({
    placementId: entry.placementId,
    sequence: entry.sequence,
    // Status pages expose the same frozen request through independently
    // calculated preview values.  Normalize harmless IEEE-754 noise, while
    // retaining the actual target identity and placement ordering checks.
    targetPosition: stablePosition(entry.targetPosition),
    targetYawDeg: stableNumber(entry.targetYawDeg),
    supportPlacementId: entry.supportPlacementId ?? null,
    dependsOnPlacementIds: [...(entry.dependsOnPlacementIds ?? [])],
    supportBrickId: entry.supportBrickId ?? null
  }));
}

function assertCameraInvariant(before, after, label, tolerance = 1e-5) {
  assert.ok(before && after, `${label}: camera state unavailable`);
  const assertClose = (actual, expected, field) => {
    assert.equal(Array.isArray(actual), Array.isArray(expected), `${label}: ${field} shape changed`);
    if (Array.isArray(expected)) {
      assert.equal(actual.length, expected.length, `${label}: ${field} length changed`);
      actual.forEach((value, index) => assert.ok(
        Math.abs(Number(value) - Number(expected[index])) <= tolerance,
        `${label}: ${field}[${index}] changed (${value} vs ${expected[index]})`
      ));
    } else {
      assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance,
        `${label}: ${field} changed (${actual} vs ${expected})`);
    }
  };
  for (const field of ['position', 'direction']) assertClose(after[field], before[field], field);
  for (const field of ['fov', 'zoom', 'near', 'far', 'rendererYaw', 'rendererPitch', 'rendererRadius']) {
    assertClose(after[field], before[field], field);
  }
  assertClose(after.rendererFocus, before.rendererFocus, 'rendererFocus');
  assert.equal(after.player?.enabled, before.player?.enabled, `${label}: player enabled state changed`);
  check(`camera invariant (${label})`, {
    tolerance,
    position: after.position,
    direction: after.direction,
    fov: after.fov,
    zoom: after.zoom
  });
}

async function waitForHudComplete(expectedCount) {
  const expected = Number(expectedCount);
  assert.ok(Number.isInteger(expected) && expected >= 1, `invalid HUD target count: ${expectedCount}`);
  await browser.waitFor(`(() => {
    const r = window.__ROBO_BRIDGE__;
    const stream = r.fastPlacement?.summary?.();
    const running = Boolean(r.placementCycleRunner?.getState?.().running);
    const hud = document.querySelector('[data-simple-status]')?.textContent?.trim() ?? '';
    return !running
      && stream?.satisfiedPlacements === ${expected}
      && stream?.totalPlacements === ${expected}
      && hud.startsWith('${expected}/${expected}')
      && !hud.includes('RUNNING');
  })()`, { timeoutMs: 15_000, intervalMs: 120 });
  return evaluate(() => ({
    hud: document.querySelector('[data-simple-status]')?.textContent?.trim() ?? '',
    stream: window.__ROBO_BRIDGE__.fastPlacement?.summary?.(),
    runner: window.__ROBO_BRIDGE__.placementCycleRunner?.getState?.() ?? null
  }));
}

async function requestPhysicalRefill(label, expectedWorldRevision, { streamId, requiredBlueSources } = {}) {
  assert.ok(Number.isInteger(requiredBlueSources) && requiredBlueSources >= 1 && requiredBlueSources <= MAX_PLACEMENTS);
  const before = await readAuthoritySnapshot();
  assert.equal(before.worldRevision, expectedWorldRevision);
  const plannedBefore = streamPlanFingerprint(await streamEntries(streamId));
  const refill = await nativeCall('request_more_bricks', { expectedWorldRevision });
  if (!isSuccess(refill)) {
    const context = await evaluate(() => {
      const r = window.__ROBO_BRIDGE__;
      return {
        robot: r.robotController.getState(),
        anchor: r.moreBricksButton.getAnchor(),
        button: r.moreBricksButton.getState(),
        runner: r.placementCycleRunner?.getState?.() ?? null,
        stream: r.fastPlacement?.summary?.() ?? null
      };
    });
    check(`${label} rejected`, { result: refill, context });
    assert.equal(isSuccess(refill), true, JSON.stringify({ refill, context }));
  }
  assert.equal(isSuccess(refill), true, JSON.stringify(refill));
  assert.equal(refill.pressesRequested, 2, JSON.stringify(refill));
  assert.equal(refill.pressesCompleted, 2, JSON.stringify(refill));
  assert.equal(refill.pressResults?.length, 2, JSON.stringify(refill));
  const anchor = before.buttonAnchor;
  const distance = (a, b) => {
    assert.ok([a?.xMm, a?.yMm, a?.zMm, b?.xMm, b?.yMm, b?.zMm].every(Number.isFinite));
    return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm);
  };
  for (const [index, press] of refill.pressResults.entries()) {
    assert.equal(press.index, index + 1);
    assert.equal(press.contactDetected, true);
    assert.equal(press.contactEvidence?.contactDetected, true);
    assert.equal(press.contactEvidence?.normalDescent, true);
    assert.ok(distance(press.contactTcp, anchor.contactTcp) <= anchor.positionToleranceMm);
    assert.ok(distance(press.pressedTcp, anchor.pressedTcp) <= anchor.positionToleranceMm);
    assert.ok(press.contactTcp.zMm - press.pressedTcp.zMm >= anchor.pressDepthMm - anchor.positionToleranceMm);
    assert.ok(distance(press.retractTcp, { xMm: anchor.pose.xMm, yMm: anchor.pose.yMm, zMm: anchor.safeApproachZMm }) <= anchor.positionToleranceMm);
  }
  const spawnedDelta = Number(refill.spawnedDelta ?? 0);
  assert.ok(Number.isInteger(spawnedDelta) && spawnedDelta > 0, JSON.stringify(refill));
  const after = await readAuthoritySnapshot();
  assert.equal(refill.worldRevisionBefore, before.worldRevision);
  assert.equal(refill.worldRevisionAfter, after.worldRevision);
  assert.ok(after.worldRevision > before.worldRevision);
  assert.deepEqual(after.placements, before.placements, 'refill must not accept or move a board placement');
  const previousIds = new Set(before.bricks.map((brick) => brick.id));
  const added = after.bricks.filter((brick) => !previousIds.has(brick.id));
  assert.equal(after.bricks.length, before.bricks.length + spawnedDelta);
  assert.equal(new Set(after.bricks.map((brick) => brick.id)).size, after.bricks.length);
  assert.equal(new Set(refill.spawnedIds).size, spawnedDelta);
  assert.deepEqual(added.map((brick) => brick.id).sort(), [...refill.spawnedIds].sort());
  assert.deepEqual(after.bricks.filter((brick) => previousIds.has(brick.id)), before.bricks, 'refill changed an existing source');
  assertCheckedSources(added, after.looseBrickCentreZMm);
  assert.deepEqual(refill.inventoryBefore.availableByColour, before.availableByColour);
  assert.deepEqual(refill.inventoryAfter.availableByColour, after.availableByColour);
  const blueDeficitBefore = Math.max(0, requiredBlueSources - (before.availableByColour.blue ?? 0));
  const blueDeficitAfter = Math.max(0, requiredBlueSources - (after.availableByColour.blue ?? 0));
  assert.ok((after.availableByColour.blue ?? 0) > (before.availableByColour.blue ?? 0), 'physical refill added no blue sources');
  if (blueDeficitBefore > 0) assert.ok(blueDeficitAfter < blueDeficitBefore, 'physical refill did not reduce the strict-blue deficit');
  assert.deepEqual(streamPlanFingerprint(await streamEntries(streamId)), plannedBefore, 'refill changed the planned stream');
  check(label, {
    pressesRequested: refill.pressesRequested,
    pressesCompleted: refill.pressesCompleted,
    spawnedDelta,
    worldRevisionBefore: refill.worldRevisionBefore,
    worldRevisionAfter: refill.worldRevisionAfter,
    inventoryAfter: refill.inventoryAfter,
    blueDeficitBefore, blueDeficitAfter, sources: added,
    contactProof: refill.pressResults.map(({ index, contactTcp, pressedTcp, retractTcp, contactEvidence }) => ({ index, contactTcp, pressedTcp, retractTcp, contactEvidence })),
    imageProof: 'Near-contact images are illustrative; measured double-contact evidence is recorded separately.'
  });
  markGate('physical_double_contact');
  return refill;
}

async function completeStreamWithPhysicalRefills(streamId, expectedCount, cycleTimeMs, { maxRefills = 4 } = {}) {
  let refillCount = 0;
  let entries = await streamEntries(streamId);
  const planned = streamPlanFingerprint(entries);
  for (;;) {
    const satisfied = entries.filter((entry) => ['COMPLETED', 'ADOPTED'].includes(entry.status));
    const waitingSource = entries.filter((entry) => entry.status === 'WAITING_SOURCE');
    if (satisfied.length === expectedCount) {
      assert.equal(entries.length, expectedCount, JSON.stringify(entries));
      assert.equal(entries.filter((entry) => entry.status === 'BLOCKED').length, 0, JSON.stringify(entries));
      assert.equal(new Set(entries.map((entry) => entry.actualBrickId)).size, expectedCount, JSON.stringify(entries));
      return entries;
    }
    assert.ok(waitingSource.length > 0, JSON.stringify(entries));
    assert.ok(refillCount < maxRefills, `bounded refill limit reached: ${refillCount}`);
    const before = await readRuntimeState();
    await requestPhysicalRefill(`MORE BRICKS physical resume ${refillCount + 1}`, before.worldRevision,
      { streamId, requiredBlueSources: expectedCount - satisfied.length });
    refillCount += 1;
    const afterRefillEntries = await streamEntries(streamId);
    assert.deepEqual(streamPlanFingerprint(afterRefillEntries), planned, 'refill must not replace the planned stream');
    entries = afterRefillEntries;
    await startStream(streamId, expectedCount, cycleTimeMs);
    entries = await streamEntries(streamId);
  }
}

async function setHeroCamera(target, { sourceId = null, guide = false } = {}) {
  const aim = await evaluate(({ target, sourceId, guide }) => {
    const r = window.__ROBO_BRIDGE__;
    const renderer = r.renderer;
    renderer.render();
    let worldTarget;
    if (sourceId) {
      const mesh = renderer.brickMeshes.get(sourceId);
      if (!mesh) throw new Error(`source_mesh_missing:${sourceId}`);
      worldTarget = mesh.getWorldPosition(mesh.position.clone());
    } else if (guide) {
      const mesh = renderer.humanGuideMesh;
      if (!mesh?.visible) throw new Error('pending_human_guide_missing');
      worldTarget = mesh.getWorldPosition(mesh.position.clone());
    } else {
      const local = renderer.camera.position.clone().set(target.xMm, target.yMm, target.zMm);
      worldTarget = renderer.machineRoot.localToWorld(local);
    }
    const worldCamera = worldTarget.clone();
    // Keep the inspection camera's full player capsule above the tabletop.
    // A camera only120mm above a source starts inside the table's expanded
    // player collider and is pushed sideways before the actual mouse click.
    // Do not disable collision or change Player settings to hold that pose.
    worldCamera.z += Math.max(120, renderer.playerSettings.playerEyeHeightMm
      + renderer.playerSettings.playerCollisionSkinMm + 50);
    renderer.player.setEnabled(true);
    renderer.player.activateFallbackLook();
    renderer.player.setLookAt(worldCamera, worldTarget);
    renderer.camera.updateMatrixWorld(true);
    renderer.render();
    renderer.updatePlayerInteraction();
    const rect = renderer.canvas.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return {
      x, y,
      sourceId,
      highlightedBrickId: renderer.highlightedBrickId,
      preview: r.humanBuildAdapter.getPreview(),
      heldBrickId: r.humanBuildAdapter.getState().heldBrickId,
      humanGuide: r.renderer.humanGuide ? { ...r.renderer.humanGuide } : null
    };
  }, { target, sourceId, guide });
  if (debug) console.log(JSON.stringify({ check: sourceId ? 'aim-source' : 'aim-target', aim }));
  return aim;
}

async function setButtonCamera() {
  return evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    const button = r.renderer.workbench?.moreBricksButton;
    if (!button) throw new Error('more_bricks_button_mesh_missing');
    button.updateWorldMatrix(true, false);
    const worldTarget = button.getWorldPosition(r.renderer.camera.position.clone());
    // Keep the real button, the safe approach pose, and the UR10 TCP in frame
    // while the operation runs. This is a camera-only inspection aid; it does
    // not alter motion or any authority state.
    const frameTarget = worldTarget.clone();
    frameTarget.z += 120;
    const worldCamera = frameTarget.clone();
    worldCamera.x += 720;
    worldCamera.y -= 840;
    worldCamera.z += 560;
    r.renderer.player.setEnabled(true);
    r.renderer.player.activateFallbackLook();
    r.renderer.player.setLookAt(worldCamera, frameTarget);
    r.renderer.camera.updateMatrixWorld(true);
    r.renderer.render();
    r.renderer.updatePlayerInteraction();
    return { target: worldTarget.toArray(), frameTarget: frameTarget.toArray(), camera: worldCamera.toArray() };
  });
}

async function readCameraState() {
  return evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    const renderer = r.renderer;
    const camera = renderer.camera;
    camera.updateMatrixWorld(true);
    const position = camera.getWorldPosition(camera.position.clone());
    const direction = camera.getWorldDirection(camera.position.clone().set(0, 0, 0));
    return {
      position: position.toArray(),
      direction: direction.toArray(),
      fov: camera.fov,
      zoom: camera.zoom,
      near: camera.near,
      far: camera.far,
      rendererFocus: renderer.focus.toArray(),
      rendererYaw: renderer.yaw,
      rendererPitch: renderer.pitch,
      rendererRadius: renderer.radius,
      player: renderer.player?.getState?.() ?? null,
      workbenchRoot: {
        position: renderer.workbench.root.position.toArray(),
        rotation: renderer.workbench.root.rotation.toArray(),
        tableTopPosition: renderer.workbench.tableTop?.position?.toArray?.() ?? null,
        tableColor: renderer.playerSettings?.tableColor ?? null
      },
      renderedPresentation: {
        brightness: renderer.webgl.toneMappingExposure,
        tableColor: `#${renderer.workbench.tableTop.material.color.getHexString()}`
      }
    };
  });
}

async function installMotionFrameObserver() {
  return evaluate(({ includeImage }) => {
    const r = window.__ROBO_BRIDGE__;
    if (!r?.renderer?.addFrameListener) throw new Error('motion_frame_observer_unavailable');
    window.__level1MotionFrames = {};
    window.__level1MotionSawActive = false;
    window.__level1MotionObserverCleanup?.();
    const saveFrame = (phase, sample, approachDistance, contactDistance) => {
      if (window.__level1MotionFrames[phase]) return;
      // This render and canvas readback happen inside the same animation-frame
      // callback that observed the measured TCP pose. No controller state is
      // altered and no artificial pause is introduced.
      r.renderer.render();
      const dataUrl = includeImage ? r.renderer.canvas.toDataURL('image/png') : null;
      window.__level1MotionFrames[phase] = {
        phase,
        tcp: sample.tcp,
        status: sample.status,
        active: sample.active,
        pressesCompleted: sample.pressesCompleted,
        approachDistance,
        contactDistance,
        dataUrl
      };
    };
    window.__level1MotionObserverCleanup = r.renderer.addFrameListener(() => {
      const anchor = r.moreBricksButton.getAnchor();
      const state = r.moreBricksButton.getState();
      const tcp = r.robotController.getState().tcp;
      const sample = {
        tcp: { xMm: tcp.xMm, yMm: tcp.yMm, zMm: tcp.zMm },
        status: state.status,
        active: state.active,
        pressesCompleted: state.pressesCompleted
      };
      if (sample.active || sample.status === 'moving' || sample.status === 'pressing') window.__level1MotionSawActive = true;
      if (!window.__level1MotionSawActive) return;
      const approachDistance = Math.hypot(
        tcp.xMm - anchor.pose.xMm,
        tcp.yMm - anchor.pose.yMm,
        tcp.zMm - anchor.safeApproachZMm
      );
      const contactDistance = Math.hypot(
        tcp.xMm - anchor.pressedTcp.xMm,
        tcp.yMm - anchor.pressedTcp.yMm,
        tcp.zMm - anchor.pressedTcp.zMm
      );
      if (sample.pressesCompleted === 0 && approachDistance <= 18) {
        saveFrame('approach', sample, approachDistance, contactDistance);
      }
      // A 12mm frame is near-contact illustration, not physical press proof.
      if (contactDistance <= 12) saveFrame('near-contact', sample, approachDistance, contactDistance);
      if (sample.pressesCompleted >= 1 && approachDistance <= 18) {
        saveFrame('retreat', sample, approachDistance, contactDistance);
      }
    });
    return { ok: true };
  }, { includeImage: writeEvidence });
}

async function clearMotionFrameObserver() {
  return evaluate(() => {
    window.__level1MotionObserverCleanup?.();
    window.__level1MotionObserverCleanup = null;
    return true;
  });
}

async function captureRefillMotion(signal) {
  const deadline = Date.now() + 120_000;
  let approachCaptured = false;
  let nearContactCaptured = false;
  let retreatCaptured = false;
  let sawActiveMotion = false;
  let latest = null;
  while (Date.now() < deadline && !signal?.aborted) {
    latest = await evaluate(() => {
      const r = window.__ROBO_BRIDGE__;
      const anchor = r.moreBricksButton.getAnchor();
      const state = r.moreBricksButton.getState();
      const tcp = r.robotController.getState().tcp;
      const frames = Object.fromEntries(Object.entries(window.__level1MotionFrames ?? {}).map(([phase, frame]) => {
        const dataUrl = frame.dataUrlDelivered ? null : frame.dataUrl;
        frame.dataUrlDelivered = true;
        return [phase, { ...frame, dataUrl }];
      }));
      return {
        button: { xMm: anchor.pose.xMm, yMm: anchor.pose.yMm, zMm: anchor.pose.zMm },
        safeApproachZMm: anchor.safeApproachZMm,
        contactTcp: anchor.contactTcp,
        pressedTcp: anchor.pressedTcp,
        tcp,
        status: state.status,
        active: state.active,
        pressesCompleted: state.pressesCompleted,
        frames
      };
    });
    const approachDistance = Math.hypot(
      latest.tcp.xMm - latest.button.xMm,
      latest.tcp.yMm - latest.button.yMm,
      latest.tcp.zMm - latest.safeApproachZMm
    );
    const contactDistance = Math.hypot(
      latest.tcp.xMm - latest.pressedTcp.xMm,
      latest.tcp.yMm - latest.pressedTcp.yMm,
      latest.tcp.zMm - latest.pressedTcp.zMm
    );
    if (latest.active || latest.status === 'moving' || latest.status === 'pressing') sawActiveMotion = true;
    const phases = [
      ['approach', '02-more-bricks-approach'],
      ['near-contact', '03-more-bricks-near-contact'],
      ['retreat', '03-more-bricks-retreat']
    ];
    for (const [phase, filename] of phases) {
      const frame = latest.frames?.[phase];
      const alreadyCaptured = phase === 'approach' ? approachCaptured
        : phase === 'near-contact' ? nearContactCaptured
          : retreatCaptured;
      if (!frame || alreadyCaptured) continue;
      if (writeEvidence) assert.ok(frame.dataUrl, `${phase} frame readback unavailable`);
      await capture(filename, frame.dataUrl);
      if (phase === 'approach') approachCaptured = true;
      if (phase === 'near-contact') nearContactCaptured = true;
      if (phase === 'retreat') retreatCaptured = true;
    }
    if (sawActiveMotion && !latest.active && latest.status !== 'moving' && latest.status !== 'pressing') break;
    await delay(40);
  }
  const frameSummary = Object.fromEntries(Object.entries(latest?.frames ?? {}).map(([phase, frame]) => [phase, {
    phase: frame.phase,
    tcp: frame.tcp,
    status: frame.status,
    active: frame.active,
    pressesCompleted: frame.pressesCompleted,
    approachDistance: frame.approachDistance,
    contactDistance: frame.contactDistance,
    imageCaptured: writeEvidence && (phase === 'approach' ? approachCaptured
      : phase === 'near-contact' ? nearContactCaptured
        : retreatCaptured)
  }]));
  return {
    approachCaptured,
    nearContactCaptured,
    retreatCaptured,
    frames: frameSummary,
    latest: latest ? { ...latest, frames: undefined } : null
  };
}

async function clickCanvas(aim) {
  await browser.connection.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: aim.x, y: aim.y, button: 'left', clickCount: 1
  }, browser.sessionId);
  await browser.connection.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: aim.x, y: aim.y, button: 'left', clickCount: 1
  }, browser.sessionId);
}

async function humanAdoptFirstTarget(placements) {
  const source = await evaluate(() => window.__ROBO_BRIDGE__.robotController.getBricks()
    .find((brick) => brick.colour === 'blue' && !brick.heldBy && !brick.snapped && !brick.placedTargetId && !brick.placementType));
  assert.ok(source, 'blue source for human adoption is unavailable');
  const sourceAim = await setHeroCamera(null, { sourceId: source.id });
  assert.equal(sourceAim.highlightedBrickId, source.id, JSON.stringify(sourceAim));
  await clickCanvas(sourceAim);
  try {
    await browser.waitFor(`__ROBO_BRIDGE__.humanBuildAdapter.getState().heldBrickId === ${JSON.stringify(source.id)}`, { timeoutMs: 3_000 });
  } catch (error) {
    const context = await evaluate(() => {
      const r = window.__ROBO_BRIDGE__, renderer = r.renderer;
      const rect = renderer.canvas.getBoundingClientRect();
      return { player: renderer.player.getState(), human: r.humanBuildAdapter.getState(),
        highlightedBrickId: renderer.highlightedBrickId, protectedBrickId: renderer.protectedBrickId,
        highlightedMoreBricks: renderer.highlightedMoreBricks, pickupLog: r.humanBuildAdapter.getPickupLog(),
        clickElement: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.outerHTML?.slice(0,400),
        robot: { moving: r.robotController.getState().moving, operationState: r.robotController.getState().operationState } };
    });
    check('Human pickup diagnostic failure', { sourceId: source.id, sourceAim, context });
    await capture('human-pickup-failure');
    throw error;
  }
  // The pending-placement guide is the runtime's authoritative human target.
  // It may intentionally choose a later eligible target, so never couple the
  // real pointer path to a planner-array index.
  const targetAim = await setHeroCamera(null, { guide: true });
  const targetPlacementId = targetAim.humanGuide?.placementId ?? null;
  assert.ok(targetPlacementId, JSON.stringify(targetAim));
  const target = placements.find((placement) => placement.placementId === targetPlacementId);
  assert.ok(target, JSON.stringify({ targetPlacementId, placements: placements.map((placement) => placement.placementId) }));
  assert.equal(targetAim.heldBrickId, source.id, JSON.stringify(targetAim));
  assert.equal(targetAim.preview?.valid, true, JSON.stringify(targetAim));
  await clickCanvas(targetAim);
  await browser.waitFor(`__ROBO_BRIDGE__.humanBuildAdapter.getState().heldBrickId === null`, { timeoutMs: 3_000 });
  const state = await nativeCall('get_placement_stream_status', { streamId: 'level1-tower', limit: 50 });
  const adopted = (state.entries ?? []).find((entry) => entry.placementId === target.placementId);
  assert.equal(adopted?.status, 'ADOPTED', JSON.stringify({ state, target }));
  assert.equal(adopted?.actor, 'human', JSON.stringify(adopted));
  assert.equal(adopted?.actualBrickId, source.id, JSON.stringify(adopted));
  const accepted = await verifyAcceptedPlacements('level1-tower-human', [target], [adopted], { colour: 'blue' });
  const pickupLog = await evaluate(() => window.__ROBO_BRIDGE__.humanBuildAdapter.getPickupLog().at(-1));
  assert.equal(pickupLog?.brickId, source.id);
  assert.equal(pickupLog?.colourPreserved, true);
  await verifyAuthorities('Human canvas adoption');
  return { source, target, adopted, accepted, pickupLog };
}

try {
  await browser.navigate(url);
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 90_000 });
  const boot = await evaluate(() => ({
    native: Boolean((document.modelContext ?? navigator.modelContext)?.registerTool),
    testing: Boolean((document.modelContextTesting ?? navigator.modelContextTesting)?.executeTool),
    names: [...(window.__level1Tools?.keys?.() ?? [])],
    duplicates: [...(window.__level1DuplicateTools ?? [])],
    mode: window.__ROBO_BRIDGE__.demoModeControl?.getState?.().mode ?? document.documentElement.dataset.demoMode,
    rendered: Boolean(window.__ROBO_BRIDGE__.renderer?.webgl?.domElement),
    canvas: Boolean(document.querySelector('#scene'))
  }));
  assert.equal(boot.native, true, JSON.stringify(boot));
  assert.equal(boot.testing, true, JSON.stringify(boot));
  assert.equal(boot.mode, 'simple', JSON.stringify(boot));
  assert.equal(boot.rendered, true, JSON.stringify(boot));
  assert.equal(boot.canvas, true, JSON.stringify(boot));
  assert.equal(boot.duplicates.length, 0, JSON.stringify(boot));
  const required = [
    'get_scene_state', 'get_build_state', 'get_robot_state', 'get_workspace',
    'observe_camera', 'preview_placement', 'plan_placement_queue',
    'get_placement_stream_status', 'control_placement_stream', 'execute_next_placement',
    'move_tool', 'latch', 'unlatch', 'claim_target', 'reset_workcell',
    'get_scene_settings', 'update_scene_settings', 'request_more_bricks'
  ];
  assert.deepEqual(required.filter((name) => !boot.names.includes(name)), [], JSON.stringify(boot));
  check('native Level 1 boot', { ...boot, toolCount: boot.names.length, requiredTools: required.length });
  markGate('native_boot');
  await verifyAuthorities('boot', true);
  await verifyInitialInventory();
  await capture('00-initial-simple-scene');

  const profile = await currentProfile();

  if (!towerOnly) {
  // Requested-colour single brick.
  await resetSimple();
  const single = makePlacements(profile, { structure: 'single', colour: 'blue' });
  await planStream('level1-single', single.placements, 1000);
  await startStream('level1-single', single.placements.length, 1000);
  const singleEntries = await completeStream('level1-single', 1);
  await verifyAcceptedPlacements('level1-single', single.placements, singleEntries, { colour: 'blue' });
  check('blue single', { completed: singleEntries.length, actualBrickId: singleEntries[0].actualBrickId });
  markGate('blue_single');
  await waitForHudComplete(1);
  await evaluate(() => window.__ROBO_BRIDGE__.renderer.setView('target'));
  await capture('01-blue-single');

  // The refill request must route through the real MORE BRICKS control.  Plan
  // the strict-blue wall before pressing so the demand-aware shared
  // dispenser supplies the colour actually needed by the next run.  The
  // result is intentionally evidence-based; this script never calls a spawn
  // helper or mutates the controller directly.
  await resetSimple();
  const wall = makePlacements(profile, { structure: 'wall', width: 5, height: 7, depth: 1, colour: 'blue' });
  await planStream('level1-wall-5x7', wall.placements, 2000);
  const beforeRefill = await readRuntimeState();
  await setButtonCamera();
  await installMotionFrameObserver();
  const motionCaptureAbort = new AbortController();
  const refillMotion = captureRefillMotion(motionCaptureAbort.signal);
  // Attach a rejection handler immediately; an assertion in the refill must
  // not leave its independent capture polling a browser that is closing.
  refillMotion.catch(() => {});
  // Arm the real state sampler before invoking the native tool so the fast
  // safe-approach and first retreat transitions cannot be missed.
  await delay(120);
  let refillMotionResult;
  try {
    await requestPhysicalRefill('MORE BRICKS physical double press', beforeRefill.worldRevision,
      { streamId: 'level1-wall-5x7', requiredBlueSources: wall.placements.length });
    refillMotionResult = await refillMotion;
  } finally {
    motionCaptureAbort.abort();
    await refillMotion.catch(() => {});
    await clearMotionFrameObserver();
  }
  assert.equal(refillMotionResult.approachCaptured, true, JSON.stringify(refillMotionResult));
  assert.equal(refillMotionResult.nearContactCaptured, true, JSON.stringify(refillMotionResult));
  assert.equal(refillMotionResult.retreatCaptured, true, JSON.stringify(refillMotionResult));
  if (writeEvidence) check('MORE BRICKS motion evidence', refillMotionResult);

  // Mandatory 5 x 7 blue wall.  It is deliberately strict-colour, so an
  // incorrect refill cannot be hidden by preferred-colour fallback.
  const speedRevision = (await readRuntimeState()).worldRevision;
  const floorSpeed = await nativeCall('control_placement_stream', {
    action: 'set_speed', cycleTimeMs: 889, expectedWorldRevision: speedRevision
  });
  assert.equal(isSuccess(floorSpeed), true, JSON.stringify(floorSpeed));
  assert.equal(floorSpeed.cycleTimeMs, 1000, JSON.stringify(floorSpeed));
  check('cycle-time safety floor', { requestedCycleTimeMs: 889, appliedCycleTimeMs: floorSpeed.cycleTimeMs });
  const restoredSpeedRevision = (await readRuntimeState()).worldRevision;
  const speed = await nativeCall('control_placement_stream', {
    action: 'set_speed', cycleTimeMs: 1333, expectedWorldRevision: restoredSpeedRevision
  });
  assert.equal(isSuccess(speed), true, JSON.stringify(speed));
  assert.equal(speed.cycleTimeMs, 1333, JSON.stringify(speed));
  check('1333 ms cadence configuration', { requestedCycleTimeMs: 1333, appliedCycleTimeMs: speed.cycleTimeMs,
    nominalBaselineCycleTimeMs: 2000, nominalRateMultiplier: 2000 / 1333, measuredSpeedupProven: false });
  markGate('speed_configuration');
  await startStream('level1-wall-5x7', wall.placements.length, 1333);
  const wallEntries = await completeStreamWithPhysicalRefills('level1-wall-5x7', 35, 1333);
  const actualWall = await verifyAcceptedPlacements('level1-wall-5x7', wall.placements, wallEntries, { colour: 'blue' });
  const wallColours = actualWall.map((brick) => brick.colour);
  assert.equal(wallColours.length, 35);
  assert.equal(wallColours.every((colour) => colour === 'blue'), true, JSON.stringify(wallColours));
  check('5 x 7 x 1 blue wall', { completed: wallEntries.length, uniqueSources: new Set(wallEntries.map((entry) => entry.actualBrickId)).size, colours: [...new Set(wallColours)] });
  markGate('blue_wall_35');
  await waitForHudComplete(wallEntries.length);
  await evaluate(() => window.__ROBO_BRIDGE__.renderer.setView('target'));
  await capture('04-blue-wall-5x7');
  }

  // Mandatory 12-target two-brick-per-layer tower.  Open colour permits one
  // compatible blue human source to be ADOPTED while the preferred robot
  // sources remain red, matching the co-build contract.
  await resetSimple();
  const tower = makePlacements(profile, { structure: 'cross_laminated_tower', width: 2, height: 6, depth: 1, colour: 'red' }, { openColour: true });
  await planStream('level1-tower', tower.placements, 1000);
  const adoption = await humanAdoptFirstTarget(tower.placements);
  check('human canvas pickup/release ADOPTED', {
    sourceId: adoption.source.id,
    sourceColour: adoption.source.colour,
    targetId: adoption.target.placementId,
    actualBrickId: adoption.adopted.actualBrickId,
    pickupLog: adoption.pickupLog
  });
  markGate('human_adoption');
  const towerStart = await startStream('level1-tower', tower.placements.length - 1, 1000);
  assert.equal(isSuccess(towerStart), true, JSON.stringify(towerStart));
  const towerEntries = await completeStream('level1-tower', 12);
  assert.equal(towerEntries.filter((entry) => entry.status === 'ADOPTED').length, 1, JSON.stringify(towerEntries));
  assert.equal(towerEntries.filter((entry) => entry.actor === 'human').length, 1, JSON.stringify(towerEntries));
  assert.equal(towerStart.completedRun.completedPlacements, 11);
  const actualTower = await verifyAcceptedPlacements('level1-tower', tower.placements, towerEntries,
    { coloursByActor: { agent: 'red', human: 'blue' } });
  assert.equal(actualTower.filter((brick) => brick.colour === 'red').length, 11);
  assert.deepEqual(actualTower.filter((brick) => brick.colour === 'blue').map((brick) => brick.actualBrickId), [adoption.source.id]);
  check('12-target red two-brick tower', { completed: towerEntries.length, adopted: towerEntries.filter((entry) => entry.status === 'ADOPTED').length, robotCompleted: towerEntries.filter((entry) => entry.status === 'COMPLETED').length });
  markGate('tower_12');
  await waitForHudComplete(towerEntries.length);
  await evaluate(() => window.__ROBO_BRIDGE__.renderer.setView('target'));
  await capture('05-red-tower-12-target');

  // Generic presentation settings share the PlayerSettingsStore and require
  // the latest exact world revision.  Use one atomic patch for both fields.
  const cameraBeforeSettings = await readCameraState();
  const geometryBeforeSettings = await readAuthoritySnapshot();
  const settingsBefore = await nativeCall('get_scene_settings');
  assert.equal(isSuccess(settingsBefore), true, JSON.stringify(settingsBefore));
  const nextBrightness = Math.min(4, Number(settingsBefore.brightness ?? settingsBefore.settings?.brightness ?? 1) + 0.25);
  const settingsChanged = await nativeCall('update_scene_settings', {
    brightness: nextBrightness,
    tableColor: '#444444',
    expectedWorldRevision: settingsBefore.worldRevision
  });
  assert.equal(isSuccess(settingsChanged), true, JSON.stringify(settingsChanged));
  assert.equal(Number(settingsChanged.brightness ?? settingsChanged.settings?.brightness), nextBrightness, JSON.stringify(settingsChanged));
  assert.equal(String(settingsChanged.tableColor ?? settingsChanged.settings?.tableColor).toLowerCase(), '#444444', JSON.stringify(settingsChanged));
  const settingsAfter = await nativeCall('get_scene_settings', { expectedWorldRevision: settingsChanged.worldRevision });
  assert.equal(isSuccess(settingsAfter), true, JSON.stringify(settingsAfter));
  assert.equal(Number(settingsAfter.brightness ?? settingsAfter.settings?.brightness), nextBrightness);
  assert.equal(String(settingsAfter.tableColor ?? settingsAfter.settings?.tableColor).toLowerCase(), '#444444');
  assert.ok(settingsChanged.worldRevision > settingsBefore.worldRevision);
  assert.equal(settingsAfter.worldRevision, settingsChanged.worldRevision);
  const cameraAfterSettings = await readCameraState();
  await delay(80);
  const cameraAfterFrame = await readCameraState();
  assertCameraInvariant(cameraBeforeSettings, cameraAfterSettings, 'settings update');
  assertCameraInvariant(cameraBeforeSettings, cameraAfterFrame, 'settings render settle');
  assert.equal(cameraAfterFrame.renderedPresentation.brightness, nextBrightness);
  assert.equal(cameraAfterFrame.renderedPresentation.tableColor.toLowerCase(), '#444444');
  for (const field of ['position', 'rotation', 'tableTopPosition']) {
    assert.deepEqual(cameraAfterFrame.workbenchRoot[field], cameraBeforeSettings.workbenchRoot[field], `settings moved workbench ${field}`);
  }
  const geometryAfterSettings = await readAuthoritySnapshot();
  assert.deepEqual(geometryAfterSettings.bricks, geometryBeforeSettings.bricks, 'presentation settings changed source/accepted geometry');
  assert.deepEqual(geometryAfterSettings.placements, geometryBeforeSettings.placements, 'presentation settings changed the live board');
  check('scene brightness and table colour', {
    before: settingsBefore,
    changed: settingsChanged,
    after: settingsAfter,
    cameraBeforeSettings,
    cameraAfterSettings,
    cameraAfterFrame
  });
  markGate('settings');
  await capture('06-settings-brighter-dark-table');

  await verifyAuthorities('completed run');
  markGate('authority_and_registrar');
  report.console = browser.console;
  assert.equal(browser.console.errors.length + browser.console.exceptions.length, 0, JSON.stringify(browser.console));
  assert.equal(browser.console.warnings.length, 0, JSON.stringify(browser.console));
  check('console', { errors: browser.console.errors.length, warnings: browser.console.warnings.length });
  markGate('console');
  assert.deepEqual(report.requiredGates.filter((gate) => !report.completedGates.includes(gate)), [], 'required acceptance gates were skipped');
  report.automatedStatus = towerOnly ? 'PARTIAL_PASS' : 'FULL_PASS';
  report.fullAutomatedRunPassed = !towerOnly;
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.automatedStatus = 'FAILED';
  report.error = error?.stack ?? String(error);
  report.console = browser.console;
  console.error(error);
  process.exitCode = 1;
} finally {
  report.missingGates = report.requiredGates.filter((gate) => !report.completedGates.includes(gate));
  if (writeEvidence) {
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  }
  await browser.close();
}

if (report.ok) console.log(JSON.stringify({ passed: true, scope: report.scope, automatedStatus: report.automatedStatus,
  fullAutomatedRunPassed: report.fullAutomatedRunPassed, skippedGates: report.skippedGates,
  checks: report.checks.length, screenshots: report.screenshots, visual: report.visual }));
