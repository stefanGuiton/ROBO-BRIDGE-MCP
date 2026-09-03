// Explicit browser diagnostic for the production submission acceptance facade.
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const { chromium } = createRequire(import.meta.url)(option('--playwright-module', 'playwright'));
const browser = await chromium.launch({
  headless: true,
  executablePath: option('--browser', undefined),
  args: ['--enable-experimental-web-platform-features']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto(option('--url', 'http://127.0.0.1:8774/?submissionGate=1'), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ROBO_BRIDGE__?.submissionAcceptance);
  const methods = option('--method', 'runConstructionAcceptance').split(',');
  const results = [];
  for (const method of methods) {
    const result = await page.evaluate(async ({ method, timeoutMs }) => {
      const call = window.__ROBO_BRIDGE__.submissionAcceptance[method]();
      return Promise.race([
        call.then(value => ({ settled: true, value })),
        new Promise(resolve => setTimeout(() => resolve({
          settled: false,
          mission: window.__ROBO_BRIDGE__.mission.getMissionState({ detail: 'detail' }),
          construction: window.__ROBO_BRIDGE__.construction.getBuildState(),
          coordinator: window.__ROBO_BRIDGE__.fastPlacement.getState(),
          robot: window.__ROBO_BRIDGE__.robotController.getState(),
          train: window.__ROBO_BRIDGE__.train.getState()
        }), timeoutMs))
      ]);
    }, { method, timeoutMs: Number(option('--timeout', '30000')) });
    results.push({ method, result });
    console.log(JSON.stringify({ method, result, errors }, null, 2));
    if (!result.settled || errors.length) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
