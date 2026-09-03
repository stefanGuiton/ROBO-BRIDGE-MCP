'use strict';

import { boundedErrorResult } from './errors.js';

export function createMissionTrainAdapter(trainIntegration) {
  if (!trainIntegration?.test || !trainIntegration?.reset || !trainIntegration?.getState) {
    throw new TypeError('Mission Train adapter requires a Train integration instance.');
  }
  return Object.freeze({
    getState() {
      return trainIntegration.getState();
    },
    async test(input = {}) {
      try {
        if (!input.identity || !input.testBinding || !input.acceptedSnapshot) {
          return await trainIntegration.test(input);
        }
        const identity = input.identity ?? {};
        const binding = input.testBinding ?? {};
        const accepted = input.acceptedSnapshot ?? {};
        const state = trainIntegration.getState();
        if (['FAILED', 'STOPPED'].includes(state.state)) {
          trainIntegration.reset({ instant: true, reason: 'mission_test_retry' });
        }
        if (trainIntegration.getState().state === 'READY') trainIntegration.refresh();
        const evidence = trainIntegration.getEvidence();
        const acceptedIds = [...(accepted.acceptedPlacementIds ?? [])].map(String).sort();
        const evidenceIds = [...(evidence?.buildBoardSnapshot?.acceptedPlacementIds ?? [])].map(String).sort();
        if (evidence?.identity?.planId !== identity.planId
          || evidence?.identity?.designChecksum !== identity.designChecksum
          || evidence?.identity?.buildBoardWorldRevision !== accepted.worldRevision
          || acceptedIds.length !== evidenceIds.length
          || acceptedIds.some((id, index) => id !== evidenceIds[index])) {
          return boundedErrorResult(Object.assign(new Error('Mission Train evidence is stale.'), {
            code: 'STALE_TRAIN_RESULT'
          }), 'STALE_TRAIN_RESULT');
        }
        const result = await trainIntegration.test({ signal: input.signal, testId: binding.testId });
        if (result?.ok === false) return result;
        const supportSource = 'BUILD_BOARD';
        const testIdentity = {
          ...identity,
          testId: binding.testId,
          supportSource,
          supportSnapshotId: binding.supportSnapshotId ?? accepted.snapshotId ?? null,
          supportSnapshotChecksum: binding.supportSnapshotChecksum ?? accepted.checksum ?? null
        };
        return Object.freeze({
          ...result,
          identity: testIdentity,
          testId: binding.testId,
          missionId: identity.missionId,
          challengeId: identity.challengeId,
          supportSource,
          testedSupportSource: supportSource,
          supportSnapshotId: testIdentity.supportSnapshotId,
          supportSnapshotChecksum: testIdentity.supportSnapshotChecksum,
          worldRevision: result.worldRevision ?? result.buildBoardWorldRevision
        });
      } catch (error) {
        return boundedErrorResult(error, 'TRAIN_TEST_FAILED');
      }
    },
    validateTestMotion(input) { return trainIntegration.validateTestMotion?.(input) === true; },
    async reset(options = {}) {
      try {
        await trainIntegration.cancelMotion?.(options.reason ?? 'mission_reset');
        if (!trainIntegration.getState().configured) return { ok: true, state: 'UNCONFIGURED' };
        return options.identity
          ? trainIntegration.reset({ instant: true, reason: options.reason ?? 'mission_reset' })
          : trainIntegration.reset(options);
      } catch (error) {
        return boundedErrorResult(error, 'TRAIN_RESET_FAILED');
      }
    },
    async cancel(options = {}) {
      try {
        await trainIntegration.cancelMotion?.(options.reason ?? 'mission_cancelled');
        if (!trainIntegration.getState().configured) return { ok: true, state: 'UNCONFIGURED' };
        return trainIntegration.reset({ instant: true, reason: options.reason ?? 'mission_cancelled' });
      } catch (error) {
        return boundedErrorResult(error, 'TRAIN_RESET_FAILED');
      }
    }
  });
}
