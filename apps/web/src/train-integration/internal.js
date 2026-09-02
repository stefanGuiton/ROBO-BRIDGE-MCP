'use strict';

import { checksumHex, cloneValue, deepFreezePlain, finite } from '../train/math.js';
import { TrainIntegrationError, invariant } from './errors.js';

export { checksumHex, cloneValue, deepFreezePlain, finite, invariant };

export function unwrapFrozenPlan(value) {
  const buildPlan = value?.buildPlan?.schemaVersion === '4.6' ? value.buildPlan : value;
  invariant(buildPlan?.schemaVersion === '4.6', 'BUILDPLAN_UNAVAILABLE', 'A frozen V4.6 BuildPlan is required.');
  return {
    buildPlan,
    frozenEnvelope: value?.buildPlan?.schemaVersion === '4.6' ? value : null
  };
}

export function callFirst(source, names) {
  for (const name of names) {
    if (typeof source?.[name] === 'function') {
      const value = source[name]();
      if (value !== undefined && value !== null) return { name, value };
    }
  }
  return { name: null, value: null };
}

export function normalizeMachinePoint(value, label = 'point') {
  const source = value?.positionMm ?? value?.machinePositionMm ?? value?.position ?? value;
  const xMm = Number(source?.xMm ?? source?.x);
  const yMm = Number(source?.yMm ?? source?.y);
  const zMm = Number(source?.zMm ?? source?.z);
  invariant([xMm, yMm, zMm].every(Number.isFinite), 'INVALID_CHALLENGE_ROUTE', `${label} must contain finite machine X, Y and Z values.`, { value });
  return Object.freeze({ xMm, yMm, zMm });
}

export function distance3(a, b) {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm);
}

export function distanceHorizontal(a, b) {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
}

export function sortedUniqueIds(values, label = 'IDs') {
  invariant(Array.isArray(values), 'PLACEMENT_IDENTITY_MISSING', `${label} must be an array.`);
  const ids = values.map((value) => String(value));
  invariant(ids.every(Boolean), 'PLACEMENT_IDENTITY_INVALID', `${label} contain an empty ID.`);
  const unique = new Set(ids);
  invariant(unique.size === ids.length, 'PLACEMENT_IDENTITY_DUPLICATE', `${label} contain duplicate IDs.`, {
    duplicateCount: ids.length - unique.size
  });
  return [...unique].sort();
}

export function compareIdSets(expectedValues, actualValues) {
  const expected = new Set(expectedValues);
  const actual = new Set(actualValues);
  return {
    missing: [...expected].filter((id) => !actual.has(id)).sort(),
    unexpected: [...actual].filter((id) => !expected.has(id)).sort(),
    matches: expected.size === actual.size && [...expected].every((id) => actual.has(id))
  };
}

export function checksumIds(ids) {
  return checksumHex([...ids].sort());
}

export function terminalState(state) {
  return state === 'CROSSED' || state === 'FAILED' || state === 'STOPPED';
}

export function makeAbortError(reason = 'train_test_cancelled') {
  return new TrainIntegrationError('TRAIN_TEST_CANCELLED', 'The train test was cancelled.', { reason }, { recoverable: true });
}
