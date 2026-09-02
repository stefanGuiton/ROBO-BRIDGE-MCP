'use strict';

import { BridgeCoreError, cloneValue } from './errors.js';
import { normalizeSupportProfile } from './support-profile.js';
import { normalizeWorldTransform } from './world-transform.js';

const ROOT_KEYS = new Set([
  'id', 'entry', 'exit', 'span', 'roadY', 'anchorHeightY', 'anchorBlockLengthX',
  'worldTransform', 'supportProfile', 'centre', 'headingRad'
]);
const POINT_KEYS = new Set(['x', 'y', 'z']);

function finite(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BridgeCoreError('INVALID_CHALLENGE', `${path} must be a finite number.`, { path, value });
  }
  return value;
}

function normalizePoint(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeCoreError('INVALID_CHALLENGE', `${path} must be an object.`, { path });
  }
  for (const key of Object.keys(value)) {
    if (!POINT_KEYS.has(key)) throw new BridgeCoreError('INVALID_CHALLENGE', `Unknown ${path} property: ${key}.`, { path: `${path}.${key}` });
  }
  return { x: finite(value.x, `${path}.x`), y: finite(value.y, `${path}.y`), z: finite(value.z ?? 0, `${path}.z`) };
}

export function normalizeChallengeInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BridgeCoreError('INVALID_CHALLENGE', 'challenge must be an object.');
  }
  for (const key of Object.keys(input)) {
    if (!ROOT_KEYS.has(key)) throw new BridgeCoreError('INVALID_CHALLENGE', `Unknown challenge property: ${key}.`, { path: key });
  }
  const hasEntry = input.entry !== undefined;
  const hasExit = input.exit !== undefined;
  if (hasEntry !== hasExit) {
    throw new BridgeCoreError('INVALID_CHALLENGE', 'challenge.entry and challenge.exit must be supplied together.');
  }
  const explicitSpan = input.span === undefined ? null : finite(input.span, 'challenge.span');
  const explicitRoadY = input.roadY === undefined ? null : finite(input.roadY, 'challenge.roadY');
  let entry;
  let exit;
  let span;
  let roadY;
  if (hasEntry) {
    entry = normalizePoint(input.entry, 'challenge.entry');
    exit = normalizePoint(input.exit, 'challenge.exit');
    const dx = exit.x - entry.x;
    const dz = exit.z - entry.z;
    span = Math.hypot(dx, dz);
    if (!(span > 0)) throw new BridgeCoreError('INVALID_CHALLENGE', 'ENTRY and EXIT must be different points.');
    if (Math.abs(entry.y - exit.y) > 1e-6) {
      throw new BridgeCoreError('INVALID_CHALLENGE', 'ENTRY and EXIT must use the same road height.', { entryY: entry.y, exitY: exit.y });
    }
    roadY = entry.y;
    if (explicitSpan !== null && Math.abs(explicitSpan - span) > 1e-6) {
      throw new BridgeCoreError('INVALID_CHALLENGE', 'challenge.span does not match ENTRY to EXIT distance.', { explicitSpan, measuredSpan: span });
    }
    if (explicitRoadY !== null && Math.abs(explicitRoadY - roadY) > 1e-6) {
      throw new BridgeCoreError('INVALID_CHALLENGE', 'challenge.roadY does not match ENTRY and EXIT.', { explicitRoadY, measuredRoadY: roadY });
    }
  } else {
    span = explicitSpan ?? 220;
    roadY = explicitRoadY ?? 75;
    if (!(span > 0)) throw new BridgeCoreError('INVALID_CHALLENGE', 'challenge.span must be greater than 0.', { span });
    entry = { x: -span * 0.5, y: roadY, z: 0 };
    exit = { x: span * 0.5, y: roadY, z: 0 };
  }
  const anchorHeightY = finite(input.anchorHeightY ?? 20, 'challenge.anchorHeightY');
  const anchorBlockLengthX = finite(input.anchorBlockLengthX ?? 20, 'challenge.anchorBlockLengthX');
  if (!(anchorHeightY > 0) || !(anchorBlockLengthX > 0)) {
    throw new BridgeCoreError('INVALID_CHALLENGE', 'Anchor dimensions must be greater than 0.', { anchorHeightY, anchorBlockLengthX });
  }
  const centre = {
    x: (entry.x + exit.x) * 0.5,
    y: roadY,
    z: (entry.z + exit.z) * 0.5
  };
  const headingRad = Math.atan2(exit.z - entry.z, exit.x - entry.x);
  return Object.freeze({
    id: typeof input.id === 'string' && input.id ? input.id : 'bridge-challenge',
    entry: Object.freeze(entry),
    exit: Object.freeze(exit),
    centre: Object.freeze(centre),
    span,
    roadY,
    headingRad,
    anchorHeightY,
    anchorBlockLengthX,
    worldTransform: normalizeWorldTransform(input.worldTransform ?? {}),
    supportProfile: normalizeSupportProfile(input.supportProfile ?? { type: 'flat', heightY: 0 })
  });
}

export function applyChallengeToSettings(settings, challengeInput = {}) {
  const challenge = normalizeChallengeInput(challengeInput);
  const candidate = cloneValue(settings);
  candidate.anchorGroupX = challenge.centre.x;
  candidate.anchorGroupZ = challenge.centre.z;
  candidate.anchorGapX = challenge.span;
  candidate.anchorHeightY = challenge.anchorHeightY;
  candidate.anchorBlockLengthX = challenge.anchorBlockLengthX;
  candidate.anchorBaseY = challenge.roadY - challenge.anchorHeightY;
  return { settings: candidate, challenge };
}
