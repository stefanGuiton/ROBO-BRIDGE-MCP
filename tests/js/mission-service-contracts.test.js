'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionService } from '../../apps/web/src/mission/mission-service.js';
import { createMissionHarness } from '../helpers/mission-fakes.js';
import { readWorldRevision, validateMissionServices } from '../../apps/web/src/mission/service-contracts.js';

test('service validation reports exact missing injected methods', () => {
  const result = validateMissionServices({});
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('bridgeHost.getCompileState'));
  assert.ok(result.missing.includes('constructionService.buildNextParts'));
  assert.ok(result.missing.includes('trainService.test'));
  assert.ok(result.missing.includes('challengeService.selectChallenge'));
  assert.ok(result.missing.includes('robotController.getState'));
  assert.ok(result.missing.includes('runtime.getWorldRevision'));
});

test('MissionService rejects an incomplete production injection', () => {
  assert.throws(() => new MissionService({}), /mission services are unavailable/i);
});

test('runtime world revision must be a non-negative safe integer', () => {
  const harness = createMissionHarness();
  assert.equal(readWorldRevision(harness.services), harness.worldRevision);
  harness.runtime.getWorldRevision = () => 1.5;
  assert.throws(() => readWorldRevision(harness.services), /invalid world revision/i);
});
