'use strict';

function boundedClone(value, depth = 0) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 400 ? `${value.slice(0, 397)}...` : value;
  if (typeof value === 'bigint') return String(value);
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => boundedClone(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort().slice(0, 24)) result[key] = boundedClone(value[key], depth + 1);
    return result;
  }
  return String(value);
}

export class TrainIntegrationError extends Error {
  constructor(code, message, details = {}, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'TrainIntegrationError';
    this.code = code || 'TRAIN_INTEGRATION_ERROR';
    this.details = boundedClone(details);
    this.recoverable = options.recoverable !== false;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      details: boundedClone(this.details)
    };
  }
}

export function invariant(condition, code, message, details = {}, options = {}) {
  if (!condition) throw new TrainIntegrationError(code, message, details, options);
}

export function asTrainIntegrationError(error, fallbackCode = 'TRAIN_INTEGRATION_ERROR') {
  if (error instanceof TrainIntegrationError) return error;
  return new TrainIntegrationError(
    error?.code || fallbackCode,
    error?.message || String(error),
    error?.details || {},
    { cause: error, recoverable: error?.recoverable !== false }
  );
}

export function boundedErrorResult(error, fallbackCode = 'TRAIN_INTEGRATION_ERROR') {
  const normalized = asTrainIntegrationError(error, fallbackCode);
  return Object.freeze({ ok: false, error: Object.freeze(normalized.toJSON()) });
}
