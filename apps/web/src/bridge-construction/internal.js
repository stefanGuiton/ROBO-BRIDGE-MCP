'use strict';

import { BridgeCoreError, cloneValue } from '../bridge-core/errors.js';

export const BRIDGE_CONSTRUCTION_SCHEMA_VERSION = 'robo-bridge.construction-runtime.v1';

export function invariant(condition, code, message, details = {}) {
  if (!condition) throw new BridgeCoreError(code, message, details);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function hashRecord(value, prefix = '') {
  return `${prefix}${fnv1a32(stableStringify(value))}`;
}

export function finite(value, name) {
  invariant(typeof value === 'number' && Number.isFinite(value), 'INVALID_SETTINGS', `${name} must be a finite number.`, { name, value });
  return value;
}

export function finitePosition(position, name = 'position') {
  invariant(position && typeof position === 'object', 'INVALID_SETTINGS', `${name} is required.`, { name });
  return {
    xMm: finite(position.xMm, `${name}.xMm`),
    yMm: finite(position.yMm, `${name}.yMm`),
    zMm: finite(position.zMm, `${name}.zMm`)
  };
}

export function cloneFrozen(value) {
  return deepFreeze(cloneValue(value));
}

export function rotateMachineOffset(localOffset, worldTransform) {
  const scale = worldTransform.scale;
  const cosine = Math.cos(worldTransform.yawRad);
  const sine = Math.sin(worldTransform.yawRad);
  return {
    xMm: scale * (cosine * localOffset.x - sine * localOffset.z),
    yMm: scale * (sine * localOffset.x + cosine * localOffset.z),
    zMm: scale * localOffset.y
  };
}

export function addPosition(left, right) {
  return {
    xMm: left.xMm + right.xMm,
    yMm: left.yMm + right.yMm,
    zMm: left.zMm + right.zMm
  };
}

export function subtractPosition(left, right) {
  return {
    xMm: left.xMm - right.xMm,
    yMm: left.yMm - right.yMm,
    zMm: left.zMm - right.zMm
  };
}

export function normaliseActor(actor) {
  if (actor === 'agent' || actor === 'codex') return 'agent';
  if (actor === 'human' || actor === 'user') return 'human';
  return null;
}

export function idSet(values, label) {
  invariant(Array.isArray(values), 'INVALID_SETTINGS', `${label} must be an array.`, { label });
  const ids = new Set();
  for (const value of values) {
    invariant(typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value), 'INVALID_SETTINGS', `${label} contains an invalid ID.`, { label, value });
    invariant(!ids.has(value), 'INVALID_SETTINGS', `${label} contains a duplicate ID.`, { label, value });
    ids.add(value);
  }
  return ids;
}
