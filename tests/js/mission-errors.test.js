'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionError, normalizeMissionErrorCode, toMissionError } from '../../apps/web/src/mission/errors.js';

test('common low-level error codes map to stable mission codes', () => {
  assert.equal(normalizeMissionErrorCode('cancelled'), 'CANCELLED');
  assert.equal(normalizeMissionErrorCode('stale_state'), 'STALE_WORLD_REVISION');
  assert.equal(normalizeMissionErrorCode('already_holding'), 'GRIPPER_NOT_EMPTY');
  assert.equal(normalizeMissionErrorCode('stream_not_found'), 'STALE_PLAN');
  assert.equal(normalizeMissionErrorCode('challenge_not_found'), 'CHALLENGE_NOT_FOUND');
});

test('unknown external codes fail as INTERNAL_ERROR without exposing their message', () => {
  const error = new MissionError('secret_vendor_failure', 'secret implementation path');
  assert.equal(error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(error.message, /secret/);
});

test('toMissionError preserves mapped cancellation and stale-state recovery codes', () => {
  assert.equal(toMissionError({ reason: 'cancelled', message: 'stopped' }).code, 'CANCELLED');
  assert.equal(toMissionError({ reason: 'stale_state', message: 'changed' }).code, 'STALE_WORLD_REVISION');
});


test('uncloneable external details cannot break safe error construction', () => {
  const error = new MissionError('INVALID_PARAMETER', 'Bad input.', { callback() {} });
  assert.equal(error.code, 'INVALID_PARAMETER');
  assert.deepEqual(error.details, {});
});
