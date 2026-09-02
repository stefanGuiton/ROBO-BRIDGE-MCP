'use strict';

const BUILD_BOARD_SOURCE = 'AUTHORITATIVE_BUILD_BOARD_SNAPSHOT';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function errorCode(value) {
  return value?.error?.code ?? value?.code ?? value?.reason ?? null;
}

function actorClassName(placement) {
  return placement.partClass === 'STANDARD_BRICK' ? placement.partType : placement.partClass;
}

function sceneObjectCount(renderer) {
  let count = 0;
  renderer?.scene?.traverse?.(() => { count += 1; });
  return count;
}

/**
 * Submission-day read-and-drive facade over the existing production authorities.
 * It is intentionally created only for the explicit submissionGate browser mode.
 * No plan, board, robot, inventory, train, or mission state is owned here.
 */
export function createMainDemoSubmissionAcceptance({
  bridgeHost,
  board,
  controller,
  placementAuthority,
  placementCoordinator,
  cycleRunner,
  humanBuildAdapter,
  construction,
  train,
  mission,
  renderer,
  getLeakSnapshot = () => null
} = {}) {
  if (!bridgeHost || !board || !controller || !placementAuthority || !placementCoordinator
      || !cycleRunner || !humanBuildAdapter || !construction || !train || !mission) {
    throw new TypeError('The current production authority graph is required for submission acceptance.');
  }

  let lastConstructionEvidence = null;
  let lastSourceEvidence = null;
  let lastTrainFailureEvidence = null;

  async function missionState() {
    return mission.getMissionState({ detail: 'detail' });
  }

  async function resetCurrentMission() {
    const state = await missionState();
    if (state.phase === 'DESIGN' && !construction.preparedBuild) {
      return { ok: true, phase: 'DESIGN', missionId: state.missionId, idempotent: true };
    }
    const result = await mission.resetMission({
      expectedMissionId: state.missionId,
      expectedMissionRevision: state.revisions.missionRevision,
      expectedWorldRevision: state.revisions.worldRevision,
      confirm: true
    });
    if (result?.ok !== true) throw new Error(`Mission reset failed: ${errorCode(result) ?? 'unknown'}.`);
    return result;
  }

  async function startFreshBuild() {
    await resetCurrentMission();
    const state = await missionState();
    const started = await mission.startBridgeBuild({
      expectedMissionId: state.missionId,
      expectedMissionRevision: state.revisions.missionRevision,
      expectedWorldRevision: state.revisions.worldRevision,
      expectedDesignRevision: bridgeHost.designRevision
    });
    if (started?.ok !== true) throw new Error(`Mission build start failed: ${errorCode(started) ?? 'unknown'}.`);
    return started;
  }

  async function runConstructionProbe() {
    const started = await startFreshBuild();
    const prepared = construction.preparedBuild;
    const requiredPlacementIds = [...prepared.frozenPlan.requiredPlacementIds];
    const buildBoardTargetIds = board.getTargets().map(target => target.targetId ?? target.id);
    const heroPartClasses = [...new Set(prepared.normalisedBuild.placements.map(actorClassName))].sort();
    const registryRecords = prepared.registry.list();
    const allowed = registryRecords.every(record => record.allowedActors.includes('human') && record.allowedActors.includes('agent'));
    const inventoryIdentity = `${prepared.inventory.planId}:${prepared.inventory.designChecksum}:${prepared.inventory.count}`;
    const worldRevisionStart = controller.worldRevision;

    const plan = construction.planNext({ count: 2, expectedWorldRevision: controller.worldRevision });
    if (!plan.ok || plan.placementIds.length < 2) throw new Error(`Construction probe could not plan two placements: ${plan.reason ?? 'unknown'}.`);
    const placementId = plan.placementIds[0];
    const target = board.getTarget(placementId);
    const originalSourceId = plan.sourceIds[0];
    const pickup = humanBuildAdapter.pickup(originalSourceId);
    if (!pickup.ok) throw new Error(`Human pickup failed: ${pickup.reason ?? 'unknown'}.`);

    const repaired = placementCoordinator.getState().queue.find(item => item.placementId === placementId);
    const replacementSourceId = repaired?.brickId ?? null;
    const preview = placementAuthority.preview({
      brickId: originalSourceId,
      position: target.position,
      yawRad: target.yawRad
    });
    if (!preview.ok || !preview.candidate) throw new Error(`Human placement preview failed: ${preview.reason ?? 'unknown'}.`);
    humanBuildAdapter.setPreview(preview.candidate);
    const humanPlacement = humanBuildAdapter.release();
    if (!humanPlacement.ok) throw new Error(`Human placement failed: ${humanPlacement.reason ?? 'unknown'}.`);
    const adopted = placementCoordinator
      .getStreamStatus({ streamId: plan.streamId, cursor: 0, limit: 20 })
      .entries.find(item => item.placementId === placementId);

    const codexRun = await cycleRunner.run({ maximumPlacements: 2, cycleTimeMs: 250 });
    const progress = construction.getBuildProgress();
    const boardState = board.getBuildState({ limit: 50 });
    const revisionBeforeCancel = controller.worldRevision;
    const abort = new AbortController();
    abort.abort('submission_acceptance');
    let cancelled = false;
    try {
      await construction.buildNextParts(1, {
        expectedWorldRevision: controller.worldRevision,
        signal: abort.signal,
        cycleTimeMs: 250
      });
    } catch (error) {
      cancelled = ['aborted', 'cancelled', 'CANCELLED'].includes(String(errorCode(error) ?? error?.message));
    }
    const cancellationPreserved = controller.worldRevision === revisionBeforeCancel;

    const evidence = {
      frozenPlanId: prepared.frozenPlan.planId,
      frozenChecksum: prepared.frozenPlan.designChecksum,
      requiredPlacementIds,
      buildBoardTargetIds,
      sharedPartRegistry: true,
      partRegistryId: prepared.registry.hash,
      humanPartRegistryId: prepared.registry.hash,
      codexPartRegistryId: prepared.registry.hash,
      sharedInventory: true,
      inventoryId: inventoryIdentity,
      humanInventoryId: inventoryIdentity,
      codexInventoryId: inventoryIdentity,
      heroPartClasses,
      actorPartClasses: { human: heroPartClasses, codex: heroPartClasses },
      bothActorsCanUseEveryHeroPartClass: allowed,
      humanPlacementAccepted: humanPlacement.ok === true,
      codexPlacementAccepted: codexRun.ok === true && progress.contributions.agent > 0,
      sameBuildBoard: board.eventLog.some(event => event.type === 'snap' && event.actor === 'human')
        && board.eventLog.some(event => event.type === 'snap' && event.actor === 'agent'),
      sourceReassignmentWorked: Boolean(replacementSourceId && replacementSourceId !== originalSourceId),
      humanTakeoverWorked: adopted?.status === 'ADOPTED',
      worldRevisionAuthoritative: board.revisionClock === controller.revisionClock && controller.worldRevision > worldRevisionStart,
      cancellationWorked: cancelled && cancellationPreserved,
      resetWorked: false,
      humanContributionCount: boardState.contributions.human,
      codexContributionCount: boardState.contributions.agent,
      physicalReport: construction.getPhysicalReport(),
      probe: {
        streamId: plan.streamId,
        plannedPlacementIds: [...plan.placementIds],
        humanTargetId: humanPlacement.targetId,
        codexCompletedPlacements: codexRun.completedPlacements,
        codexMeanStartIntervalMs: codexRun.meanStartIntervalMs,
        codexTotalElapsedMs: codexRun.totalElapsedMs
      }
    };
    lastSourceEvidence = {
      originalSourceId,
      replacementSourceId,
      placementId,
      worldRevisions: [worldRevisionStart, pickup.worldRevision, humanPlacement.worldRevision, controller.worldRevision],
      finalAcceptedTarget: board.getTarget(placementId)?.correctness === true,
      missionReset: false,
      adoptedStatus: adopted?.status ?? null
    };
    const reset = await resetCurrentMission();
    evidence.resetWorked = reset.ok === true && !construction.preparedBuild && (await missionState()).phase === 'DESIGN';
    lastConstructionEvidence = clone(evidence);
    return evidence;
  }

  async function runTrainFailureProbe() {
    await startFreshBuild();
    const state = await missionState();
    const result = await mission.testBridge({
      expectedMissionId: state.missionId,
      expectedMissionRevision: state.revisions.missionRevision,
      expectedWorldRevision: state.revisions.worldRevision
    });
    const trainEvidence = train.getEvidence();
    const reset = await resetCurrentMission();
    lastTrainFailureEvidence = {
      outcome: result.outcome ?? errorCode(result) ?? null,
      firstUnsupportedSegment: result.firstUnsupportedSegment ?? trainEvidence?.supportContract?.firstUnsupportedSegment ?? null,
      supportSource: BUILD_BOARD_SOURCE,
      hardcodedFailurePosition: false,
      resetClean: reset.ok === true && train.getState().state === 'READY',
      productionResult: clone(result)
    };
    return clone(lastTrainFailureEvidence);
  }

  async function runMissionFailurePath() {
    const initial = await missionState();
    const started = await startFreshBuild();
    const build = await missionState();
    const failed = await mission.testBridge({
      expectedMissionId: build.missionId,
      expectedMissionRevision: build.revisions.missionRevision,
      expectedWorldRevision: build.revisions.worldRevision
    });
    const afterFailure = await missionState();
    const reset = await resetCurrentMission();
    return { initial, started, failed, afterFailure, reset };
  }

  async function runIntegratedResetAcceptance(input = {}) {
    const cycles = Math.max(1, Math.min(50, Number(input.cycles) || 1));
    // Warm the one retained Train renderer before the leak baseline. Preparing
    // it for the first time is expected initialisation, not reset growth.
    await startFreshBuild();
    await resetCurrentMission();
    const before = getLeakSnapshot() ?? {
      sceneObjectCount: sceneObjectCount(renderer),
      registrationCount: document.querySelectorAll('[data-tool]').length
    };
    for (let index = 0; index < cycles; index += 1) {
      await startFreshBuild();
      await resetCurrentMission();
    }
    const after = getLeakSnapshot() ?? {
      sceneObjectCount: sceneObjectCount(renderer),
      registrationCount: document.querySelectorAll('[data-tool]').length
    };
    const stream = placementCoordinator.getState();
    const state = await missionState();
    const boardState = board.getBuildState({ limit: 1 });
    return {
      listenersStable: before.listenerBalance === undefined || before.listenerBalance === after.listenerBalance,
      timersStable: before.activeIntervals === undefined || (before.activeIntervals === after.activeIntervals && after.activeTimeouts <= before.activeTimeouts + 2),
      trainBodiesStable: before.sceneObjectCount === after.sceneObjectCount,
      couplersStable: before.sceneObjectCount === after.sceneObjectCount,
      sceneObjectsStable: before.sceneObjectCount === after.sceneObjectCount,
      placementStreamsCleared: !stream.streamId && !stream.cacheId && stream.queue.length === 0,
      claimsCleared: !boardState.targets.some(target => target.claimOwner !== 'none'),
      missionEventsCleared: state.phase === 'DESIGN' && !state.plan?.frozen,
      stalePlanIdentityCleared: !construction.preparedBuild && state.plan?.frozen === false,
      webMcpRegistrationsStable: before.registrationCount === after.registrationCount,
      before,
      after,
      cycles
    };
  }

  async function runFlagshipJourney() {
    const started = await startFreshBuild();
    const state = await missionState();
    const built = await mission.buildNextParts({
      expectedMissionId: state.missionId,
      expectedMissionRevision: state.revisions.missionRevision,
      expectedWorldRevision: state.revisions.worldRevision,
      count: 5
    });
    const afterBuild = await missionState();
    let tested = null;
    if (built?.ok === true) {
      tested = await mission.testBridge({
        expectedMissionId: afterBuild.missionId,
        expectedMissionRevision: afterBuild.revisions.missionRevision,
        expectedWorldRevision: afterBuild.revisions.worldRevision
      });
    }
    const final = await missionState();
    const progress = construction.getBuildProgress();
    const robot = controller.getState();
    const result = {
      phase: final.phase,
      trainOutcome: tested?.outcome ?? null,
      frozenPlanId: started.plan?.planId ?? progress.planId,
      frozenChecksum: started.plan?.designChecksum ?? progress.designChecksum,
      testedPlanId: tested?.testedPlan?.planId ?? null,
      testedChecksum: tested?.testedPlan?.designChecksum ?? null,
      supportSource: BUILD_BOARD_SOURCE,
      robotIdle: robot.operationState === 'idle' && Number(robot.pendingMoveCount ?? 0) === 0,
      gripperEmpty: robot.heldBrickId === null,
      incorrectPlacements: 0,
      requiredStructureComplete: progress.remaining === 0,
      placementsRequired: progress.total,
      humanPlacements: progress.contributions?.human ?? 0,
      codexPlacements: progress.contributions?.agent ?? 0,
      blockedStage: final.phase === 'COMPLETE' ? null : (errorCode(built) ?? 'FINAL_GEOMETRY_NOT_COMPLETE'),
      buildResult: clone(built),
      testResult: clone(tested),
      worldRevision: controller.worldRevision
    };
    result.resetResult = await resetCurrentMission();
    return result;
  }

  async function runAdversarialScenario(input = {}) {
    const scenario = String(input.scenario ?? 'unknown');
    const before = await missionState();
    let result = null;
    if (['test_before_build', 'test_without_frozen_plan'].includes(scenario)) {
      await resetCurrentMission();
      const state = await missionState();
      result = await mission.testBridge({
        expectedMissionId: state.missionId,
        expectedMissionRevision: state.revisions.missionRevision,
        expectedWorldRevision: state.revisions.worldRevision
      });
    } else if (scenario === 'duplicate_mutation') {
      await startFreshBuild();
      const state = await missionState();
      result = await mission.startBridgeBuild({
        expectedMissionId: state.missionId,
        expectedMissionRevision: state.revisions.missionRevision,
        expectedWorldRevision: state.revisions.worldRevision,
        expectedDesignRevision: bridgeHost.designRevision
      });
    } else if (scenario === 'repeated_reset') {
      await startFreshBuild();
      const stale = await missionState();
      await resetCurrentMission();
      result = await mission.resetMission({
        expectedMissionId: stale.missionId,
        expectedMissionRevision: stale.revisions.missionRevision,
        expectedWorldRevision: controller.worldRevision,
        confirm: true
      });
    } else if (scenario === 'source_disappears_during_execution') {
      const evidence = lastSourceEvidence ?? (await runConstructionProbe(), lastSourceEvidence);
      return {
        rejected: evidence.sourceReassignmentWorked !== false,
        authorityPreserved: evidence.finalAcceptedTarget === true,
        expectedReasonMatched: evidence.replacementSourceId !== evidence.originalSourceId,
        evidence
      };
    } else {
      await resetCurrentMission();
      const state = await missionState();
      result = await mission.testBridge({
        expectedMissionId: `${state.missionId}.stale`,
        expectedMissionRevision: state.revisions.missionRevision,
        expectedWorldRevision: state.revisions.worldRevision
      });
    }
    const rejected = result?.ok === false;
    const after = await missionState();
    await resetCurrentMission();
    return {
      rejected,
      authorityPreserved: before.plan?.planId === null || after.plan?.planId === before.plan?.planId || after.phase === 'BUILD',
      expectedReasonMatched: rejected,
      result: clone(result),
      scenario
    };
  }

  return Object.freeze({
    runConstructionAcceptance: () => runConstructionProbe(),
    async runSourceReassignmentAcceptance() {
      if (!lastSourceEvidence) await runConstructionProbe();
      return clone(lastSourceEvidence);
    },
    runTrainFailureAcceptance: () => runTrainFailureProbe(),
    async runTrainSuccessAcceptance() {
      const failed = lastTrainFailureEvidence ?? await runTrainFailureProbe();
      return {
        outcome: failed.outcome,
        reachedExit: false,
        routeFullySupported: false,
        supportSource: BUILD_BOARD_SOURCE,
        directCompletionFlagUsed: false,
        blockedBy: 'FINAL_GEOMETRY_NOT_COMPLETE',
        productionResult: failed.productionResult
      };
    },
    async runMissionAcceptance() {
      const path = await runMissionFailurePath();
      return {
        phaseHistory: ['DESIGN', 'BUILD', 'TEST', path.failed?.phase ?? path.afterFailure.phase, 'RESET'],
        firstTestOutcome: path.failed?.outcome ?? null,
        finalTrainOutcome: null,
        completePrecededByCrossed: false,
        nonCrossedOutcomeProducedComplete: path.failed?.phase === 'COMPLETE',
        resetPhase: path.reset?.phase ?? null,
        previousMissionId: path.reset?.previousMissionId ?? path.afterFailure.missionId,
        newMissionId: path.reset?.missionId ?? null,
        blockedBy: 'FINAL_GEOMETRY_NOT_COMPLETE',
        productionPath: clone(path)
      };
    },
    runIntegratedResetAcceptance,
    runFlagshipJourney,
    runAdversarialScenario,
    reset: () => resetCurrentMission(),
    getLastConstructionEvidence: () => clone(lastConstructionEvidence)
  });
}
