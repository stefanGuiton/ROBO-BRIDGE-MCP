'use strict';

import { MissionError, assertNotAborted, cloneValue, toMissionError } from '../errors.js';
import {
  assertIdentityMatch,
  compactRegistryIdentity,
  fingerprint,
  nonNegativeInteger,
  normalizeFrozenIdentity,
  sameIdSet,
  sameStructuredValue,
  stateFromRobot
} from './shared.js';

const BUILD_BOARD_SOURCE = 'BUILD_BOARD';

function acceptedRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.accepted === true) return true;
  if (record.occupiedBy && record.correctness !== false) return true;
  if (record.correctness === true && (record.placedBrickId || record.occupiedBy)) return true;
  return ['correct', 'accepted'].includes(String(record.status ?? record.state ?? '').toLowerCase());
}

function genericBoardSnapshot(source = {}) {
  const state = typeof source?.getState === 'function' ? source.getState() : source;
  const targets = typeof source?.getTargets === 'function'
    ? source.getTargets()
    : cloneValue(state?.targets ?? state?.buildState?.targets ?? []);
  const placements = typeof source?.getPlacements === 'function'
    ? source.getPlacements()
    : cloneValue(state?.freePlacements ?? state?.placements ?? []);
  const ids = new Set(
    source?.acceptedPlacementIds instanceof Set
      ? [...source.acceptedPlacementIds].map(String)
      : Array.isArray(source?.acceptedPlacementIds) ? source.acceptedPlacementIds.map(String) : []
  );
  for (const item of targets ?? []) {
    if (!acceptedRecord(item)) continue;
    const id = item.placementId ?? item.targetId ?? item.id;
    if (id) ids.add(String(id));
  }
  for (const item of placements ?? []) {
    if (item?.accepted === false) continue;
    const id = item?.placementId ?? item?.targetId ?? item?.id;
    if (id) ids.add(String(id));
  }
  const acceptedPlacementIds = [...ids].sort();
  return {
    schemaVersion: 'robo-bridge.accepted-buildboard-snapshot.v1',
    blueprintId: source?.blueprintId ?? state?.blueprintId ?? state?.buildState?.blueprintId ?? null,
    designChecksum: source?.designChecksum ?? state?.designChecksum ?? state?.buildState?.designChecksum ?? null,
    worldRevision: source?.worldRevision ?? state?.worldRevision ?? state?.buildState?.worldRevision ?? null,
    acceptedPlacementIds,
    acceptedChecksum: fingerprint(acceptedPlacementIds, ''),
    targetCount: Array.isArray(targets) ? targets.length : 0
  };
}

function requireSession(value) {
  const session = value?.session ?? value;
  const required = ['startBuild', 'getBuildProgress', 'buildNextParts', 'cancelBuild', 'reset'];
  const missing = required.filter((name) => typeof session?.[name] !== 'function');
  if (missing.length) {
    throw new MissionError('SERVICE_UNAVAILABLE', 'The production Construction session is incomplete.', { missing });
  }
  return session;
}

function sessionFrozen(session) {
  const frozen = session?.preparedBuild?.frozenPlan;
  if (!frozen || typeof frozen !== 'object') {
    throw new MissionError('START_BUILD_FAILED', 'The Construction session has no frozen plan identity.');
  }
  return frozen;
}

function sessionRegistry(session) {
  return compactRegistryIdentity(session?.preparedBuild?.registry ?? {
    revision: sessionFrozen(session).partRegistryRevision,
    hash: sessionFrozen(session).partRegistryHash
  });
}

function finalBinding(requestIdentity, session) {
  const requested = normalizeFrozenIdentity(requestIdentity);
  const frozen = sessionFrozen(session);
  const registry = sessionRegistry(session);
  const requiredPlacementIds = frozen.requiredPlacementIds;
  if (!Array.isArray(requiredPlacementIds) || !requiredPlacementIds.length) {
    throw new MissionError('START_BUILD_FAILED', 'Construction did not supply requiredPlacementIds.');
  }
  return Object.freeze({
    ...cloneValue(requested),
    challengeId: requested.challengeId,
    designRevision: frozen.designRevision,
    planId: frozen.planId,
    designChecksum: frozen.designChecksum,
    worldTransform: cloneValue(frozen.worldTransform),
    requiredPlacementIds: [...requiredPlacementIds],
    partRegistryRevision: registry?.revision ?? frozen.partRegistryRevision ?? null,
    partRegistryHash: registry?.hash ?? frozen.partRegistryHash ?? null,
    partRegistryIdentity: cloneValue(registry?.identity ?? registry ?? null)
  });
}

/**
 * Map the real bridge construction session to the MissionService contract.
 * The real BuildBoard remains the only progress and acceptance authority.
 */
export function createConstructionServiceAdapter({
  session = null,
  createSession = null,
  getAcceptedBuildBoardSnapshot,
  normalizeAcceptedBuildBoardSnapshot = null,
  runtime = null,
  robotController = null,
  resetWorkcell = null,
  disposeSessionOnReset = false
} = {}) {
  if (!session && typeof createSession !== 'function') {
    throw new MissionError('SERVICE_UNAVAILABLE', 'A Construction session or createSession callback is required.');
  }
  if (typeof getAcceptedBuildBoardSnapshot !== 'function') {
    throw new MissionError('SERVICE_UNAVAILABLE', 'getAcceptedBuildBoardSnapshot is required.');
  }

  let activeSession = session ? requireSession(session) : null;
  let binding = null;

  const currentWorldRevision = () => {
    const value = typeof runtime?.getWorldRevision === 'function'
      ? runtime.getWorldRevision()
      : activeSession?.getBuildProgress?.().worldRevision;
    return nonNegativeInteger(value, 'worldRevision');
  };

  const assertBound = (identity, context) => {
    if (!binding) throw new MissionError('BUILD_NOT_STARTED', 'The bridge build has not started.');
    assertIdentityMatch(binding, identity, { context });
    return binding;
  };

  const readAcceptedSnapshot = async (rawProgress) => {
    const source = await getAcceptedBuildBoardSnapshot();
    const normalised = typeof normalizeAcceptedBuildBoardSnapshot === 'function'
      ? normalizeAcceptedBuildBoardSnapshot(source)
      : genericBoardSnapshot(source);
    if (!normalised || typeof normalised !== 'object' || !Array.isArray(normalised.acceptedPlacementIds)) {
      throw new MissionError('INVALID_SUPPORT_SNAPSHOT', 'The BuildBoard snapshot is invalid.');
    }
    const acceptedPlacementIds = normalised.acceptedPlacementIds.map(String).sort();
    if (new Set(acceptedPlacementIds).size !== acceptedPlacementIds.length) {
      throw new MissionError('INVALID_SUPPORT_SNAPSHOT', 'The BuildBoard snapshot contains duplicate placement IDs.');
    }
    const foreign = acceptedPlacementIds.find((id) => !binding.requiredPlacementIds.includes(id));
    if (foreign) throw new MissionError('STALE_PLAN', 'BuildBoard contains an accepted placement outside the frozen plan.');
    if (acceptedPlacementIds.length !== rawProgress.completed) {
      throw new MissionError('CONSTRUCTION_ERROR', 'BuildBoard accepted IDs do not match Construction progress.');
    }
    if (normalised.blueprintId && normalised.blueprintId !== binding.planId) {
      throw new MissionError('STALE_PLAN', 'BuildBoard blueprintId does not match the frozen plan.');
    }
    if (normalised.designChecksum && normalised.designChecksum !== binding.designChecksum) {
      throw new MissionError('STALE_PLAN', 'BuildBoard design checksum does not match the frozen plan.');
    }
    const worldRevision = nonNegativeInteger(normalised.worldRevision ?? rawProgress.worldRevision, 'worldRevision');
    if (worldRevision !== rawProgress.worldRevision || worldRevision !== currentWorldRevision()) {
      throw new MissionError('STALE_WORLD_REVISION', 'BuildBoard and Construction progress use different world revisions.');
    }
    const acceptedChecksum = normalised.acceptedChecksum ?? fingerprint(acceptedPlacementIds, '');
    const checksum = fingerprint({
      missionId: binding.missionId,
      planId: binding.planId,
      designChecksum: binding.designChecksum,
      worldRevision,
      acceptedPlacementIds,
      acceptedChecksum
    }, 'board_');
    return Object.freeze({
      ...cloneValue(normalised),
      schemaVersion: 'robo-bridge.mission-buildboard-snapshot.v1',
      supportSource: BUILD_BOARD_SOURCE,
      snapshotId: `buildboard.${binding.planId}.${worldRevision}.${acceptedPlacementIds.length}`,
      checksum,
      acceptedChecksum,
      blueprintId: binding.planId,
      designChecksum: binding.designChecksum,
      worldRevision,
      acceptedPlacementIds,
      identity: cloneValue(binding)
    });
  };

  const normaliseProgress = async (raw) => {
    if (!raw || typeof raw !== 'object') throw new MissionError('CONSTRUCTION_ERROR', 'Construction returned no progress.');
    if (raw.planId !== binding.planId || raw.designChecksum !== binding.designChecksum) {
      throw new MissionError('STALE_PLAN', 'Construction progress belongs to another frozen plan.');
    }
    const required = nonNegativeInteger(raw.total, 'Construction progress total');
    const accepted = nonNegativeInteger(raw.completed, 'Construction progress completed');
    const remaining = nonNegativeInteger(raw.remaining, 'Construction progress remaining');
    if (required !== binding.requiredPlacementIds.length || accepted + remaining !== required || accepted > required) {
      throw new MissionError('CONSTRUCTION_ERROR', 'Construction progress counts are inconsistent.');
    }
    const worldRevision = nonNegativeInteger(raw.worldRevision, 'Construction progress worldRevision');
    const acceptedSnapshot = await readAcceptedSnapshot(raw);
    const robot = stateFromRobot(robotController?.getState?.() ?? {});
    return Object.freeze({
      ok: true,
      identity: cloneValue(binding),
      missionId: binding.missionId,
      planId: binding.planId,
      designChecksum: binding.designChecksum,
      designRevision: binding.designRevision,
      challengeId: binding.challengeId,
      required,
      accepted,
      remaining,
      correct: accepted,
      incorrect: 0,
      human: nonNegativeInteger(raw.contributions?.human ?? 0, 'human contribution'),
      codex: nonNegativeInteger(raw.contributions?.agent ?? 0, 'agent contribution'),
      blocked: 0,
      waitingSource: 0,
      robotStatus: robot.state,
      worldRevision,
      supportSource: BUILD_BOARD_SOURCE,
      acceptedSnapshot,
      sourceProgress: cloneValue(raw)
    });
  };

  return Object.freeze({
    async startBuild({ identity, buildPlan, worldTransform, expectedWorldRevision, signal } = {}) {
      try {
        assertNotAborted(signal);
        const requested = normalizeFrozenIdentity(identity);
        if (expectedWorldRevision !== currentWorldRevision()) {
          throw new MissionError('STALE_WORLD_REVISION', 'The world revision is stale.');
        }
        if (!buildPlan || buildPlan.schemaVersion !== '4.6') {
          throw new MissionError('START_BUILD_FAILED', 'A V4.6 BuildPlan is required.');
        }
        if (buildPlan.planId !== requested.planId
          || buildPlan.designChecksum !== requested.designChecksum
          || buildPlan.designRevision !== requested.designRevision) {
          throw new MissionError('STALE_PLAN', 'The requested BuildPlan identity is stale.');
        }
        if (!activeSession) {
          activeSession = requireSession(await createSession({
            identity: cloneValue(requested),
            buildPlan: cloneValue(buildPlan),
            worldTransform: cloneValue(worldTransform),
            signal
          }));
        }
        let started = null;
        if (!activeSession.preparedBuild) {
          started = await activeSession.startBuild({
            planId: requested.planId,
            designChecksum: requested.designChecksum,
            designRevision: requested.designRevision,
            expectedWorldRevision,
            signal
          });
        }
        const frozen = sessionFrozen(activeSession);
        if (frozen.planId !== requested.planId
          || frozen.designChecksum !== requested.designChecksum
          || frozen.designRevision !== requested.designRevision) {
          throw new MissionError('STALE_PLAN', 'The Construction session was prepared for another plan.');
        }
        if (worldTransform && (!frozen.worldTransform || !sameStructuredValue(frozen.worldTransform, worldTransform))) {
          throw new MissionError('STALE_PLAN', 'The Construction session worldTransform does not match the bridge plan.');
        }
        binding = finalBinding(requested, activeSession);
        if (!started) {
          started = await activeSession.startBuild({
            planId: binding.planId,
            designChecksum: binding.designChecksum,
            designRevision: binding.designRevision,
            partRegistryHash: binding.partRegistryHash ?? undefined,
            expectedWorldRevision,
            signal
          });
        }
        assertNotAborted(signal);
        const progress = await normaliseProgress(started?.progress ?? activeSession.getBuildProgress());
        return {
          ok: true,
          identity: cloneValue(binding),
          missionId: binding.missionId,
          challengeId: binding.challengeId,
          planId: binding.planId,
          designChecksum: binding.designChecksum,
          designRevision: binding.designRevision,
          worldTransform: cloneValue(binding.worldTransform),
          requiredPlacementIds: [...binding.requiredPlacementIds],
          partRegistryRevision: binding.partRegistryRevision,
          partRegistryHash: binding.partRegistryHash,
          partRegistryIdentity: cloneValue(binding.partRegistryIdentity),
          actorSplit: null,
          worldRevision: progress.worldRevision,
          progress
        };
      } catch (error) {
        binding = null;
        throw toMissionError(error, 'START_BUILD_FAILED', 'Construction could not start the build.');
      }
    },

    async getProgress({ identity } = {}) {
      try {
        assertBound(identity, 'Construction progress identity');
        return await normaliseProgress(activeSession.getBuildProgress());
      } catch (error) {
        throw toMissionError(error, 'CONSTRUCTION_ERROR', 'Construction could not read progress.');
      }
    },

    async buildNextParts({ identity, count = 1, expectedWorldRevision, signal } = {}, options = {}) {
      try {
        assertBound(identity, 'Construction execution identity');
        assertNotAborted(signal ?? options.signal);
        if (!Number.isSafeInteger(count) || count < 1 || count > 5) {
          throw new MissionError('INVALID_PARAMETER', 'count must be from 1 to 5.');
        }
        if (expectedWorldRevision !== currentWorldRevision()) {
          throw new MissionError('STALE_WORLD_REVISION', 'The world revision is stale.');
        }
        const raw = await activeSession.buildNextParts(count, {
          ...options,
          expectedWorldRevision,
          signal: signal ?? options.signal
        });
        assertNotAborted(signal ?? options.signal);
        if (raw?.ok === false && raw.reason !== 'build_complete') {
          if (raw.reason === 'cancelled') throw new MissionError('CANCELLED', 'Construction was cancelled.');
          throw new MissionError('CONSTRUCTION_ERROR', raw.message ?? `Construction stopped: ${raw.reason ?? 'unknown error'}.`);
        }
        const completed = raw?.reason === 'build_complete'
          ? 0
          : nonNegativeInteger(raw?.completedPlacements ?? raw?.completedCount ?? raw?.completed ?? 0, 'completed');
        if (completed > count) throw new MissionError('CONSTRUCTION_ERROR', 'Construction completed more parts than requested.');
        const progress = await normaliseProgress(raw?.progress ?? activeSession.getBuildProgress());
        const resultList = Array.isArray(raw?.results) ? raw.results : [];
        const last = resultList.at(-1) ?? raw?.lastPlacement ?? null;
        const lastPlacement = last ? {
          placementId: last.placementId ?? last.targetId ?? null,
          actor: last.actor ?? last.completedBy ?? 'codex',
          status: last.status ?? (last.ok === false ? 'failed' : 'accepted'),
          sourceReassigned: Boolean(last.sourceReassigned)
        } : null;
        return {
          ok: true,
          identity: cloneValue(binding),
          missionId: binding.missionId,
          planId: binding.planId,
          designChecksum: binding.designChecksum,
          requested: count,
          completed,
          lastPlacement,
          worldRevision: progress.worldRevision,
          progress,
          execution: cloneValue(raw)
        };
      } catch (error) {
        throw toMissionError(error, 'CONSTRUCTION_ERROR', 'Construction could not build the requested parts.');
      }
    },

    async cancel({ reason = 'mission_cancelled', identity = null } = {}) {
      try {
        if (!activeSession) return { ok: true, cancelled: false, reason: 'no_active_construction' };
        if (identity && binding) assertIdentityMatch(binding, identity, { context: 'Construction cancellation identity' });
        const result = await activeSession.cancelBuild(String(reason || 'mission_cancelled'));
        return { ok: result?.ok !== false, cancelled: true, result: cloneValue(result) };
      } catch (error) {
        throw toMissionError(error, 'CONSTRUCTION_ERROR', 'Construction cancellation failed.');
      }
    },

    async reset({ identity = null, expectedWorldRevision = null, signal } = {}) {
      try {
        assertNotAborted(signal);
        if (binding && identity) assertIdentityMatch(binding, identity, { context: 'Construction reset identity' });
        if (expectedWorldRevision !== null && expectedWorldRevision !== currentWorldRevision()) {
          throw new MissionError('STALE_WORLD_REVISION', 'The world revision is stale.');
        }
        const sessionResult = activeSession ? await activeSession.reset({ resetSources: true, expectedWorldRevision }) : { ok: true, skipped: true };
        if (sessionResult?.ok === false) throw new MissionError('RESET_FAILED', 'Construction session reset failed.');
        const workcellResult = typeof resetWorkcell === 'function'
          ? await resetWorkcell({ identity: cloneValue(binding), signal })
          : null;
        if (workcellResult?.ok === false) throw new MissionError('RESET_FAILED', 'The authorised workcell reset failed.');
        if (disposeSessionOnReset && activeSession?.dispose) {
          await activeSession.dispose();
          activeSession = null;
        }
        binding = null;
        assertNotAborted(signal);
        return {
          ok: true,
          worldRevision: currentWorldRevision(),
          session: cloneValue(sessionResult),
          workcell: cloneValue(workcellResult)
        };
      } catch (error) {
        throw toMissionError(error, 'RESET_FAILED', 'Construction reset failed.');
      }
    },

    getBinding() { return cloneValue(binding); },
    getProductionSession() { return activeSession; }
  });
}
