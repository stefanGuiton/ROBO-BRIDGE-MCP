'use strict';

import { MissionError, assertNotAborted, cloneValue, toMissionError } from '../errors.js';
import { fingerprint, nonNegativeInteger, requireMethod } from './shared.js';

function sourceId(value) {
  const id = value?.presetId ?? value?.challengeId ?? value?.id;
  if (typeof id !== 'string' || !id) {
    throw new MissionError('SERVICE_UNAVAILABLE', 'ChallengeService returned no preset ID.');
  }
  return id;
}

function checksumFor(value) {
  return fingerprint({
    presetId: value?.presetId ?? value?.id ?? null,
    familyHint: value?.familyHint ?? null,
    entry: value?.entry ?? null,
    exit: value?.exit ?? null,
    trackRoute: value?.trackRoute ?? value?.trainRoute ?? null,
    bridgeTransform: value?.bridgeTransform ?? null,
    bridgeChallengeInput: value?.bridgeChallengeInput ?? null,
    collisionProxy: value?.collisionProxy ?? null
  }, 'challenge_');
}

function publicChallenge(value, metadata = {}) {
  const id = sourceId(value);
  const bridgeChallengeInput = value?.bridgeChallengeInput ?? null;
  return Object.freeze({
    id,
    challengeId: id,
    presetId: id,
    bridgeChallengeId: metadata?.bridgeChallengeId ?? bridgeChallengeInput?.id ?? value?.bridgeChallengeId ?? id,
    label: metadata?.label ?? value?.label ?? id,
    description: metadata?.description ?? value?.description ?? `Production challenge ${id}.`,
    enabled: metadata?.enabled !== false && value?.enabled !== false,
    checksum: value?.checksum ?? value?.challengeChecksum ?? checksumFor(value),
    challengeChecksum: value?.checksum ?? value?.challengeChecksum ?? checksumFor(value),
    familyHint: value?.familyHint ?? null,
    entry: cloneValue(value?.entry ?? null),
    exit: cloneValue(value?.exit ?? null),
    trainRoute: cloneValue(value?.trainRoute ?? value?.trackRoute ?? null),
    trackRoute: cloneValue(value?.trackRoute ?? value?.trainRoute ?? null),
    bridgeTransform: cloneValue(value?.bridgeTransform ?? null),
    bridgeChallengeInput: cloneValue(bridgeChallengeInput),
    collisionProxy: cloneValue(value?.collisionProxy ?? null),
    raw: cloneValue(value)
  });
}

/**
 * Adapt the current ChallengeService API to the MissionService contract.
 * Terrain IDs and transforms are read from the injected production service and preset map.
 */
export function createChallengeServiceAdapter({
  service,
  presets = null,
  metadata = {},
  runtime = null,
  selectChallenge = null,
  resetChallenge = null
} = {}) {
  const getState = requireMethod(service, 'getState', 'ChallengeService');
  requireMethod(service, 'setPreset', 'ChallengeService');

  const readWorldRevision = () => {
    if (typeof runtime?.getWorldRevision !== 'function') return null;
    return nonNegativeInteger(runtime.getWorldRevision(), 'worldRevision');
  };

  const availableRecords = () => {
    if (presets && typeof presets === 'object' && !Array.isArray(presets)) {
      return Object.entries(presets).map(([id, value]) => publicChallenge({ ...cloneValue(value), presetId: value?.presetId ?? id }, metadata[id]));
    }
    return [publicChallenge(getState(), metadata[sourceId(getState())])];
  };

  const activeRecord = () => {
    const state = getState();
    const id = sourceId(state);
    return publicChallenge(state, metadata[id]);
  };

  return Object.freeze({
    getOptions({ cursor = 0, limit = 5 } = {}) {
      if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
        throw new MissionError('INVALID_PARAMETER', 'Challenge option paging is invalid.');
      }
      const records = availableRecords();
      const options = records.slice(cursor, cursor + limit);
      return {
        ok: true,
        cursor,
        limit,
        returnedCount: options.length,
        totalAvailable: records.length,
        nextCursor: cursor + options.length < records.length ? cursor + options.length : null,
        options
      };
    },

    getActiveChallenge() {
      return { ok: true, challenge: activeRecord(), worldRevision: readWorldRevision() };
    },

    async selectChallenge({ challengeId, expectedWorldRevision, signal } = {}) {
      try {
        assertNotAborted(signal);
        const before = readWorldRevision();
        if (before !== null && expectedWorldRevision !== before) {
          throw new MissionError('STALE_WORLD_REVISION', 'The world revision is stale.');
        }
        const option = availableRecords().find((item) => item.id === challengeId);
        if (!option || !option.enabled) throw new MissionError('CHALLENGE_NOT_FOUND', 'The selected challenge is not available.');

        if (typeof selectChallenge === 'function') {
          await selectChallenge({ challengeId, service, signal, option: cloneValue(option) });
        } else {
          await service.setPreset(challengeId);
        }
        assertNotAborted(signal);
        const selected = activeRecord();
        if (selected.id !== challengeId) throw new MissionError('CHALLENGE_NOT_FOUND', 'ChallengeService did not activate the selected challenge.');
        return { ok: true, challenge: selected, worldRevision: readWorldRevision() };
      } catch (error) {
        throw toMissionError(error, 'CHALLENGE_NOT_FOUND', 'ChallengeService could not select the challenge.');
      }
    },

    getEntry() { return cloneValue(service.getEntry?.() ?? activeRecord().entry); },
    getExit() { return cloneValue(service.getExit?.() ?? activeRecord().exit); },
    getTrainRoute() { return cloneValue(service.getTrainRoute?.() ?? service.getTrackRoute?.() ?? activeRecord().trainRoute); },
    getTrackRoute() { return cloneValue(service.getTrackRoute?.() ?? service.getTrainRoute?.() ?? activeRecord().trackRoute); },
    getBridgeTransform() { return cloneValue(service.getBridgeTransform?.() ?? activeRecord().bridgeTransform); },
    getBridgeChallengeInput() { return cloneValue(service.getBridgeChallengeInput?.() ?? activeRecord().bridgeChallengeInput); },

    async reset(options = {}) {
      try {
        assertNotAborted(options.signal);
        if (typeof resetChallenge === 'function') await resetChallenge({ service, ...options });
        else if (typeof service.reset === 'function') await service.reset();
        assertNotAborted(options.signal);
        return { ok: true, challenge: activeRecord(), worldRevision: readWorldRevision() };
      } catch (error) {
        throw toMissionError(error, 'RESET_FAILED', 'ChallengeService reset failed.');
      }
    },

    get productionService() { return service; }
  });
}
