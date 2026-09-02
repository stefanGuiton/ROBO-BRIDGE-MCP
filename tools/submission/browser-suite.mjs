import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ChromiumSession, findBrowserExecutable } from './cdp-browser.mjs';
import { PRELOAD_SCRIPT } from './browser-preload.mjs';
import { runCurrentAcceptance } from './current-acceptance.mjs';
import { runFutureAcceptance } from './future-acceptance.mjs';
import {
  delay,
  freePort,
  harmlessConsoleError,
  passFail,
  safeArray,
  startServer,
  stopServer,
  unavailable,
  waitForHealth,
  waitForIdle,
  evaluate,
  writeBrowserEvidence
} from './browser-support.mjs';
import { STATUS, makeTest } from './core.mjs';

export async function runBrowserSuite(options = {}) {
  const started = performance.now();
  const rootDirectory = path.resolve(options.rootDirectory);
  const evidenceDirectory = path.resolve(options.evidenceDirectory);
  const profile = options.profile ?? 'auto';
  const heroAttempts = options.heroAttempts ?? 1;
  const resetCycles = options.resetCycles ?? 50;
  const providerTimeoutMs = options.providerTimeoutMs ?? 180_000;
  const explicitCatalogue = options.catalogueName ?? null;
  let catalogueName = explicitCatalogue ?? (profile === 'current' ? 'current' : profile === 'final' ? 'final' : 'minimum');
  let catalogue = options.catalogues?.[catalogueName];
  const finalRequired = profile === 'final';
  const tests = [];
  const screenshots = [];
  const failedRequests = [];
  const responseStatuses = [];
  let server = null;
  let browser = null;
  let browserMetadata = { available: false, reason: null };
  let webmcp = { toolCount: null, catalogueName, annotationAudit: [], responseSizes: [] };
  let futureAvailability = { challenge: false, construction: false, train: false, mission: false, provider: false };
  let heroReliability = { prompt: 'Build a valid bridge across the terrain and successfully get the train to the other side.', attempts: 0, passes: 0, failures: 0, notAvailable: 0, runs: [] };
  let runtimeMetadata = null;
  let trainResult = null;
  let missionResult = null;

  try {
    if (!catalogue) throw new Error(`Unknown WebMCP catalogue: ${catalogueName}`);
    const executable = findBrowserExecutable();
    if (!executable) {
      tests.push(unavailable({ id: 'browser.chromium_available', area: 'BROWSER', reason: 'CHROMIUM_NOT_FOUND', required: true }));
      browserMetadata = { available: false, reason: 'CHROMIUM_NOT_FOUND' };
      return { tests, screenshots, browser: browserMetadata, webmcp, futureAvailability, heroReliability, console: { errors: [], warnings: [], exceptions: [], blocking: [] } };
    }

    await mkdir(evidenceDirectory, { recursive: true });
    const port = await freePort();
    server = startServer(rootDirectory, port);
    const origin = `http://127.0.0.1:${port}`;
    const health = await waitForHealth(`${origin}/health`, 30_000);
    tests.push(passFail({ id: 'browser.server_ready', area: 'BROWSER', condition: health.ok, details: health }));

    browser = await ChromiumSession.launch({ executable, viewport: [1440, 900], preloadScript: PRELOAD_SCRIPT, launchTimeoutMs: 30_000 });
    browser.connection.on('Network.loadingFailed', (event, sessionId) => {
      if (sessionId === browser.sessionId && !event.canceled) failedRequests.push(event);
    });
    browser.connection.on('Network.responseReceived', (event, sessionId) => {
      if (sessionId === browser.sessionId) responseStatuses.push({ type: event.type, url: event.response?.url, status: event.response?.status });
    });
    browserMetadata = {
      available: true,
      product: browser.version?.product ?? 'Chromium',
      protocolVersion: browser.version?.protocolVersion ?? null,
      userAgent: browser.version?.userAgent ?? null,
      jsVersion: browser.version?.jsVersion ?? null,
      executablePath: executable,
      headless: process.env.ROBO_BRIDGE_HEADED !== '1',
      viewport: { width: 1440, height: 900 },
      registrationMode: 'injected_native_model_context'
    };

    const targetUrl = `${origin}/?submissionGate=1`;
    browserMetadata.url = targetUrl;
    const pageResponse = await fetch(targetUrl, { cache: 'no-store' });
    const navigationStarted = performance.now();
    await browser.navigate(targetUrl, 120_000);
    tests.push(passFail({
      id: 'browser.main_demo_load',
      area: 'BROWSER',
      condition: pageResponse.ok,
      details: { url: targetUrl, status: pageResponse.status },
      durationMs: performance.now() - navigationStarted
    }));

    await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`, { timeoutMs: 120_000, intervalMs: 100 });
    tests.push(passFail({ id: 'browser.runtime_ready', area: 'BROWSER', condition: true }));
    futureAvailability = await evaluate(browser, `() => window.__ROBO_BRIDGE_QA__?.serviceAvailability?.() ?? {}`);
    if (!explicitCatalogue && profile === 'auto') {
      catalogueName = futureAvailability.construction && futureAvailability.train && futureAvailability.mission ? 'final' : 'current';
      catalogue = options.catalogues?.[catalogueName];
      if (!catalogue) throw new Error(`Unknown WebMCP catalogue: ${catalogueName}`);
      webmcp.catalogueName = catalogueName;
    }
    await browser.waitFor(`document.documentElement.dataset.bridgeReady === 'true'`, { timeoutMs: 120_000, intervalMs: 100 });
    await browser.waitFor(`Boolean(window.__ROBO_BRIDGE__?.bridgeHost && window.__ROBO_BRIDGE__?.bridgeHologram)`, { timeoutMs: 120_000, intervalMs: 100 });
    await browser.waitFor(`(window.__ROBO_BRIDGE_QA__?.registrations?.length ?? 0) >= ${Number(catalogue.minimum ?? 19)}`, { timeoutMs: 120_000, intervalMs: 100 });
    await waitForIdle(browser);
    await delay(400);

    const currentAcceptance = await runCurrentAcceptance({
      browser,
      evidenceDirectory,
      screenshots,
      tests,
      catalogue,
      resetCycles,
      initialWebMcp: webmcp
    });
    webmcp = currentAcceptance.webmcp;
    const { loadShot, beforeShot, afterShot } = currentAcceptance;

    const futureAcceptance = await runFutureAcceptance({
      browser,
      tests,
      finalRequired,
      providerTimeoutMs,
      resetCycles,
      heroAttempts
    });
    futureAvailability = futureAcceptance.futureAvailability;
    heroReliability = futureAcceptance.heroReliability;
    trainResult = futureAcceptance.trainResult;
    missionResult = futureAcceptance.missionResult;

    runtimeMetadata = await evaluate(browser, `() => {
      const runtime = window.__ROBO_BRIDGE__;
      return {
        documentTitle: document.title,
        location: location.href,
        runtimeVersion: runtime?.version ?? null,
        product: runtime?.product ?? null,
        runtimeReady: document.documentElement.dataset.runtimeReady ?? null,
        bridgeReady: document.documentElement.dataset.bridgeReady ?? null,
        bridge: runtime?.bridgeDesign?.service?.getDesignState?.({ includeCapabilities: false }) ?? null,
        robot: runtime?.getRobotState?.() ?? null,
        serviceAvailability: window.__ROBO_BRIDGE_QA__?.serviceAvailability?.() ?? null,
        leakSnapshot: window.__ROBO_BRIDGE_QA__?.leakSnapshot?.() ?? null
      };
    }`);
    const finalHtml = await browser.evaluate('document.documentElement.outerHTML', { timeoutMs: 30_000 });
    await writeFile(path.join(evidenceDirectory, 'final-runtime.html'), String(finalHtml), 'utf8');

    const windowErrors = await evaluate(browser, `() => window.__ROBO_BRIDGE_QA__.windowErrors`);
    const unhandledRejections = await evaluate(browser, `() => window.__ROBO_BRIDGE_QA__.unhandledRejections`);
    const networkBlocking = failedRequests.filter((item) => ['Document', 'Script', 'Stylesheet', 'Worker'].includes(item.type));
    const consoleErrors = safeArray(browser.console.errors);
    const exceptions = safeArray(browser.console.exceptions);
    const blockingConsole = consoleErrors.filter((item) => !harmlessConsoleError(item));
    const blocking = [
      ...blockingConsole.map((item) => ({ kind: 'console', item })),
      ...exceptions.map((item) => ({ kind: 'exception', item })),
      ...safeArray(windowErrors).map((item) => ({ kind: 'window', item })),
      ...safeArray(unhandledRejections).map((item) => ({ kind: 'unhandled-rejection', item })),
      ...networkBlocking.map((item) => ({ kind: 'network', item }))
    ];
    tests.push(passFail({ id: 'browser.no_blocking_console_or_resource_errors', area: 'BROWSER', condition: blocking.length === 0, details: { blocking, failedRequests, responseStatuses } }));

    const consoleData = {
      errors: consoleErrors,
      warnings: safeArray(browser.console.warnings),
      exceptions,
      logEntries: safeArray(browser.console.logEntries),
      windowErrors,
      unhandledRejections,
      failedRequests,
      blocking
    };
    await writeBrowserEvidence({ evidenceDirectory, metadata: runtimeMetadata, consoleData, webmcp });

    return {
      tests,
      screenshots,
      browser: browserMetadata,
      webmcp,
      futureAvailability,
      heroReliability,
      console: consoleData,
      runtimeMetadata,
      trainResult,
      missionResult,
      durationMs: Math.round((performance.now() - started) * 1000) / 1000,
      evidence: { loadShot, beforeShot, afterShot }
    };
  } catch (error) {
    const reason = error?.code === 'CHROMIUM_NOT_FOUND' ? 'CHROMIUM_NOT_FOUND' : 'BROWSER_SUITE_FAILED';
    tests.push(makeTest({
      id: 'browser.execution',
      area: 'BROWSER',
      status: reason === 'CHROMIUM_NOT_FOUND' ? STATUS.NOT_AVAILABLE : STATUS.FAIL,
      required: true,
      reason,
      details: {
        name: error?.name ?? null,
        message: error?.message ?? String(error),
        stack: error?.stack ?? null,
        browserStderr: error?.browserStderr ?? browser?.getStderr?.() ?? null,
        server: server?.output?.() ?? null
      }
    }));
    return {
      tests,
      screenshots,
      browser: { ...browserMetadata, available: false, reason },
      webmcp,
      futureAvailability,
      heroReliability,
      console: {
        errors: browser?.console?.errors ?? [],
        warnings: browser?.console?.warnings ?? [],
        exceptions: browser?.console?.exceptions ?? [],
        blocking: []
      },
      runtimeMetadata,
      durationMs: Math.round((performance.now() - started) * 1000) / 1000
    };
  } finally {
    await browser?.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
}

export {
  validateAdversarial,
  validateConstruction,
  validateHero,
  validateIntegratedReset,
  validateMission,
  validateSourceReassignment,
  validateTerrain,
  validateTrainFailure,
  validateTrainSuccess
} from './future-contracts.mjs';
