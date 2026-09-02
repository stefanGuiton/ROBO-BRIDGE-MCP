// Explicit browser acceptance command; never runs as part of read-only tests.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const modulePath = option('--playwright-module', 'playwright');
const { chromium } = createRequire(import.meta.url)(modulePath);
const output = path.resolve('output/playwright/construction');
const write = args.includes('--write-evidence');
if (write) await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: option('--browser', undefined), args: ['--enable-experimental-web-platform-features'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [], warnings = [];
page.on('pageerror', e => consoleErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
const screenshot = async name => { if (write) await page.screenshot({ path: path.join(output, name + '.png') }); };
try {
  await page.goto(option('--url', 'http://127.0.0.1:8772/'), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ROBO_BRIDGE__?.bridgeHost?.ready, null, { timeout: 30000 });
  console.log(await page.locator('body').innerText().then(s => s.slice(0,1700)));
  await screenshot('01-initial');
  const initial = await page.evaluate(() => {
    const r = window.__ROBO_BRIDGE__;
    return { planId: r.bridgeHost.buildPlan.planId, physical: r.construction?.getPhysicalReport(),
      documentWebMcp: Boolean(document.modelContext), navigatorWebMcp: Boolean(navigator.modelContext),
      tools: [...document.querySelectorAll('[data-tool]')].map(e => e.dataset.tool) };
  });
  console.log('INITIAL', JSON.stringify(initial));
  if (args.includes('--endpoints-only')) {
    if (!(await page.locator('#settings-panel').getAttribute('class'))?.includes('is-open')) await page.locator('[data-settings-toggle]').first().click();
    await page.getByLabel('ENTRY X (mm)', { exact: true }).fill('-320');
    await page.getByLabel('EXIT Y (mm)', { exact: true }).fill('110');
    await page.getByLabel('ENTRY Z (mm)', { exact: true }).fill('176');
    if (await page.getByLabel('EXIT Z (mm)', { exact: true }).inputValue() !== '176') throw new Error('Z link failed');
    await page.getByRole('button', { name: 'Apply endpoints', exact: true }).click();
    await page.locator('[data-endpoint-status]').filter({ hasText: 'Applied' }).waitFor();
    const changed = await page.evaluate(() => ({ entry: window.__ROBO_BRIDGE__.challenge.getEntry(), exit: window.__ROBO_BRIDGE__.challenge.getExit(), plan: window.__ROBO_BRIDGE__.bridgeHost.getCompileState() }));
    if (Math.abs(changed.entry.position.x - 500) > 0.001 || Math.abs(changed.entry.position.z - 176) > 0.001 || Math.abs(changed.exit.displayPosition.y - 160) > 0.001) throw new Error('Endpoint transform mismatch');
    await page.locator('[data-endpoint-settings]').evaluate(e => e.scrollIntoView({ block: 'start' }));
    await screenshot('04-endpoint-controls');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.runtimeReady === 'true');
    if (await page.getByLabel('ENTRY X (mm)', { exact: true }).inputValue() !== '-320') throw new Error('Endpoint persistence failed');
    const restored = await page.evaluate(() => window.__ROBO_BRIDGE__.challenge.getEntry().position);
    if (Math.abs(restored.x - 500) > 0.001 || Math.abs(restored.z - 176) > 0.001) throw new Error('Persisted scene transform mismatch');
    const section = page.locator('[data-endpoint-settings]');
    await section.scrollIntoViewIfNeeded();
    const entryY = await page.getByLabel('ENTRY Y (mm)', { exact: true }).inputValue();
    await page.getByLabel('EXIT X (mm)', { exact: true }).fill('-320');
    await page.getByLabel('EXIT Y (mm)', { exact: true }).fill(entryY);
    await page.getByRole('button', { name: 'Apply endpoints', exact: true }).click();
    await page.locator('[data-endpoint-status]').filter({ hasText: 'distance must be' }).waitFor();
    const afterInvalid = await page.evaluate(() => window.__ROBO_BRIDGE__.challenge.getEntry().position);
    if (JSON.stringify(afterInvalid) !== JSON.stringify(restored)) throw new Error('Invalid endpoint request mutated scene');
    await page.getByRole('button', { name: 'Reset endpoints', exact: true }).click();
    await page.locator('[data-endpoint-status]').filter({ hasText: 'Applied' }).waitFor();
    console.log('ENDPOINTS', JSON.stringify({ linkedHeight: true, changed, persistence: true, invalidRejected: true, reset: true }));
  } else if (!args.includes('--initial-only')) {
    await page.getByRole('button', { name: 'BUILD BRIDGE', exact: true }).click();
    await page.waitForFunction(() => window.__ROBO_BRIDGE__.construction.getBuildState().started);
    await screenshot('02-shared-inventory');
    const result = await page.evaluate(async () => {
      const r = window.__ROBO_BRIDGE__, c = r.construction;
      const plan = c.planNext({ count: 2, expectedWorldRevision: r.robotController.worldRevision });
      const target = r.board.getTarget(plan.placementIds[0]);
      const source = plan.sourceIds[0];
      const pickup = r.humanBuildAdapter.pickup(source);
      if (!pickup.ok) throw new Error(JSON.stringify(pickup));
      const reassigned = r.fastPlacement.getState();
      const preview = r.robotController.placementAuthority.preview({ brickId: source, position: target.position, yawRad: target.yawRad });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      r.humanBuildAdapter.setPreview(preview.candidate);
      const release = r.humanBuildAdapter.release();
      if (!release.ok) throw new Error(JSON.stringify(release));
      const adopted = r.fastPlacement.getState();
      const robot = await c.buildNextParts(3, { expectedWorldRevision: r.robotController.worldRevision });
      return { plan, pickup, reassigned, release, adopted, robot, progress: c.getBuildProgress(), physical: c.getPhysicalReport(),
        supportedParts: c.preparedBuild.registry.list().map(p => ({ key: p.registryKey, actors: p.allowedActors })) };
    });
    console.log('EXECUTION', JSON.stringify({ robot: result.robot, progress: result.progress }));
    await screenshot('03-human-and-robot');
    if (write) await writeFile(path.join(output, 'acceptance.json'), JSON.stringify({ initial, result, consoleErrors, warnings }, null, 2));
    if (!result.robot.ok) process.exitCode = 1;
  }
  console.log('CONSOLE', JSON.stringify({ consoleErrors, warnings }));
  if (write) await writeFile(path.join(output, 'console.json'), JSON.stringify({ consoleErrors, warnings }, null, 2));
  if (consoleErrors.length) process.exitCode = 1;
} catch (error) {
  console.log('FAILURE', error.message, JSON.stringify({ consoleErrors, warnings }));
  await screenshot('failure');
  throw error;
} finally { await browser.close(); }
