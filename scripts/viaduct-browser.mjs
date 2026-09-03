// Explicit no-screenshot browser acceptance. Real production tool callbacks,
// Mission and Construction; native registration is checked separately.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const { chromium } = createRequire(import.meta.url)(option('--playwright-module', 'playwright'));
const browser = await chromium.launch({ headless: true, executablePath: option('--browser', undefined),
  args: ['--enable-experimental-web-platform-features'] });
const page = await browser.newPage();
const errors = [], warnings = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
try {
  await page.goto(option('--url', 'http://127.0.0.1:8774/'), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ROBO_BRIDGE__?.mission && document.documentElement.dataset.runtimeReady === 'true');
  const design = await page.evaluate(async () => {
    const r = window.__ROBO_BRIDGE__;
    const invoke = (name, input) => r.missionRuntime.guardedBridgeTools.find(t => t.name === name).execute(input);
    const before = await invoke('get_bridge_design', { includeCapabilities: false });
    const root = r.renderer.machineRoot;
    const previousGroup = root.getObjectByName('V46_EXACT_BUILDPLAN_HOLOGRAM').uuid;
    const spatial = JSON.stringify({ transform: r.bridgeHost.worldTransform, entry: r.challenge.getEntry(), exit: r.challenge.getExit(), route: r.challenge.getTrainRoute() });
    const input = { expectedDesignRevision: before.designRevision, patch: { viaduct: { archCount: 3 } } };
    const changed = await invoke('update_bridge_design', input);
    const hologram = r.bridgeHologram;
    const groupReplaced = root.getObjectByName('V46_EXACT_BUILDPLAN_HOLOGRAM').uuid !== previousGroup;
    const stale = await invoke('update_bridge_design', input);
    const invalid = await invoke('update_bridge_design', { expectedDesignRevision: r.bridgeHost.designRevision, patch: { viaduct: { archCount: 99 } } });
    const rejectedUnchanged = r.bridgeHost.buildPlan.planId === changed.planId && r.bridgeHost.designRevision === changed.designRevision;
    const reset = await invoke('reset_bridge_design', { expectedDesignRevision: r.bridgeHost.designRevision });
    return { before, input, changed, hologramSource: hologram.source, groupReplaced, stale, invalid, rejectedUnchanged, reset,
      spatialUnchanged: spatial === JSON.stringify({ transform: r.bridgeHost.worldTransform, entry: r.challenge.getEntry(), exit: r.challenge.getExit(), route: r.challenge.getTrainRoute() }),
      native: Boolean(navigator.modelContext), tools: [...document.querySelectorAll('[data-tool]')].map(e => e.dataset.tool),
      facadeAbsent: !r.submissionAcceptance, playerEnabled: r.renderer.player.enabled };
  });
  assert.equal(design.before.family, 'viaduct');
  assert.equal(design.before.bridgeSpec.viaduct.archCount, 4);
  assert.equal(design.changed.ok, true);
  assert.equal(design.changed.designRevision, design.before.designRevision + 1);
  assert.notEqual(design.changed.planId, design.before.planId);
  assert.notEqual(design.changed.designChecksum, design.before.designChecksum);
  assert.equal(design.hologramSource.planId, design.changed.planId);
  assert.equal(design.groupReplaced, true);
  assert.equal(design.stale.ok, false); assert.equal(design.invalid.ok, false);
  assert.equal(design.rejectedUnchanged, true); assert.equal(design.spatialUnchanged, true);
  assert.equal(design.reset.ok, true); assert.equal(design.reset.bridgeSpec.viaduct.archCount, 4);
  assert.equal(design.native, true); assert.equal(new Set(design.tools).size, 27); assert.equal(design.facadeAbsent, true);

  await page.getByRole('button', { name: 'BUILD BRIDGE', exact: true }).click();
  await page.waitForFunction(() => window.__ROBO_BRIDGE__.mission.phase === 'BUILD');
  const collaboration = await page.evaluate(async () => {
    const r = window.__ROBO_BRIDGE__, m = r.mission, c = r.construction;
    const start = await m.getMissionState();
    const earlyTest = await m.testBridge({ expectedMissionId: start.missionId,
      expectedMissionRevision: start.revisions.missionRevision, expectedWorldRevision: start.revisions.worldRevision });
    const afterFailure = await m.getMissionState();
    const plan = c.planNext({ count: 2, expectedWorldRevision: r.robotController.worldRevision });
    const target = r.board.getTarget(plan.placementIds[0]), source = plan.sourceIds[0];
    const pickup = r.humanBuildAdapter.pickup(source);
    const replacement = r.fastPlacement.getState().queue.find(p => p.placementId === target.id)?.brickId;
    const preview = r.robotController.placementAuthority.preview({ brickId: source, position: target.position, yawRad: target.yawRad });
    if (!pickup.ok || !preview.ok) throw new Error('human_pickup_or_preview_failed');
    r.humanBuildAdapter.setPreview(preview.candidate);
    const human = r.humanBuildAdapter.release();
    const adopted = r.fastPlacement.getStreamStatus({ streamId: plan.streamId, cursor: 0, limit: 20 }).entries.find(p => p.placementId === target.id)?.status;
    const state = await m.getMissionState();
    const robot = await m.buildNextParts({ expectedMissionId: state.missionId,
      expectedMissionRevision: state.revisions.missionRevision, expectedWorldRevision: state.revisions.worldRevision, count: 3 });
    const frozen = await r.missionRuntime.guardedBridgeTools.find(t => t.name === 'update_bridge_design').execute({
      expectedDesignRevision: r.bridgeHost.designRevision, patch: { viaduct: { archCount: 3 } } });
    return { earlyTest, sameMission: start.missionId === afterFailure.missionId, afterFailure: afterFailure.phase,
      human, robot, sourceReassigned: Boolean(replacement && replacement !== source), adopted, frozen,
      registry: c.preparedBuild.registry.hash, planId: c.preparedBuild.frozenPlan.planId,
      sharedParts: c.preparedBuild.registry.list().map(p => ({ partType: p.partType, allowedActors: p.allowedActors })),
      progress: c.getBuildProgress(), physical: c.getPhysicalReport(), trainPlanId: r.train.getState().planIdentity.planId,
      playerEnabled: r.renderer.player.enabled, solidParts: r.robotController.getBricks().filter(b => b.placedTargetId).map(b => b.id) };
  });
  assert.equal(collaboration.earlyTest.outcome, 'TRAIN_FELL');
  assert.equal(collaboration.afterFailure, 'BUILD'); assert.equal(collaboration.sameMission, true);
  assert.equal(collaboration.human.ok, true); assert.equal(collaboration.robot.ok, true);
  assert.equal(collaboration.sourceReassigned, true); assert.equal(collaboration.adopted, 'ADOPTED');
  assert.equal(collaboration.frozen.ok, false); assert.equal(collaboration.playerEnabled, true);
  assert.equal(collaboration.trainPlanId, collaboration.planId);
  assert.equal(collaboration.progress.contributions.human, 1);
  assert.equal(collaboration.progress.contributions.agent, 3);
  for (const p of collaboration.sharedParts) assert.deepEqual(p.allowedActors, ['human', 'agent']);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const result = { design, collaboration, errors, warnings, visual: 'USER-VERIFY PENDING',
    boundary: 'real tool-callback and Human service-adapter execution, not native external-agent invocation or mouse-driven Human acceptance' };
  if (args.includes('--write-evidence')) {
    const output = path.resolve(option('--output', 'output/playwright/viaduct'));
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify({ passed: true, design: design.changed.planId, construction: collaboration.progress, errors, warnings }));
} finally { await browser.close(); }
