'use strict';

import { MissionError, assertNotAborted, cloneValue, toMissionError } from '../errors.js';
import {
  assertIdentityMatch,
  fingerprint,
  nonNegativeInteger,
  normalizeFrozenIdentity,
  sameIdSet,
  sameStructuredValue
} from './shared.js';

const READY = 'READY';
const TERMINAL = new Set(['FAILED', 'CROSSED', 'STOPPED']);
const ACTIVE = new Set(['PREPARING_TEST', 'POSITIONING_PUSHER', 'PUSH_READY', 'PUSHING', 'RUNNING_SUPPORTED', 'FALLING']);
const BUILD_BOARD_SOURCE = 'BUILD_BOARD';

function requireTrainService(service) {
  const required = ['getState', 'getSnapshot', 'startTest', 'runToTerminal', 'resetTrain', 'stopTest'];
  const missing = required.filter((name) => typeof service?.[name] !== 'function');
  if (missing.length) {
    throw new MissionError('SERVICE_UNAVAILABLE', 'The production TrainService is incomplete.', { missing });
  }
  return service;
}

function defaultSnapshot(source = {}) {
  const state = typeof source?.getState === 'function' ? source.getState() : source;
  const targets = typeof source?.getTargets === 'function'
    ? source.getTargets()
    : cloneValue(state?.targets ?? state?.buildState?.targets ?? []);
  const ids = new Set(
    source?.acceptedPlacementIds instanceof Set
      ? [...source.acceptedPlacementIds].map(String)
      : Array.isArray(source?.acceptedPlacementIds) ? source.acceptedPlacementIds.map(String) : []
  );
  for (const target of targets ?? []) {
    const accepted = target?.accepted === true
      || Boolean(target?.occupiedBy && target?.correctness !== false)
      || ['accepted', 'correct'].includes(String(target?.status ?? target?.state ?? '').toLowerCase());
    if (!accepted) continue;
    const id = target.placementId ?? target.targetId ?? target.id;
    if (id) ids.add(String(id));
  }
  const acceptedPlacementIds = [...ids].sort();
  return {
    blueprintId: source?.blueprintId ?? state?.blueprintId ?? state?.buildState?.blueprintId ?? null,
    designChecksum: source?.designChecksum ?? state?.designChecksum ?? state?.buildState?.designChecksum ?? null,
    worldRevision: source?.worldRevision ?? state?.worldRevision ?? state?.buildState?.worldRevision ?? null,
    acceptedPlacementIds,
    acceptedChecksum: fingerprint(acceptedPlacementIds, '')
  };
}

function trainState(service) {
  return String(service.getState() ?? 'UNKNOWN').toUpperCase();
}

function mapStartFailure(started) {
  const reason = String(started?.reason ?? started?.preconditions?.primaryCode ?? 'TRAIN_ERROR').toUpperCase();
  if (reason === 'TRAIN_NOT_READY') return new MissionError('TRAIN_NOT_READY', 'TrainService is not ready.');
  if (reason === 'STALE_PLAN' || reason === 'NO_FROZEN_PLAN') return new MissionError('STALE_PLAN', 'TrainService rejected the frozen plan identity.');
  if (reason === 'ROBOT_EXECUTING' || reason === 'ROBOT_NOT_IDLE') return new MissionError('ROBOT_BUSY', 'The robot must be idle before TEST.');
  if (reason === 'GRIPPER_HOLDING_PART') return new MissionError('GRIPPER_NOT_EMPTY', 'The gripper must be empty before TEST.');
  return new MissionError('TRAIN_ERROR', started?.message ?? `TrainService start failed: ${reason}.`);
}

/**
 * Map Train TEST V2.2 to the MissionService contract.
 * TrainService remains the only test and physics authority.
 */
export function createTrainServiceAdapter({
  service,
  runtime = null,
  getAcceptedBuildBoardSnapshot,
  normalizeAcceptedBuildBoardSnapshot = null,
  awaitPusherReady = null,
  maxSeconds = 20,
  fixedDtSeconds = 1 / 120
} = {}) {
  service = requireTrainService(service);
  if (typeof getAcceptedBuildBoardSnapshot !== 'function') {
    throw new MissionError('SERVICE_UNAVAILABLE', 'getAcceptedBuildBoardSnapshot is required for TrainService.');
  }

  let activeTest = null;

  const currentWorldRevision = () => nonNegativeInteger(
    typeof runtime?.getWorldRevision === 'function'
      ? runtime.getWorldRevision()
      : service.getSnapshot()?.buildBoard?.worldRevision,
    'worldRevision'
  );

  const normalizeBoard = async () => {
    const source = await getAcceptedBuildBoardSnapshot();
    const snapshot = typeof normalizeAcceptedBuildBoardSnapshot === 'function'
      ? normalizeAcceptedBuildBoardSnapshot(source)
      : defaultSnapshot(source);
    if (!snapshot || !Array.isArray(snapshot.acceptedPlacementIds)) {
      throw new MissionError('INVALID_SUPPORT_SNAPSHOT', 'The accepted BuildBoard snapshot is invalid.');
    }
    return Object.freeze({
      ...cloneValue(snapshot),
      acceptedPlacementIds: snapshot.acceptedPlacementIds.map(String).sort()
    });
  };

  const checkLiveBoard = async (acceptedSnapshot, identity) => {
    const live = await normalizeBoard();
    const suppliedIds = acceptedSnapshot.acceptedPlacementIds.map(String).sort();
    if (!sameIdSet(live.acceptedPlacementIds, suppliedIds)) {
      throw new MissionError('STALE_WORLD_REVISION', 'The BuildBoard changed before TrainService started.');
    }
    if (live.blueprintId && live.blueprintId !== identity.planId) {
      throw new MissionError('STALE_PLAN', 'The BuildBoard blueprint does not match the frozen plan.');
    }
    if (live.designChecksum && live.designChecksum !== identity.designChecksum) {
      throw new MissionError('STALE_PLAN', 'The BuildBoard checksum does not match the frozen plan.');
    }
    if (nonNegativeInteger(live.worldRevision, 'BuildBoard worldRevision') !== currentWorldRevision()) {
      throw new MissionError('STALE_WORLD_REVISION', 'The BuildBoard world revision is stale.');
    }
    return live;
  };

  const verifyCoreSnapshot = (snapshot, identity, liveBoard) => {
    const plan = snapshot?.planIdentity;
    if (!plan || plan.planId !== identity.planId
      || plan.designChecksum !== identity.designChecksum
      || plan.designRevision !== identity.designRevision) {
      throw new MissionError('STALE_TRAIN_RESULT', 'TrainService used another BuildPlan identity.');
    }
    const board = snapshot?.buildBoard;
    if (!board || (board.blueprintId && board.blueprintId !== identity.planId)) {
      throw new MissionError('STALE_TRAIN_RESULT', 'TrainService used another BuildBoard blueprint.');
    }
    if (nonNegativeInteger(board.worldRevision, 'Train BuildBoard worldRevision') !== currentWorldRevision()) {
      throw new MissionError('STALE_TRAIN_RESULT', 'TrainService used a stale BuildBoard world revision.');
    }
    if (liveBoard.acceptedChecksum && board.acceptedChecksum
      && liveBoard.acceptedChecksum !== board.acceptedChecksum) {
      throw new MissionError('STALE_TRAIN_RESULT', 'TrainService used another accepted BuildBoard snapshot.');
    }
    const usedTransform = snapshot?.routeFrame?.worldTransform;
    if (identity.worldTransform && usedTransform && !sameStructuredValue(identity.worldTransform, usedTransform)) {
      throw new MissionError('STALE_TRAIN_RESULT', 'TrainService used another worldTransform.');
    }
  };

  return Object.freeze({
    getState() {
      const state = trainState(service);
      const snapshot = service.getSnapshot();
      return {
        ok: true,
        state,
        ready: [READY, 'FAILED', 'STOPPED'].includes(state),
        canTest: [READY, 'FAILED', 'STOPPED'].includes(state),
        result: snapshot?.result?.outcome ?? service.getResult?.()?.outcome ?? null,
        lastResult: cloneValue(snapshot?.result ?? service.getResult?.() ?? null),
        active: ACTIVE.has(state)
      };
    },

    async test({ identity: identityInput, testBinding, acceptedSnapshot, signal } = {}, options = {}) {
      try {
        assertNotAborted(signal ?? options.signal);
        const identity = normalizeFrozenIdentity(identityInput);
        if (!testBinding?.testId) throw new MissionError('INVALID_TRAIN_RESULT', 'The train test binding has no testId.');
        assertIdentityMatch(identity, testBinding, {
          context: 'Train test binding',
          requireMission: true,
          allowUnpopulatedRequiredIds: false
        });
        if (!acceptedSnapshot || acceptedSnapshot.supportSource !== BUILD_BOARD_SOURCE
          || !Array.isArray(acceptedSnapshot.acceptedPlacementIds)) {
          throw new MissionError('INVALID_SUPPORT_SNAPSHOT', 'TEST needs an accepted BUILD_BOARD snapshot.');
        }
        assertIdentityMatch(identity, acceptedSnapshot.identity ?? acceptedSnapshot, {
          context: 'Train support snapshot',
          allowUnpopulatedRequiredIds: false
        });
        if (currentWorldRevision() !== testBinding.sampledWorldRevision
          || acceptedSnapshot.worldRevision !== testBinding.sampledWorldRevision) {
          throw new MissionError('STALE_WORLD_REVISION', 'The train test snapshot world revision is stale.');
        }
        const initialState = trainState(service);
        if (['FAILED', 'STOPPED'].includes(initialState)) {
          const reset = await service.resetTrain({ instant: true });
          if (String(reset?.state ?? trainState(service)).toUpperCase() !== READY) {
            throw new MissionError('TRAIN_NOT_READY', 'TrainService could not reset for the next test.');
          }
        } else if (initialState !== READY) {
          throw new MissionError('TRAIN_NOT_READY', 'TrainService is not READY.');
        }

        const liveBoard = await checkLiveBoard(acceptedSnapshot, identity);
        activeTest = Object.freeze({
          testId: testBinding.testId,
          identity: cloneValue(identity),
          supportSnapshotId: testBinding.supportSnapshotId ?? acceptedSnapshot.snapshotId ?? null,
          supportSnapshotChecksum: testBinding.supportSnapshotChecksum ?? acceptedSnapshot.checksum ?? null
        });

        // startTest() already calls prepareTest(). Do not call prepareTest() separately.
        let started = await service.startTest();
        if (started?.ok === false) throw mapStartFailure(started);
        assertNotAborted(signal ?? options.signal);

        if (started?.waitingForPusher || trainState(service) === 'POSITIONING_PUSHER') {
          if (typeof awaitPusherReady !== 'function') {
            service.stopTest();
            throw new MissionError('TRAIN_NOT_READY', 'The external train pusher is not ready.');
          }
          const ready = await awaitPusherReady({
            testId: activeTest.testId,
            targetPose: cloneValue(service.getPushStartPose?.() ?? started?.snapshot?.pusher?.targetPose ?? null),
            service,
            signal: signal ?? options.signal
          });
          assertNotAborted(signal ?? options.signal);
          if (ready === false) throw new MissionError('TRAIN_NOT_READY', 'The external train pusher did not become ready.');
          if (trainState(service) === 'POSITIONING_PUSHER') {
            if (typeof service.notifyPusherReady !== 'function') throw new MissionError('TRAIN_NOT_READY', 'TrainService cannot confirm pusher readiness.');
            service.notifyPusherReady(ready?.pose ?? ready?.targetPose ?? undefined);
          }
          if (trainState(service) === 'PUSH_READY') {
            if (typeof service.pushEvent !== 'function') throw new MissionError('TRAIN_ERROR', 'TrainService cannot start the push event.');
            started = await service.pushEvent();
            if (started?.ok === false) throw mapStartFailure(started);
          }
        }

        let snapshot = await service.runToTerminal(options.maxSeconds ?? maxSeconds, options.fixedDtSeconds ?? fixedDtSeconds);
        assertNotAborted(signal ?? options.signal);
        let state = String(snapshot?.state ?? trainState(service)).toUpperCase();
        if (!TERMINAL.has(state)) {
          service.stopTest();
          snapshot = service.getSnapshot();
          state = String(snapshot?.state ?? trainState(service)).toUpperCase();
        }
        verifyCoreSnapshot(snapshot, identity, liveBoard);
        if (currentWorldRevision() !== testBinding.sampledWorldRevision) {
          throw new MissionError('STALE_WORLD_REVISION', 'The world changed while TrainService ran.');
        }

        const realOutcome = String(snapshot?.result?.outcome ?? service.getResult?.()?.outcome ?? '').toUpperCase();
        if (!/^[A-Z][A-Z0-9_.:-]{0,63}$/.test(realOutcome)) {
          throw new MissionError('INVALID_TRAIN_RESULT', 'TrainService returned no valid terminal outcome.');
        }
        const outcome = state === 'CROSSED' && realOutcome === 'CROSSED' ? 'CROSSED' : realOutcome;
        if (outcome === 'CROSSED' && state !== 'CROSSED') {
          throw new MissionError('INVALID_TRAIN_RESULT', 'Only the actual CROSSED state can return CROSSED.');
        }

        const result = {
          ok: true,
          identity: {
            ...cloneValue(identity),
            testId: activeTest.testId,
            supportSource: BUILD_BOARD_SOURCE,
            supportSnapshotId: activeTest.supportSnapshotId,
            supportSnapshotChecksum: activeTest.supportSnapshotChecksum
          },
          testId: activeTest.testId,
          missionId: identity.missionId,
          challengeId: identity.challengeId,
          planId: identity.planId,
          designChecksum: identity.designChecksum,
          designRevision: identity.designRevision,
          partRegistryRevision: identity.partRegistryRevision,
          partRegistryHash: identity.partRegistryHash,
          supportSource: BUILD_BOARD_SOURCE,
          testedSupportSource: BUILD_BOARD_SOURCE,
          supportSnapshotId: activeTest.supportSnapshotId,
          supportSnapshotChecksum: activeTest.supportSnapshotChecksum,
          worldRevision: currentWorldRevision(),
          state,
          outcome,
          firstUnsupportedSegment: snapshot?.result?.firstUnsupportedSegment ?? snapshot?.support?.firstUnsupportedSegment ?? null,
          firstUnsupportedProgress: snapshot?.result?.firstUnsupportedProgress ?? snapshot?.support?.firstUnsupportedProgress ?? null,
          trainSnapshot: cloneValue(snapshot)
        };
        activeTest = null;
        return result;
      } catch (error) {
        activeTest = null;
        throw toMissionError(error, 'TRAIN_ERROR', 'TrainService could not run the bridge test.');
      }
    },

    async cancel({ identity = null } = {}) {
      try {
        if (identity && activeTest) {
          assertIdentityMatch(activeTest.identity, identity, { context: 'Train cancellation identity' });
        }
        const snapshot = await service.stopTest();
        activeTest = null;
        return { ok: true, state: snapshot?.state ?? trainState(service), snapshot: cloneValue(snapshot) };
      } catch (error) {
        throw toMissionError(error, 'TRAIN_ERROR', 'TrainService cancellation failed.');
      }
    },

    async reset({ identity = null, signal } = {}) {
      try {
        assertNotAborted(signal);
        if (identity && activeTest) {
          assertIdentityMatch(activeTest.identity, identity, { context: 'Train reset identity' });
        }
        service.stopTest();
        let snapshot = await service.resetTrain({ instant: true });
        if (String(snapshot?.state ?? trainState(service)).toUpperCase() !== READY
          && typeof service.runResetToReady === 'function') {
          snapshot = await service.runResetToReady();
        }
        if (String(snapshot?.state ?? trainState(service)).toUpperCase() !== READY) {
          throw new MissionError('RESET_FAILED', 'TrainService did not return to READY.');
        }
        activeTest = null;
        assertNotAborted(signal);
        return { ok: true, state: READY, snapshot: cloneValue(snapshot), worldRevision: currentWorldRevision() };
      } catch (error) {
        throw toMissionError(error, 'RESET_FAILED', 'TrainService reset failed.');
      }
    },

    getProductionService() { return service; }
  });
}
