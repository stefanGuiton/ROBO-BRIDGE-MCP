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

const report = {
  browser: null,
  url,
  visual: 'USER-VERIFY PENDING',
  screenshots: [],
  checks: [],
  console: null,
  ok: false
};

function check(name, details = {}) {
  report.checks.push({ name, ...details });
  console.log(JSON.stringify({ check: name, ...details }));
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
  const context = navigator.modelContext;
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
const nativeCall = (name, input = {}) => evaluate(async ({ name, input }) => {
  if (!navigator.modelContextTesting?.executeTool) throw new Error('native_model_context_testing_unavailable');
  return navigator.modelContextTesting.executeTool(name, JSON.stringify(input));
}, { name, input }).then(parseToolResult);

async function capture(name) {
  if (!writeEvidence) return null;
  const file = path.join(output, `${name}.png`);
  await browser.screenshot(file);
  report.screenshots.push(file);
  return file;
}

async function readRuntimeState() {
  return evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    const bricks = r.robotController.getBricks();
    const loose = bricks.filter((brick) => !brick.heldBy && !brick.placedTargetId && !brick.placementType);
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

async function resetSimple() {
  const result = await evaluate(() => window.__ROBO_BRIDGE__.demoModeControl.change('simple', { reset: true }));
  assert.equal(result?.ok, true, JSON.stringify(result));
  await browser.waitFor(`document.documentElement.dataset.demoMode === 'simple'`, { timeoutMs: 10_000 });
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
  return result;
}

async function streamEntries(streamId) {
  const entries = [];
  let cursor = 0;
  for (;;) {
    const result = await nativeCall('get_placement_stream_status', { streamId, cursor, limit: 50 });
    assert.equal(isSuccess(result), true, JSON.stringify(result));
    entries.push(...(result.entries ?? []));
    if (result.nextCursor === null || result.nextCursor === undefined) break;
    if (!Number.isInteger(result.nextCursor) || result.nextCursor <= cursor) break;
    cursor = result.nextCursor;
  }
  return entries;
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

async function requestPhysicalRefill(label, expectedWorldRevision) {
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
  const spawnedDelta = Number(refill.spawnedDelta ?? 0);
  assert.ok(spawnedDelta > 0, JSON.stringify(refill));
  check(label, {
    pressesRequested: refill.pressesRequested,
    pressesCompleted: refill.pressesCompleted,
    spawnedDelta,
    worldRevisionBefore: refill.worldRevisionBefore,
    worldRevisionAfter: refill.worldRevisionAfter,
    inventoryAfter: refill.inventoryAfter
  });
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
    await requestPhysicalRefill(`MORE BRICKS physical resume ${refillCount + 1}`, before.worldRevision);
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
    worldCamera.z += 120;
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
      }
    };
  });
}

async function captureRefillMotion() {
  const deadline = Date.now() + 120_000;
  let approachCaptured = false;
  let pressCaptured = false;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await evaluate(() => {
      const r = window.__ROBO_BRIDGE__;
      const anchor = r.moreBricksButton.getAnchor();
      const state = r.moreBricksButton.getState();
      const tcp = r.robotController.getState().tcp;
      return {
        button: { xMm: anchor.pose.xMm, yMm: anchor.pose.yMm, zMm: anchor.pose.zMm },
        safeApproachZMm: anchor.safeApproachZMm,
        contactTcp: anchor.contactTcp,
        pressedTcp: anchor.pressedTcp,
        tcp,
        status: state.status,
        active: state.active,
        pressesCompleted: state.pressesCompleted
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
    if (!approachCaptured && approachDistance <= 18) {
      await capture('02-more-bricks-approach');
      approachCaptured = true;
    }
    if (!pressCaptured && latest.status === 'pressing' && contactDistance <= 12) {
      await capture('03-more-bricks-press');
      pressCaptured = true;
    }
    if (!latest.active && latest.status !== 'moving' && latest.status !== 'pressing') break;
    await delay(40);
  }
  return { approachCaptured, pressCaptured, latest };
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
    .find((brick) => brick.colour === 'blue' && !brick.heldBy && !brick.placedTargetId && !brick.placementType));
  assert.ok(source, 'blue source for human adoption is unavailable');
  const target = placements[0];
  const sourceAim = await setHeroCamera(null, { sourceId: source.id });
  assert.equal(sourceAim.highlightedBrickId, source.id, JSON.stringify(sourceAim));
  await clickCanvas(sourceAim);
  await browser.waitFor(`__ROBO_BRIDGE__.humanBuildAdapter.getState().heldBrickId === ${JSON.stringify(source.id)}`, { timeoutMs: 3_000 });
  const targetAim = await setHeroCamera({ xMm: target.xMm, yMm: target.yMm, zMm: target.zMm }, { guide: true });
  assert.equal(targetAim.heldBrickId, source.id, JSON.stringify(targetAim));
  assert.equal(targetAim.preview?.valid, true, JSON.stringify(targetAim));
  await clickCanvas(targetAim);
  await browser.waitFor(`__ROBO_BRIDGE__.humanBuildAdapter.getState().heldBrickId === null`, { timeoutMs: 3_000 });
  const state = await nativeCall('get_placement_stream_status', { streamId: 'level1-tower', limit: 50 });
  const adopted = (state.entries ?? []).find((entry) => entry.placementId === target.placementId);
  assert.equal(adopted?.status, 'ADOPTED', JSON.stringify({ state, target }));
  assert.equal(adopted?.actor, 'human', JSON.stringify(adopted));
  assert.equal(adopted?.actualBrickId, source.id, JSON.stringify(adopted));
  return { source, target, adopted, pickupLog: await evaluate(() => window.__ROBO_BRIDGE__.humanBuildAdapter.getPickupLog().at(-1)) };
}

try {
  await browser.navigate(url);
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 90_000 });
  const boot = await evaluate(() => ({
    native: Boolean(navigator.modelContext?.registerTool),
    testing: Boolean(navigator.modelContextTesting?.executeTool),
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
  await capture('00-initial-simple-scene');

  const profile = await currentProfile();

  if (!towerOnly) {
  // Requested-colour single brick.
  await resetSimple();
  const single = makePlacements(profile, { structure: 'single', colour: 'blue' });
  await planStream('level1-single', single.placements, 1000);
  await startStream('level1-single', single.placements.length, 1000);
  const singleEntries = await completeStream('level1-single', 1);
  assert.equal(singleEntries[0].expectedColour ?? singleEntries[0].requestedColour ?? 'blue', 'blue');
  check('blue single', { completed: singleEntries.length, actualBrickId: singleEntries[0].actualBrickId });
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
  const refillPromise = requestPhysicalRefill('MORE BRICKS physical double press', beforeRefill.worldRevision);
  const refillMotion = captureRefillMotion();
  await refillPromise;
  const refillMotionResult = await refillMotion;
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
  check('50% faster cadence', { requestedCycleTimeMs: 1333, appliedCycleTimeMs: speed.cycleTimeMs });
  await startStream('level1-wall-5x7', wall.placements.length, 1333);
  const wallEntries = await completeStreamWithPhysicalRefills('level1-wall-5x7', 35, 1333);
  const wallColours = await evaluate(({ ids }) => {
    const bricks = new Map(window.__ROBO_BRIDGE__.robotController.getBricks().map((brick) => [brick.id, brick]));
    return ids.map((id) => bricks.get(id)?.colour ?? null);
  }, { ids: wallEntries.map((entry) => entry.actualBrickId) });
  assert.equal(wallColours.length, 35);
  assert.equal(wallColours.every((colour) => colour === 'blue'), true, JSON.stringify(wallColours));
  check('5 x 7 x 1 blue wall', { completed: wallEntries.length, uniqueSources: new Set(wallEntries.map((entry) => entry.actualBrickId)).size, colours: [...new Set(wallColours)] });
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
  const towerStart = await startStream('level1-tower', tower.placements.length - 1, 1000);
  assert.equal(isSuccess(towerStart), true, JSON.stringify(towerStart));
  const towerEntries = await completeStream('level1-tower', 12);
  assert.equal(towerEntries.filter((entry) => entry.status === 'ADOPTED').length, 1, JSON.stringify(towerEntries));
  assert.equal(towerEntries.filter((entry) => entry.actor === 'human').length, 1, JSON.stringify(towerEntries));
  check('12-target red two-brick tower', { completed: towerEntries.length, adopted: towerEntries.filter((entry) => entry.status === 'ADOPTED').length, robotCompleted: towerEntries.filter((entry) => entry.status === 'COMPLETED').length });
  await waitForHudComplete(towerEntries.length);
  await evaluate(() => window.__ROBO_BRIDGE__.renderer.setView('target'));
  await capture('05-red-tower-12-target');

  // Generic presentation settings share the PlayerSettingsStore and require
  // the latest exact world revision.  Use one atomic patch for both fields.
  const cameraBeforeSettings = await readCameraState();
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
  const cameraAfterSettings = await readCameraState();
  await delay(80);
  const cameraAfterFrame = await readCameraState();
  assertCameraInvariant(cameraBeforeSettings, cameraAfterSettings, 'settings update');
  assertCameraInvariant(cameraBeforeSettings, cameraAfterFrame, 'settings render settle');
  check('scene brightness and table colour', {
    before: settingsBefore,
    changed: settingsChanged,
    after: settingsAfter,
    cameraBeforeSettings,
    cameraAfterSettings,
    cameraAfterFrame
  });
  await capture('06-settings-brighter-dark-table');

  report.console = browser.console;
  assert.equal(browser.console.errors.length + browser.console.exceptions.length, 0, JSON.stringify(browser.console));
  assert.equal(browser.console.warnings.length, 0, JSON.stringify(browser.console));
  check('console', { errors: browser.console.errors.length, warnings: browser.console.warnings.length });
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error?.stack ?? String(error);
  report.console = browser.console;
  console.error(error);
  process.exitCode = 1;
} finally {
  if (writeEvidence) {
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  }
  await browser.close();
}

if (report.ok) console.log(JSON.stringify({ passed: true, checks: report.checks.length, screenshots: report.screenshots, visual: report.visual }));
