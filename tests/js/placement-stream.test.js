import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { PlacementAuthority } from '../../apps/web/src/bricks/placement-authority.js';
import { createLogoRoboRuntime } from '../../apps/web/src/logo/runtime.js';
import { ConnectionGraph } from '../../apps/web/src/player/connection-graph.js';
import { PlacementIntentEngine } from '../../apps/web/src/player/placement-intent.js';
import { PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { makeReachableV8Spawn } from '../../apps/web/src/player/v8-spawn.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { PlacementLookaheadCoordinator } from '../../apps/web/src/robot/placement-lookahead.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { createLogoRoboToolHandlers } from '../../apps/web/src/webmcp/tool-handlers.js';
import { createRuntimeBridge } from '../../apps/web/src/webmcp/runtime-bridge.js';
import { createV8WorkcellProfile } from '../../apps/web/src/workcell/v8-workcell-profile.js';
import { SIMPLE_DEMO_CLEARANCE_MM } from '../../apps/web/src/logo/simple-demo-mode.js';

const supplied = JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url), 'utf8'));
const settings = { ...PLAYER_FALLBACK_SETTINGS, ...supplied };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeHarness({ brickCount = 12, timeScale = 0 } = {}) {
  const profile = createV8WorkcellProfile(settings);
  const generated = makeReachableV8Spawn(settings, profile);
  const clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock, mode: 'co-build' });
  const controller = new RobotController({
    board,
    bricks: generated.records.slice(0, brickCount),
    revisionClock: clock,
    workspace: profile.workspace,
    layout: profile.layout,
    timeScale
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
  // Exercise the production flat-table transfer policy with current table defaults.
  const lookahead = new PlacementLookaheadCoordinator({ controller, placementAuthority: authority, workcellProfile: { ...profile, safeClearanceZMm: SIMPLE_DEMO_CLEARANCE_MM } });
  const runtime = createLogoRoboRuntime({ controller, board, placementAuthority: authority, fastPlacement: lookahead, workcellProfile: profile });
  const handlers = createLogoRoboToolHandlers({ bridge: createRuntimeBridge(runtime) });
  const centre = {
    xMm: (profile.buildZone.minX + profile.buildZone.maxX) / 2,
    yMm: (profile.buildZone.minY + profile.buildZone.maxY) / 2,
    zMm: profile.placementSurfaceZMm + settings.brickBodyHeightMm / 2
  };
  return { profile, generated, clock, board, controller, authority, lookahead, runtime, handlers, centre };
}

function destinations(count, centre, { prefix = 'job', colour = null } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    placementId: `${prefix}-${String(index).padStart(4, '0')}`,
    colour,
    position: {
      ...centre,
      xMm: centre.xMm + ((index % 5) - 2) * 40,
      yMm: centre.yMm + (Math.floor(index / 5) % 4) * 32
    },
    yawRad: 0
  }));
}

function appendStream(lookahead, placements, streamId = 'stream-1') {
  let result = null;
  for (let offset = 0; offset < placements.length; offset += 50) {
    const chunk = placements.slice(offset, offset + 50);
    result = lookahead.planQueue(chunk, {
      streamId,
      mode: offset === 0 ? 'replace' : 'append',
      finalChunk: offset + chunk.length === placements.length
    });
    assert.equal(result.ok, true, result.reason);
    assert.ok(result.queueLength <= 5);
  }
  return result;
}

function statusEntry(lookahead, placementId, streamId = 'stream-1') {
  const status = lookahead.getStreamStatus({ streamId, cursor: 0, limit: 50 });
  assert.equal(status.ok, true, status.reason);
  return status.entries.find((entry) => entry.placementId === placementId);
}

function humanPlace({ controller, authority }, brickId, request) {
  const preview = authority.preview({ brickId, ...request });
  assert.equal(preview.ok, true, preview.reason);
  assert.equal(controller.beginHumanCarry(brickId).ok, true);
  const result = controller.commitHumanPlacement({
    brickId,
    position: preview.candidate.position,
    yawRad: preview.candidate.yawRad,
    supportBrickId: request.supportBrickId ?? null,
    supportSide: request.supportSide ?? 'M',
    carriedSide: request.carriedSide ?? null
  });
  assert.equal(result.ok, true, result.reason);
  return result;
}

test('two thousand logical placements append in bounded idempotent chunks with five active ghosts and paginated status', () => {
  const { lookahead, centre, clock } = makeHarness();
  const logical = destinations(2000, centre);
  const before = clock.value;
  const result = appendStream(lookahead, logical, 'large-stream');
  assert.equal(clock.value, before, 'stream planning must preserve worldRevision');
  assert.equal(result.stream.totalPlacements, 2000);
  assert.equal(result.queueLength, 5);
  assert.equal(lookahead.getRenderPreviews().length, 5);
  assert.equal(new Set(result.queue.map((proposal) => proposal.brickId)).size, 5);

  const page1 = lookahead.getStreamStatus({ streamId: 'large-stream', cursor: 0, limit: 37 });
  const page2 = lookahead.getStreamStatus({ streamId: 'large-stream', cursor: page1.nextCursor, limit: 37 });
  assert.equal(page1.entries.length, 37);
  assert.equal(page2.entries.length, 37);
  assert.equal(page1.totalAvailable, 2000);
  assert.equal(page1.nextCursor, 37);
  assert.equal(page2.cursor, 37);
  assert.equal(clock.value, before, 'status pagination must preserve worldRevision');

  const retry = lookahead.planQueue(logical.slice(-50), {
    streamId: 'large-stream', mode: 'append', finalChunk: true, expectedWorldRevision: before
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.appendedCount, 0);
  assert.equal(retry.duplicateCount, 50);
  assert.equal(retry.stream.totalPlacements, 2000);

  const afterFinal = lookahead.planQueue([{ ...logical[0], placementId: 'large-stream-after-final' }], {
    streamId: 'large-stream', mode: 'append', finalChunk: true, expectedWorldRevision: before
  });
  assert.equal(afterFinal.ok, false);
  assert.equal(afterFinal.reason, 'stream_finalized');

  const conflict = lookahead.planQueue([{ ...logical[0], yawRad: Math.PI / 2 }], {
    streamId: 'large-stream', mode: 'append', finalChunk: true, expectedWorldRevision: before
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'duplicate_placement_conflict');
  assert.equal(lookahead.getStreamStatus({ streamId: 'large-stream', limit: 1 }).totalPlacements, 2000);
});

test('human source interference repairs both the next and a future reservation deterministically', () => {
  const { lookahead, centre, controller, clock } = makeHarness();
  appendStream(lookahead, destinations(8, centre), 'source-stream');
  for (const slotIndex of [0, 4]) {
    const before = lookahead.getState();
    const stolen = before.queue[slotIndex];
    const moved = controller.moveLooseBrick(stolen.brickId, {
      ...stolen.brick.position,
      yMm: stolen.brick.position.yMm + 1
    }, { actor: 'human' });
    assert.equal(moved.ok, true);
    const repaired = lookahead.getState();
    const logical = repaired.queue.find((proposal) => proposal.placementId === stolen.placementId);
    assert.ok(logical);
    assert.notEqual(logical.brickId, stolen.brickId);
    assert.equal(logical.sourceReassigned, true);
    assert.equal(new Set(repaired.queue.map((proposal) => proposal.brickId)).size, repaired.queue.length);
    assert.ok(repaired.queue.every((proposal) => proposal.expectedWorldRevision === clock.value));
  }
});

test('correct human placements become ADOPTED, advance the window, and reopen after removal', () => {
  const harness = makeHarness();
  appendStream(harness.lookahead, destinations(7, harness.centre), 'adopt-stream');
  for (let count = 0; count < 2; count += 1) {
    const proposal = harness.lookahead.getState().queue[0];
    humanPlace(harness, proposal.brickId, {
      position: proposal.candidate.position,
      yawRad: proposal.candidate.yawRad
    });
    const entry = statusEntry(harness.lookahead, proposal.placementId, 'adopt-stream');
    assert.equal(entry.status, 'ADOPTED');
    assert.equal(entry.actor, 'human');
    assert.equal(entry.actualBrickId, proposal.brickId);
    assert.ok(harness.lookahead.getState().queue.length <= 5);
  }
  const adopted = harness.lookahead.getStreamStatus({ streamId: 'adopt-stream', limit: 50 }).entries
    .find((entry) => entry.status === 'ADOPTED');
  assert.equal(harness.controller.beginHumanCarry(adopted.actualBrickId).ok, true);
  const looseOrigin = harness.generated.records.find((brick) => brick.id === adopted.actualBrickId);
  assert.equal(harness.controller.commitHumanDrop({
    brickId: adopted.actualBrickId,
    position: looseOrigin.position,
    yawRad: looseOrigin.yawRad
  }).ok, true);
  const reopened = statusEntry(harness.lookahead, adopted.placementId, 'adopt-stream');
  assert.notEqual(reopened.status, 'ADOPTED');
  assert.equal(reopened.actualBrickId, null);
  assert.ok(
    harness.lookahead.getState().queue.some((proposal) => proposal.placementId === adopted.placementId),
    JSON.stringify({ reopened, queue: harness.lookahead.getState().queue.map((proposal) => proposal.placementId) })
  );
});

test('wrong colour and incompatible yaw block logical targets without overwriting human bricks', () => {
  for (const mismatch of ['colour', 'yaw']) {
    const harness = makeHarness();
    const red = harness.generated.records.find((brick) => brick.colour === 'red');
    const blue = harness.generated.records.find((brick) => brick.colour === 'blue');
    const placement = destinations(1, harness.centre, { colour: 'red' })[0];
    appendStream(harness.lookahead, [placement], `conflict-${mismatch}`);
    const brick = mismatch === 'colour' ? blue : red;
    humanPlace(harness, brick.id, {
      position: placement.position,
      yawRad: mismatch === 'yaw' ? Math.PI / 2 : 0
    });
    const status = harness.lookahead.getStreamStatus({ streamId: `conflict-${mismatch}`, limit: 20 });
    assert.equal(status.entries[0].status, 'BLOCKED');
    assert.equal(status.entries[0].reason, 'target_occupied_incompatible');
    assert.ok(status.entries[0].details.mismatch.includes(mismatch));
    assert.ok(harness.board.getPlacements().some((entry) => entry.brickId === brick.id), 'human brick must remain authoritative');
  }
});

test('incompatible connector geometry blocks without relocating the human structure', () => {
  const harness = makeHarness();
  const [support, wrongTop] = harness.generated.records;
  humanPlace(harness, support.id, { position: harness.centre, yawRad: 0 });
  const logical = {
    placementId: 'connector-top',
    supportBrickId: support.id,
    supportSide: 'R',
    carriedSide: 'L',
    yawRad: 0
  };
  appendStream(harness.lookahead, [logical], 'connector-stream');
  assert.equal(harness.lookahead.getState().queue.length, 1);
  humanPlace(harness, wrongTop.id, {
    supportBrickId: support.id,
    supportSide: 'M',
    carriedSide: 'M',
    yawRad: 0
  });
  const entry = harness.lookahead.getStreamStatus({ streamId: 'connector-stream', limit: 20 }).entries[0];
  assert.equal(entry.status, 'BLOCKED');
  assert.ok(entry.details.mismatch.includes('connector'));
  assert.ok(harness.board.getPlacements().some((placement) => placement.brickId === wrongTop.id));
});

test('agent completion reopens after human removal and dependencies wait for satisfied supports', async () => {
  const harness = makeHarness();
  const [base, top] = destinations(2, harness.centre);
  top.position = null;
  top.supportPlacementId = base.placementId;
  top.supportSide = 'M';
  top.carriedSide = 'M';
  appendStream(harness.lookahead, [base, top], 'dependency-stream');
  let status = harness.lookahead.getStreamStatus({ streamId: 'dependency-stream', limit: 20 });
  assert.equal(status.entries[1].status, 'WAITING_DEPENDENCY');
  assert.equal(status.activeQueue.length, 1);

  const first = harness.lookahead.getState().queue[0];
  const completed = await harness.lookahead.execute({ proposalId: first.proposalId, physicalSpeedMmS: 650, playbackMultiplier: 40 });
  assert.equal(completed.ok, true, completed.reason);
  status = harness.lookahead.getStreamStatus({ streamId: 'dependency-stream', limit: 20 });
  assert.equal(status.entries[0].status, 'COMPLETED');
  assert.equal(status.entries[1].status, 'PLANNED');
  assert.equal(status.entries[1].supportBrickId, completed.brickId);

  assert.equal(harness.controller.beginHumanCarry(completed.brickId).ok, true);
  status = harness.lookahead.getStreamStatus({ streamId: 'dependency-stream', limit: 20 });
  assert.notEqual(status.entries[0].status, 'COMPLETED');
  assert.equal(status.entries[1].status, 'WAITING_DEPENDENCY');
});

test('stale execution fails before motion after target or source changes', async () => {
  for (const interference of ['target', 'source']) {
    const harness = makeHarness();
    const placement = destinations(1, harness.centre)[0];
    const revision = harness.clock.value;
    const planned = harness.lookahead.planQueue([placement], {
      streamId: `stale-${interference}`, mode: 'replace', finalChunk: true, expectedWorldRevision: revision
    });
    const proposal = planned.queue[0];
    if (interference === 'target') {
      const other = harness.controller.getBricks().find((brick) => brick.id !== proposal.brickId);
      humanPlace(harness, other.id, { position: placement.position, yawRad: 0 });
    } else {
      assert.equal(harness.controller.beginHumanCarry(proposal.brickId).ok, true);
    }
    const tcpBefore = harness.controller.getState().tcp;
    const result = await harness.handlers.executeNextPlacement({
      proposalId: proposal.proposalId,
      physicalSpeedMmS: 650,
      playbackMultiplier: 40,
      expectedWorldRevision: revision
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'stale_state');
    assert.deepEqual(harness.controller.getState().tcp, tcpBefore);
  }
});

test('source exhaustion waits without losing the job and resumes when compatible bricks are added', async () => {
  const harness = makeHarness({ brickCount: 1 });
  appendStream(harness.lookahead, destinations(3, harness.centre), 'supply-stream');
  let status = harness.lookahead.getStreamStatus({ streamId: 'supply-stream', limit: 20 });
  assert.equal(status.activeQueue.length, 1);
  assert.equal(status.counts.WAITING_SOURCE, 2);
  const proposal = harness.lookahead.getState().queue[0];
  assert.equal((await harness.lookahead.execute({ proposalId: proposal.proposalId, physicalSpeedMmS: 650, playbackMultiplier: 40 })).ok, true);
  status = harness.lookahead.getStreamStatus({ streamId: 'supply-stream', limit: 20 });
  assert.equal(status.activeQueue.length, 0);
  assert.equal(status.counts.WAITING_SOURCE, 2);

  const added = harness.controller.addLooseBricks(harness.generated.records.slice(1, 3), { actor: 'human' });
  assert.equal(added.ok, true);
  status = harness.lookahead.getStreamStatus({ streamId: 'supply-stream', limit: 20 });
  assert.equal(status.activeQueue.length, 2);
  assert.equal(status.counts.PLANNED, 2);
});

test('reset invalidates the stream and abort cancellation leaves no late robot samples', async () => {
  const harness = makeHarness({ timeScale: 0.25 });
  appendStream(harness.lookahead, destinations(1, harness.centre), 'reset-stream');
  const proposal = harness.lookahead.getState().queue[0];
  const aborter = new AbortController();
  const execution = harness.lookahead.execute({
    proposalId: proposal.proposalId,
    physicalSpeedMmS: 80,
    playbackMultiplier: 1,
    signal: aborter.signal
  });
  await sleep(15);
  aborter.abort();
  const cancelled = await execution;
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.reason, 'cancelled');
  const cancelledStatus = harness.lookahead.getStreamStatus({ streamId: 'reset-stream', limit: 20 });
  assert.equal(cancelledStatus.counts.CANCELLED, 1);
  assert.equal(cancelledStatus.entries[0].status, 'CANCELLED');
  assert.equal(cancelledStatus.activeQueue.length, 0);
  assert.equal(cancelledStatus.remainingPlacements, 0);
  const stoppedTcp = harness.controller.getState().tcp;
  await sleep(30);
  assert.deepEqual(harness.controller.getState().tcp, stoppedTcp);

  const beforeReset = harness.controller.getState().worldRevision;
  await harness.runtime.robot.reset({ expectedWorldRevision: beforeReset });
  assert.equal(harness.lookahead.getState().stream.streamId, null);
  assert.equal(harness.lookahead.getStreamStatus({ streamId: 'reset-stream' }).reason, 'stream_not_found');
});

test('repeated mixed human and agent reconciliation is deterministic', () => {
  const signatures = [];
  for (let trial = 0; trial < 5; trial += 1) {
    const harness = makeHarness();
    const logical = destinations(7, harness.centre, { prefix: 'mixed' });
    logical[1].colour = 'red';
    appendStream(harness.lookahead, logical, 'mixed-stream');
    const future = harness.lookahead.getState().queue[4];
    assert.equal(harness.controller.moveLooseBrick(future.brickId, {
      ...future.brick.position,
      yMm: future.brick.position.yMm + 1
    }, { actor: 'human' }).ok, true);
    const first = harness.lookahead.getState().queue[0];
    humanPlace(harness, first.brickId, { position: first.candidate.position, yawRad: first.candidate.yawRad });
    const blue = harness.controller.getBricks().find((brick) => brick.colour === 'blue' && !brick.heldBy && !brick.placementType);
    humanPlace(harness, blue.id, { position: logical[1].position, yawRad: 0 });
    const status = harness.lookahead.getStreamStatus({ streamId: 'mixed-stream', limit: 20 });
    signatures.push(JSON.stringify({
      statuses: status.entries.map((entry) => [entry.placementId, entry.status, entry.sourceReassigned]),
      active: status.activeQueue.map((entry) => [entry.placementId, entry.sourceBrickId])
    }));
  }
  assert.equal(new Set(signatures).size, 1);
});

test('overlapping execute calls cannot both run and ten sequential placements retain bounded per-brick playback', async () => {
  const overlap = makeHarness({ timeScale: 0.05 });
  appendStream(overlap.lookahead, destinations(2, overlap.centre), 'overlap-stream');
  const next = overlap.lookahead.getState().queue[0];
  const firstPromise = overlap.lookahead.execute({ proposalId: next.proposalId, physicalSpeedMmS: 650, playbackMultiplier: 40 });
  const second = await overlap.lookahead.execute({ proposalId: next.proposalId, physicalSpeedMmS: 650, playbackMultiplier: 40 });
  const first = await firstPromise;
  assert.equal(first.ok, true, first.reason);
  assert.equal(second.ok, false);
  assert.equal(overlap.board.getPlacements().length, 1);

  const timing = makeHarness();
  appendStream(timing.lookahead, destinations(10, timing.centre, { prefix: 'timed' }), 'timing-stream');
  const measurements = [];
  while (timing.lookahead.getState().stream.remainingPlacements > 0) {
    const proposal = timing.lookahead.getState().queue[0];
    assert.ok(proposal, JSON.stringify(timing.lookahead.getStreamStatus({ streamId: 'timing-stream', limit: 50 })));
    const result = await timing.lookahead.execute({ proposalId: proposal.proposalId, physicalSpeedMmS: 650, playbackMultiplier: 40 });
    assert.equal(result.ok, true, result.reason);
    measurements.push(result);
    assert.ok(timing.lookahead.getState().queue.length <= 5);
  }
  assert.equal(measurements.length, 10);
  assert.ok(measurements.every((result) => result.playbackDurationMs < 2000));
  assert.equal(timing.board.getPlacements().length, 10);
});
