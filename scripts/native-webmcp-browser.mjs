// Explicit supported-browser verification of the production WebMCP registrar.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const { chromium } = createRequire(import.meta.url)(option('--playwright-module', 'playwright'));
const output = path.resolve(option('--output', 'output/playwright/native-webmcp'));
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
  await page.waitForFunction(() => document.documentElement.dataset.runtimeReady === 'true');
  const evidence = await page.evaluate(() => {
    const native = navigator.modelContext;
    const prototype = native ? Object.getPrototypeOf(native) : null;
    const toolElements = [...document.querySelectorAll('[data-tool]')];
    const toolNames = toolElements.map(element => element.dataset.tool);
    return {
      userAgent: navigator.userAgent,
      documentModelContext: Boolean(document.modelContext),
      navigatorModelContext: Boolean(native),
      nativeRegisterTool: typeof native?.registerTool === 'function',
      nativeUnregisterTool: typeof native?.unregisterTool === 'function',
      ownProperties: native ? Object.getOwnPropertyNames(native) : [],
      prototypeProperties: prototype ? Object.getOwnPropertyNames(prototype) : [],
      webMcpHud: document.querySelector('[data-webmcp]')?.textContent?.trim() ?? null,
      registeredToolCount: toolNames.length,
      registeredToolNames: toolNames,
      uniqueToolCount: new Set(toolNames).size,
      expectedToolNames: window.__ROBO_BRIDGE__?.missionRuntime?.fullToolNames ?? [],
      submissionFacadeAbsent: !window.__ROBO_BRIDGE__?.submissionAcceptance
    };
  });
  evidence.passed = evidence.navigatorModelContext
    && evidence.nativeRegisterTool
    && evidence.registeredToolCount === 27
    && evidence.uniqueToolCount === 27
    && evidence.expectedToolNames.length === 27
    && evidence.registeredToolNames.every(name => evidence.expectedToolNames.includes(name))
    && evidence.submissionFacadeAbsent;
  const result = { evidence, consoleErrors, warnings };
  console.log(JSON.stringify(result, null, 2));
  if (write) {
    if (args.includes('--screenshots')) await page.screenshot({ path: path.join(output, '01-native-27-tools.png'), fullPage: true });
    await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(result, null, 2));
  }
  if (!evidence.passed || consoleErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
