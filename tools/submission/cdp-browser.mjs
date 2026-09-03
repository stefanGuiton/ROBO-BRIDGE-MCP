import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function executableCandidates() {
  const candidates = [
    process.env.ROBO_BRIDGE_BROWSER,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  const names = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const directory of String(process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) candidates.push(path.join(directory, name));
  }
  return [...new Set(candidates)];
}

export function findBrowserExecutable() {
  return executableCandidates().find((candidate) => existsSync(candidate)) ?? null;
}

class CdpConnection {
  constructor(child) {
    this.child = child;
    this.writePipe = child.stdio[3];
    this.readPipe = child.stdio[4];
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.buffer = '';
    this.closed = false;
    this.readPipe.setEncoding('utf8');
    this.readPipe.on('data', (chunk) => this.#receive(chunk));
    const close = () => this.#close(new Error('Chromium CDP pipe closed.'));
    this.readPipe.on('error', close);
    this.readPipe.on('close', close);
    child.on('exit', close);
  }

  #receive(chunk) {
    this.buffer += chunk;
    for (;;) {
      const end = this.buffer.indexOf('\0');
      if (end < 0) return;
      const frame = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!frame) continue;
      let message;
      try { message = JSON.parse(frame); } catch { continue; }
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
        continue;
      }
      for (const listener of this.listeners.get(message.method) ?? []) {
        try { listener(message.params ?? {}, message.sessionId ?? null); } catch {}
      }
    }
  }

  #close(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  on(method, listener) {
    const current = this.listeners.get(method) ?? [];
    current.push(listener);
    this.listeners.set(method, current);
    return () => this.listeners.set(method, (this.listeners.get(method) ?? []).filter((item) => item !== listener));
  }

  send(method, params = {}, sessionId = null, timeoutMs = 30_000) {
    if (this.closed) return Promise.reject(new Error('Chromium CDP pipe is closed.'));
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs} ms.`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer, method });
      this.writePipe.write(`${JSON.stringify(message)}\0`);
    });
  }

  dispose() {
    this.#close(new Error('Chromium CDP connection disposed.'));
    this.writePipe?.destroy();
    this.readPipe?.destroy();
    this.listeners.clear();
  }
}

function browserArguments(userDataDirectory, viewport) {
  const [width, height] = viewport;
  const args = [
    ...(process.env.ROBO_BRIDGE_HEADED === '1' ? [] : ['--headless=new']),
    '--remote-debugging-pipe',
    `--user-data-dir=${userDataDirectory}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--no-proxy-server',
    '--proxy-bypass-list=<-loopback>',
    '--disable-dev-shm-usage',
    '--metrics-recording-only',
    '--mute-audio',
    '--hide-scrollbars',
    '--enable-webgl',
    '--ignore-gpu-blocklist'
  ];
  // Full built scenes can saturate CPU software rasterisation on Windows.
  // Use Chrome's normal GPU backend there; retain an explicit software option.
  if (process.platform !== 'win32' || process.env.ROBO_BRIDGE_SOFTWARE_GL === '1') {
    args.push('--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle');
  }
  if (process.platform === 'linux' && (typeof process.getuid !== 'function' || process.getuid() === 0 || process.env.CI)) args.push('--no-sandbox');
  return args;
}

async function terminateProcessTree(child, signal = 'SIGTERM') {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    await Promise.race([new Promise((resolve) => taskkill.once('exit', resolve)), delay(2_000)]);
    return;
  }
  try { process.kill(-child.pid, signal); } catch {
    try { child.kill(signal); } catch {}
  }
}

function remoteValue(object) {
  if (Object.prototype.hasOwnProperty.call(object, 'value')) return object.value;
  if (object.unserializableValue === 'NaN') return Number.NaN;
  if (object.unserializableValue === 'Infinity') return Number.POSITIVE_INFINITY;
  if (object.unserializableValue === '-Infinity') return Number.NEGATIVE_INFINITY;
  return undefined;
}

export class ChromiumSession {
  static async launch(options = {}) {
    const executable = options.executable ?? findBrowserExecutable();
    if (!executable) {
      const error = new Error('No Chromium-compatible browser executable was found.');
      error.code = 'CHROMIUM_NOT_FOUND';
      throw error;
    }
    const viewport = options.viewport ?? [1440, 900];
    const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'robo-bridge-submission-'));
    let stderr = '';
    const child = spawn(executable, [...browserArguments(userDataDirectory, viewport), ...(options.args ?? [])], {
      stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
      env: { ...process.env, HOME: process.env.HOME ?? os.homedir() }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-200_000); });
    const connection = new CdpConnection(child);
    try {
      const version = await connection.send('Browser.getVersion', {}, null, options.launchTimeoutMs ?? 20_000);
      const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
      const session = new ChromiumSession({ child, connection, sessionId, targetId, executable, userDataDirectory, viewport, version, getStderr: () => stderr });
      await session.#initialize(options.preloadScript ?? '');
      return session;
    } catch (error) {
      await terminateProcessTree(child, 'SIGKILL');
      connection.dispose();
      await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
      error.browserStderr = stderr;
      throw error;
    }
  }

  constructor({ child, connection, sessionId, targetId, executable, userDataDirectory, viewport, version, getStderr }) {
    this.child = child;
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.executable = executable;
    this.userDataDirectory = userDataDirectory;
    this.viewport = viewport;
    this.version = version;
    this.getStderr = getStderr;
    this.closed = false;
    this.console = { errors: [], warnings: [], messages: [], exceptions: [], logEntries: [] };
  }

  async #initialize(preloadScript) {
    const send = (method, params = {}) => this.connection.send(method, params, this.sessionId);
    await Promise.all([
      send('Page.enable'),
      send('Runtime.enable'),
      send('Log.enable'),
      send('Network.enable'),
      send('Emulation.setDeviceMetricsOverride', {
        width: this.viewport[0],
        height: this.viewport[1],
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: this.viewport[0],
        screenHeight: this.viewport[1]
      })
    ]);
    this.connection.on('Runtime.consoleAPICalled', (event, sessionId) => {
      if (sessionId !== this.sessionId) return;
      const message = {
        type: event.type,
        timestamp: event.timestamp,
        text: (event.args ?? []).map((item) => item.value ?? item.description ?? item.type).join(' '),
        stackTrace: event.stackTrace ?? null
      };
      this.console.messages.push(message);
      if (event.type === 'error' || event.type === 'assert') this.console.errors.push(message);
      if (event.type === 'warning') this.console.warnings.push(message);
    });
    this.connection.on('Runtime.exceptionThrown', (event, sessionId) => {
      if (sessionId === this.sessionId) this.console.exceptions.push(event.exceptionDetails ?? event);
    });
    this.connection.on('Log.entryAdded', (event, sessionId) => {
      if (sessionId !== this.sessionId) return;
      this.console.logEntries.push(event.entry);
      if (event.entry?.level === 'error') this.console.errors.push({ type: 'log', text: event.entry.text, source: event.entry.source });
      if (event.entry?.level === 'warning') this.console.warnings.push({ type: 'log', text: event.entry.text, source: event.entry.source });
    });
    if (preloadScript) await send('Page.addScriptToEvaluateOnNewDocument', { source: preloadScript });
  }

  async navigate(url, timeoutMs = 60_000) {
    const loaded = new Promise((resolve) => {
      const unsubscribe = this.connection.on('Page.loadEventFired', (_event, sessionId) => {
        if (sessionId !== this.sessionId) return;
        unsubscribe();
        resolve();
      });
    });
    const result = await this.connection.send('Page.navigate', { url }, this.sessionId, timeoutMs);
    if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}`);
    await Promise.race([
      loaded,
      delay(timeoutMs).then(() => { throw new Error(`Page load timed out after ${timeoutMs} ms.`); })
    ]);
  }

  async evaluate(expression, options = {}) {
    const result = await this.connection.send('Runtime.evaluate', {
      expression,
      awaitPromise: options.awaitPromise ?? true,
      returnByValue: options.returnByValue ?? true,
      userGesture: options.userGesture ?? true,
      generatePreview: false
    }, this.sessionId, options.timeoutMs ?? 60_000);
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Browser evaluation failed.';
      throw new Error(detail);
    }
    return remoteValue(result.result ?? {});
  }

  async waitFor(expression, options = {}) {
    const timeoutMs = options.timeoutMs ?? 60_000;
    const intervalMs = options.intervalMs ?? 100;
    const started = performance.now();
    let lastValue;
    while (performance.now() - started < timeoutMs) {
      try {
        lastValue = await this.evaluate(expression, { timeoutMs: Math.min(10_000, timeoutMs) });
        if (lastValue) return lastValue;
      } catch (error) {
        if (options.failOnEvaluationError) throw error;
        lastValue = { error: String(error.message ?? error) };
      }
      await delay(intervalMs);
    }
    const error = new Error(options.message ?? `Readiness condition timed out after ${timeoutMs} ms.`);
    error.lastValue = lastValue;
    throw error;
  }

  async screenshot(filePath) {
    const result = await this.connection.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    }, this.sessionId, 30_000);
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(result.data, 'base64'));
    return filePath;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try { await this.connection.send('Target.closeTarget', { targetId: this.targetId }, null, 5_000); } catch {}
    try { await this.connection.send('Browser.close', {}, null, 5_000); } catch {}
    await terminateProcessTree(this.child, 'SIGTERM');
    await Promise.race([
      this.child.exitCode !== null ? Promise.resolve() : new Promise((resolve) => this.child.once('exit', resolve)),
      delay(1_500)
    ]);
    await terminateProcessTree(this.child, 'SIGKILL');
    this.connection.dispose();
    for (const stream of this.child.stdio ?? []) {
      stream?.removeAllListeners?.();
      stream?.destroy?.();
      stream?.unref?.();
    }
    this.child.removeAllListeners();
    this.child.unref();
    await rm(this.userDataDirectory, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 }).catch(() => {});
  }
}
