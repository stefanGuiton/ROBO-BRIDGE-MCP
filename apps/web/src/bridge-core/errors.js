'use strict';

export const BRIDGE_CORE_ERROR_CODES = Object.freeze([
  'INVALID_SETTINGS',
  'INVALID_CHALLENGE',
  'INVALID_TRANSFORM',
  'UNKNOWN_FAMILY',
  'OUT_OF_RANGE',
  'STALE_DESIGN_REVISION',
  'OPERATION_IN_PROGRESS',
  'COMPILE_FAILED',
  'BUILDPLAN_UNAVAILABLE',
  'CANCELLED',
  'UNSUPPORTED_PART',
  'INTERNAL_ERROR'
]);

const ERROR_SET = new Set(BRIDGE_CORE_ERROR_CODES);

export class BridgeCoreError extends Error {
  constructor(code, message, details = {}) {
    const stableCode = ERROR_SET.has(code) ? code : 'INTERNAL_ERROR';
    super(message || stableCode.replaceAll('_', ' ').toLowerCase());
    this.name = 'BridgeCoreError';
    this.code = stableCode;
    this.details = cloneValue(details);
  }
}

export function cloneValue(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

export function assertNotAborted(signal) {
  if (signal?.aborted) {
    throw new BridgeCoreError('CANCELLED', 'The bridge operation was cancelled before commit.');
  }
}

export function asBridgeCoreError(error, fallbackCode = 'INTERNAL_ERROR', fallbackMessage = 'The bridge operation failed.') {
  if (error instanceof BridgeCoreError) return error;
  if (error?.name === 'AbortError') {
    return new BridgeCoreError('CANCELLED', 'The bridge operation was cancelled before commit.');
  }
  return new BridgeCoreError(fallbackCode, error?.message || fallbackMessage, {
    causeName: error?.name || null
  });
}

export function errorResult(error, fallbackCode = 'INTERNAL_ERROR') {
  const stable = asBridgeCoreError(error, fallbackCode);
  return {
    ok: false,
    code: stable.code,
    reason: stable.code,
    message: stable.message,
    details: cloneValue(stable.details)
  };
}
