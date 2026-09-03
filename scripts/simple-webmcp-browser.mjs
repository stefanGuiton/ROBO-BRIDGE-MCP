// Explicit state-only acceptance. No screenshots or visual grading.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { ChromiumSession } from '../tools/submission/cdp-browser.mjs';
import { selectHumanContributionGuide } from '../apps/web/src/logo/simple-human-slot-guide.js';
import { FINAL_TOWER_REQUEST, simplePlacements, SIMPLE_DEMO_SCENARIOS } from '../tests/helpers/simple-demo-harness.js';

// Observe real native registration. Do not install a modelContext shim.
const preload = `(() => {
  window.__simpleTools = new Map();
  const context = document.modelContext ?? navigator.modelContext;
  if (!context?.registerTool) return;
  const proto = Object.getPrototypeOf(context);
  const register = proto.registerTool;
  proto.registerTool = function(tool, options) {
    const result = register.call(this, tool, options);
    if (window.__simpleTools.has(tool.name)) throw new Error('duplicate_tool:' + tool.name);
    window.__simpleTools.set(tool.name, tool);
    return result;
  };
})();`;

const browser = await ChromiumSession.launch({
  preloadScript: preload,
  args: ['--enable-experimental-web-platform-features']
});
const report = {
  browser: browser.version.product,
  visual: 'STATE AND VISIBLE GUIDE CHECKED',
  screenshots: 'NOT REQUESTED',
  tests: []
};
const check = (name, details) => {
  report.tests.push({ name, ...details });
  console.log(JSON.stringify({ name, ...details }));
};
const evaluate = (fn, args = null) => browser.evaluate(`(${fn.toString()})(${JSON.stringify(args)})`);
const call = (name, input = {}) => evaluate(async ({ name, input }) => {
  const testing = document.modelContextTesting ?? navigator.modelContextTesting;
  const value = await testing.executeTool(name, JSON.stringify(input));
  return typeof value === 'string' ? JSON.parse(value) : value;
}, { name, input });

try {
  await browser.navigate(process.env.ROBO_SIMPLE_URL ?? 'http://127.0.0.1:8774/?demo=simple');
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 90000 });

  const boot = await evaluate(() => ({
    native: Boolean(document.modelContext?.registerTool ?? navigator.modelContext?.registerTool),
    names: [...window.__simpleTools.keys()],
    mode: __ROBO_BRIDGE__.demoModeControl.getState().mode,
    terrain: __ROBO_BRIDGE__.challenge?.terrainGroup?.visible ?? false,
    hologram: __ROBO_BRIDGE__.renderer.machineRoot.getObjectByName('V46_EXACT_BUILDPLAN_HOLOGRAM')?.visible ?? false,
    request: document.querySelector('[data-simple-human-pose]')?.textContent ?? ''
  }));
  assert.equal(boot.native, true);
  assert.equal(boot.names.length, 28);
  assert.equal(new Set(boot.names).size, 28);
  assert.equal(boot.mode, 'simple');
  assert.equal(boot.terrain, false);
  assert.equal(boot.hologram, false);
  check('native registration and Simple mode', boot);

  await evaluate(() => {
    const runtime = __ROBO_BRIDGE__;
    window.__simpleAuthorities = [
      runtime.robotController,
      runtime.board,
      runtime.fastPlacement,
      runtime.placementCycleRunner
    ];
  });

  for (const shape of SIMPLE_DEMO_SCENARIOS) {
    const reset = await evaluate(() => __ROBO_BRIDGE__.demoModeControl.change('simple', { reset: true }));
    assert.equal(reset.ok, true);
    assert.equal(reset.mode, 'simple');

    const workspace = await call('get_workspace');
    const scene = await call('get_scene_state', { type: 'brick', limit: 20 });
    const placements = simplePlacements(shape, workspace);
    const planned = await call('plan_placement_queue', {
      streamId: shape.prefix,
      mode: 'replace',
      finalChunk: true,
      placements,
      cycleTimeMs: 2000,
      expectedWorldRevision: scene.worldRevision
    });
    assert.equal(planned.ok, true, JSON.stringify(planned));

    let startRevision = planned.worldRevision;
    let humanEvidence = null;
    if (shape.prefix === 'tower') {
      assert.equal(shape.request, FINAL_TOWER_REQUEST);
      assert.equal(placements.length, 12);
      const before = await call('get_placement_stream_status', { streamId: shape.prefix, limit: 50 });
      const guide = selectHumanContributionGuide(before);
      assert.ok(guide, JSON.stringify(before));
      assert.equal(guide.status, 'PLANNED');
      assert.notEqual(guide.placementId, guide.robotNextPlacementId);
      assert.equal(before.activeQueue[1].placementId, guide.placementId);

      await browser.waitFor(
        `document.querySelector('[data-simple-human-slot]')?.textContent.includes(${JSON.stringify(guide.placementId)})`,
        { timeoutMs: 5000 }
      );
      const guideUi = await evaluate(() => ({
        slot: document.querySelector('[data-simple-human-slot]')?.textContent,
        pose: document.querySelector('[data-simple-human-pose]')?.textContent,
        rule: document.querySelector('[data-simple-human-rule]')?.textContent
      }));
      assert.match(guideUi.pose, new RegExp(`YAW ${guide.targetYawDeg}°`));
      assert.match(guideUi.rule, /blue brick/i);

      const human = await evaluate(({ guide, beforeWorldRevision }) => {
        const runtime = __ROBO_BRIDGE__;
        const brick = runtime.robotController.getBricks().find(item =>
          item.colour === 'blue' && !item.heldBy && !item.placementType
        );
        if (!brick) return { ok: false, reason: 'blue_source_unavailable' };
        const preview = runtime.robotController.placementAuthority.preview({
          brickId: brick.id,
          position: guide.targetPosition,
          yawRad: guide.targetYawDeg * Math.PI / 180
        });
        if (!preview.ok) return preview;
        const pickup = runtime.robotController.beginHumanCarry(brick.id);
        if (!pickup.ok) return pickup;
        const placed = runtime.robotController.commitHumanPlacement({
          brickId: brick.id,
          position: preview.candidate.position,
          yawRad: preview.candidate.yawRad
        });
        return {
          ...placed,
          brickId: brick.id,
          colour: placed.brick?.colour ?? brick.colour,
          beforeWorldRevision,
          pickupWorldRevision: pickup.worldRevision,
          placementWorldRevision: placed.worldRevision
        };
      }, { guide, beforeWorldRevision: before.worldRevision });
      assert.equal(human.ok, true, JSON.stringify(human));
      assert.equal(human.colour, 'blue');
      assert.ok(human.pickupWorldRevision > human.beforeWorldRevision);
      assert.ok(human.placementWorldRevision > human.pickupWorldRevision);

      const adoptedState = await call('get_placement_stream_status', { streamId: shape.prefix, limit: 50 });
      const adopted = adoptedState.entries.find(entry => entry.placementId === guide.placementId);
      assert.equal(adopted.status, 'ADOPTED');
      assert.equal(adopted.actor, 'human');
      assert.equal(adopted.actualBrickId, human.brickId);
      assert.equal(adoptedState.satisfiedPlacements, 1);
      assert.equal(adoptedState.activeQueue.some(entry => entry.placementId === guide.placementId), false);

      await browser.waitFor(
        `document.querySelector('[data-simple-human-guide]')?.dataset.state === 'adopted'`,
        { timeoutMs: 5000 }
      );
      const adoptedUi = await evaluate(() => ({
        slot: document.querySelector('[data-simple-human-slot]')?.textContent,
        pose: document.querySelector('[data-simple-human-pose]')?.textContent
      }));
      assert.match(adoptedUi.slot, /BLUE ADOPTED/);
      assert.match(adoptedUi.pose, new RegExp(human.brickId));
      startRevision = adoptedState.worldRevision;
      humanEvidence = { guide, human, adopted, guideUi, adoptedUi };
    }

    const start = await call('control_placement_stream', {
      action: 'start',
      cycleTimeMs: 2000,
      maximumPlacements: placements.length,
      expectedWorldRevision: startRevision
    });
    assert.equal(start.ok, true, JSON.stringify(start));

    if (shape.prefix === 'tower') {
      for (const cycleTimeMs of [1333, 889]) {
        const changed = await evaluate(async requestedCycleTimeMs => {
          const testing = document.modelContextTesting ?? navigator.modelContextTesting;
          const value = await testing.executeTool(
            'control_placement_stream',
            JSON.stringify({
              action: 'set_speed',
              cycleTimeMs: requestedCycleTimeMs,
              expectedWorldRevision: __ROBO_BRIDGE__.robotController.worldRevision
            })
          );
          return typeof value === 'string' ? JSON.parse(value) : value;
        }, cycleTimeMs);
        assert.equal(changed.ok, true, JSON.stringify(changed));
        assert.equal(changed.cycleTimeMs, Math.max(1000, cycleTimeMs));
        check('live speed', { requested: cycleTimeMs, applied: changed.cycleTimeMs });
      }
    }

    await browser.waitFor(`!__ROBO_BRIDGE__.placementCycleRunner.getState().running`, { timeoutMs: 90000 });
    const result = await call('get_placement_stream_status', { streamId: shape.prefix, limit: 50 });
    const execution = await evaluate(() => __ROBO_BRIDGE__.streamControl.getState());
    assert.equal(result.satisfiedPlacements, placements.length, JSON.stringify({ result, execution }));

    const all = [...result.entries];
    if (result.nextCursor !== null) {
      const page = await call('get_placement_stream_status', {
        streamId: shape.prefix,
        cursor: result.nextCursor,
        limit: 20
      });
      all.push(...page.entries);
    }
    assert.equal(new Set(all.map(entry => entry.actualBrickId)).size, placements.length);
    assert.equal(all.some(entry =>
      ['BLOCKED', 'WAITING_SOURCE', 'WAITING_DEPENDENCY', 'CANCELLED'].includes(entry.status)
    ), false);

    const adopted = all.filter(entry => entry.status === 'ADOPTED');
    if (shape.prefix === 'tower') {
      assert.equal(result.satisfiedPlacements, 12);
      assert.equal(adopted.length, 1);
      assert.equal(adopted[0].actor, 'human');
      assert.equal(adopted[0].actualBrickId, humanEvidence.human.brickId);
      assert.equal(all.filter(entry => entry.actualBrickId === humanEvidence.human.brickId).length, 1);
      assert.deepEqual(result.counts, { ADOPTED: 1, COMPLETED: 11 });
      assert.ok(all.slice(-2).every(entry => entry.status === 'COMPLETED'));
      assert.equal(execution.lastResult.completedPlacements, 11);
    }
    check(shape.prefix, {
      completed: result.satisfiedPlacements,
      required: placements.length,
      adopted,
      execution,
      humanEvidence
    });
  }

  const modes = await evaluate(async () => {
    const runtime = __ROBO_BRIDGE__;
    const bridgeHost = runtime.bridgeHost;
    const planId = bridgeHost?.planId ?? null;
    const bridge = await runtime.demoModeControl.change('bridge');
    const terrainVisible = runtime.challenge?.terrainGroup?.visible ?? null;
    const simple = await runtime.demoModeControl.change('simple');
    const currentAuthorities = [
      runtime.robotController,
      runtime.board,
      runtime.fastPlacement,
      runtime.placementCycleRunner
    ];
    return {
      bridge: bridge.mode,
      simple: simple.mode,
      terrainVisible,
      sameBridgeHost: bridgeHost === runtime.bridgeHost,
      samePlan: planId === (runtime.bridgeHost?.planId ?? null),
      sameAuthorities: window.__simpleAuthorities.every(
        (authority, index) => authority === currentAuthorities[index]
      ),
      count: window.__simpleTools.size
    };
  });
  assert.equal(modes.bridge, 'bridge');
  assert.equal(modes.simple, 'simple');
  assert.equal(modes.sameBridgeHost, true);
  assert.equal(modes.samePlan, true);
  assert.equal(modes.sameAuthorities, true);
  assert.equal(modes.count, 28);
  check('mode reset and preserved authorities', modes);

  report.console = browser.console;
  assert.equal(browser.console.errors.length + browser.console.exceptions.length, 0, JSON.stringify(browser.console));
  assert.equal(browser.console.warnings.length, 0, JSON.stringify(browser.console.warnings));
  check('console', { errors: browser.console.errors.length, warnings: browser.console.warnings.length });
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error.message;
  report.console = browser.console;
  console.error(error);
  process.exitCode = 1;
} finally {
  if (process.argv.includes('--write-evidence')) {
    await mkdir('output/playwright/simple-webmcp', { recursive: true });
    await writeFile(
      'output/playwright/simple-webmcp/acceptance.json',
      JSON.stringify(report, null, 2)
    );
  }
  await browser.close();
}
