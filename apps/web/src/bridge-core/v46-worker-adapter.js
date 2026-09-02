'use strict';

import { BridgeCoreError, assertNotAborted } from './errors.js';

let sequence = 0;

export async function compileV46InWorker({
  settings,
  supportProfile,
  includeGridMaps = false,
  signal = null,
  workerUrl = new URL('./v46-worker-entry.js', import.meta.url),
  workerFactory = null
} = {}) {
  assertNotAborted(signal);
  const WorkerConstructor = globalThis.Worker;
  if (typeof workerFactory !== 'function' && typeof WorkerConstructor !== 'function') {
    throw new BridgeCoreError('COMPILE_FAILED', 'A browser Worker is not available. Use the inline compiler mode.');
  }
  const worker = typeof workerFactory === 'function'
    ? workerFactory(workerUrl)
    : new WorkerConstructor(workerUrl, { type: 'module', name: 'robo-bridge-v46-compiler' });
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    let settled = false;
    const dispose = () => {
      signal?.removeEventListener?.('abort', onAbort);
      try { worker.terminate(); } catch {}
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      dispose();
      callback(value);
    };
    const onAbort = () => finish(reject, new BridgeCoreError('CANCELLED', 'The bridge compile was cancelled.'));
    signal?.addEventListener?.('abort', onAbort, { once: true });
    worker.onmessage = (event) => {
      const response = event.data;
      if (!response || response.id !== id) return;
      if (response.ok) finish(resolve, response.result);
      else finish(reject, new BridgeCoreError(response.error?.code ?? 'COMPILE_FAILED', response.error?.message ?? 'The V4.6 worker failed.', response.error?.details));
    };
    worker.onerror = (event) => finish(reject, new BridgeCoreError('COMPILE_FAILED', event?.message || 'The V4.6 worker failed.'));
    try {
      worker.postMessage({ id, settings, supportProfile, includeGridMaps });
    } catch (error) {
      finish(reject, new BridgeCoreError('COMPILE_FAILED', error?.message || 'The V4.6 worker request failed.'));
    }
  });
}
