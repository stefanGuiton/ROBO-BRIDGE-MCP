import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

const supplied = JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url), 'utf8'));
const settings = { ...PLAYER_FALLBACK_SETTINGS, ...supplied };

function makeToolOnlyWorkcell() {
  const profile = createV8WorkcellProfile(settings);
  const generated = makeReachableV8Spawn(settings, profile);
  const clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock, mode: 'co-build' });
  const controller = new RobotController({
    board, bricks: generated.records, revisionClock: clock,
    workspace: profile.workspace, layout: profile.layout, timeScale: 0
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
  const fastPlacement = new PlacementLookaheadCoordinator({ controller, placementAuthority: authority, workcellProfile: profile });
  const runtime = createLogoRoboRuntime({ controller, board, placementAuthority: authority, fastPlacement, workcellProfile: profile });
  return { handlers: createLogoRoboToolHandlers({ bridge: createRuntimeBridge(runtime) }), board, graph, profile, fastPlacement, controller };
}

async function currentRevision(handlers) {
  return (await handlers.getRobotState()).worldRevision;
}

async function move(handlers, tcp) {
  const result = await handlers.moveTool({
    xMm: tcp.xMm, yMm: tcp.yMm, zMm: tcp.zMm,
    ...(Number.isFinite(tcp.yawDeg) ? { yawDeg: tcp.yawDeg } : {}),
    speedMmS: 650, expectedWorldRevision: await currentRevision(handlers)
  });
  assert.equal(result.ok, true, `move failed: ${result.reason ?? 'unknown'}`);
  return result;
}

async function placeBrick(handlers, brick, placementRequest) {
  const pickup = brick.reachability.pickupTcp;
  const pickupApproach = brick.reachability.safeApproachTcp;
  await move(handlers, pickupApproach);
  await move(handlers, pickup);
  const latch = await handlers.latch({ expectedWorldRevision: await currentRevision(handlers) });
  assert.equal(latch.ok, true, `latch failed: ${latch.reason ?? 'unknown'}`);
  await move(handlers, pickupApproach);

  const preview = await handlers.previewPlacement({
    brickId: brick.id,
    ...placementRequest,
    expectedWorldRevision: await currentRevision(handlers)
  });
  assert.equal(preview.ok, true, `preview failed: ${preview.reason ?? 'unknown'}`);
  await move(handlers, preview.approachTcp);
  await move(handlers, preview.requiredTcp);
  const unlatch = await handlers.unlatch({ expectedWorldRevision: await currentRevision(handlers) });
  assert.equal(unlatch.ok, true, `unlatch failed: ${unlatch.reason ?? 'unknown'}`);
  await move(handlers, preview.retreatTcp);
  return { preview, unlatch };
}

test('WebMCP plans five ghosts read-only and executes one accepted placement in one mutating call', async () => {
  const { handlers, profile, board } = makeToolOnlyWorkcell();
  const revision = await currentRevision(handlers);
  const centre = {
    xMm: (profile.buildZone.minX + profile.buildZone.maxX) / 2,
    yMm: (profile.buildZone.minY + profile.buildZone.maxY) / 2,
    zMm: profile.placementSurfaceZMm + settings.brickBodyHeightMm / 2
  };
  const planned = await handlers.planPlacementQueue({
    expectedWorldRevision: revision,
    placements: Array.from({ length: 5 }, (_, index) => ({
      position: { ...centre, xMm: centre.xMm + (index - 2) * 40 },
      yawRad: 0
    }))
  });
  assert.equal(planned.ok, true, planned.reason);
  assert.equal(planned.worldRevision, revision);
  assert.equal(planned.queueLength, 5);
  const startedAt = performance.now();
  const placed = await handlers.executeNextPlacement({
    proposalId: planned.queue[0].proposalId,
    physicalSpeedMmS: 650,
    playbackMultiplier: 40,
    expectedWorldRevision: revision
  });
  assert.equal(placed.ok, true, placed.reason);
  assert.ok(placed.playbackDurationMs < 2000);
  assert.ok(placed.executionWallDurationMs < 2500);
  assert.ok(performance.now() - startedAt < 2500);
  assert.equal(placed.remainingQueued, 4);
  assert.equal(board.getPlacements().length, 1);
});

test('an agent builds an interlocked three-brick wall using only primitive WebMCP handlers', async () => {
  const { handlers, board, graph, profile } = makeToolOnlyWorkcell();
  const scene = await handlers.getSceneState({ type: 'brick', limit: 20 });
  assert.equal(scene.ok, true);
  assert.equal(scene.worldRevision, (await handlers.getRobotState()).worldRevision);
  const available = scene.objects.filter((brick) => brick.state === 'free' && brick.reachability?.reachable);
  assert.ok(available.length >= 3);

  const baseZ = profile.placementSurfaceZMm + settings.brickBodyHeightMm / 2;
  const first = await placeBrick(handlers, available[0], { xMm: 700, yMm: -220, zMm: baseZ, yawDeg: 0 });
  const second = await placeBrick(handlers, available[1], { xMm: 732, yMm: -220, zMm: baseZ, yawDeg: 0 });
  assert.ok(Number.isFinite(first.preview.requiredTcp.yawDeg), 'placement preview must return the fixed-down tool yaw needed to honour brick yaw');
  const beforeRejectedPreview = await currentRevision(handlers);
  const mismatched = await handlers.previewPlacement({
    brickId: available[2].id,
    supportBrickId: available[0].id,
    supportSide: 'R',
    carriedSide: 'M',
    yawDeg: 0,
    expectedWorldRevision: beforeRejectedPreview
  });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.reason, 'connector_pair_mismatch');
  const rotatedSide = await handlers.previewPlacement({
    brickId: available[2].id,
    supportBrickId: available[0].id,
    supportSide: 'R',
    carriedSide: 'L',
    yawDeg: 90,
    expectedWorldRevision: beforeRejectedPreview
  });
  assert.equal(rotatedSide.ok, true);
  assert.equal(rotatedSide.candidate.relativeRotationDeg, 90);
  assert.equal(rotatedSide.candidate.studCount, 4);
  assert.equal(await currentRevision(handlers), beforeRejectedPreview, 'all WebMCP previews must remain read-only');
  const top = await placeBrick(handlers, available[2], {
    supportBrickId: available[0].id, supportSide: 'R', carriedSide: 'L', yawDeg: 0
  });

  assert.equal(first.unlatch.placementType, 'mat');
  assert.equal(second.unlatch.placementType, 'mat');
  assert.equal(top.unlatch.placementType, 'brick-connection');
  assert.equal(top.preview.candidate.relativeRotationDeg, 0);
  assert.equal(board.getPlacements().length, 3);
  const graphState = graph.snapshot();
  assert.equal(graphState.validation.pass, true);
  assert.equal(graphState.matRoots.length, 2);
  assert.ok(graphState.edges.length >= 2, 'top brick must bridge both base bricks');

  const finalScene = await handlers.getSceneState({ type: 'brick', limit: 20 });
  const placed = finalScene.objects.filter((brick) => [available[0].id, available[1].id, available[2].id].includes(brick.id));
  assert.ok(placed.every((brick) => brick.state === 'placed'));
  assert.equal((await handlers.getRobotState()).heldBrickId, null);
});
