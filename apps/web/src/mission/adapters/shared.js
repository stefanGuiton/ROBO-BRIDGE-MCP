'use strict';

import { MissionError, assertNotAborted, cloneValue, toMissionError } from '../errors.js';

const SAFE_ID = /^[A-Za-z0-9_.:/-]{1,200}$/;

export function requireMethod(target, name, owner) {
  if (typeof target?.[name] !== 'function') {
    throw new MissionError('SERVICE_UNAVAILABLE', `${owner}.${name} is required.`);
  }
  return target[name].bind(target);
}

export function safeIdentityValue(value, field, { required = true } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new MissionError('INVALID_PARAMETER', `${field} must be a safe ID.`);
  }
  return value;
}

export function nonNegativeInteger(value, field, { required = true } = {}) {
  if ((value === undefined || value === null) && !required) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MissionError('INVALID_PARAMETER', `${field} must be a non-negative integer.`);
  }
  return value;
}

function canonical(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value !== 'object') return value;
  if (seen.has(value)) throw new MissionError('INVALID_PARAMETER', 'Identity data must not contain cycles.');
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => canonical(item, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = canonical(value[key], seen);
  }
  seen.delete(value);
  return result;
}

export function stableStringify(value) {
  return JSON.stringify(canonical(value));
}

export function fingerprint(value, prefix = 'id_') {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}${hash.toString(16).padStart(8, '0')}`;
}

export function sameStructuredValue(left, right) {
  try { return stableStringify(left) === stableStringify(right); }
  catch { return false; }
}

export function normalizePlacementIds(value, field = 'requiredPlacementIds', { required = false } = {}) {
  if ((value === undefined || value === null) && !required) return null;
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new MissionError('INVALID_PARAMETER', `${field} must be an array of IDs.`);
  }
  const result = value.map((item, index) => safeIdentityValue(String(item), `${field}[${index}]`));
  if (new Set(result).size !== result.length) {
    throw new MissionError('STALE_PLAN', `${field} contains duplicate IDs.`);
  }
  return result;
}

export function sameIdSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const expected = new Set(left);
  return expected.size === left.length && right.every((item) => expected.has(item));
}

export function compactRegistryIdentity(source = {}) {
  const identity = source?.identity ?? source?.partRegistryIdentity ?? source ?? {};
  const revision = source?.partRegistryRevision ?? source?.revision ?? identity?.revision ?? null;
  const hash = source?.partRegistryHash ?? source?.hash ?? identity?.hash ?? null;
  if (!revision && !hash && !identity?.schemaVersion) return null;
  return Object.freeze({
    schemaVersion: identity?.schemaVersion ?? source?.schemaVersion ?? null,
    revision,
    hash,
    size: Number.isSafeInteger(identity?.size ?? source?.size) ? (identity?.size ?? source?.size) : null,
    identity: cloneValue(identity)
  });
}

export function normalizeFrozenIdentity(value = {}, { requireMission = true } = {}) {
  const source = value?.identity ?? value ?? {};
  const missionId = safeIdentityValue(source.missionId, 'missionId', { required: requireMission });
  const challengeId = safeIdentityValue(source.challengeId, 'challengeId', { required: false });
  const planId = safeIdentityValue(source.planId, 'planId');
  const designChecksum = safeIdentityValue(source.designChecksum ?? source.planChecksum, 'designChecksum');
  const designRevision = nonNegativeInteger(source.designRevision, 'designRevision', { required: false });
  const requiredPlacementIds = normalizePlacementIds(source.requiredPlacementIds, 'requiredPlacementIds', { required: false });
  const partRegistryIdentity = compactRegistryIdentity(source.partRegistryIdentity ?? {
    revision: source.partRegistryRevision,
    hash: source.partRegistryHash
  });
  return Object.freeze({
    missionId,
    challengeId,
    challengeChecksum: source.challengeChecksum ?? null,
    designRevision,
    planId,
    designChecksum,
    worldTransform: source.worldTransform ? cloneValue(source.worldTransform) : null,
    requiredPlacementIds,
    partRegistryRevision: source.partRegistryRevision ?? partRegistryIdentity?.revision ?? null,
    partRegistryHash: source.partRegistryHash ?? partRegistryIdentity?.hash ?? null,
    partRegistryIdentity: partRegistryIdentity ? cloneValue(partRegistryIdentity.identity ?? partRegistryIdentity) : null
  });
}

export function assertIdentityMatch(expectedValue, actualValue, {
  context = 'service result',
  testId = null,
  requireMission = true,
  allowUnpopulatedRequiredIds = true
} = {}) {
  const expected = normalizeFrozenIdentity(expectedValue, { requireMission });
  const actual = normalizeFrozenIdentity(actualValue, { requireMission });
  const staleCode = testId ? 'STALE_TRAIN_RESULT' : 'STALE_PLAN';

  for (const key of ['missionId', 'challengeId', 'designRevision', 'planId', 'designChecksum', 'partRegistryRevision', 'partRegistryHash']) {
    if (expected[key] === null || expected[key] === undefined) continue;
    if (actual[key] === null || actual[key] === undefined || actual[key] !== expected[key]) {
      throw new MissionError(staleCode, `${context} does not match ${key}.`, { expected: expected[key], actual: actual[key] });
    }
  }
  if (expected.worldTransform && (!actual.worldTransform || !sameStructuredValue(expected.worldTransform, actual.worldTransform))) {
    throw new MissionError(staleCode, `${context} does not match worldTransform.`);
  }
  if (expected.requiredPlacementIds && (!allowUnpopulatedRequiredIds || expected.requiredPlacementIds.length > 0)) {
    if (!actual.requiredPlacementIds || !sameIdSet(expected.requiredPlacementIds, actual.requiredPlacementIds)) {
      throw new MissionError(staleCode, `${context} does not match requiredPlacementIds.`);
    }
  }
  const expectedSource = expectedValue?.identity ?? expectedValue ?? {};
  const actualSource = actualValue?.identity ?? actualValue ?? {};
  const expectedRegistryIdentity = expectedSource?.partRegistryIdentity ?? null;
  const actualRegistryIdentity = actualSource?.partRegistryIdentity ?? null;
  if (expectedRegistryIdentity && actualRegistryIdentity
      && !sameStructuredValue(expectedRegistryIdentity, actualRegistryIdentity)) {
    throw new MissionError(staleCode, `${context} does not match PartRegistry identity.`);
  }
  if (testId !== null) {
    const actualTestId = actualValue?.testId ?? actualValue?.identity?.testId ?? actualValue?.testIdentity?.testId;
    if (!actualTestId) throw new MissionError('INVALID_TRAIN_RESULT', `${context} has no testId.`);
    if (actualTestId !== testId) throw new MissionError('STALE_TRAIN_RESULT', `${context} belongs to another test.`);
  }
  return expected;
}

export function publicFailure(error, fallbackCode, fallbackMessage) {
  throw toMissionError(error, fallbackCode, fallbackMessage);
}

export function checkSignal(...signals) {
  for (const signal of signals) assertNotAborted(signal);
}

export function stateFromRobot(robotState = {}) {
  const operationState = String(robotState.operationState ?? robotState.state ?? (robotState.moving ? 'moving' : 'idle')).toLowerCase();
  const heldPartId = robotState.heldPartId ?? robotState.heldBrickId ?? robotState.heldObjectId ?? robotState.gripper?.heldPartId ?? null;
  return Object.freeze({
    idle: !robotState.moving && ['idle', 'ready', 'stopped'].includes(operationState),
    heldPartId,
    gripperEmpty: !heldPartId,
    state: operationState
  });
}

export function readCurrentWorldRevision(runtime, fallback = null) {
  const value = typeof runtime?.getWorldRevision === 'function' ? runtime.getWorldRevision() : fallback;
  return nonNegativeInteger(value, 'worldRevision');
}
