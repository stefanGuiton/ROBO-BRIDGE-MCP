import test from 'node:test';
import assert from 'node:assert/strict';
import { constructionHarness } from '../helpers/construction-harness.js';
import { validateCollision } from '../../apps/web/src/robot/collision.js';

const options = h => ({ expectedWorldRevision: h.controller.worldRevision, executionMode: 'simulated_fast_forward' });

test('known 183/276 empty-gripper arch collision still fails closed in normal collision validation', async () => {
  const h = await constructionHarness({ terrain7: true });
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const arch = h.service.preparedBuild.normalisedBuild.placements.find(p => p.placementId === 'bp_9453b510.c.0.0');
  assert.ok(arch, 'regression is pinned to the measured Viaduct checkpoint');
  const obstacle = { ...arch, id: 'supporting-arch', snapped: true };
  const result = validateCollision({ tcp: { xMm: 481.9602456802, yMm: -127.1733127981, zMm: 122.1175874451 }, bricks: [obstacle] }, h.controller.layout);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'collision');
  assert.equal(result.obstacle, 'brick:supporting-arch');
});

test('explicit fast-forward completes live Viaduct through shared sources and placement authority, without motion', async () => {
  const h = await constructionHarness({ terrain7: true });
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const prepared = h.service.preparedBuild;
  const before = h.controller.getState();
  h.controller.moveTool = () => { throw new Error('fast-forward must not move the robot'); };
  let commits = 0;
  const commit = h.authority.commit.bind(h.authority);
  h.authority.commit = input => { commits++; return commit(input); };
  while (h.service.getBuildProgress().remaining) {
    const result = await h.service.buildNextParts(5, options(h));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.completedPlacements > 0 && result.completedPlacements <= 5);
    assert.equal(result.executionMode, 'simulated_fast_forward');
  }
  const progress = h.service.getBuildProgress(), events = h.board.eventLog.filter(e => e.type === 'snap');
  assert.equal(progress.total, prepared.frozenPlan.requiredPlacementIds.length);
  assert.equal(progress.completed, progress.total);
  assert.equal(commits, progress.total);
  assert.equal(progress.byExecutionMode.simulated_fast_forward, progress.total);
  assert.equal(progress.byExecutionMode.robot, 0);
  assert.equal(new Set(events.map(e => e.brickId)).size, progress.total);
  assert.ok(events.every(e => e.actor === 'agent' && e.executionMode === 'simulated_fast_forward'));
  assert.ok(h.board.getTargets().every(t => t.correctness && t.executionMode === 'simulated_fast_forward'));
  assert.deepEqual(h.controller.getState().tcp, before.tcp);
  assert.deepEqual(h.controller.getState().jointsRad, before.jointsRad);
  await h.service.reset({ expectedWorldRevision: h.controller.worldRevision });
  assert.equal(h.board.progress().filled, 0);
});

test('fast-forward rejects stale, invalid and cancelled calls; cancelled batches stop at the part boundary', async () => {
  const h = await constructionHarness({ terrain7: true });
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const revision = h.controller.worldRevision;
  await assert.rejects(h.service.buildNextParts(1, { ...options(h), expectedWorldRevision: revision - 1 }), /stale/);
  await assert.rejects(h.service.buildNextParts(6, options(h)), /1 to 5/);
  await assert.rejects(h.service.buildNextParts(1, { ...options(h), executionMode: 'magic' }), /executionMode/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(h.service.buildNextParts(1, { ...options(h), signal: abort.signal }), /aborted/);
  assert.equal(h.controller.worldRevision, revision);
  const commit = h.controller.commitSimulatedPlacement.bind(h.controller);
  h.controller.commitSimulatedPlacement = input => {
    const result = commit(input);
    h.service.cancelBuild({ expectedWorldRevision: h.controller.worldRevision });
    return result;
  };
  const result = await h.service.buildNextParts(5, options(h));
  assert.equal(result.reason, 'cancelled');
  assert.equal(result.completedPlacements, 1);
  assert.equal(h.board.progress().filled, 1);
});

test('fast-forward preserves source availability and dependency/occupancy validation', async () => {
  const h = await constructionHarness({ terrain7: true });
  h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
  const plan = h.service.planNext({ count: 2, expectedWorldRevision: h.controller.worldRevision });
  const stolen = plan.sourceIds[0], target = h.board.getTarget(plan.placementIds[0]);
  assert.equal(h.controller.beginHumanCarry(stolen).ok, true);
  assert.equal(h.controller.commitSimulatedPlacement({ brickId: stolen, targetId: target.id, expectedWorldRevision: h.controller.worldRevision }).reason, 'source_unavailable');
  assert.equal(h.controller.commitHumanPlacement({ brickId: stolen, position: target.position, yawRad: target.yawRad }).ok, true);
  const result = await h.service.buildNextParts(2, options(h));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(h.board.getTarget(target.id).completedBy, 'human');
  assert.equal(h.service.getBuildProgress().byExecutionMode.simulated_fast_forward, 2);
  const upper = h.board.getTargets().find(t => h.board.targetBlockReason(t, t.colour) === 'support_not_ready');
  const source = h.controller.getBricks().find(b => !b.snapped && b.colour === upper.colour);
  assert.ok(source);
  const revision = h.controller.worldRevision;
  const blocked = h.controller.commitSimulatedPlacement({ brickId: source.id, targetId: upper.id, expectedWorldRevision: revision });
  assert.equal(blocked.ok, false);
  assert.equal(h.controller.worldRevision, revision);
});
