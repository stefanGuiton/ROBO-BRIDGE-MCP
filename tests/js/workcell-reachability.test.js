import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { makeReachableV8MoreSpawn, makeReachableV8Spawn } from '../../apps/web/src/player/v8-spawn.js';
import { createV8WorkcellProfile, pointInsideZone } from '../../apps/web/src/workcell/v8-workcell-profile.js';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { PlacementAuthority } from '../../apps/web/src/bricks/placement-authority.js';
import { ConnectionGraph } from '../../apps/web/src/player/connection-graph.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';
import { PlacementIntentEngine } from '../../apps/web/src/player/placement-intent.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { FastPlacementCoordinator } from '../../apps/web/src/robot/fast-placement.js';
import { PlacementLookaheadCoordinator } from '../../apps/web/src/robot/placement-lookahead.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { createLogoRoboRuntime, placedBuildBounds } from '../../apps/web/src/logo/runtime.js';
import { createObservationService } from '../../apps/web/src/perception/observation-service.js';
import { createRuntimeBridge } from '../../apps/web/src/webmcp/runtime-bridge.js';
import { projectObjectBounds } from '../../apps/web/src/perception/projection.js';

const supplied = JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url), 'utf8'));
const settings = { ...PLAYER_FALLBACK_SETTINGS, ...supplied };

function makeFastPlacementHarness() {
  const profile = createV8WorkcellProfile(settings);
  const generated = makeReachableV8Spawn(settings, profile);
  const clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock, mode: 'co-build' });
  const controller = new RobotController({
    board,
    bricks: [generated.records[0]],
    revisionClock: clock,
    workspace: profile.workspace,
    layout: profile.layout,
    timeScale: 0
  });
  const graph = new ConnectionGraph(settings);
  const placementEngine = new PlacementIntentEngine(settings, board, graph);
  placementEngine.configureTableFrame({
    centre: {
      xMm: (profile.matBounds.minX + profile.matBounds.maxX) / 2,
      yMm: (profile.matBounds.minY + profile.matBounds.maxY) / 2
    },
    yawRad: 0,
    placementSurfaceZMm: profile.placementSurfaceZMm,
    widthMm: settings.matWidthMm,
    depthMm: settings.matDepthMm
  });
  const authority = new PlacementAuthority({
    board, graph, placementEngine, settings,
    getBricks: () => controller.getBricks(), profile
  });
  assert.equal(controller.setPlacementAuthority(authority), true);
  const fastPlacement = new FastPlacementCoordinator({ controller, placementAuthority: authority, workcellProfile: profile });
  const target = {
    xMm: (profile.buildZone.minX + profile.buildZone.maxX) / 2,
    yMm: (profile.buildZone.minY + profile.buildZone.maxY) / 2,
    zMm: profile.placementSurfaceZMm + settings.brickBodyHeightMm / 2
  };
  return { profile, controller, board, fastPlacement, brick: generated.records[0], target, clock };
}

function makeLookaheadHarness() {
  const profile = createV8WorkcellProfile(settings);
  const generated = makeReachableV8Spawn(settings, profile);
  const clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock, mode: 'co-build' });
  const controller = new RobotController({
    board,
    bricks: generated.records.slice(0, 8),
    revisionClock: clock,
    workspace: profile.workspace,
    layout: profile.layout,
    timeScale: 0
  });
  const graph = new ConnectionGraph(settings);
  const placementEngine = new PlacementIntentEngine(settings, board, graph);
  placementEngine.configureTableFrame({
    centre: {
      xMm: (profile.matBounds.minX + profile.matBounds.maxX) / 2,
      yMm: (profile.matBounds.minY + profile.matBounds.maxY) / 2
    },
    yawRad: 0,
    placementSurfaceZMm: profile.placementSurfaceZMm,
    widthMm: settings.matWidthMm,
    depthMm: settings.matDepthMm
  });
  const authority = new PlacementAuthority({
    board, graph, placementEngine, settings,
    getBricks: () => controller.getBricks(), profile
  });
  assert.equal(controller.setPlacementAuthority(authority), true);
  const lookahead = new PlacementLookaheadCoordinator({ controller, placementAuthority: authority, workcellProfile: profile });
  const centre = {
    xMm: (profile.buildZone.minX + profile.buildZone.maxX) / 2,
    yMm: (profile.buildZone.minY + profile.buildZone.maxY) / 2,
    zMm: profile.placementSurfaceZMm + settings.brickBodyHeightMm / 2
  };
  const placements = Array.from({ length: 5 }, (_, index) => ({
    position: { ...centre, xMm: centre.xMm + (index - 2) * 40 },
    yawRad: 0
  }));
  return { profile, controller, board, lookahead, placements, clock };
}

test('V8 workcell maps the visible supply and mat into one validated machine frame', () => {
  const profile = createV8WorkcellProfile(settings);
  assert.equal(profile.tableSurfaceZMm, 0);
  assert.ok(profile.supplyZone.maxX < profile.matBounds.minX);
  assert.ok(profile.buildZone.minX >= profile.matBounds.minX);
  assert.ok(profile.buildZone.maxX <= profile.workspace.xMaxMm);
  assert.ok(profile.recommendedTransferTcp.zMm >= profile.workspace.safeClearanceZMm);
  assert.ok(Math.abs(profile.tableFrame.xAxis[0] * profile.tableFrame.yAxis[0] + profile.tableFrame.xAxis[1] * profile.tableFrame.yAxis[1]) < 1e-9);
});

test('reachable V8 spawn is deterministic, non-overlapping, and guarantees red/blue inventory', () => {
  const profile = createV8WorkcellProfile(settings);
  const first = makeReachableV8Spawn(settings, profile);
  const second = makeReachableV8Spawn(settings, profile);
  assert.equal(first.ok, true);
  assert.deepEqual(first.records, second.records);
  assert.equal(first.records.length, settings.spawnCount);
  assert.ok(first.records.filter((brick) => brick.colour === 'red').length >= 2);
  assert.ok(first.records.filter((brick) => brick.colour === 'blue').length >= 2);
  for (const brick of first.records) {
    assert.equal(brick.reachability.reachable, true);
    assert.ok(pointInsideZone(brick.position, profile.supplyZone));
    assert.equal(brick.reachability.pickupTcp.xMm, brick.position.xMm);
    assert.equal(brick.reachability.pickupTcp.yMm, brick.position.yMm);
  }
  for (let left = 0; left < first.records.length; left += 1) {
    for (let right = left + 1; right < first.records.length; right += 1) {
      assert.ok(Math.hypot(
        first.records[left].position.xMm - first.records[right].position.xMm,
        first.records[left].position.yMm - first.records[right].position.yMm
      ) >= 38);
    }
  }
});

test('twenty-five deterministic seeds all produce a complete reachable inventory', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const profile = createV8WorkcellProfile(settings);
    const result = makeReachableV8Spawn({ ...settings, seed }, profile, { seed });
    assert.equal(result.ok, true, `seed ${seed}: ${result.reason ?? 'unknown'}`);
    assert.equal(result.records.length, settings.spawnCount);
    assert.ok(result.records.every((brick) => brick.reachability?.reachable === true));
  }
});

test('MORE BRICKS uses unused reachable slots and preserves unique IDs', () => {
  const profile = createV8WorkcellProfile(settings);
  const initial = makeReachableV8Spawn(settings, profile);
  const added = makeReachableV8MoreSpawn(settings, profile, 1, initial.records, { startIndex: initial.records.length });
  assert.equal(added.ok, true);
  assert.equal(added.records.length, 10);
  assert.equal(new Set([...initial.records, ...added.records].map((brick) => brick.id)).size, 22);
  assert.ok(added.records.every((brick) => brick.reachability.pendingPhysicsSettle === true));
});

test('human and robot-facing previews share one placement authority and board', async () => {
  const profile = createV8WorkcellProfile(settings);
  const generated = makeReachableV8Spawn(settings, profile);
  const clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock, mode: 'co-build' });
  const controller = new RobotController({
    board,
    bricks: generated.records,
    revisionClock: clock,
    workspace: profile.workspace,
    layout: profile.layout,
    timeScale: 0
  });
  const graph = new ConnectionGraph(settings);
  const placementEngine = new PlacementIntentEngine(settings, board, graph);
  placementEngine.configureTableFrame({
    centre: {
      xMm: (profile.matBounds.minX + profile.matBounds.maxX) / 2,
      yMm: (profile.matBounds.minY + profile.matBounds.maxY) / 2
    },
    yawRad: 0,
    placementSurfaceZMm: profile.placementSurfaceZMm,
    widthMm: settings.matWidthMm,
    depthMm: settings.matDepthMm
  });
  const authority = new PlacementAuthority({
    board,
    graph,
    placementEngine,
    settings,
    getBricks: () => controller.getBricks(),
    profile
  });
  assert.equal(controller.setPlacementAuthority(authority), true);
  const first = generated.records[0];
  const before = clock.value;
  const preview = authority.preview({
    brickId: first.id,
    position: {
      xMm: profile.buildZone.minX + 80,
      yMm: profile.buildZone.minY + 80,
      zMm: profile.placementSurfaceZMm + settings.brickBodyHeightMm / 2
    },
    yawRad: 0
  });
  assert.equal(preview.ok, true);
  assert.equal(clock.value, before, 'preview must remain read-only');
  assert.equal(controller.beginHumanCarry(first.id).ok, true);
  const beforePlacement = clock.value;
  const placed = controller.commitHumanPlacement({
    brickId: first.id,
    position: preview.candidate.position,
    yawRad: preview.candidate.yawRad,
    placementType: preview.candidate.placementType
  });
  assert.equal(placed.ok, true);
  assert.equal(placed.placementAuthorityApplied, true);
  assert.equal(clock.value, beforePlacement + 1, 'an accepted placement must increment the shared revision exactly once');
  assert.equal(board.getPlacements().length, 1);
  assert.ok(board.getPlacements()[0].cells.length > 0, 'BuildBoard must retain the occupancy cells needed to rebuild derived state');
  assert.equal(graph.snapshot().matRoots.includes(first.id), true);

  graph.registerMatRoot('ghost-root', [[999, 999]]);

  const second = generated.records[1];
  const stacked = authority.preview({
    brickId: second.id,
    supportBrickId: first.id,
    supportSide: 'M',
    carriedSide: 'M',
    yawRad: 0
  });
  assert.equal(stacked.ok, true);
  assert.equal(graph.snapshot().matRoots.includes('ghost-root'), false, 'preview must discard graph-only state');
  assert.equal(graph.snapshot().matRoots.includes(first.id), true, 'preview must rebuild the graph from BuildBoard');
  assert.ok(stacked.requiredTcp.zMm > preview.requiredTcp.zMm);

  const beforeRejectedPreviews = clock.value;
  const mismatchedPair = authority.preview({
    brickId: second.id,
    supportBrickId: first.id,
    supportSide: 'R',
    carriedSide: 'M',
    yawRad: 0
  });
  assert.equal(mismatchedPair.ok, false);
  assert.equal(mismatchedPair.reason, 'connector_pair_mismatch');
  const perpendicular = authority.preview({
    brickId: second.id,
    supportBrickId: first.id,
    supportSide: 'M',
    carriedSide: 'M',
    yawRad: Math.PI / 2
  });
  assert.equal(perpendicular.ok, false);
  assert.equal(perpendicular.reason, 'perpendicular_connection_forbidden');
  assert.equal(clock.value, beforeRejectedPreviews, 'rejected connector previews must not mutate worldRevision');

  const parallelHalfTurn = authority.preview({
    brickId: second.id,
    supportBrickId: first.id,
    supportSide: 'M',
    carriedSide: 'M',
    yawRad: Math.PI
  });
  assert.equal(parallelHalfTurn.ok, true, 'a physically equivalent 180 degree input remains parallel');
  assert.equal(parallelHalfTurn.candidate.relativeRotationDeg, 180);
  assert.equal(parallelHalfTurn.candidate.studCount, 8);

  const rotatedSide = authority.preview({
    brickId: second.id,
    supportBrickId: first.id,
    supportSide: 'R',
    carriedSide: 'L',
    yawRad: Math.PI / 2
  });
  assert.equal(rotatedSide.ok, true, 'side connector pairs must retain quarter-turn rotation');
  assert.equal(rotatedSide.candidate.relativeRotationDeg, 90);
  assert.equal(rotatedSide.candidate.studCount, 4);

  const human = new HumanBuildAdapter({ controller, board, graph, placementEngine });
  assert.equal(human.pickup(second.id).ok, true);
  assert.equal(human.setPreview(mismatchedPair.candidate), true);
  const beforeRejectedRelease = clock.value;
  const rejectedRelease = human.release();
  assert.equal(rejectedRelease.ok, false);
  assert.equal(rejectedRelease.reason, 'CONNECTOR_PAIR_MISMATCH');
  assert.equal(rejectedRelease.keepHolding, true);
  assert.equal(human.getState().heldBrickId, second.id);
  assert.equal(clock.value, beforeRejectedRelease, 'rejected human release must preserve worldRevision');
  assert.equal(human.cancel().ok, true);

  const runtime = createLogoRoboRuntime({
    controller,
    board,
    placementAuthority: authority,
    workcellProfile: profile,
    getUserCamera: () => ({
      position: [415, -1050, 420],
      target: [415, -360, 5],
      up: [0, 0, 1],
      projection: 'perspective',
      fovYDeg: 62,
      nearMm: 2,
      farMm: 12000
    })
  });
  for (const cameraId of ['tray_camera', 'canvas_camera', 'top_camera', 'left_camera', 'right_camera', 'user_camera']) {
    const camera = runtime.world.getCamera(cameraId, { widthPx: 640, heightPx: 360 });
    const probePosition = ['canvas_camera', 'top_camera', 'left_camera', 'right_camera'].includes(cameraId)
      ? placed.brick.position
      : generated.records[1].position;
    assert.equal(camera.id, cameraId);
    assert.equal(camera.worldRevision, clock.value);
    assert.ok(projectObjectBounds({
      position: probePosition,
      bounds: { xMm: 31.8, yMm: 15.8, zMm: 9.6 }
    }, camera), `${cameraId} must project the shared V8 workcell`);
  }
  const observation = await createObservationService({ bridge: createRuntimeBridge(runtime) })
    .observe({ cameraId: 'tray_camera', type: 'brick', limit: 20 });
  assert.equal(observation.ok, true);
  assert.ok(observation.detections.length >= 4, `the active V8 supply camera exposed only ${observation.detections.length} reachable bricks`);
  assert.ok(observation.detections.some((detection) => detection.colour === 'red'));
  assert.ok(observation.detections.some((detection) => detection.colour === 'blue'));
  assert.ok(observation.detections.every((detection) => detection.reachable === true));
  const humanObservation = await createObservationService({ bridge: createRuntimeBridge(runtime) })
    .observe({ cameraId: 'user_camera', type: 'brick', limit: 20 });
  assert.equal(humanObservation.ok, true);
  assert.ok(humanObservation.detections.length > 0);
  assert.equal(humanObservation.snapshotRevision, clock.value);
});

test('five-slot look-ahead is read-only, reserves unique sources, and caches staple trajectories', () => {
  const { lookahead, placements, clock } = makeLookaheadHarness();
  const before = clock.value;
  const stale = lookahead.planQueue(placements, { expectedWorldRevision: before + 1 });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale_state');
  const result = lookahead.planQueue(placements, { expectedWorldRevision: before });
  assert.equal(result.ok, true, result.reason);
  assert.equal(clock.value, before, 'look-ahead planning must not mutate the world');
  assert.equal(result.queue.length, 5);
  assert.equal(new Set(result.queue.map((proposal) => proposal.brickId)).size, 5);
  assert.deepEqual(result.queue.map((proposal) => proposal.slotLabel), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(lookahead.getRenderPreviews().length, 5);
  for (const proposal of result.queue) {
    assert.equal(proposal.trajectory.shape, 'staple-up-across-down');
    assert.deepEqual(proposal.trajectory.waypoints.map((waypoint) => waypoint.stage), [
      'source_approach','source_descend','capture','source_lift','transfer','target_descend','release','target_retreat'
    ]);
    assert.equal(proposal.trajectory.waypoints[0].tcp.zMm, proposal.trajectory.waypoints[3].tcp.zMm);
    assert.equal(proposal.trajectory.waypoints[3].tcp.zMm, proposal.trajectory.waypoints[4].tcp.zMm);
  }
});

test('a human taking a reserved source repairs the queue with the nearest free replacement', () => {
  const { lookahead, placements, controller, clock } = makeLookaheadHarness();
  const planned = lookahead.planQueue(placements);
  assert.equal(planned.ok, true);
  const stolen = planned.queue[0];
  const revisionBeforeHumanMove = clock.value;
  const moved = controller.moveLooseBrick(
    stolen.brickId,
    { ...stolen.brick.position, yMm: stolen.brick.position.yMm + 1 },
    { actor: 'human' }
  );
  assert.equal(moved.ok, true);
  assert.equal(clock.value, revisionBeforeHumanMove + 1);
  const repaired = lookahead.getState();
  assert.equal(repaired.queue.length, 5);
  assert.notEqual(repaired.queue[0].brickId, stolen.brickId);
  assert.equal(repaired.queue[0].sourceReassigned, true);
  assert.equal(new Set(repaired.queue.map((proposal) => proposal.brickId)).size, 5);
  assert.ok(repaired.queue.every((proposal) => proposal.expectedWorldRevision === clock.value));
});

test('look-ahead executes only the next proposal and repairs the remaining cache', async () => {
  const { lookahead, placements, board } = makeLookaheadHarness();
  const planned = lookahead.planQueue(placements.slice(0, 2));
  assert.equal(planned.ok, true);
  const rejected = await lookahead.execute({ proposalId: planned.queue[1].proposalId, physicalSpeedMmS: 650, playbackMultiplier: 40 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'invalid_input');
  const result = await lookahead.execute({ proposalId: planned.queue[0].proposalId, physicalSpeedMmS: 650, playbackMultiplier: 40 });
  assert.equal(result.ok, true, result.reason);
  assert.ok(result.playbackDurationMs < 2000);
  assert.equal(result.remainingQueued, 1);
  assert.equal(board.getPlacements().length, 1);
  const remaining = lookahead.getState();
  assert.equal(remaining.queue.length, 1);
  assert.equal(remaining.queue[0].status, 'VALID');
  assert.equal(remaining.queue[0].expectedWorldRevision, remaining.worldRevision);
});

test('fast ghost proposal is read-only, revision-locked, WebMCP-visible, and exposes cyan render state', () => {
  const { fastPlacement, target, clock, brick, controller, board, profile } = makeFastPlacementHarness();
  const before = clock.value;
  const preview = fastPlacement.preview({ brickId: brick.id, position: target, yawRad: 0 });
  assert.equal(preview.status, 'VALID');
  assert.equal(clock.value, before, 'ghost planning must not mutate authoritative state');
  assert.equal(fastPlacement.getRenderPreview().proposal, true);
  assert.equal(fastPlacement.getRenderPreview().valid, true);
  const runtime = createLogoRoboRuntime({
    controller,
    board,
    placementAuthority: fastPlacement.placementAuthority,
    workcellProfile: profile,
    placementPreviewObserver: (request) => fastPlacement.preview({
      brickId: request.brickId,
      position: { xMm: request.xMm, yMm: request.yMm, zMm: request.zMm },
      yawRad: Number(request.yawDeg ?? 0) * Math.PI / 180
    })
  });
  const webPreview = runtime.world.previewPlacement({
    brickId: brick.id,
    ...target,
    yawDeg: 0,
    expectedWorldRevision: before
  });
  assert.equal(webPreview.ok, true);
  assert.equal(fastPlacement.getState().status, 'VALID');
  assert.equal(clock.value, before, 'WebMCP preview visibility must remain read-only');
  const moved = controller.moveLooseBrick(brick.id, { ...brick.position, yMm: brick.position.yMm + 1 }, { actor: 'human' });
  assert.equal(moved.ok, true);
  assert.equal(fastPlacement.getState().status, 'STALE');
});

test('fast placement keeps physical limits unchanged and completes displayed playback below two seconds', async () => {
  const { fastPlacement, target, brick, controller, board } = makeFastPlacementHarness();
  assert.equal(fastPlacement.preview({ brickId: brick.id, position: target, yawRad: 0 }).status, 'VALID');
  const physicalLimits = {
    speed: controller.getState().speedLimitMmS,
    acceleration: controller.getState().accelerationLimitMmS2,
    jointSpeed: controller.getState().jointSpeedLimitRadS,
    jointAcceleration: controller.getState().jointAccelerationLimitRadS2
  };
  const startedAt = performance.now();
  const execution = fastPlacement.execute({ physicalSpeedMmS: 650, playbackMultiplier: 40 });
  const concurrent = await controller.latch({ actor: 'human' });
  assert.equal(concurrent.reason, 'operation_in_progress', 'exclusive compound motion must reject overlapping control');
  const result = await execution;
  const elapsedMs = performance.now() - startedAt;
  assert.equal(result.ok, true, result.reason);
  assert.ok(result.playbackDurationMs < 2000, `reported playback was ${result.playbackDurationMs} ms`);
  assert.ok(elapsedMs < 2500, `accept-to-release/retreat took ${elapsedMs.toFixed(0)} ms`);
  assert.equal(board.getPlacements().length, 1);
  assert.deepEqual({
    speed: controller.getState().speedLimitMmS,
    acceleration: controller.getState().accelerationLimitMmS2,
    jointSpeed: controller.getState().jointSpeedLimitRadS,
    jointAcceleration: controller.getState().jointAccelerationLimitRadS2
  }, physicalLimits);
  assert.equal(controller.getState().simulationPlaybackMultiplier, 40);
});

test('reset cancels fast compound motion and prevents stale samples from committing afterward', async () => {
  const { fastPlacement, target, brick, controller } = makeFastPlacementHarness();
  assert.equal(fastPlacement.preview({ brickId: brick.id, position: target, yawRad: 0 }).status, 'VALID');
  const execution = fastPlacement.execute({ physicalSpeedMmS: 80, playbackMultiplier: 1 });
  await new Promise((resolve) => setTimeout(resolve, 15));
  const resetState = await controller.reset();
  const result = await execution;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(controller.getState().tcp, resetState.tcp);
  assert.equal(controller.getState().heldBrickId, null);
});

test('twenty fast-placement trials preserve one controller/board authority', async () => {
  for (let trial = 0; trial < 20; trial += 1) {
    const { fastPlacement, target, brick, controller, board } = makeFastPlacementHarness();
    const offsetTarget = { ...target, xMm: target.xMm + (trial % 4) * 8, yMm: target.yMm + Math.floor(trial / 4) * 8 };
    assert.equal(fastPlacement.preview({ brickId: brick.id, position: offsetTarget, yawRad: (trial % 2) * Math.PI / 2 }).status, 'VALID', `trial ${trial + 1} preview`);
    const result = await fastPlacement.execute({ physicalSpeedMmS: 650, playbackMultiplier: 40 });
    assert.equal(result.ok, true, `trial ${trial + 1}: ${result.reason ?? 'unknown'}`);
    assert.ok(result.playbackDurationMs < 2000, `trial ${trial + 1} exceeded displayed target`);
    assert.equal(board.getPlacements().length, 1);
    assert.equal(controller.getBricks().filter((candidate) => candidate.placementType).length, 1);
  }
});

test('human bridge placement preserves its preview anchor and both support connections', () => {
  const profile = createV8WorkcellProfile(settings);
  const generated = makeReachableV8Spawn(settings, profile);
  const clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock, mode: 'co-build' });
  const controller = new RobotController({
    board,
    bricks: generated.records,
    revisionClock: clock,
    workspace: profile.workspace,
    layout: profile.layout,
    timeScale: 0
  });
  const graph = new ConnectionGraph(settings);
  const placementEngine = new PlacementIntentEngine(settings, board, graph);
  placementEngine.configureTableFrame({
    centre: {
      xMm: (profile.matBounds.minX + profile.matBounds.maxX) / 2,
      yMm: (profile.matBounds.minY + profile.matBounds.maxY) / 2
    },
    yawRad: 0,
    placementSurfaceZMm: profile.placementSurfaceZMm,
    widthMm: settings.matWidthMm,
    depthMm: settings.matDepthMm
  });
  const authority = new PlacementAuthority({
    board, graph, placementEngine, settings,
    getBricks: () => controller.getBricks(), profile
  });
  assert.equal(controller.setPlacementAuthority(authority), true);
  const adapter = new HumanBuildAdapter({ controller, board, graph, placementEngine });
  const [left, right, bridge] = generated.records;
  const baseZ = profile.placementSurfaceZMm + settings.brickBodyHeightMm / 2;

  for (const [brick, xMm] of [[left, 700], [right, 732]]) {
    const preview = authority.preview({ brickId: brick.id, position: { xMm, yMm: -220, zMm: baseZ }, yawRad: 0 });
    assert.equal(preview.ok, true);
    assert.equal(controller.beginHumanCarry(brick.id).ok, true);
    const result = controller.commitHumanPlacement({
      brickId: brick.id,
      position: preview.candidate.position,
      yawRad: preview.candidate.yawRad,
      placementType: preview.candidate.placementType
    });
    assert.equal(result.ok, true);
  }

  const bridgePreview = authority.preview({
    brickId: bridge.id,
    supportBrickId: left.id,
    supportSide: 'R',
    carriedSide: 'L',
    yawRad: 0
  });
  assert.equal(bridgePreview.ok, true);
  assert.ok(bridgePreview.candidate.connections.length >= 2, 'preview must span both base bricks');
  assert.equal(adapter.pickup(bridge.id).ok, true);
  assert.equal(adapter.setPreview(bridgePreview.candidate), true);
  const released = adapter.release();
  assert.equal(released.ok, true);
  assert.deepEqual(released.position, bridgePreview.candidate.position, 'commit must preserve the previewed bridge centre');
  assert.equal(released.yawRad, bridgePreview.candidate.yawRad);

  const placement = board.getPlacements().find((candidate) => candidate.brickId === bridge.id);
  assert.ok(placement.connections.length >= 2, 'BuildBoard must retain both bridge supports');
  assert.ok(controller.getBricks().find((brick) => brick.id === bridge.id).connection.groups.length >= 2);
  assert.ok(graph.snapshot().edges.length >= 2);

  const runtime = createLogoRoboRuntime({ controller, board, placementAuthority: authority, workcellProfile: profile });
  const placedObjects = runtime.world.getSnapshotData().objects.filter((object) => [left.id, right.id, bridge.id].includes(object.id));
  const bounds = placedBuildBounds(placedObjects);
  const expectedTarget = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2
  ];
  for (const cameraId of ['canvas_camera', 'top_camera', 'left_camera', 'right_camera']) {
    const camera = runtime.world.getCamera(cameraId, { widthPx: 640, heightPx: 360 });
    assert.ok(camera.target.every((value, index) => Math.abs(value - expectedTarget[index]) < 0.01), `${cameraId} must target the placed-build centroid`);
    assert.ok(placedObjects.every((object) => projectObjectBounds(object, camera)), `${cameraId} must fit every placed brick`);
  }
});
