import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingHumanGuide, previewHumanGuide } from '../../apps/web/src/player/pending-placement-guide.js';
import { simpleHarness } from '../helpers/simple-demo-harness.js';
import { createSimpleStructurePlan, toWebMcpPlacements } from '../../apps/web/src/robot/simple-structure-planner.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';

test('guide derives only eligible compatible pending slots without changing stream state', () => {
  const request = { position: { xMm: 700, yMm: 0, zMm: 8.6 }, yawRad: 0, colour: 'red' };
  const entries = [{ placementId: 'a', request, status: 'EXECUTING' },
    { placementId: 'b', request: { ...request, dependsOnPlacementIds: ['a'] }, status: 'WAITING_DEPENDENCY' },
    { placementId: 'c', request: { ...request, colour: null, preferredColour: 'red' }, status: 'PLANNED' }];
  const before = JSON.stringify(entries);
  const guide = pendingHumanGuide({ stream: { entries } }, { colour: 'blue' });
  assert.equal(guide.placementId, 'c');
  guide.position.xMm = -1;
  assert.equal(JSON.stringify(entries), before);
});

test('guide requires the authoritative accepted source for explicit and implicit supports', () => {
  const request = { position: { xMm: 700, yMm: 0, zMm: 18.2 }, yawRad: 0 };
  const entries = [{ placementId: 'base', request, status: 'COMPLETED', actualBrickId: null },
    { placementId: 'top', request: { ...request, supportPlacementId: 'base' }, status: 'PLANNED' }];
  assert.equal(pendingHumanGuide({ stream: { entries } }), null);
  entries[0].actualBrickId = 'accepted-source';
  assert.equal(pendingHumanGuide({ stream: { entries } }).supportBrickId, 'accepted-source');
});

test('Human marker prefers the second ready slot without reserving either actor', () => {
  const request = { position: { xMm: 700, yMm: 0, zMm: 8.6 }, yawRad: 0 };
  const entries = ['first', 'second'].map(placementId => ({ placementId, request, status: 'PLANNED' }));
  assert.equal(pendingHumanGuide({ stream: { entries } }).placementId, 'second');
  entries[1].status = 'EXECUTING';
  assert.equal(pendingHumanGuide({ stream: { entries } }).placementId, 'first');
});

test('guided12-target tower requires correct yaw, normal Human release, then adopts and continues', async () => {
  const h = await simpleHarness();
  const plan = createSimpleStructurePlan({ structure: 'cross_laminated_tower', height: 6, colour: 'red' }, { profile: h.profile });
  assert.equal(plan.blockCount, 12);
  const placements = toWebMcpPlacements(plan).map(p => ({ ...p, colour: null, preferredColour: 'red' }));
  await h.call('plan_placement_queue', { placements, streamId: 'guided12', mode: 'replace', finalChunk: true, expectedWorldRevision: h.controller.worldRevision });
  const blue = h.controller.getBricks().find(b => b.colour === 'blue');
  const human = new HumanBuildAdapter({ controller: h.controller, board: h.board, graph: h.graph, placementEngine: h.engine });
  assert.equal(human.pickup(blue.id).ok, true);
  const guide = pendingHumanGuide(h.coordinator, blue), revision = h.controller.worldRevision;
  assert.equal(previewHumanGuide({ guide, carried: blue, authority: h.authority, yawRad: guide.yawRad + Math.PI / 2 }).blockedReason, 'rotate_to_pending_target');
  assert.equal(h.controller.worldRevision, revision);
  const preview = previewHumanGuide({ guide, carried: blue, authority: h.authority, yawRad: guide.yawRad });
  assert.equal(preview.valid, true);
  assert.equal(h.board.getPlacements().length, 0);
  human.setPreview(preview);
  assert.equal(human.release().ok, true);
  assert.equal(h.coordinator.stream.byId.get(guide.placementId).status, 'ADOPTED');
  assert.equal((await h.runner.run({ cycleTimeMs: 2000, maximumPlacements: 12 })).ok, true);
  assert.equal(h.coordinator.summary().satisfiedPlacements, 12);
  assert.equal(h.board.getPlacements().filter(p => p.actor === 'human').length, 1);
  assert.equal(new Set(h.board.getPlacements().map(p => p.brickId)).size, 12);
});
