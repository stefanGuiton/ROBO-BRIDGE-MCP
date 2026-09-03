import test from 'node:test';
import assert from 'node:assert/strict';
import { constructionHarness } from '../helpers/construction-harness.js';
import { partsOverlap } from '../../apps/web/src/bricks/part-spec.js';

test('construction derives current identity, shared parts and physical bounds; freezes design', async () => {
  const h = await constructionHarness();
  const originalWorkspace = structuredClone(h.controller.workspace);
  const state = h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const p = h.service.preparedBuild;
  assert.equal(state.planId, h.host.buildPlan.planId);
  assert.equal(p.inventory.count, p.frozenPlan.requiredPlacementIds.length);
  assert.notEqual(p.inventory.count, 476);
  for (const placement of p.normalisedBuild.placements) {
    assert.deepEqual(p.registry.resolve(placement).allowedActors, ['human', 'agent']);
    assert.equal(h.board.getTarget(placement.placementId).placementId, placement.placementId);
  }
  assert.equal(h.service.getPhysicalReport().invalidTargets.length, 0);
  assert.deepEqual(h.controller.workspace, originalWorkspace);
  await assert.rejects(h.host.applySettingsBatch(h.host.settings, h.host.designRevision), /Reset construction/);
  assert.throws(() => h.service.planNext({ expectedWorldRevision: -1 }), /stale_world_revision/);
  const live = h.controller.getBricks();
  for (let i = 0; i < live.length; i++) for (let j = 0; j < i; j++) assert.equal(partsOverlap(live[i], live[j]), false, 'shared feeder sources overlap');
  await h.service.reset({ expectedWorldRevision: h.controller.worldRevision });
  assert.equal(h.board.progress().total, 0);
  await h.host.applySettingsBatch(h.host.settings, h.host.designRevision);
});

test('current bridge executes through the existing UR10 placement stream and BuildBoard', async () => {
  const h = await constructionHarness();
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const result = await h.service.buildNextParts(1, { expectedWorldRevision: h.controller.worldRevision, cycleTimeMs: 250 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(h.service.getBuildProgress().contributions.agent, 1);
  assert.equal(h.board.eventLog.filter(e => e.type === 'snap' && e.actor === 'agent').length, 1);
});

test('shared source theft reassigns and a human target takeover is adopted without reset', async () => {
  const h = await constructionHarness();
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const plan = h.service.planNext({ count: 2, expectedWorldRevision: h.controller.worldRevision });
  const source = plan.sourceIds[0], target = h.board.getTarget(plan.placementIds[0]);
  assert.equal(h.controller.beginHumanCarry(source).ok, true);
  const repaired = h.coordinator.getState().queue.find(p => p.placementId === target.id);
  assert.ok(repaired);
  assert.notEqual(repaired.brickId, source);
  const accepted = h.controller.commitHumanPlacement({ brickId: source, position: target.position, yawRad: target.yawRad });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  const adopted = h.coordinator.getStreamStatus({ streamId: plan.streamId, cursor: 0, limit: 20 }).entries.find(e => e.placementId === target.id);
  assert.equal(adopted.status, 'ADOPTED');
  const executed = await h.runner.run({ maximumPlacements: 2, cycleTimeMs: 250 });
  assert.equal(executed.ok, true, JSON.stringify(executed));
  assert.deepEqual(h.service.getBuildProgress().contributions, { human: 1, agent: 1, unknown: 0 });
});

test('construction cancellation is forwarded and reset releases the frozen design', async () => {
  const h = await constructionHarness();
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const abort = new AbortController();
  const run = h.service.buildNextParts(2, { expectedWorldRevision: h.controller.worldRevision, signal: abort.signal });
  abort.abort();
  const cancelled = await run;
  assert.equal(cancelled.ok, false);
  assert.equal(h.board.progress().filled, 0);
  await h.service.reset({ expectedWorldRevision: h.controller.worldRevision });
  await h.host.applySettingsBatch(h.host.settings, h.host.designRevision);
});

test('shared part preview rejects occupied, unsupported, and wrong-type bridge targets', async () => {
  const h = await constructionHarness();
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const p = h.service.preparedBuild;
  const upper = p.normalisedBuild.placements.find(p => p.dependencyIds.length);
  const source = h.controller.getBricks().find(b => b.colour === upper.colour);
  assert.ok(source);
  const before = h.controller.worldRevision;
  assert.equal(h.authority.preview({ brickId: source.id, position: upper.position }).ok, false);
  assert.equal(h.controller.worldRevision, before);
  assert.throws(() => h.service.startBuild({ expectedWorldRevision: before }), /reset_required/);
});
