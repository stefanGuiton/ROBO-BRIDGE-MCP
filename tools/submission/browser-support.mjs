import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { STATUS, makeTest } from './core.mjs';

export function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

export async function waitForHealth(url, timeoutMs = 30_000) {
  const started = performance.now();
  let lastError = null;
  while (performance.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return { ok: true, status: response.status, body: await response.text() };
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Web server did not become ready: ${lastError?.message ?? 'unknown error'}`);
}

export function startServer(rootDirectory, port) {
  const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const child = spawn(python, ['scripts/serve_web.py', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: rootDirectory,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-100_000); });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-100_000); });
  return { child, output: () => ({ stdout, stderr }) };
}

export async function stopServer(server) {
  const child = server?.child;
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    await Promise.race([new Promise((resolve) => killer.once('exit', resolve)), delay(2_000)]);
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch {
    try { child.kill('SIGTERM'); } catch {}
  }
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(1_500)]);
  if (child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {
      try { child.kill('SIGKILL'); } catch {}
    }
  }
}

function expressionCall(fnSource, argument) {
  return `(${fnSource})(${JSON.stringify(argument)})`;
}

export async function evaluate(browser, fnSource, argument = undefined, timeoutMs = 120_000) {
  const expression = argument === undefined ? `(${fnSource})()` : expressionCall(fnSource, argument);
  return await browser.evaluate(expression, { timeoutMs });
}

export async function waitForIdle(browser, timeoutMs = 120_000) {
  return await browser.waitFor(`(() => {
    const runtime = window.__ROBO_BRIDGE__;
    const robot = runtime?.getRobotState?.();
    const bridge = runtime?.bridgeHost?.getCompileState?.();
    const robotIdle = robot && !robot.moving && ['idle', 'ready', undefined, null].includes(robot.operationState);
    const bridgeIdle = !bridge || ['ready', 'idle', undefined, null].includes(bridge.state);
    return Boolean(robotIdle && bridgeIdle);
  })()`, { timeoutMs, intervalMs: 100, message: 'Runtime did not become idle.' });
}

export async function bridgeSnapshot(browser) {
  return await evaluate(browser, `() => {
    const runtime = window.__ROBO_BRIDGE__;
    const state = runtime?.bridgeDesign?.service?.getDesignState?.({ includeCapabilities: false }) ?? null;
    const hologram = runtime?.bridgeHologram ?? null;
    const group = runtime?.renderer?.machineRoot?.getObjectByName?.('V46_EXACT_BUILDPLAN_HOLOGRAM') ?? null;
    const challenge = runtime?.challenge ?? null;
    const safeCall = (name) => {
      try { return typeof challenge?.[name] === 'function' ? challenge[name]() : null; }
      catch (error) { return { error: error?.code ?? error?.message ?? String(error) }; }
    };
    const active = safeCall('getActiveChallenge');
    const entry = safeCall('getEntry');
    const exit = safeCall('getExit');
    const trainRoute = safeCall('getTrainRoute');
    const bridgeTransform = safeCall('getBridgeTransform');
    const collisionProxy = safeCall('getCollisionProxy');
    const terrain = challenge?.terrainGroup ?? null;
    const host = runtime?.bridgeHost ?? null;
    const buildPlan = host?.buildPlan ?? null;
    const buildPlanTotal = buildPlan?.billOfMaterials?.totalPhysicalParts ?? null;
    return {
      state,
      designRevision: state?.designRevision ?? null,
      planId: state?.planId ?? null,
      designChecksum: state?.designChecksum ?? null,
      family: state?.family ?? null,
      bridgeSpec: state?.bridgeSpec ?? null,
      hostReady: Boolean(host?.ready),
      hostCompileState: host?.getCompileState?.() ?? null,
      host: {
        challenge: host?.challenge ?? null,
        worldTransform: host?.worldTransform ?? null,
        buildPlan: buildPlan ? {
          planId: buildPlan.planId ?? null,
          designChecksum: buildPlan.designChecksum ?? null,
          designRevision: buildPlan.designRevision ?? null,
          totalPhysicalParts: buildPlanTotal
        } : null
      },
      challenge: {
        present: Boolean(challenge),
        api: {
          getActiveChallenge: typeof challenge?.getActiveChallenge === 'function',
          getBridgeTransform: typeof challenge?.getBridgeTransform === 'function',
          getEntry: typeof challenge?.getEntry === 'function',
          getExit: typeof challenge?.getExit === 'function',
          getTrainRoute: typeof challenge?.getTrainRoute === 'function',
          getCollisionProxy: typeof challenge?.getCollisionProxy === 'function'
        },
        active,
        entry,
        exit,
        trainRoute,
        bridgeTransform,
        bridgeChallenge: challenge?.bridgeChallenge ?? null,
        collisionProxy,
        terrain: {
          present: Boolean(terrain),
          name: terrain?.name ?? null,
          visible: terrain?.visible ?? null,
          childCount: terrain?.children?.length ?? 0,
          parentName: terrain?.parent?.name ?? null,
          attachedToScene: Boolean(terrain && runtime?.renderer?.scene?.getObjectByProperty?.('uuid', terrain.uuid))
        }
      },
      hologramSource: hologram?.source ?? null,
      hologramSummary: hologram?.summary ?? null,
      hologramPage: hologram?.page ?? null,
      hologramWorldTransform: hologram?.worldTransform ?? null,
      hologramPlacementCount: hologram?.placements?.length ?? 0,
      hologramGroupUuid: group?.uuid ?? null,
      hologramVisible: Boolean(group && group.visible !== false),
      hologramChildCount: group?.children?.length ?? 0,
      runtimeReady: document.documentElement.dataset.runtimeReady ?? null,
      bridgeReady: document.documentElement.dataset.bridgeReady ?? null,
      hud: document.querySelector('[data-bridge-hud]')?.dataset
        ? { ...document.querySelector('[data-bridge-hud]').dataset }
        : null
    };
  }`);
}

export function passFail({ id, area, condition, required = true, reason = 'ACCEPTANCE_ASSERTION_FAILED', details = {}, evidence = [], durationMs = 0 }) {
  return makeTest({
    id,
    area,
    status: condition ? STATUS.PASS : STATUS.FAIL,
    required,
    reason: condition ? null : reason,
    details,
    evidence,
    durationMs
  });
}

export function unavailable({ id, area, reason, required = false, details = {} }) {
  return makeTest({ id, area, status: STATUS.NOT_AVAILABLE, required, reason, details });
}

export function errorCode(result) {
  if (!result || typeof result !== 'object') return null;
  return result.error?.code ?? result.reason ?? result.code ?? null;
}

export function stripDeckOverhang(spec) {
  const clone = structuredClone(spec);
  if (clone?.common) delete clone.common.deckOverhang;
  return clone;
}

async function fileSha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function capture(browser, evidenceDirectory, name, screenshots) {
  const filePath = path.join(evidenceDirectory, name);
  await browser.screenshot(filePath);
  screenshots.push(name);
  return { name, filePath, sha256: await fileSha256(filePath) };
}

export async function providerAcceptance({ browser, availability, service, method, argument, validator, id, area = 'HERO LOOP', reason, required, timeoutMs }) {
  if (!availability[service]) return {
    test: unavailable({ id, area, reason, required, details: { availability } }),
    evidence: null
  };
  if (!availability.provider) return {
    test: makeTest({ id, area, status: STATUS.FAIL, required: true, reason: 'SUBMISSION_ACCEPTANCE_PROVIDER_NOT_PRESENT', details: { availability } }),
    evidence: null
  };
  const started = performance.now();
  const call = await evaluate(browser, `async (input) => window.__ROBO_BRIDGE_QA__.callProvider(input.method, input.argument, input.timeoutMs)`, {
    method,
    argument,
    timeoutMs
  }, timeoutMs + 10_000);
  const durationMs = performance.now() - started;
  if (!call?.available) return {
    test: makeTest({ id, area, status: STATUS.FAIL, required: true, reason: 'ACCEPTANCE_PROVIDER_METHOD_NOT_PRESENT', durationMs, details: { call } }),
    evidence: null
  };
  if (call?.threw) return {
    test: makeTest({ id, area, status: STATUS.FAIL, required: true, reason: 'ACCEPTANCE_PROVIDER_METHOD_FAILED', durationMs, details: { call } }),
    evidence: null
  };
  const evidence = call.result;
  const errors = validator(evidence);
  return {
    test: passFail({ id, area, condition: errors.length === 0, required, details: { errors, evidence }, durationMs }),
    evidence
  };
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function harmlessConsoleError(item) {
  const text = String(item?.text ?? item?.description ?? item?.exception?.description ?? '');
  return /favicon\.ico|DevToolsActivePort|crbug\.com\/242999|Automatic fallback to software WebGL/i.test(text);
}

export async function writeBrowserEvidence({ evidenceDirectory, metadata, consoleData, webmcp }) {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(path.join(evidenceDirectory, 'runtime-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  await writeFile(path.join(evidenceDirectory, 'console-log.json'), `${JSON.stringify(consoleData, null, 2)}\n`, 'utf8');
  await writeFile(path.join(evidenceDirectory, 'webmcp-browser-audit.json'), `${JSON.stringify(webmcp, null, 2)}\n`, 'utf8');
}
