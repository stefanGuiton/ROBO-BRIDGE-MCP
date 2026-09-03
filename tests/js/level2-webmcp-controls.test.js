import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionMissionRuntime } from '../../apps/web/src/mission/create-production-mission-runtime.js';
import { getMissionToolDefinitions } from '../../apps/web/src/mission/webmcp-mission-tools.js';
import { createMainDemoConstructionSession } from '../../apps/web/src/mission/main-demo-construction-session.js';
import { createBridgeDesignPackage } from '../../apps/web/src/bridge-design/create-bridge-design-package.js';
import { createEasyBridgeChallenge } from '../../apps/web/src/challenge/main-demo-easy.js';
import { createLevelGatedTrain } from '../../apps/web/src/train-integration/level-gated-train.js';
import { createMissionTrainAdapter } from '../../apps/web/src/train-integration/mission-train-adapter.js';
import { createProductionHarness } from '../helpers/production-fakes.js';
import { createMissionHarness } from '../helpers/mission-fakes.js';
import { constructionHarness } from '../helpers/construction-harness.js';

const INVALID_CYCLES = [0, 249, 60001, 300.5, '300', null, true, {}, NaN, Infinity];
const INVALID_ACTORS = ['codex', 'both', 'Human', '', null, true, 1, {}];

async function apiHarness({ configure = () => {}, execute = null } = {}) {
  const h = createProductionHarness({ requiredCount: 6 });
  configure(h);
  const calls = [];
  const original = h.constructionSession.buildNextParts;
  h.constructionSession.buildNextParts = (count, options) => {
    calls.push({ count, options });
    return execute ? execute(count, options, h) : original.call(h.constructionSession, count, options);
  };
  const bundle = await createProductionMissionRuntime({
    bridgeHost: h.bridgeHost,
    bridgeDesignService: h.bridgeDesignService,
    bridgeTools: h.bridgeTools,
    challengeService: h.challengeService,
    challengePresets: h.challengePresets,
    selectChallenge: h.selectionHook,
    constructionSession: h.constructionSession,
    getAcceptedBuildBoardSnapshot: h.boardSnapshot,
    normalizeAcceptedBuildBoardSnapshot: h.canonicalBoardSnapshot,
    trainService: h.trainService,
    robotController: h.robotController,
    runtime: h.runtime,
    idFactory: h.nextMissionId
  });
  const input = (extra = {}) => ({
    expectedMissionId: bundle.service.missionId,
    expectedMissionRevision: bundle.service.missionRevision,
    expectedWorldRevision: h.worldRevision,
    ...extra
  });
  const started = await bundle.service.startBridgeBuild(input({ expectedDesignRevision: h.plan.designRevision }));
  assert.equal(started.ok, true, JSON.stringify(started));
  const tool = bundle.additionalTools.find((item) => item.name === 'build_next_parts');
  const progressTool = bundle.additionalTools.find((item) => item.name === 'get_build_progress');
  const adapter = bundle.adapters.constructionService;
  const adapterInput = (extra = {}) => ({
    identity: adapter.getBinding(), count: 1, expectedWorldRevision: h.worldRevision, ...extra
  });
  return { h, bundle, input, tool, progressTool, adapter, adapterInput, calls };
}

function stableState(api) {
  return {
    worldRevision: api.h.worldRevision,
    missionRevision: api.bundle.service.missionRevision,
    phase: api.bundle.service.phase,
    targets: api.h.board.getTargets()
  };
}

function advisoryProgress(h) {
  const emptySide = () => ({
    total: 0, completed: 0, remaining: 0,
    contributions: { human: 0, agent: 0, unknown: 0 },
    byExecutionMode: { simulated_fast_forward: 0, robot: 0, human: 0, unknown: 0 }
  });
  const byAdvisorySide = { human: emptySide(), agent: emptySide() };
  h.board.getTargets().forEach((target, index, targets) => {
    const side = byAdvisorySide[index < targets.length / 2 ? 'human' : 'agent'];
    side.total += 1;
    if (target.occupiedBy && target.correctness !== false) {
      side.completed += 1;
      const actor = ['human', 'agent'].includes(target.completedBy) ? target.completedBy : 'unknown';
      side.contributions[actor] += 1;
      side.byExecutionMode[actor === 'agent' ? 'robot' : actor] += 1;
    } else side.remaining += 1;
  });
  return {
    schemaVersion: 'robo-bridge.collaboration.v1', mode: 'lateral_advisory', advisoryOnly: true,
    axis: 'bridge_local_z', centreLocalZ: 0, centrelineToleranceLocal: 1e-7,
    negativeSideActor: 'human', positiveSideActor: 'agent', centrelineActor: 'agent', byAdvisorySide
  };
}

test('Level 2 extends the existing build tool with optional bounded bridge-only controls', () => {
  const tools = getMissionToolDefinitions({});
  assert.equal(tools.length, 8);
  assert.equal(new Set(tools.map((item) => item.name)).size, 8);
  const { inputSchema, annotations } = tools.find((item) => item.name === 'build_next_parts');
  assert.equal(annotations.readOnlyHint, false);
  assert.equal(inputSchema.additionalProperties, false);
  assert.deepEqual(inputSchema.required, [
    'expectedMissionId', 'expectedMissionRevision', 'expectedWorldRevision', 'count'
  ]);
  assert.equal(inputSchema.properties.count.minimum, 1);
  assert.equal(inputSchema.properties.count.maximum, 5);
  const cycle = inputSchema.properties.cycleTimeMs;
  assert.equal(cycle.type, 'integer');
  assert.equal(cycle.minimum, 250);
  assert.equal(cycle.maximum, 60000);
  assert.match(cycle.description, /does not change Simple/i);
  assert.deepEqual(inputSchema.properties.actorHint.enum, ['human', 'agent']);
  assert.match(inputSchema.properties.actorHint.description, /not permission or actor attribution/i);
  assert.equal(tools.find((item) => item.name === 'get_build_progress').annotations.readOnlyHint, true);
});

for (const actorHint of ['human', 'agent']) {
  for (const executionMode of ['robot', 'simulated_fast_forward']) {
    test(`300 ms and ${actorHint} advisory hint survive Mission and adapter for ${executionMode}`, async () => {
      const api = await apiHarness();
      const expectedWorldRevision = api.h.worldRevision;
      const result = await api.tool.execute(api.input({ count: 2, cycleTimeMs: 300, actorHint, executionMode }));
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.completed, 2);
      assert.equal(result.executionMode, executionMode);
      assert.equal(api.calls.length, 1);
      assert.equal(api.calls[0].count, 2);
      assert.equal(api.calls[0].options.cycleTimeMs, 300);
      assert.equal(api.calls[0].options.actorHint, actorHint);
      assert.equal(api.calls[0].options.executionMode, executionMode);
      assert.equal(api.calls[0].options.expectedWorldRevision, expectedWorldRevision);
      assert.ok(api.calls[0].options.signal instanceof AbortSignal);
      assert.notEqual(result.lastPlacement.actor, 'human');
      assert.equal(api.h.board.getTargets().filter((target) => target.completedBy === 'agent').length, 2);
      assert.equal(api.h.board.getTargets().filter((target) => target.completedBy === 'human').length, 0);
    });
  }
}

test('cycle bounds are accepted exactly and omitted controls preserve session defaults', async () => {
  for (const cycleTimeMs of [250, 60000, undefined]) {
    const api = await apiHarness();
    const result = await api.tool.execute(api.input({ count: 1, ...(cycleTimeMs === undefined ? {} : { cycleTimeMs }) }));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(api.calls[0].options.cycleTimeMs, cycleTimeMs);
    assert.equal(Object.hasOwn(api.calls[0].options, 'cycleTimeMs'), cycleTimeMs !== undefined);
    assert.equal(Object.hasOwn(api.calls[0].options, 'actorHint'), false);
    assert.equal(api.calls[0].options.executionMode, 'robot');
  }
});

test('Mission rejects invalid cycle and actor hints before any construction mutation', async () => {
  const api = await apiHarness();
  const before = stableState(api);
  const invalid = [
    ...INVALID_CYCLES.map((cycleTimeMs) => ({ cycleTimeMs })),
    ...INVALID_ACTORS.map((actorHint) => ({ actorHint })),
    ...[0, 6, 2.5, '2', null].map((count) => ({ count }))
  ];
  for (const fields of invalid) {
    const result = await api.tool.execute(api.input({ count: 1, ...fields }));
    assert.equal(result.ok, false, JSON.stringify(fields));
    assert.equal(result.error.code, 'INVALID_PARAMETER', JSON.stringify(result));
  }
  assert.equal(api.calls.length, 0);
  assert.deepEqual(stableState(api), before);
});

test('adapter independently validates request and legacy option controls before session mutation', async () => {
  const api = await apiHarness();
  const before = stableState(api);
  const invalid = [
    ...INVALID_CYCLES.map((cycleTimeMs) => ({ cycleTimeMs })),
    ...INVALID_ACTORS.map((actorHint) => ({ actorHint }))
  ];
  for (const fields of invalid) {
    await assert.rejects(api.adapter.buildNextParts(api.adapterInput(fields)), { code: 'INVALID_PARAMETER' });
    await assert.rejects(api.adapter.buildNextParts(api.adapterInput(), fields), { code: 'INVALID_PARAMETER' });
  }
  assert.equal(api.calls.length, 0);
  assert.deepEqual(stableState(api), before);
});

test('adapter forwards valid controls and the exact signal without clamping or relabelling', async () => {
  const api = await apiHarness();
  const abort = new AbortController();
  const expectedWorldRevision = api.h.worldRevision;
  const result = await api.adapter.buildNextParts(api.adapterInput({ cycleTimeMs: 300, actorHint: 'human', signal: abort.signal }));
  assert.equal(result.ok, true);
  assert.equal(api.calls[0].count, 1);
  assert.equal(api.calls[0].options.signal, abort.signal);
  assert.equal(api.calls[0].options.expectedWorldRevision, expectedWorldRevision);
  assert.equal(api.calls[0].options.cycleTimeMs, 300);
  assert.equal(api.calls[0].options.actorHint, 'human');
  assert.notEqual(result.lastPlacement.actor, 'human');
});

test('new controls do not bypass exact Mission or adapter revision guards', async () => {
  const api = await apiHarness();
  const before = stableState(api);
  const cases = [
    [{ expectedMissionId: 'old-mission' }, 'STALE_MISSION'],
    [{ expectedMissionRevision: api.bundle.service.missionRevision - 1 }, 'STALE_MISSION_REVISION'],
    [{ expectedWorldRevision: api.h.worldRevision - 1 }, 'STALE_WORLD_REVISION']
  ];
  for (const [fields, code] of cases) {
    const result = await api.tool.execute(api.input({ count: 1, cycleTimeMs: 300, actorHint: 'agent', ...fields }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
  }
  await assert.rejects(api.adapter.buildNextParts(api.adapterInput({
    cycleTimeMs: 300, actorHint: 'human', expectedWorldRevision: api.h.worldRevision - 1
  })), { code: 'STALE_WORLD_REVISION' });
  assert.equal(api.calls.length, 0);
  assert.deepEqual(stableState(api), before);
});

test('pre-cancelled 300 ms calls do not reach the construction session', async () => {
  const api = await apiHarness();
  const before = stableState(api);
  const abort = new AbortController();
  abort.abort('cancel-before-build');
  const result = await api.tool.execute(api.input({ count: 1, cycleTimeMs: 300, actorHint: 'agent' }), { signal: abort.signal });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CANCELLED');
  await assert.rejects(api.adapter.buildNextParts(api.adapterInput({
    cycleTimeMs: 300, actorHint: 'human', signal: abort.signal
  })), { code: 'CANCELLED' });
  assert.equal(api.calls.length, 0);
  assert.deepEqual(stableState(api), before);
});

test('in-flight native-style cancellation reaches the session through Mission and adapter', { timeout: 5000 }, async () => {
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const api = await apiHarness({
    execute(count, options) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
        }, { once: true });
        entered();
      });
    }
  });
  const before = stableState(api);
  const abort = new AbortController();
  const pending = api.tool.execute(api.input({ count: 5, cycleTimeMs: 300, actorHint: 'agent' }), { signal: abort.signal });
  await ready;
  assert.equal(api.calls[0].options.signal.aborted, false);
  abort.abort('cancel-active-build');
  const result = await pending;
  assert.equal(api.calls[0].options.signal.aborted, true);
  assert.equal(api.calls[0].options.signal.reason, 'cancel-active-build');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CANCELLED');
  assert.equal(api.h.constructionCalls.cancelBuild, 1);
  assert.deepEqual(stableState(api), before);
});

test('progress exposes only fixed advisory aggregates, remains read-only, and retains actual actors', async () => {
  const api = await apiHarness({
    configure(h) {
      const original = h.constructionSession.getBuildProgress;
      h.constructionSession.getBuildProgress = () => {
        const collaboration = advisoryProgress(h);
        collaboration.fullPlan = { targets: Array.from({ length: 1000 }, () => 'not-public') };
        collaboration.byAdvisorySide.human.targetIds = ['not-public'];
        return { ...original(), collaboration, fullPlan: { private: 'not-public' } };
      };
    }
  });
  assert.equal(api.h.acceptHuman(0), true);
  const built = await api.tool.execute(api.input({ count: 1, cycleTimeMs: 300, actorHint: 'human' }));
  assert.equal(built.ok, true, JSON.stringify(built));
  const before = stableState(api);
  const callsBefore = api.calls.length;
  const first = await api.progressTool.execute({});
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.build.human, 1);
  assert.equal(first.build.codex, 1);
  assert.deepEqual(first.collaboration, advisoryProgress(api.h));
  assert.deepEqual(first.collaboration.byAdvisorySide.human.contributions, { human: 1, agent: 1, unknown: 0 });
  assert.doesNotMatch(JSON.stringify(first), /not-public|fullPlan|targetIds|sourceProgress|requiredPlacementIds/);
  assert.ok(JSON.stringify(first).length < 1500, JSON.stringify(first).length);
  first.collaboration.byAdvisorySide.human.total = 999;
  const second = await api.progressTool.execute({});
  assert.deepEqual(second.collaboration, advisoryProgress(api.h));
  assert.deepEqual(stableState(api), before);
  assert.equal(api.calls.length, callsBefore);
});

test('invalid advisory aggregates cannot report a fabricated completed side', async () => {
  const api = await apiHarness({
    configure(h) {
      const original = h.constructionSession.getBuildProgress;
      h.constructionSession.getBuildProgress = () => {
        const collaboration = advisoryProgress(h);
        collaboration.byAdvisorySide.human.completed = 3;
        return { ...original(), collaboration };
      };
    }
  });
  const before = stableState(api);
  const result = await api.progressTool.execute({});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CONSTRUCTION_ERROR');
  assert.deepEqual(stableState(api), before);
  assert.equal(api.calls.length, 0);
});

test('real Terrain 7 ConstructionSession forwards both hints and returns bounded progress without Train initialization', async () => {
  const h = await constructionHarness({ terrain7: true });
  let trainFactories = 0;
  const train = createLevelGatedTrain({
    createIntegration() { trainFactories += 1; throw new Error('Level 2 must not initialize Train.'); }
  });
  const runtime = { robot: h.controller, getWorldRevision: () => h.controller.worldRevision };
  const bundle = await createProductionMissionRuntime({
    bridgeHost: h.host,
    bridgeDesignPackage: createBridgeDesignPackage({ host: h.host }),
    challengeService: h.challenge,
    challengeMetadata: { EASY: { label: 'Terrain 7', bridgeChallengeId: createEasyBridgeChallenge(h.challenge).id } },
    constructionSession: createMainDemoConstructionSession(h.service, runtime.getWorldRevision),
    getAcceptedBuildBoardSnapshot: () => h.board,
    trainIntegration: train,
    robotController: h.controller,
    runtime,
    idFactory: () => 'mission-level2-real-controls'
  });
  const input = (extra = {}) => ({
    expectedMissionId: bundle.service.missionId,
    expectedMissionRevision: bundle.service.missionRevision,
    expectedWorldRevision: h.controller.worldRevision,
    ...extra
  });
  const started = await bundle.service.startBridgeBuild(input({ expectedDesignRevision: h.host.designRevision }));
  assert.equal(started.ok, true, JSON.stringify(started));
  const tool = bundle.additionalTools.find((item) => item.name === 'build_next_parts');
  for (const actorHint of ['human', 'agent']) {
    const result = await tool.execute(input({ count: 1, cycleTimeMs: 300, actorHint, executionMode: 'simulated_fast_forward' }));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.completed, 1);
    assert.equal(result.lastPlacement.actor, 'agent');
    assert.equal(result.executionMode, 'simulated_fast_forward');
  }
  const revision = h.controller.worldRevision;
  const progress = await bundle.service.getBuildProgress();
  assert.equal(progress.ok, true, JSON.stringify(progress));
  assert.equal(progress.build.accepted, 2);
  assert.equal(progress.build.codex, 2);
  assert.equal(progress.build.human, 0);
  assert.deepEqual(progress.collaboration, h.service.getBuildProgress().collaboration);
  assert.ok(progress.collaboration.byAdvisorySide.human.total > 0);
  assert.ok(progress.collaboration.byAdvisorySide.agent.total > 0);
  assert.equal(Object.values(progress.collaboration.byAdvisorySide).reduce((sum, side) => sum + side.byExecutionMode.simulated_fast_forward, 0), 2);
  assert.ok(JSON.stringify(progress).length < 1500, JSON.stringify(progress).length);
  assert.equal(h.controller.worldRevision, revision);
  assert.equal(trainFactories, 0);
  assert.equal(train.getSubsystem(), null);
  train.dispose();
});

test('direct disabled-Train tests reject before mutation bookkeeping and omit train next actions', async () => {
  for (const asyncState of [false, true]) {
    const h = createMissionHarness();
    let trainFactories = 0, frameSubscriptions = 0, beginnings = 0;
    const train = createLevelGatedTrain({
      createIntegration() { trainFactories += 1; throw new Error('Unexpected Train initialization.'); },
      subscribeFrame() { frameSubscriptions += 1; return () => {}; }
    });
    Object.assign(h.trainService, createMissionTrainAdapter(train));
    if (asyncState) h.trainService.getState = async () => train.getState();
    const started = await h.startBuild();
    assert.equal(started.ok, true);
    const originalBegin = h.service._begin;
    h.service._begin = function (...args) { beginnings += 1; return originalBegin.apply(this, args); };
    const frozen = h.service.frozen;
    const before = {
      worldRevision: h.worldRevision, missionRevision: h.service.missionRevision,
      eventCount: h.events.length, eventSequence: h.service.events.nextSequence
    };
    const state = await h.service.getMissionState();
    assert.equal(state.ok, true, JSON.stringify(state));
    assert.equal(state.train.enabled, false);
    assert.equal(state.nextActions.includes('test_bridge'), false);
    const result = await h.service.testBridge(h.sessionInput());
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'LEVEL3_ONLY');
    assert.equal(result.error.retryable, false);
    assert.equal(result.error.allowedNextActions.includes('test_bridge'), false);
    assert.match(result.error.recovery, /Level 3/);
    assert.equal(h.service.phase, 'BUILD');
    assert.equal(h.service.active, null);
    assert.equal(h.service.lastTest, null);
    assert.equal(h.service.frozen, frozen);
    assert.deepEqual({
      worldRevision: h.worldRevision, missionRevision: h.service.missionRevision,
      eventCount: h.events.length, eventSequence: h.service.events.nextSequence
    }, before);
    assert.equal(beginnings, 0);
    assert.equal(trainFactories, 0);
    assert.equal(frameSubscriptions, 0);
    assert.equal(train.getSubsystem(), null);
    train.dispose();
  }
});

test('Train readiness read is followed by live revision revalidation before TEST begins', async () => {
  const h = createMissionHarness();
  await h.startBuild();
  const input = h.sessionInput();
  const frozen = h.service.frozen;
  const events = h.events.length;
  h.trainService.getState = async () => {
    h.setWorldRevision(h.worldRevision + 1);
    return { state: 'READY', enabled: true };
  };
  const result = await h.service.testBridge(input);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'STALE_WORLD_REVISION');
  assert.equal(h.service.phase, 'BUILD');
  assert.equal(h.service.active, null);
  assert.equal(h.service.frozen, frozen);
  assert.equal(h.service.missionRevision, input.expectedMissionRevision);
  assert.equal(h.events.length, events);
  assert.equal(h.trainService.state.calls.test, 0);
});
