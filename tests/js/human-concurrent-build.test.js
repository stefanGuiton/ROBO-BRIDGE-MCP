import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleHarness, simplePlacements } from '../helpers/simple-demo-harness.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';

async function setup() {
  const h = await simpleHarness();
  h.board.loadBlueprint({ blueprintId: 'simple-bricks', targets: [] }, { expectedWorldRevision: h.controller.worldRevision });
  h.adapter = new HumanBuildAdapter({ controller: h.controller, board: h.board, graph: h.graph, placementEngine: h.engine });
  h.blue = h.controller.getBricks().find(b => b.colour === 'blue');
  h.placements = simplePlacements({ width: 3, depth: 1, height: 1, prefix: 'shared' }, await h.call('get_workspace', {}))
    .map(p => ({ ...p, colour: 'red', preferredColour: null }));
  const plan = await h.call('plan_placement_queue', { streamId: 'shared', mode: 'replace', finalChunk: true,
    placements: h.placements, expectedWorldRevision: h.controller.worldRevision });
  assert.equal(plan.ok, true, plan.reason);
  return h;
}

function placeHeld(h, target, yawRad = 0) {
  const id = h.adapter.active.brickId;
  const position = { xMm: target.xMm, yMm: target.yMm, zMm: target.zMm };
  const preview = h.authority.preview({ brickId: id, position, yawRad });
  assert.equal(preview.ok, true, preview.reason);
  h.adapter.setPreview({ ...preview.candidate, carriedBrickId: id });
  const release = h.adapter.release();
  assert.equal(release.ok, true, JSON.stringify(release));
}

test('human picks up during motion and keeps carrying while all robot placements finish', { timeout: 10000 }, async () => {
  const h = await setup();
  let picked = false;
  const unsubscribe = h.controller.subscribe(event => {
    if (event.type === 'motion_started' && !picked) {
      picked = true;
      assert.equal(h.adapter.pickup(h.blue.id).ok, true);
      assert.equal(h.controller.getState().moving, true);
    }
  });
  try {
    const result = await h.runner.run({ cycleTimeMs: 250 });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.completedPlacements, 3);
    assert.equal(h.adapter.active.brickId, h.blue.id);
    assert.equal(h.controller.getBricks().find(b => b.id === h.blue.id).heldBy, 'human');
    assert.equal(h.controller.heldBrickId, null);
  } finally { unsubscribe(); h.adapter.cancel(); }
});

test('human blue placement during robot planning overrides a red future target without stopping stream', { timeout: 10000 }, async () => {
  const h = await setup();
  let edited = false;
  const unsubscribe = h.controller.subscribe(event => {
    if (event.type === 'motion_planning' && !edited) {
      edited = true;
      assert.equal(h.adapter.pickup(h.blue.id).ok, true);
      placeHeld(h, h.placements[2]);
    }
  });
  try {
    const result = await h.runner.run({ cycleTimeMs: 250 });
    assert.equal(result.ok, true, JSON.stringify(result));
    const status = h.coordinator.getStreamStatus({ streamId: 'shared', limit: 50 });
    assert.deepEqual(status.counts, { COMPLETED: 2, ADOPTED: 1 });
    assert.equal(h.controller.getBricks().find(b => b.id === h.blue.id).colour, 'blue');
  } finally { unsubscribe(); }
});

test('only active robot source is locked, future source is available and reassigned', { timeout: 10000 }, async () => {
  const h = await setup();
  const future = h.coordinator.getState().queue[1].brickId;
  let edited = false;
  const unsubscribe = h.controller.subscribe(event => {
    if (event.type === 'motion_started' && !edited) {
      edited = true;
      assert.equal(h.adapter.pickup(h.controller.activePlacementBrickId).reason, 'operation_in_progress');
      assert.equal(h.adapter.pickup(future).ok, true);
    }
  });
  try {
    const result = await h.runner.run({ cycleTimeMs: 250 });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.results.every(p => p.brickId !== future));
    assert.equal(h.adapter.active.brickId, future);
  } finally { unsubscribe(); h.adapter.cancel(); }
});

test('Simple sandbox adopts different human geometry and reopens targets when removed', async () => {
  const h = await setup();
  assert.equal(h.adapter.pickup(h.blue.id).ok, true);
  placeHeld(h, h.placements[1], Math.PI / 2);
  const entry = h.coordinator.getStreamStatus({ streamId: 'shared', limit: 50 }).entries[1];
  assert.equal(entry.status, 'ADOPTED');
  assert.equal(entry.actualBrickId, h.blue.id);
  h.adapter.pickup(h.blue.id);
  assert.notEqual(h.coordinator.getStreamStatus({ streamId: 'shared', limit: 50 }).entries[1].status, 'ADOPTED');
  h.adapter.cancel();
});

test('non-Simple compound lock and TEST mode remain enforced', async () => {
  const h = await setup();
  h.adapter.setMode('TEST');
  assert.equal(h.adapter.pickup(h.blue.id).reason, 'test_mode_locked');
  h.adapter.setMode('BUILD');
  h.board.loadBlueprint({ blueprintId: 'bridge', targets: [] }, { expectedWorldRevision: h.controller.worldRevision });
  const lease = h.controller.beginExclusiveOperation('fast-placement');
  assert.equal(h.adapter.pickup(h.blue.id).reason, 'operation_in_progress');
  h.controller.endExclusiveOperation(lease.token);
});

test('human takes active destination at release: robot parks spare and completes without overlap', { timeout: 15000 }, async () => {
  const h = await setup();
  h.controller.layout = { ...h.controller.layout, simulationMotionCollisions: false };
  let edited = false, rejectedRelease = null;
  const unlatch = h.controller.unlatch.bind(h.controller);
  h.controller.unlatch = async input => {
    const result = await unlatch(input);
    if (!result.ok) rejectedRelease = result.reason;
    return result;
  };
  const unsubscribe = h.controller.subscribe(event => {
    if (event.type === 'motion_started' && !edited && h.controller.heldBrickId
      && Math.hypot(event.target.xMm - h.placements[0].xMm, event.target.yMm - h.placements[0].yMm) < 1
      && event.target.zMm < 30) {
      edited = true;
      assert.equal(h.adapter.pickup(h.blue.id).ok, true);
      placeHeld(h, h.placements[0]);
    }
  });
  try {
    const result = await h.runner.run({ cycleTimeMs: 250 });
    assert.equal(edited, true);
    assert.equal(rejectedRelease, 'mat_occupied', JSON.stringify(result));
    assert.equal(result.ok, true, JSON.stringify(result));
    const status = h.coordinator.getStreamStatus({ streamId: 'shared', limit: 50 });
    assert.deepEqual(status.counts, { ADOPTED: 1, COMPLETED: 2 });
    assert.equal(status.entries[0].actualBrickId, h.blue.id);
    assert.ok(result.results[0].divertedBrickId);
    assert.equal(h.controller.heldBrickId, null);
    assert.equal(h.controller.operationBlocked(), false);
    const placed = h.board.getPlacements();
    assert.equal(placed.length, 4, 'human plus two planned bricks plus the parked spare');
    const cells = placed.flatMap(p => p.cells.map(c => JSON.stringify(c)));
    assert.equal(new Set(cells).size, cells.length, 'no duplicate occupied mat cells');
  } finally { unsubscribe(); }
});

test('takeover recovery remains cancellable and never reports a held spare as placed', { timeout: 10000 }, async () => {
  const h = await setup(), abort = new AbortController();
  h.controller.layout = { ...h.controller.layout, simulationMotionCollisions: false };
  let edited = false;
  const parking = h.coordinator.humanTakeoverParking.bind(h.coordinator);
  h.coordinator.humanTakeoverParking = proposal => {
    const preview = parking(proposal);
    assert.ok(preview);
    abort.abort();
    return preview;
  };
  const unsubscribe = h.controller.subscribe(event => {
    if (event.type === 'motion_started' && !edited && h.controller.heldBrickId
      && Math.hypot(event.target.xMm - h.placements[0].xMm, event.target.yMm - h.placements[0].yMm) < 1
      && event.target.zMm < 30) {
      edited = true;
      h.adapter.pickup(h.blue.id);
      placeHeld(h, h.placements[0]);
    }
  });
  try {
    const result = await h.runner.run({ cycleTimeMs: 250, signal: abort.signal });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'cancelled');
    assert.equal(h.board.getPlacements().length, 1);
    assert.ok(h.controller.heldBrickId);
    assert.equal(h.controller.operationBlocked(), false);
  } finally { unsubscribe(); }
});

test('no free parking remains a reported stop rather than overlapping or losing the held brick', { timeout: 10000 }, async () => {
  const h = await setup();
  h.controller.layout = { ...h.controller.layout, simulationMotionCollisions: false };
  let edited = false;
  const preview = h.authority.preview.bind(h.authority);
  const parking = h.coordinator.humanTakeoverParking.bind(h.coordinator);
  h.coordinator.humanTakeoverParking = proposal => {
    const revision = h.controller.worldRevision;
    h.authority.preview = () => ({ ok: false, reason: 'mat_occupied' });
    try {
      assert.equal(parking(proposal), null);
      assert.equal(h.controller.worldRevision, revision);
      return null;
    } finally { h.authority.preview = preview; }
  };
  const unsubscribe = h.controller.subscribe(event => {
    if (event.type === 'motion_started' && !edited && h.controller.heldBrickId
      && Math.hypot(event.target.xMm - h.placements[0].xMm, event.target.yMm - h.placements[0].yMm) < 1
      && event.target.zMm < 30) {
      edited = true;
      h.adapter.pickup(h.blue.id);
      placeHeld(h, h.placements[0]);
    }
  });
  try {
    const result = await h.runner.run({ cycleTimeMs: 250 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'mat_occupied');
    assert.equal(h.board.getPlacements().length, 1);
    assert.ok(h.controller.heldBrickId);
    assert.equal(h.controller.operationBlocked(), false);
  } finally { unsubscribe(); }
});
