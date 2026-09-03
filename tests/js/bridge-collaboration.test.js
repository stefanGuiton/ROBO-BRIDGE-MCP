import test from 'node:test';
import assert from 'node:assert/strict';
import { constructionHarness } from '../helpers/construction-harness.js';
import { TERRAIN7_BRIDGE_INITIAL_SETTINGS } from '../../apps/web/src/bridge/main-demo-bridge.js';
// Retain the historical three-row contribution fixture; current two-row
// compilation is covered independently by bridge-width.test.js.
const legacyThreeRowSettings = { ...TERRAIN7_BRIDGE_INITIAL_SETTINGS, bridgeWidthCells: 3 };
import { createConstructionPlacementStream } from '../../apps/web/src/bridge-core/construction-adapter.js';
import { inverseTransformPointFromMainDemo, transformPointToMainDemo } from '../../apps/web/src/bridge-core/world-transform.js';
import { createBridgeCollaboration, classifyBridgeCollaboration } from '../../apps/web/src/bridge-construction/bridge-collaboration.js';
import { eligibleBatch } from '../../apps/web/src/bridge-construction/bridge-build-session.js';
import { getBridgeBuildProgress } from '../../apps/web/src/bridge-construction/bridge-build-progress.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';

const revisionOptions = h => ({ expectedWorldRevision: h.controller.worldRevision });
const sideCounts = progress => Object.fromEntries(Object.entries(progress.collaboration.byAdvisorySide).map(([actor, side]) => [actor, side.total]));

test('current Terrain 7 Viaduct has immutable advisory 91 Human / 185 Codex labels, unchanged compiler preferences and shared supply', async () => {
  const h = await constructionHarness({ terrain7: true, bridgeSettings: legacyThreeRowSettings });
  const compilerPlanBefore = JSON.stringify(h.host.buildPlan);
  h.service.startBuild(revisionOptions(h));
  const prepared = h.service.preparedBuild;
  const { placements, worldTransform, collaboration } = prepared.normalisedBuild;
  const raw = createConstructionPlacementStream(prepared.frozenPlan.buildPlan, worldTransform);
  const originalById = new Map(raw.entries.map(entry => [entry.placementId, entry]));
  const targets = new Map(prepared.targetSet.targets.map(target => [target.targetId, target]));
  assert.equal(placements.length, 276);
  assert.equal(prepared.inventory.count, 276);
  assert.equal(prepared.normalisedBuild.summary.assignedToHuman, 91);
  assert.equal(prepared.normalisedBuild.summary.assignedToAgent, 185);
  assert.deepEqual(sideCounts(h.service.getBuildProgress()), { human: 91, agent: 185 });
  assert.equal(collaboration.advisoryOnly, true);
  assert.equal(collaboration.axis, 'bridge_local_z');
  assert.equal(collaboration.centreLocalZ, prepared.frozenPlan.buildPlan.anchors.bridgeCentreZ);
  const sides = { negative: 0, centreline: 0, positive: 0 };
  for (const placement of placements) {
    const target = targets.get(placement.placementId);
    const original = originalById.get(placement.placementId);
    const relativeZ = inverseTransformPointFromMainDemo(placement.renderPose.position, worldTransform).z - collaboration.centreLocalZ;
    const expectedActor = relativeZ < -collaboration.centrelineToleranceLocal ? 'human' : 'agent';
    assert.equal(placement.collaboration.advisoryActor, expectedActor);
    assert.equal(placement.actorAssignment, expectedActor);
    assert.equal(placement.actorPreference, original.actorPreference);
    assert.equal(placement.originalActorPreference, original.actorPreference);
    assert.equal(target.actorPreference, original.actorPreference);
    assert.equal(target.originalActorPreference, original.actorPreference);
    assert.deepEqual(target.collaboration, placement.collaboration);
    assert.deepEqual(target.allowedActors, ['human', 'agent']);
    assert.deepEqual(placement.allowedActors, ['human', 'agent']);
    assert.deepEqual(prepared.registry.resolve(placement).allowedActors, ['human', 'agent']);
    assert.equal(Object.isFrozen(placement.collaboration), true);
    assert.equal(Object.isFrozen(target.collaboration), true);
    sides[placement.collaboration.side]++;
  }
  assert.deepEqual(sides, { negative: 91, centreline: 94, positive: 91 });
  const tracks = placements.filter(placement => placement.partClass === 'TRACK_SEGMENT');
  assert.equal(tracks.length, 3);
  assert.ok(tracks.every(placement => placement.collaboration.side === 'centreline' && placement.collaboration.advisoryActor === 'agent'));
  const sources = prepared.inventory.list();
  assert.equal(new Set(sources.map(source => source.sourceId)).size, 276);
  assert.ok(sources.every(source => source.robotEligible && source.allowedActors.join(',') === 'human,agent'));
  assert.ok(h.controller.getBricks().every(brick => brick.bridgePart.allowedActors.join(',') === 'human,agent'));
  assert.equal(JSON.stringify(h.host.buildPlan), compilerPlanBefore);
  assert.throws(() => { placements[0].collaboration.advisoryActor = 'agent'; }, TypeError);
  const snapshot = h.board.getTarget(placements[0].placementId);
  snapshot.collaboration.advisoryActor = 'changed-snapshot';
  assert.equal(h.board.getTarget(snapshot.targetId).collaboration.advisoryActor, placements[0].collaboration.advisoryActor);
});

test('advisory classification uses inverse-transformed render origin relative to a nonzero bridge centre', () => {
  const centreLocalZ = 37;
  const collaboration = createBridgeCollaboration({ buildPlan: { anchors: { bridgeCentreZ: centreLocalZ } } });
  for (const yawDeg of [-90, 0, 63, 180]) {
    const worldTransform = { translationMm: { xMm: 610, yMm: -73, zMm: 44 }, yawDeg, scale: 2.75 };
    for (const [offset, side, actor] of [[-8, 'negative', 'human'], [0, 'centreline', 'agent'], [8, 'positive', 'agent']]) {
      const renderPose = { position: transformPointToMainDemo({ x: 123, y: 19, z: centreLocalZ + offset }, worldTransform) };
      const metadata = classifyBridgeCollaboration({ renderPose, worldTransform, collaboration });
      assert.equal(metadata.side, side);
      assert.equal(metadata.advisoryActor, actor);
      assert.ok(Math.abs(metadata.localLateralZ - centreLocalZ - offset) < 1e-10);
      assert.ok(Math.abs(metadata.relativeLateralZ - offset) < 1e-10);
      assert.equal(metadata.centreLocalZ, centreLocalZ);
    }
  }
  assert.throws(() => createBridgeCollaboration({ buildPlan: {} }), /finite number/);
});

function selectionFixture(placements, acceptedIds = []) {
  const targets = placements.map(placement => ({ targetId: placement.placementId,
    occupiedBy: acceptedIds.includes(placement.placementId) ? `source.${placement.placementId}` : null,
    correctness: acceptedIds.includes(placement.placementId) }));
  return { prepared: { normalisedBuild: { placements } }, board: { worldRevision: 17, getTargets: () => structuredClone(targets) } };
}

function fixturePlacement(id, actor, z, { height = 2, dependencies = [], reachable = true, track = false } = {}) {
  return { placementId: id, position: { xMm: 0, yMm: 0, zMm: z }, yawRad: 0,
    collisionProxy: { sizeMm: { xMm: 2, yMm: 2, zMm: height } },
    partClass: track ? 'TRACK_SEGMENT' : 'STANDARD_BRICK', requiresStructureComplete: track,
    robotTarget: { reachable }, dependencyIds: dependencies,
    collaboration: { advisoryOnly: true, advisoryActor: actor } };
}

test('pure bounded scheduling prefers ready advisory targets but keeps max-Z access order and the no-hint order', () => {
  const placements = [
    fixturePlacement('human.tall-arch', 'human', 1, { height: 50 }),
    fixturePlacement('agent.low', 'agent', 1),
    fixturePlacement('human.low', 'human', 10),
    fixturePlacement('human.unreachable', 'human', -10, { reachable: false }),
    fixturePlacement('track', 'agent', 50, { track: true })
  ];
  const { prepared, board } = selectionFixture(placements);
  const before = JSON.stringify(board.getTargets());
  const preferred = eligibleBatch(prepared, board, 3, { actorHint: 'human' });
  assert.deepEqual(preferred.selected.map(placement => placement.placementId), ['human.low', 'human.tall-arch', 'agent.low']);
  assert.deepEqual(preferred.scheduling, { actorHint: 'human', advisoryOnly: true, preferredSelected: 2,
    fallbackUsed: true, fallbackCount: 1, fallbackPlacementIds: ['agent.low'], fallbackReason: 'no_preferred_eligible_placement' });
  assert.deepEqual(eligibleBatch(prepared, board, 3).selected.map(placement => placement.placementId), ['agent.low', 'human.low', 'human.tall-arch']);
  assert.equal(JSON.stringify(board.getTargets()), before);
  assert.equal(board.worldRevision, 17);
});

test('pure hint fallback can unlock a preferred dependency but never bypasses structure or reachability gates', () => {
  const placements = [
    fixturePlacement('agent.support', 'agent', 3),
    fixturePlacement('human.dependent', 'human', 2, { dependencies: ['agent.support'] }),
    fixturePlacement('track', 'agent', 5, { track: true, dependencies: ['human.dependent'] })
  ];
  const { prepared, board } = selectionFixture(placements);
  const batch = eligibleBatch(prepared, board, 5, { actorHint: 'human' });
  assert.deepEqual(batch.selected.map(placement => placement.placementId), ['agent.support', 'human.dependent']);
  assert.deepEqual(batch.scheduling.fallbackPlacementIds, ['agent.support']);
  const afterStructure = selectionFixture(placements, ['agent.support', 'human.dependent']);
  const last = eligibleBatch(afterStructure.prepared, afterStructure.board, 1, { actorHint: 'human' });
  assert.equal(last.selected[0].placementId, 'track');
  assert.equal(last.scheduling.fallbackUsed, true);
  assert.throws(() => eligibleBatch(prepared, board, 6), /1 to 5/);
  for (const actorHint of [null, 'codex', 'user', 'unknown', '', 1]) {
    assert.throws(() => eligibleBatch(prepared, board, 1, { actorHint }), /actorHint/);
  }
});

test('Human can adopt a Codex-side target and real robot execution can accept a Human-side target with consistent 300 ms queue/runner settings', async () => {
  const h = await constructionHarness({ terrain7: true, bridgeSettings: legacyThreeRowSettings });
  h.service.startBuild(revisionOptions(h));
  const prepared = h.service.preparedBuild;
  const human = new HumanBuildAdapter({ controller: h.controller, board: h.board, graph: h.authority.graph, placementEngine: h.authority.placementEngine });
  const planned = h.service.planNext({ ...revisionOptions(h), count: 1, actorHint: 'agent', cycleTimeMs: 300 });
  assert.equal(planned.ok, true, JSON.stringify(planned));
  assert.equal(planned.cycleTimeMs, 300);
  assert.equal(planned.scheduling.actorHint, 'agent');
  assert.equal(planned.scheduling.fallbackUsed, false);
  const target = h.board.getTarget(planned.placementIds[0]);
  assert.equal(target.collaboration.advisoryActor, 'agent');
  assert.equal(human.pickup(planned.sourceIds[0]).ok, true);
  const preview = h.authority.preview({ brickId: planned.sourceIds[0], position: target.position, yawRad: target.yawRad });
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(human.setPreview(preview.candidate), true);
  assert.equal(human.release().ok, true);
  const adopted = h.coordinator.getStreamStatus({ streamId: planned.streamId, cursor: 0, limit: 5 }).entries.find(entry => entry.placementId === target.id);
  assert.equal(adopted.status, 'ADOPTED');
  assert.equal(h.board.getTarget(target.id).completedBy, 'human');

  const queued = [], runs = [];
  const planQueue = h.coordinator.planQueue.bind(h.coordinator), run = h.runner.run.bind(h.runner);
  h.coordinator.planQueue = (entries, options) => { queued.push(options); return planQueue(entries, options); };
  h.runner.run = options => { runs.push(options); return run(options); };
  const signal = new AbortController().signal;
  const executed = await h.service.buildNextParts(1, { ...revisionOptions(h), actorHint: 'human', cycleTimeMs: 300, signal });
  assert.equal(executed.ok, true, JSON.stringify(executed));
  assert.equal(executed.executionMode, 'robot');
  assert.equal(executed.scheduling.fallbackUsed, false);
  assert.equal(queued.length, 1);
  assert.equal(runs.length, 1);
  assert.equal(queued[0].cycleTimeMs, 300);
  assert.equal(runs[0].cycleTimeMs, 300);
  assert.equal(runs[0].signal, signal);
  assert.equal(h.coordinator.getState().stream.cycleTimeMs, 300);
  const robotTarget = h.board.getTarget(executed.results[0].placementId);
  assert.equal(robotTarget.collaboration.advisoryActor, 'human');
  assert.equal(robotTarget.completedBy, 'agent');
  const progress = h.service.getBuildProgress();
  assert.deepEqual(progress.contributions, { human: 1, agent: 1, unknown: 0 });
  assert.deepEqual(progress.collaboration.byAdvisorySide.agent.contributions, { human: 1, agent: 0, unknown: 0 });
  assert.deepEqual(progress.collaboration.byAdvisorySide.human.contributions, { human: 0, agent: 1, unknown: 0 });
  assert.equal(progress.collaboration.byAdvisorySide.human.byExecutionMode.robot, 1);
  const snaps = h.board.eventLog.filter(event => event.type === 'snap');
  assert.equal(snaps.length, 2);
  assert.equal(new Set(snaps.map(event => event.targetId)).size, 2);
  assert.equal(new Set(snaps.map(event => event.brickId)).size, 2);
  assert.ok(snaps.every(event => prepared.inventory.get(event.brickId)?.allowedActors.join(',') === 'human,agent'));
  assert.equal(h.controller.board, h.board);
  assert.equal(h.authority.board, h.board);

  const revision = h.controller.worldRevision;
  const snapshot = JSON.stringify({ targets: h.board.getTargets(), bricks: h.controller.getBricks() });
  for (let index = 0; index < 3; index++) {
    assert.deepEqual(h.service.getBuildProgress(), progress);
    eligibleBatch(prepared, h.board, 1, { actorHint: 'human' });
  }
  assert.equal(h.controller.worldRevision, revision);
  assert.equal(JSON.stringify({ targets: h.board.getTargets(), bricks: h.controller.getBricks() }), snapshot);
  assert.throws(() => { progress.collaboration.byAdvisorySide.human.completed = 99; }, TypeError);
});

test('invalid actor/cycle options reject before source or queue mutation and omitted cycle remains 1000 ms', async () => {
  const h = await constructionHarness({ terrain7: true, bridgeSettings: legacyThreeRowSettings });
  h.service.startBuild(revisionOptions(h));
  const before = JSON.stringify({ revision: h.controller.worldRevision, targets: h.board.getTargets(), bricks: h.controller.getBricks() });
  let admissions = 0;
  const planQueue = h.coordinator.planQueue.bind(h.coordinator);
  h.coordinator.planQueue = (...args) => { admissions++; return planQueue(...args); };
  for (const actorHint of [null, 'codex', 'user', 'unknown', '', 1]) {
    assert.throws(() => h.service.planNext({ ...revisionOptions(h), actorHint }), /actorHint/);
    for (const executionMode of ['robot', 'simulated_fast_forward']) {
      await assert.rejects(h.service.buildNextParts(1, { ...revisionOptions(h), actorHint, executionMode }), /actorHint/);
    }
  }
  for (const cycleTimeMs of [null, 249, 60001, 300.5, '300', NaN, Infinity]) {
    assert.throws(() => h.service.planNext({ ...revisionOptions(h), cycleTimeMs }), /cycleTimeMs/);
    await assert.rejects(h.service.buildNextParts(1, { ...revisionOptions(h), cycleTimeMs }), /cycleTimeMs/);
  }
  assert.equal(admissions, 0);
  assert.equal(JSON.stringify({ revision: h.controller.worldRevision, targets: h.board.getTargets(), bricks: h.controller.getBricks() }), before);
  const normal = h.service.planNext(revisionOptions(h));
  assert.equal(normal.cycleTimeMs, 1000);
  assert.equal(h.coordinator.getState().stream.cycleTimeMs, 1000);
  assert.equal(normal.scheduling.actorHint, null);
});

test('read-only aggregate uses occupied correct board targets, including unknown actual actors, not advisory assignments', () => {
  const collaboration = createBridgeCollaboration({ buildPlan: { anchors: { bridgeCentreZ: 0 } } });
  const normalisedBuild = { planId: 'fixture', designChecksum: 'fixture', collaboration, placements: [
    { placementId: 'human-side', partClass: 'STANDARD_BRICK', collaboration: { advisoryActor: 'human' } },
    { placementId: 'agent-side', partClass: 'STANDARD_BRICK', collaboration: { advisoryActor: 'agent' } },
    { placementId: 'unaccepted', partClass: 'STANDARD_BRICK', collaboration: { advisoryActor: 'agent' } }
  ] };
  let targets = [
    { targetId: 'human-side', occupiedBy: 'one', correctness: true, completedBy: 'agent', executionMode: 'simulated_fast_forward' },
    { targetId: 'agent-side', occupiedBy: 'two', correctness: true, completedBy: null },
    { targetId: 'unaccepted', occupiedBy: 'three', correctness: false, completedBy: 'human' }
  ];
  const buildBoard = { worldRevision: 7, getTargets: () => structuredClone(targets) };
  const progress = getBridgeBuildProgress({ buildBoard, normalisedBuild });
  assert.equal(progress.completed, 2);
  assert.deepEqual(progress.contributions, { human: 0, agent: 1, unknown: 1 });
  assert.deepEqual(progress.collaboration.byAdvisorySide.human.contributions, { human: 0, agent: 1, unknown: 0 });
  assert.equal(progress.collaboration.byAdvisorySide.human.byExecutionMode.simulated_fast_forward, 1);
  assert.equal(progress.collaboration.byAdvisorySide.agent.byExecutionMode.unknown, 1);
  assert.equal(progress.collaboration.byAdvisorySide.agent.remaining, 1);
  targets = targets.map(target => ({ ...target, occupiedBy: null, correctness: false }));
  const after = getBridgeBuildProgress({ buildBoard, normalisedBuild });
  assert.equal(after.completed, 0);
  assert.equal(after.remaining, 3);
  assert.deepEqual(after.contributions, { human: 0, agent: 0, unknown: 0 });
  assert.equal(buildBoard.worldRevision, 7);
  assert.ok(JSON.stringify(after.collaboration).length < 1000);
});

test('bounded explicitly labelled fast-forward with Codex hint still completes all 276 shared Viaduct targets with reported fallback', async () => {
  const h = await constructionHarness({ terrain7: true, bridgeSettings: legacyThreeRowSettings });
  h.service.startBuild(revisionOptions(h));
  const prepared = h.service.preparedBuild;
  const placements = new Map(prepared.normalisedBuild.placements.map(placement => [placement.placementId, placement]));
  const before = h.controller.getState();
  h.controller.moveTool = () => { throw new Error('labelled fast-forward must not report robot motion'); };
  let fallbackCount = 0;
  for (let batch = 0; h.service.getBuildProgress().remaining; batch++) {
    assert.ok(batch < 276, 'hint must never strand the opposite advisory side');
    const result = await h.service.buildNextParts(5, { ...revisionOptions(h), actorHint: 'agent', cycleTimeMs: 300, executionMode: 'simulated_fast_forward' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.completedPlacements >= 1 && result.completedPlacements <= 5);
    assert.equal(result.executionMode, 'simulated_fast_forward');
    assert.equal(result.robotExecuted, false);
    assert.equal(result.motionCollisionVerified, false);
    assert.equal(result.scheduling.actorHint, 'agent');
    assert.ok(result.scheduling.fallbackPlacementIds.length <= 5);
    assert.ok(result.scheduling.fallbackPlacementIds.every(id => placements.get(id).collaboration.advisoryActor === 'human'));
    fallbackCount += result.scheduling.fallbackCount;
  }
  const progress = h.service.getBuildProgress();
  assert.equal(fallbackCount, 91);
  assert.equal(progress.completed, 276);
  assert.equal(progress.remaining, 0);
  assert.deepEqual(progress.contributions, { human: 0, agent: 276, unknown: 0 });
  assert.equal(progress.byExecutionMode.simulated_fast_forward, 276);
  assert.equal(progress.byExecutionMode.robot, 0);
  assert.equal(progress.collaboration.byAdvisorySide.human.completed, 91);
  assert.equal(progress.collaboration.byAdvisorySide.agent.completed, 185);
  assert.equal(progress.collaboration.byAdvisorySide.human.contributions.agent, 91);
  assert.equal(progress.collaboration.byAdvisorySide.agent.contributions.agent, 185);
  const snaps = h.board.eventLog.filter(event => event.type === 'snap');
  assert.equal(snaps.length, 276);
  assert.equal(new Set(snaps.map(event => event.targetId)).size, 276);
  assert.equal(new Set(snaps.map(event => event.brickId)).size, 276);
  assert.ok(snaps.every(event => prepared.inventory.get(event.brickId) && event.actor === 'agent' && event.executionMode === 'simulated_fast_forward'));
  assert.deepEqual(h.controller.getState().tcp, before.tcp);
  assert.deepEqual(h.controller.getState().jointsRad, before.jointsRad);
});
