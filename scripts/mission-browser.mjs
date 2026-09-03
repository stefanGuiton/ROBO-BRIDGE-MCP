// Explicit Mission browser acceptance; never runs as part of read-only tests.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const { chromium } = createRequire(import.meta.url)(option('--playwright-module', 'playwright'));
const output = path.resolve(option('--output', 'output/playwright/mission'));
const write = args.includes('--write-evidence');
if (write) await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: option('--browser', undefined),
  args: ['--enable-experimental-web-platform-features']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const warnings = [];
page.on('pageerror', error => consoleErrors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
  if (message.type() === 'warning') warnings.push(message.text());
});

try {
  await page.goto(option('--url', 'http://127.0.0.1:8774/'), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ROBO_BRIDGE__?.mission && document.documentElement.dataset.runtimeReady === 'true');
  const initial = await page.evaluate(async () => ({
    state: await window.__ROBO_BRIDGE__.mission.getMissionState(),
    fullToolNames: window.__ROBO_BRIDGE__.missionRuntime.fullToolNames,
    additionalToolCount: window.__ROBO_BRIDGE__.missionRuntime.additionalTools.length
  }));
  if (initial.state.phase !== 'DESIGN') throw new Error(`Expected DESIGN, received ${initial.state.phase}.`);
  if (initial.fullToolNames.length !== 27 || new Set(initial.fullToolNames).size !== 27 || initial.additionalToolCount !== 13) {
    throw new Error('Mission did not compose the exact 14 + 5 + 8 tool surface.');
  }

  await page.getByRole('button', { name: 'BUILD BRIDGE', exact: true }).click();
  await page.waitForFunction(() => window.__ROBO_BRIDGE__.mission.phase === 'BUILD');
  const build = await page.evaluate(async () => ({
    mission: await window.__ROBO_BRIDGE__.mission.getMissionState({ detail: 'detail' }),
    progress: window.__ROBO_BRIDGE__.construction.getBuildProgress(),
    train: window.__ROBO_BRIDGE__.train.getState()
  }));
  if (build.mission.plan.planId !== build.progress.planId || build.train.planIdentity.planId !== build.progress.planId) {
    throw new Error('Mission, Construction, and Train do not share one plan identity.');
  }
  if (write && args.includes('--screenshots')) await page.screenshot({ path: path.join(output, '01-mission-build.png'), fullPage: true });

  const guarded = await page.evaluate(async () => {
    const tool = window.__ROBO_BRIDGE__.missionRuntime.guardedBridgeTools.find(item => item.name === 'update_bridge_design');
    return tool.execute({ patch: { topArchCount: 3 }, expectedDesignRevision: window.__ROBO_BRIDGE__.bridgeHost.designRevision });
  });
  if (guarded.ok !== false || guarded.error?.code !== 'INVALID_PHASE') {
    throw new Error(`Frozen bridge mutation was not guarded: ${JSON.stringify(guarded)}.`);
  }

  const failed = await page.evaluate(async () => {
    const service = window.__ROBO_BRIDGE__.mission;
    const state = await service.getMissionState();
    return service.testBridge({
      expectedMissionId: state.missionId,
      expectedMissionRevision: state.revisions.missionRevision,
      expectedWorldRevision: state.revisions.worldRevision
    });
  });
  if (failed.outcome !== 'TRAIN_FELL' || failed.phase !== 'BUILD' || failed.missionComplete !== false) {
    throw new Error(`Expected TEST failure to return BUILD: ${JSON.stringify(failed)}.`);
  }
  if (write && args.includes('--screenshots')) await page.screenshot({ path: path.join(output, '02-mission-train-fell.png'), fullPage: true });

  const reset = await page.evaluate(async () => {
    const service = window.__ROBO_BRIDGE__.mission;
    const state = await service.getMissionState();
    return service.resetMission({
      expectedMissionId: state.missionId,
      expectedMissionRevision: state.revisions.missionRevision,
      expectedWorldRevision: state.revisions.worldRevision,
      confirm: true
    });
  });
  if (reset.phase !== 'DESIGN' || reset.missionId === reset.previousMissionId) {
    throw new Error(`Mission reset did not create a clean DESIGN identity: ${JSON.stringify(reset)}.`);
  }
  const acceptance = { initial, build, guarded, failed, reset, consoleErrors, warnings };
  console.log(JSON.stringify(acceptance, null, 2));
  if (write) {
    if (args.includes('--screenshots')) await page.screenshot({ path: path.join(output, '03-mission-reset.png'), fullPage: true });
    await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(acceptance, null, 2));
  }
  if (consoleErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
