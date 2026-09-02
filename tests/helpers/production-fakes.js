'use strict';

import { fingerprint } from '../../apps/web/src/mission/adapters/shared.js';

const clone = (value) => structuredClone(value);

export function createProductionHarness({ requiredCount = 3 } = {}) {
  let worldRevision = 10;
  let planNumber = 1;
  let outcome = 'TRAIN_FELL';
  let missionSequence = 0;
  const worldTransform = Object.freeze({
    id: 'live-transform',
    sourceFrame: 'bridge-local-mm',
    targetFrame: 'main-demo-machine-mm',
    translationMm: { xMm: 500, yMm: 0, zMm: 120 },
    yawRad: 0,
    scale: 1
  });
  const requiredPlacementIds = Array.from({ length: requiredCount }, (_, index) => `plan-${planNumber}.p.${index + 1}`);
  const plan = {
    schemaVersion: '4.6',
    planId: `plan-${planNumber}`,
    designChecksum: `checksum-${planNumber}`,
    designRevision: 1,
    billOfMaterials: { totalPhysicalParts: requiredCount },
    geometry: { family: 'aqueduct' },
    catalogue: { customDefinitions: [] }
  };
  const bridgeSpec = { family: 'AQUEDUCT', span: 300 };

  const robotState = { operationState: 'idle', moving: false, heldBrickId: null };
  const robotController = {
    getState() { return { ...robotState, worldRevision }; }
  };
  const runtime = {
    robot: robotController,
    getWorldRevision() { return worldRevision; }
  };

  const presetData = {
    EASY: {
      schemaVersion: 'robo-bridge.challenge.v1',
      presetId: 'EASY',
      familyHint: 'AQUEDUCT',
      entry: { position: { x: 0, y: 0, z: 0 } },
      exit: { position: { x: 300, y: 0, z: 0 } },
      trackRoute: { start: { x: 0, y: 0, z: 0 }, end: { x: 300, y: 0, z: 0 } },
      bridgeTransform: clone(worldTransform),
      bridgeChallengeInput: { id: 'terrain-easy', entry: { x: 0, y: 0 }, exit: { x: 300, y: 0 }, worldTransform: clone(worldTransform) },
      collisionProxy: { id: 'easy-proxy' }
    },
    HARD_CUSTOM: {
      schemaVersion: 'robo-bridge.challenge.v1',
      presetId: 'HARD_CUSTOM',
      familyHint: 'VIADUCT',
      entry: { position: { x: 4, y: 2, z: 0 } },
      exit: { position: { x: 330, y: 12, z: 0 } },
      trackRoute: { start: { x: 4, y: 2, z: 0 }, end: { x: 330, y: 12, z: 0 } },
      bridgeTransform: { ...clone(worldTransform), translationMm: { xMm: 480, yMm: 15, zMm: 130 } },
      bridgeChallengeInput: { id: 'terrain-hard-custom', entry: { x: 0, y: 0 }, exit: { x: 326, y: 10 } },
      collisionProxy: { id: 'hard-proxy' }
    }
  };
  let activePreset = 'EASY';
  const challengeCalls = { setPreset: 0 };
  const challengeService = {
    getState() { return clone(presetData[activePreset]); },
    setPreset(id) {
      if (!presetData[id]) throw new Error(`unknown_preset:${id}`);
      activePreset = id;
      challengeCalls.setPreset += 1;
      return this.getState();
    },
    getEntry() { return clone(presetData[activePreset].entry); },
    getExit() { return clone(presetData[activePreset].exit); },
    getTrackRoute() { return clone(presetData[activePreset].trackRoute); },
    getBridgeTransform() { return clone(presetData[activePreset].bridgeTransform); },
    getBridgeChallengeInput() { return clone(presetData[activePreset].bridgeChallengeInput); },
    reset() { activePreset = 'EASY'; return this.getState(); }
  };

  const bridgeHost = {
    ready: true,
    settings: clone(bridgeSpec),
    buildPlan: plan,
    worldTransform: clone(worldTransform),
    getCompileState() {
      return { ready: true, mutationActive: false, designRevision: plan.designRevision, planId: plan.planId, designChecksum: plan.designChecksum };
    },
    exportPlan() { return clone(plan); }
  };
  const bridgeDesignService = {
    getDesignState() {
      return { ok: true, family: bridgeSpec.family, bridgeSpec: clone(bridgeSpec), designRevision: plan.designRevision, planId: plan.planId, designChecksum: plan.designChecksum };
    }
  };
  const bridgeToolNames = [
    'get_bridge_design',
    'get_bridge_capabilities',
    'update_bridge_design',
    'get_bridge_build_plan',
    'reset_bridge_design'
  ];
  const bridgeTools = bridgeToolNames.map((name) => ({
    name,
    description: name,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: name.startsWith('get_'), untrustedContentHint: false },
    async execute() { return bridgeDesignService.getDesignState(); }
  }));

  const targets = requiredPlacementIds.map((placementId) => ({ targetId: placementId, placementId, occupiedBy: null, correctness: null, completedBy: null }));
  const board = {
    blueprintId: plan.planId,
    designChecksum: plan.designChecksum,
    get worldRevision() { return worldRevision; },
    getTargets() { return clone(targets); },
    reset() {
      for (const target of targets) Object.assign(target, { occupiedBy: null, correctness: null, completedBy: null });
      worldRevision += 1;
      return { ok: true, worldRevision };
    }
  };
  const accept = (index, actor = 'agent') => {
    const target = targets[index];
    if (!target || target.occupiedBy) return false;
    target.occupiedBy = `source-${index + 1}`;
    target.correctness = true;
    target.completedBy = actor;
    worldRevision += 1;
    return true;
  };
  const boardSnapshot = () => board;
  const canonicalBoardSnapshot = (source = board) => {
    const acceptedPlacementIds = source.getTargets().filter((target) => target.occupiedBy && target.correctness !== false).map((target) => target.placementId).sort();
    return {
      schemaVersion: 'robo-bridge.accepted-buildboard-snapshot.v1',
      blueprintId: source.blueprintId,
      designChecksum: source.designChecksum,
      worldRevision: source.worldRevision,
      acceptedPlacementIds,
      acceptedChecksum: fingerprint(acceptedPlacementIds, ''),
      targetCount: requiredCount,
      freePlacementCount: 0
    };
  };

  const constructionCalls = { startBuild: 0, getBuildProgress: 0, buildNextParts: 0, cancelBuild: 0, reset: 0, lastCount: null };
  let started = false;
  const getBuildProgress = () => {
    constructionCalls.getBuildProgress += 1;
    const acceptedTargets = targets.filter((target) => target.occupiedBy && target.correctness !== false);
    const human = acceptedTargets.filter((target) => target.completedBy === 'human').length;
    const agent = acceptedTargets.filter((target) => target.completedBy === 'agent').length;
    return {
      schemaVersion: 'robo-bridge.build-progress.v1',
      planId: plan.planId,
      designChecksum: plan.designChecksum,
      worldRevision,
      completed: acceptedTargets.length,
      remaining: requiredCount - acceptedTargets.length,
      total: requiredCount,
      fraction: acceptedTargets.length / requiredCount,
      percent: acceptedTargets.length / requiredCount * 100,
      status: acceptedTargets.length === requiredCount ? 'complete' : acceptedTargets.length ? 'building' : 'ready',
      contributions: { human, agent, unknown: 0 },
      byPartClass: { STANDARD_BRICK: { total: requiredCount, completed: acceptedTargets.length } }
    };
  };
  const registryIdentity = { schemaVersion: 'robo-bridge.part-registry.v1', revision: 'bridge-part-registry.p0.v1', hash: 'parts_abc123', size: 2 };
  const constructionSession = {
    preparedBuild: {
      frozenPlan: {
        ...clone(plan),
        schemaVersion: 'robo-bridge.frozen-construction-plan.v1',
        worldTransform: clone(worldTransform),
        requiredPlacementIds: [...requiredPlacementIds],
        partRegistryRevision: registryIdentity.revision,
        partRegistryHash: registryIdentity.hash
      },
      registry: { ...clone(registryIdentity), identity: clone(registryIdentity) }
    },
    startBuild(expected = {}) {
      constructionCalls.startBuild += 1;
      if (expected.planId && expected.planId !== plan.planId) throw Object.assign(new Error('stale plan'), { code: 'STALE_DESIGN_REVISION' });
      started = true;
      worldRevision += 1;
      return { started: true, progress: getBuildProgress() };
    },
    getBuildProgress,
    async buildNextParts(count, options = {}) {
      constructionCalls.buildNextParts += 1;
      constructionCalls.lastCount = count;
      if (!started) throw Object.assign(new Error('not started'), { code: 'BUILD_NOT_STARTED' });
      if (options.signal?.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      const results = [];
      for (let index = 0; index < targets.length && results.length < count; index += 1) {
        if (!accept(index, 'agent')) continue;
        results.push({ ok: true, placementId: targets[index].placementId, actor: 'codex', status: 'accepted', sourceReassigned: index === 1 });
      }
      return { ok: true, completedPlacements: results.length, results, progress: getBuildProgress() };
    },
    cancelBuild(reason) {
      constructionCalls.cancelBuild += 1;
      return { ok: true, reason, progress: getBuildProgress() };
    },
    reset() {
      constructionCalls.reset += 1;
      started = false;
      const boardState = board.reset();
      return { ok: true, boardState, state: { started: false, progress: getBuildProgress() } };
    },
    dispose() { started = false; return { ok: true }; }
  };

  const trainCalls = { prepareTest: 0, startTest: 0, runToTerminal: 0, resetTrain: 0, stopTest: 0 };
  let trainState = 'READY';
  let trainResult = null;
  const trainSnapshot = () => {
    const accepted = canonicalBoardSnapshot();
    return {
      schemaVersion: 'robo-bridge.train-test-snapshot.v2',
      state: trainState,
      result: clone(trainResult),
      planIdentity: { planId: plan.planId, designChecksum: plan.designChecksum, designRevision: plan.designRevision },
      buildBoard: { blueprintId: plan.planId, worldRevision, acceptedChecksum: accepted.acceptedChecksum },
      routeFrame: { worldTransform: clone(worldTransform) },
      support: { firstUnsupportedSegment: outcome === 'CROSSED' ? null : 'rail-segment-2', firstUnsupportedProgress: outcome === 'CROSSED' ? null : 0.4 }
    };
  };
  const trainService = {
    getState() { return trainState; },
    getResult() { return clone(trainResult); },
    getSnapshot: trainSnapshot,
    prepareTest() {
      trainCalls.prepareTest += 1;
      if (trainState !== 'READY') return { ok: false, reason: 'TRAIN_NOT_READY', snapshot: trainSnapshot() };
      trainState = 'PUSH_READY';
      trainResult = null;
      return { ok: true, snapshot: trainSnapshot() };
    },
    startTest() {
      trainCalls.startTest += 1;
      const prepared = this.prepareTest();
      if (!prepared.ok) return prepared;
      trainState = 'PUSHING';
      return { ok: true, snapshot: trainSnapshot() };
    },
    runToTerminal() {
      trainCalls.runToTerminal += 1;
      trainState = outcome === 'CROSSED' ? 'CROSSED' : 'FAILED';
      trainResult = {
        success: outcome === 'CROSSED',
        outcome,
        firstUnsupportedSegment: outcome === 'CROSSED' ? null : 'rail-segment-2',
        firstUnsupportedProgress: outcome === 'CROSSED' ? null : 0.4
      };
      return trainSnapshot();
    },
    stopTest() {
      trainCalls.stopTest += 1;
      if (['PUSHING', 'POSITIONING_PUSHER', 'PUSH_READY', 'FALLING', 'RUNNING_SUPPORTED'].includes(trainState)) {
        trainState = 'STOPPED';
        trainResult = { success: false, outcome: 'STOPPED' };
      }
      return trainSnapshot();
    },
    resetTrain() {
      trainCalls.resetTrain += 1;
      trainState = 'READY';
      trainResult = null;
      return trainSnapshot();
    },
    runResetToReady() { return this.resetTrain({ instant: true }); }
  };

  const selectionHook = async ({ challengeId, service }) => {
    service.setPreset(challengeId);
    worldRevision += 1;
  };

  return {
    runtime,
    robotController,
    robotState,
    bridgeHost,
    bridgeDesignService,
    bridgeTools,
    challengeService,
    challengePresets: presetData,
    challengeCalls,
    selectionHook,
    constructionSession,
    constructionCalls,
    trainService,
    trainCalls,
    board,
    boardSnapshot,
    canonicalBoardSnapshot,
    requiredPlacementIds,
    plan,
    worldTransform,
    acceptHuman(index = 0) { return accept(index, 'human'); },
    completeBuild() { for (let index = 0; index < targets.length; index += 1) accept(index, 'agent'); },
    setOutcome(value) { outcome = value; },
    setRobotBusy(value = true) { robotState.operationState = value ? 'moving' : 'idle'; robotState.moving = value; },
    setHeldPart(value = 'held-part') { robotState.heldBrickId = value; },
    nextMissionId() { missionSequence += 1; return `mission-production-${missionSequence}`; },
    get worldRevision() { return worldRevision; },
    bumpWorldRevision() { worldRevision += 1; return worldRevision; }
  };
}
