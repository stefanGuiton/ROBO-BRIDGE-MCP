'use strict';

import {
  TRAIN_FIXED_DT_SECONDS,
  TRAIN_STATES,
  createMainDemoTrainSubsystem
} from '../train/index.js';
import { createTrainTestEvidence } from './buildboard-evidence-adapter.js';
import { createChallengeTerrainSurfaceAdapter } from './challenge-terrain-surface-adapter.js';
import { TrainIntegrationError, asTrainIntegrationError } from './errors.js';
import { cloneValue, deepFreezePlain, invariant, makeAbortError, terminalState } from './internal.js';

function normalizedInput(input = {}) {
  const preparedBuild = input.preparedBuild || null;
  return {
    frozenPlan: input.frozenPlan ?? preparedBuild?.frozenPlan,
    buildBoard: input.buildBoard ?? null,
    buildBoardSnapshot: input.buildBoardSnapshot ?? null,
    normalisedBuild: input.normalisedBuild ?? preparedBuild?.normalisedBuild,
    targetSet: input.targetSet ?? preparedBuild?.targetSet,
    expectedPlacementIds: input.expectedPlacementIds ?? preparedBuild?.frozenPlan?.requiredPlacementIds,
    partRegistry: input.partRegistry ?? preparedBuild?.registry,
    requirePartRegistry: input.requirePartRegistry,
    allowIdOnlySnapshot: input.allowIdOnlySnapshot === true
  };
}

function missionState(subsystem, evidence, configured) {
  const snapshot = subsystem?.service?.getSnapshot?.() || null;
  return deepFreezePlain({
    schemaVersion: 'robo-bridge.mission-train-state.v1',
    configured,
    state: snapshot?.state ?? 'UNCONFIGURED',
    terminal: snapshot ? terminalState(snapshot.state) : false,
    outcome: snapshot?.result?.outcome ?? null,
    success: snapshot?.result?.success ?? null,
    progress: snapshot?.progress ?? 0,
    elapsedMs: snapshot?.elapsedMs ?? 0,
    planIdentity: snapshot?.planIdentity ?? (evidence?.identity ? {
      planId: evidence.identity.planId,
      designChecksum: evidence.identity.designChecksum,
      designRevision: evidence.identity.designRevision
    } : null),
    buildBoard: snapshot?.buildBoard ?? (evidence ? {
      blueprintId: evidence.buildBoardSnapshot.blueprintId,
      worldRevision: evidence.buildBoardSnapshot.worldRevision,
      acceptedChecksum: evidence.buildBoardSnapshot.acceptedChecksum
    } : null),
    support: snapshot?.support ?? (evidence ? {
      segmentCount: evidence.supportContract.segmentCount,
      supportedCount: evidence.supportContract.supportedCount,
      allSupported: evidence.supportContract.allSupported,
      firstUnsupportedSegment: evidence.supportContract.firstUnsupportedSegment,
      firstUnsupportedProgress: evidence.supportContract.firstUnsupportedProgress,
      checksum: evidence.supportContract.supportChecksum
    } : null),
    pusher: snapshot?.pusher ? {
      mode: snapshot.pusher.mode,
      visible: snapshot.pusher.visible,
      engaged: snapshot.pusher.engaged,
      targetPose: snapshot.pusher.targetPose
    } : null
  });
}

function terminalResult(snapshot, evidence) {
  const outcome = snapshot?.result?.outcome ?? (snapshot?.state === TRAIN_STATES.CROSSED ? 'CROSSED' : snapshot?.state === TRAIN_STATES.FAILED ? 'TRAIN_FELL' : 'STOPPED');
  const completed = outcome === 'CROSSED' || outcome === 'TRAIN_FELL';
  return deepFreezePlain({
    ok: completed,
    success: outcome === 'CROSSED',
    outcome,
    cause: snapshot?.result?.cause ?? null,
    state: snapshot?.state ?? null,
    progress: snapshot?.result?.progress ?? snapshot?.progress ?? 0,
    elapsedMs: snapshot?.result?.elapsedMs ?? snapshot?.elapsedMs ?? 0,
    firstUnsupportedSegment: snapshot?.result?.firstUnsupportedSegment ?? evidence?.supportContract?.firstUnsupportedSegment ?? null,
    firstUnsupportedProgress: snapshot?.result?.firstUnsupportedProgress ?? evidence?.supportContract?.firstUnsupportedProgress ?? null,
    planId: evidence?.identity?.planId ?? snapshot?.planIdentity?.planId ?? null,
    designChecksum: evidence?.identity?.designChecksum ?? snapshot?.planIdentity?.designChecksum ?? null,
    buildBoardWorldRevision: evidence?.identity?.buildBoardWorldRevision ?? snapshot?.buildBoard?.worldRevision ?? null,
    supportChecksum: evidence?.supportContract?.supportChecksum ?? snapshot?.support?.checksum ?? null,
    collisionChecksum: snapshot?.collision?.checksum ?? null,
    evidenceChecksum: evidence?.identity?.evidenceChecksum ?? null
  });
}

export function createMainDemoTrainIntegration(options = {}) {
  const challengeService = options.challengeService;
  invariant(challengeService, 'CHALLENGE_SERVICE_REQUIRED', 'ChallengeService is required for Train integration.');
  let subsystem = null;
  let subsystemUnsubscribe = null;
  let terrainSurface = null;
  let evidence = null;
  let preparedInput = null;
  let pending = null;
  let disposed = false;

  function clearSubsystem() {
    subsystemUnsubscribe?.();
    subsystemUnsubscribe = null;
    subsystem?.dispose?.();
    subsystem = null;
    terrainSurface = null;
  }

  function settlePending(result) {
    if (!pending) return false;
    const active = pending;
    pending = null;
    active.signal?.removeEventListener?.('abort', active.onAbort);
    active.resolve(result);
    return true;
  }

  function verifyPreparedEvidence() {
    if (!subsystem || !evidence) return;
    const liveSupport = subsystem.service.getSupportMap();
    invariant(liveSupport?.checksum === evidence.supportMap.checksum,
      'TRAIN_SUPPORT_REPLAY_MISMATCH', 'TrainService support map differs from prepared authority evidence.', {
        expected: evidence.supportMap.checksum,
        received: liveSupport?.checksum ?? null
      }, { recoverable: false });
  }

  function checkTerminal() {
    if (!subsystem || !pending) return false;
    const state = subsystem.service.getState();
    if (!terminalState(state)) return false;
    const snapshot = subsystem.service.getSnapshot();
    if (pending.overrideResult) return settlePending(pending.overrideResult);
    if (pending.cancelled) {
      return settlePending(deepFreezePlain({
        ok: false,
        success: false,
        outcome: 'STOPPED',
        state: snapshot.state,
        error: makeAbortError(pending.cancelReason).toJSON(),
        planId: evidence?.identity?.planId ?? null,
        buildBoardWorldRevision: evidence?.identity?.buildBoardWorldRevision ?? null
      }));
    }
    return settlePending(terminalResult(snapshot, evidence));
  }

  function prepare(input = {}) {
    invariant(!disposed, 'TRAIN_INTEGRATION_DISPOSED', 'Train integration is disposed.', {}, { recoverable: false });
    invariant(!pending, 'TRAIN_TEST_ACTIVE', 'A train test is already active.');
    const normalized = normalizedInput(input);
    const nextEvidence = createTrainTestEvidence({
      challengeService,
      ...normalized,
      routeValidation: input.routeValidation ?? options.routeValidation,
      supportSettings: input.supportSettings ?? options.supportSettings,
      includeMergedFaces: input.includeMergedFaces ?? true
    });
    clearSubsystem();
    evidence = nextEvidence;
    preparedInput = {
      ...normalized,
      routeValidation: input.routeValidation ?? options.routeValidation,
      supportSettings: input.supportSettings ?? options.supportSettings,
      includeMergedFaces: input.includeMergedFaces ?? true,
      terrain: input.terrain
    };
    terrainSurface = createChallengeTerrainSurfaceAdapter({
      challengeService,
      routeFrame: evidence.routeContract.trainRouteFrame,
      ...(options.terrain || {}),
      ...(input.terrain || {})
    });
    const userStateChange = options.onStateChange;
    subsystem = createMainDemoTrainSubsystem({
      THREE: options.THREE,
      machineRoot: options.machineRoot,
      requestRender: options.requestRender,
      vehicleMeshFactory: options.vehicleMeshFactory,
      materialFactory: options.materialFactory,
      getFrozenBuildPlan: () => evidence.buildPlan,
      getAcceptedBuildBoardSnapshot: () => evidence.buildBoardSnapshot,
      getWorldTransform: () => evidence.routeContract.worldTransform,
      surfaceProvider: terrainSurface,
      pusher: options.pusher,
      settings: options.settings,
      preconditions: {
        ...(options.preconditions || {}),
        expectedPlanId: () => evidence.identity.planId,
        expectedDesignChecksum: () => evidence.identity.designChecksum
      },
      onStateChange(snapshot, reason) {
        userStateChange?.(snapshot, reason);
        checkTerminal();
      }
    });
    subsystemUnsubscribe = subsystem.service.subscribe(() => checkTerminal());
    verifyPreparedEvidence();
    options.onPrepared?.({ evidence, state: missionState(subsystem, evidence, true) });
    return Object.freeze({
      ok: true,
      evidence,
      state: missionState(subsystem, evidence, true),
      updateFrame: subsystem.updateFrame
    });
  }

  function ensurePrepared(input = {}) {
    const authorityKeys = [
      'frozenPlan', 'preparedBuild', 'buildBoard', 'buildBoardSnapshot',
      'normalisedBuild', 'targetSet', 'expectedPlacementIds', 'partRegistry',
      'requirePartRegistry', 'allowIdOnlySnapshot', 'routeValidation',
      'supportSettings', 'includeMergedFaces', 'terrain'
    ];
    const hasAuthorityInput = authorityKeys.some((key) => input[key] !== undefined);
    if (!subsystem || hasAuthorityInput) return prepare(input);
    return { ok: true, evidence, state: missionState(subsystem, evidence, true), updateFrame: subsystem.updateFrame };
  }

  function test(input = {}) {
    ensurePrepared(input);
    invariant(subsystem.service.getState() === TRAIN_STATES.READY, 'TRAIN_NOT_READY', 'TrainService must be READY before TEST.', {
      state: subsystem.service.getState()
    });
    const signal = input.signal ?? null;
    if (signal?.aborted) {
      return Promise.resolve(deepFreezePlain({
        ok: false,
        success: false,
        outcome: 'STOPPED',
        state: TRAIN_STATES.READY,
        error: makeAbortError(signal.reason).toJSON(),
        planId: evidence.identity.planId,
        buildBoardWorldRevision: evidence.identity.buildBoardWorldRevision
      }));
    }
    const promise = new Promise((resolve) => {
      const onAbort = () => {
        if (!pending) return;
        pending.cancelled = true;
        pending.cancelReason = signal.reason ?? 'abort_signal';
        subsystem.service.stopTest();
        checkTerminal();
      };
      pending = { resolve, signal, onAbort, cancelled: false, cancelReason: null, overrideResult: null };
      signal?.addEventListener?.('abort', onAbort, { once: true });
    });
    try {
      const started = subsystem.service.startTest();
      if (!started?.ok) {
        const error = new TrainIntegrationError('TRAIN_PRECONDITION_FAILED', 'Train TEST preconditions failed.', {
          reason: started?.reason ?? 'unknown',
          preconditions: started?.preconditions ?? started?.snapshot?.preconditions ?? null
        });
        settlePending(deepFreezePlain({ ok: false, error: error.toJSON(), state: subsystem.service.getState() }));
        return promise;
      }
      const liveCollision = subsystem.service.getCollisionSnapshot();
      if (liveCollision?.checksum !== evidence.collisionSnapshot.checksum) {
        const error = new TrainIntegrationError('TRAIN_COLLISION_REPLAY_MISMATCH', 'TrainService collision snapshot differs from prepared authority evidence.', {
          expected: evidence.collisionSnapshot.checksum,
          received: liveCollision?.checksum ?? null
        }, { recoverable: false });
        pending.overrideResult = deepFreezePlain({ ok: false, error: error.toJSON(), state: TRAIN_STATES.STOPPED });
        subsystem.service.stopTest();
      }
      checkTerminal();
      return promise;
    } catch (error) {
      const normalized = asTrainIntegrationError(error, 'TRAIN_START_FAILED');
      settlePending(deepFreezePlain({ ok: false, error: normalized.toJSON(), state: subsystem.service.getState() }));
      return promise;
    }
  }

  function updateFrame(deltaSeconds) {
    if (!subsystem || disposed) return { fixedSteps: 0, active: false, configured: Boolean(subsystem), disposed };
    const frame = subsystem.updateFrame(deltaSeconds);
    checkTerminal();
    return frame;
  }

  function runToTerminal(maxSeconds = 20) {
    invariant(subsystem, 'TRAIN_NOT_CONFIGURED', 'Prepare Train integration first.');
    const limit = Math.ceil(Math.max(0, Number(maxSeconds) || 0) / TRAIN_FIXED_DT_SECONDS);
    for (let index = 0; index < limit && !terminalState(subsystem.service.getState()); index += 1) {
      subsystem.service.step(TRAIN_FIXED_DT_SECONDS);
    }
    checkTerminal();
    return subsystem.service.getSnapshot();
  }

  function notifyPusherReady(pose = null, { startPush = true } = {}) {
    invariant(subsystem, 'TRAIN_NOT_CONFIGURED', 'Prepare Train integration first.');
    const snapshot = subsystem.service.notifyPusherReady(pose);
    if (startPush && subsystem.service.getState() === TRAIN_STATES.PUSH_READY) subsystem.service.pushEvent();
    return snapshot;
  }

  function reset({ instant = false, reason = 'mission_reset' } = {}) {
    invariant(subsystem, 'TRAIN_NOT_CONFIGURED', 'Prepare Train integration first.');
    if (pending) {
      pending.cancelled = true;
      pending.cancelReason = reason;
      subsystem.service.stopTest();
      checkTerminal();
    }
    const snapshot = subsystem.service.resetTrain({ instant });
    return deepFreezePlain({ ok: true, state: snapshot.state, snapshot });
  }

  function refresh(input = preparedInput || {}) {
    invariant(subsystem?.service?.getState() === TRAIN_STATES.READY, 'TRAIN_NOT_READY', 'Support can refresh only while TrainService is READY.');
    return prepare(input);
  }

  function dispose() {
    if (disposed) return { ok: true, disposed: true, idempotent: true };
    if (pending) {
      pending.cancelled = true;
      pending.cancelReason = 'disposed';
      subsystem?.service?.stopTest?.();
      checkTerminal();
    }
    clearSubsystem();
    evidence = null;
    preparedInput = null;
    disposed = true;
    return { ok: true, disposed: true, idempotent: false };
  }

  return Object.freeze({
    prepare,
    refresh,
    test,
    updateFrame,
    runToTerminal,
    notifyPusherReady,
    reset,
    getState: () => missionState(subsystem, evidence, Boolean(subsystem)),
    getDetailedSnapshot: () => subsystem?.service?.getSnapshot?.() ?? null,
    getEvidence: () => evidence,
    getSupportMap: () => subsystem?.service?.getSupportMap?.() ?? evidence?.supportMap ?? null,
    getCollisionSnapshot: () => subsystem?.service?.getCollisionSnapshot?.() ?? evidence?.collisionSnapshot ?? null,
    getTerrainDiagnostics: () => terrainSurface?.getDiagnostics?.() ?? null,
    getSubsystem: () => subsystem,
    dispose
  });
}

export function normalizeTrainIntegrationFailure(error) {
  return asTrainIntegrationError(error).toJSON();
}
