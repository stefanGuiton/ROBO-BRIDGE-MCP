// Explicit Train browser acceptance; never runs as part of read-only tests.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const { chromium } = createRequire(import.meta.url)(option('--playwright-module', 'playwright'));
const output = path.resolve('output/playwright/train');
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
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
  if (message.type() === 'warning') warnings.push(message.text());
});

try {
  await page.goto(option('--url', 'http://127.0.0.1:8774/'), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ROBO_BRIDGE__?.bridgeHost?.ready, null, { timeout: 30000 });
  await page.getByRole('button', { name: 'BUILD BRIDGE', exact: true }).click();
  await page.waitForFunction(() => window.__ROBO_BRIDGE__?.train?.getState?.().state === 'READY');
  const initial = await page.evaluate(() => {
    const runtime = window.__ROBO_BRIDGE__;
    const subsystem = runtime.train.getSubsystem();
    return {
      state: runtime.train.getState(),
      evidence: runtime.train.getEvidence()?.identity,
      support: runtime.train.getSupportMap(),
      trainRootCount: subsystem.renderer.root.parent.children.filter((child) => child.name === 'ROBO_BRIDGE_TRAIN_V22').length,
      machineRootAttached: subsystem.renderer.root.parent === subsystem.renderer.root.parent,
      frameListenerCount: runtime.renderer?.frameListeners?.size ?? null
    };
  });
  if (initial.trainRootCount !== 1) throw new Error(`Expected one Train root, received ${initial.trainRootCount}.`);
  if (write) await page.screenshot({ path: path.join(output, '01-train-ready.png'), fullPage: true });

  const result = await page.evaluate(() => window.__ROBO_BRIDGE__.train.test());
  const failed = await page.evaluate(() => window.__ROBO_BRIDGE__.train.getState());
  if (result.outcome !== 'TRAIN_FELL' || result.cause !== 'SUPPORT_LOSS') {
    throw new Error(`Expected real partial-board TRAIN_FELL/SUPPORT_LOSS, received ${JSON.stringify(result)}.`);
  }
  if (write) await page.screenshot({ path: path.join(output, '02-train-fell.png'), fullPage: true });

  const reset = await page.evaluate(() => window.__ROBO_BRIDGE__.train.reset({ instant: true, reason: 'browser_acceptance' }));
  const ready = await page.evaluate(() => window.__ROBO_BRIDGE__.train.getState());
  if (ready.state !== 'READY') throw new Error(`Train reset did not return READY: ${ready.state}.`);
  const finalRootCount = await page.evaluate(() => {
    const root = window.__ROBO_BRIDGE__.train.getSubsystem().renderer.root;
    return root.parent.children.filter((child) => child.name === 'ROBO_BRIDGE_TRAIN_V22').length;
  });
  if (finalRootCount !== 1) throw new Error(`Train reset leaked roots: ${finalRootCount}.`);

  const acceptance = { initial, result, failed, resetState: reset.state, ready, finalRootCount, consoleErrors, warnings };
  console.log(JSON.stringify(acceptance, null, 2));
  if (write) {
    await page.screenshot({ path: path.join(output, '03-train-reset-ready.png'), fullPage: true });
    await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(acceptance, null, 2));
  }
  if (consoleErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
