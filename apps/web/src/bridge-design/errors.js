'use strict';

export const BRIDGE_ERROR_CODES = Object.freeze([
  'INVALID_PARAMETER',
  'OUT_OF_RANGE',
  'UNKNOWN_FAMILY',
  'STALE_DESIGN_REVISION',
  'COMPILE_FAILED',
  'BUILDPLAN_UNAVAILABLE',
  'RUNTIME_UNAVAILABLE',
  'OPERATION_IN_PROGRESS',
  'CANCELLED',
  'INTERNAL_ERROR'
]);

export class BridgeDesignError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'BridgeDesignError';
    this.code = BRIDGE_ERROR_CODES.includes(code) ? code : 'INTERNAL_ERROR';
    if (details !== undefined) this.details = structuredCloneSafe(details);
  }
}

export function structuredCloneSafe(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function errorResult(error, fallbackCode = 'INTERNAL_ERROR') {
  const code = BRIDGE_ERROR_CODES.includes(error?.code) ? error.code : fallbackCode;
  const result = {
    ok: false,
    error: {
      code,
      message: String(error?.message || code.replaceAll('_', ' ').toLowerCase())
    }
  };
  if (error?.details !== undefined) result.error.details = structuredCloneSafe(error.details);
  return result;
}

export function assertNotAborted(signal) {
  if (signal?.aborted) {
    throw new BridgeDesignError('CANCELLED', 'The bridge-design operation was cancelled before it started.');
  }
}
