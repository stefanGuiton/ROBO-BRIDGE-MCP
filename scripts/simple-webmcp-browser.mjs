// Explicit state-only acceptance. No screenshots or visual grading.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { ChromiumSession } from '../tools/submission/cdp-browser.mjs';
import { simplePlacements, SIMPLE_DEMO_SCENARIOS } from '../tests/helpers/simple-demo-harness.js';

// Observe real native registration, never supply a modelContext shim.
const preload = `(() => {
  window.__simpleTools = new Map();
  const context = navigator.modelContext;
  if (!context?.registerTool) return;
  const proto = Object.getPrototypeOf(context), register = proto.registerTool;
  proto.registerTool = function(tool, options) {
    const result = register.call(this, tool, options);
    if (window.__simpleTools.has(tool.name)) throw new Error('duplicate_tool:' + tool.name);
    window.__simpleTools.set(tool.name, tool);
    return result;
  };
})();`;
const browser = await ChromiumSession.launch({ preloadScript: preload, args: ['--enable-experimental-web-platform-features'] });
const report = { browser: browser.version.product, visual: 'USER-VERIFY PENDING', screenshots: 'NOT REQUESTED', tests: [] };
const check = (name, details) => { report.tests.push({ name, ...details }); console.log(JSON.stringify({ name, ...details })); };
const evaluate = (fn, args = null) => browser.evaluate(`(${fn.toString()})(${JSON.stringify(args)})`);
const call = (name, input = {}) => evaluate(async ({ name, input }) => {
  const value = await navigator.modelContextTesting.executeTool(name, JSON.stringify(input));
  return typeof value === 'string' ? JSON.parse(value) : value;
}, { name, input });
try {
  await browser.navigate(process.env.ROBO_SIMPLE_URL ?? 'http://127.0.0.1:8774/?demo=simple');
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 90000 });
  const boot = await evaluate(() => ({ native: Boolean(navigator.modelContext?.registerTool), names: [...window.__simpleTools.keys()], mode: __ROBO_BRIDGE__.demoModeControl.getState().mode,
    terrain: __ROBO_BRIDGE__.challenge.terrainGroup.visible, hologram: __ROBO_BRIDGE__.renderer.machineRoot.getObjectByName('V46_EXACT_BUILDPLAN_HOLOGRAM').visible }));
  assert.equal(boot.native, true); assert.equal(boot.names.length, 28); assert.equal(boot.mode, 'simple'); assert.equal(boot.terrain, false); assert.equal(boot.hologram, false);
  check('native registration and Simple mode', boot);
  await evaluate(() => { const r = __ROBO_BRIDGE__; window.__simpleAuthorities = [r.robotController, r.board, r.fastPlacement, r.placementCycleRunner]; });
  for (const shape of SIMPLE_DEMO_SCENARIOS) {
    await evaluate(() => __ROBO_BRIDGE__.demoModeControl.change('simple', { reset: true }));
    const workspace = await call('get_workspace');
    const scene = await call('get_scene_state', { type: 'brick', limit: 20 });
    const placements = simplePlacements(shape, workspace);
    const planned = await call('plan_placement_queue', { streamId: shape.prefix, mode: 'replace', finalChunk: true, placements, cycleTimeMs: 2000, expectedWorldRevision: scene.worldRevision });
    assert.equal(planned.ok, true, JSON.stringify(planned));
    const start = await call('control_placement_stream', { action: 'start', cycleTimeMs: 2000, maximumPlacements: placements.length, expectedWorldRevision: planned.worldRevision });
    assert.equal(start.ok, true, JSON.stringify(start));
    if (shape.prefix === 'tower') {
      await browser.waitFor(`__ROBO_BRIDGE__.fastPlacement.summary().satisfiedPlacements >= 1`, { timeoutMs: 20000 });
      const human = await evaluate(() => {
        const r = __ROBO_BRIDGE__, entry = r.fastPlacement.stream.entries[1];
        const brick = r.robotController.getBricks().find(b => b.colour === 'blue' && !b.heldBy && !b.placementType);
        const preview = r.robotController.placementAuthority.preview({ brickId: brick.id, position: entry.request.position, yawRad: entry.request.yawRad });
        if (!preview.ok) return preview;
        const pickup = r.robotController.beginHumanCarry(brick.id); if (!pickup.ok) return pickup;
        return r.robotController.commitHumanPlacement({ brickId: brick.id, position: preview.candidate.position, yawRad: preview.candidate.yawRad });
      });
      assert.equal(human.ok, true, JSON.stringify(human));
      for (const cycleTimeMs of [1333, 889]) {
        const changed = await evaluate(async cycleTimeMs => {
          const result = await navigator.modelContextTesting.executeTool('control_placement_stream', JSON.stringify({ action: 'set_speed', cycleTimeMs, expectedWorldRevision: __ROBO_BRIDGE__.robotController.worldRevision }));
          return typeof result === 'string' ? JSON.parse(result) : result;
        }, cycleTimeMs);
        assert.equal(changed.cycleTimeMs, Math.max(1000, cycleTimeMs));
        check('live speed', { requested: cycleTimeMs, applied: changed.cycleTimeMs });
      }
    }
    await browser.waitFor(`!__ROBO_BRIDGE__.placementCycleRunner.getState().running`, { timeoutMs: 90000 });
    const result = await call('get_placement_stream_status', { streamId: shape.prefix, limit: 50 });
    const execution = await evaluate(() => __ROBO_BRIDGE__.streamControl.getState());
    assert.equal(result.satisfiedPlacements, placements.length, JSON.stringify({ result, execution }));
    // Native responses remain bounded; follow the cursor when needed.
    const all = [...result.entries];
    if (result.nextCursor !== null) all.push(...(await call('get_placement_stream_status', { streamId: shape.prefix, cursor: result.nextCursor, limit: 20 })).entries);
    assert.equal(new Set(all.map(e => e.actualBrickId)).size, placements.length);
    const adopted = all.filter(e => e.status === 'ADOPTED');
    if (shape.prefix === 'tower') { assert.equal(adopted.length, 1); assert.equal(adopted[0].actor, 'human'); }
    check(shape.prefix, { completed: result.satisfiedPlacements, required: placements.length, adopted, execution });
  }
  const modes = await evaluate(async () => {
    const r = __ROBO_BRIDGE__, planId = r.bridgeHost.planId;
    const bridge = await r.demoModeControl.change('bridge');
    const visible = r.challenge.terrainGroup.visible;
    const simple = await r.demoModeControl.change('simple');
    return { bridge: bridge.mode, simple: simple.mode, visible, samePlan: planId === r.bridgeHost.planId,
      sameAuthorities: window.__simpleAuthorities.every((a, i) => a === [r.robotController, r.board, r.fastPlacement, r.placementCycleRunner][i]),
      count: window.__simpleTools.size };
  });
  assert.equal(modes.sameAuthorities, true); assert.equal(modes.samePlan, true); assert.equal(modes.visible, true); assert.equal(modes.count, 28);
  check('mode reset and preserved bridge', modes);
  report.console = browser.console;
  assert.equal(browser.console.errors.length + browser.console.exceptions.length, 0, JSON.stringify(browser.console));
  check('console', { errors: browser.console.errors.length, warnings: browser.console.warnings.length });
  report.ok = true;
} catch (error) { report.ok = false; report.error = error.message; report.console = browser.console; console.error(error); process.exitCode = 1; }
finally {
  if (process.argv.includes('--write-evidence')) { await mkdir('output/playwright/simple-webmcp', { recursive: true }); await writeFile('output/playwright/simple-webmcp/acceptance.json', JSON.stringify(report, null, 2)); }
  await browser.close();
}
