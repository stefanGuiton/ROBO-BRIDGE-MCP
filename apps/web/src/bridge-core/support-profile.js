'use strict';

import { BridgeCoreError } from './errors.js';

const PROFILE_TYPES = new Set(['flat', 'piecewiseLinear', 'sampled1d']);

function finite(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BridgeCoreError('INVALID_CHALLENGE', `${path} must be a finite number.`, { path, value });
  }
  return value;
}

function plainObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeCoreError('INVALID_CHALLENGE', `${path} must be an object.`, { path });
  }
  return value;
}

function normalizeSamples(samples, path) {
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new BridgeCoreError('INVALID_CHALLENGE', `${path} must contain at least two samples.`, { path });
  }
  const normalized = samples.map((sample, index) => {
    plainObject(sample, `${path}[${index}]`);
    return {
      x: finite(sample.x, `${path}[${index}].x`),
      heightY: finite(sample.heightY, `${path}[${index}].heightY`)
    };
  }).sort((a, b) => a.x - b.x);
  for (let index = 1; index < normalized.length; index += 1) {
    if (!(normalized[index].x > normalized[index - 1].x)) {
      throw new BridgeCoreError('INVALID_CHALLENGE', `${path} x values must be strictly increasing.`, {
        path,
        index,
        x: normalized[index].x
      });
    }
  }
  return normalized;
}

export function normalizeSupportProfile(profile = { type: 'flat', heightY: 0 }) {
  plainObject(profile, 'supportProfile');
  const type = profile.type ?? 'flat';
  if (!PROFILE_TYPES.has(type)) {
    throw new BridgeCoreError('INVALID_CHALLENGE', `Unsupported support profile type: ${String(type)}.`, {
      type,
      supportedTypes: [...PROFILE_TYPES]
    });
  }
  const allowed = type === 'flat' ? new Set(['type', 'heightY', 'id']) : new Set(['type', 'samples', 'outside', 'id']);
  for (const key of Object.keys(profile)) {
    if (!allowed.has(key)) {
      throw new BridgeCoreError('INVALID_CHALLENGE', `Unknown supportProfile property: ${key}.`, { path: `supportProfile.${key}` });
    }
  }
  if (type === 'flat') {
    return Object.freeze({ type, heightY: finite(profile.heightY ?? 0, 'supportProfile.heightY'), id: profile.id ?? null });
  }
  const outside = profile.outside ?? 'clamp';
  if (!['clamp', 'linear', 'error'].includes(outside)) {
    throw new BridgeCoreError('INVALID_CHALLENGE', 'supportProfile.outside must be clamp, linear, or error.', { outside });
  }
  return Object.freeze({
    type,
    samples: Object.freeze(normalizeSamples(profile.samples, 'supportProfile.samples').map(Object.freeze)),
    outside,
    id: profile.id ?? null
  });
}

function interpolate(a, b, x) {
  const t = (x - a.x) / (b.x - a.x || 1);
  return a.heightY + (b.heightY - a.heightY) * t;
}

export function createSupportSampler(profile = { type: 'flat', heightY: 0 }, options = {}) {
  if (typeof options.terrainHeightAt === 'function') {
    return (x, z = 0) => {
      const height = options.terrainHeightAt(x, z);
      if (!Number.isFinite(height)) {
        throw new BridgeCoreError('INVALID_CHALLENGE', 'terrainHeightAt returned a non-finite height.', { x, z, height });
      }
      return height;
    };
  }
  const normalized = normalizeSupportProfile(profile);
  if (normalized.type === 'flat') return () => normalized.heightY;
  const samples = normalized.samples;
  return (x) => {
    finite(x, 'support sample x');
    if (x <= samples[0].x) {
      if (normalized.outside === 'error' && x < samples[0].x) {
        throw new BridgeCoreError('INVALID_CHALLENGE', 'Support sample is left of the profile range.', { x, minimumX: samples[0].x });
      }
      return normalized.outside === 'linear' && samples.length > 1 ? interpolate(samples[0], samples[1], x) : samples[0].heightY;
    }
    const last = samples.length - 1;
    if (x >= samples[last].x) {
      if (normalized.outside === 'error' && x > samples[last].x) {
        throw new BridgeCoreError('INVALID_CHALLENGE', 'Support sample is right of the profile range.', { x, maximumX: samples[last].x });
      }
      return normalized.outside === 'linear' ? interpolate(samples[last - 1], samples[last], x) : samples[last].heightY;
    }
    let low = 0;
    let high = last;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (samples[middle].x <= x) low = middle;
      else high = middle;
    }
    return interpolate(samples[low], samples[high], x);
  };
}

export function supportProfileSummary(profile = { type: 'flat', heightY: 0 }) {
  const normalized = normalizeSupportProfile(profile);
  if (normalized.type === 'flat') return { type: 'flat', heightY: normalized.heightY, id: normalized.id };
  return {
    type: normalized.type,
    sampleCount: normalized.samples.length,
    xMin: normalized.samples[0].x,
    xMax: normalized.samples.at(-1).x,
    heightMin: Math.min(...normalized.samples.map((item) => item.heightY)),
    heightMax: Math.max(...normalized.samples.map((item) => item.heightY)),
    outside: normalized.outside,
    id: normalized.id
  };
}
