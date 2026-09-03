import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { PlacementAuthority } from '../../apps/web/src/bricks/placement-authority.js';
import { ConnectionGraph } from '../../apps/web/src/player/connection-graph.js';
import { PlacementIntentEngine } from '../../apps/web/src/player/placement-intent.js';
import { PLAYER_FALLBACK_SETTINGS } from '../../apps/web/src/player/player-settings.js';
import { makeReachableV8Spawn } from '../../apps/web/src/player/v8-spawn.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { PlacementLookaheadCoordinator } from '../../apps/web/src/robot/placement-lookahead.js';
import { PlannedPlacementCycleRunner } from '../../apps/web/src/robot/placement-cycle-runner.js';
import {
  createSimpleStructurePlan,
  ROBOT_SHOWCASE_INVENTORY,
  toWebMcpPlacements
} from '../../apps/web/src/robot/simple-structure-planner.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { createV8WorkcellProfile } from '../../apps/web/src/workcell/v8-workcell-profile.js';
import { SIMPLE_DEMO_CLEARANCE_MM } from '../../apps/web/src/logo/simple-demo-mode.js';

const supplied = JSON.parse(await readFile(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url), 'utf8'));
const settings = { ...PLAYER_FALLBACK_SETTINGS, ...supplied };

function inventoryCounts(records) {
  const counts = {};
  for (const record of records) counts[record.colour] = (counts[record.colour] ?? 0) + 1;
  return counts;
}

function makeHarness(colours, { timeScale = 0 } = {}) {
  const profile = createV8WorkcellProfile(settings);
  const generated = makeReachableV8Spawn(settings, profile, { count: colours.length, colours });
  assert.equal(generated.ok, true, generated.reason);
  const clock = new RevisionClock();
  const board = new BuildBoard([], { revisionClock: clock, mode: 'co-build' });
  const controller = new RobotController({
    board,
    bricks: generated.records,
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
    board,
    graph,
    placementEngine,
    settings,
    getBricks: () => controller.getBricks(),
    profile
  });
  assert.equal(controller.setPlacementAuthority(authority), true);
  // The production Simple mode uses a 250 mm transfer clearance. Keep this
  // planner/integration harness on that same safe, non-singular path policy.
  const simpleProfile = { ...profile, safeClearanceZMm: SIMPLE_DEMO_CLEARANCE_MM };
  const coordinator = new PlacementLookaheadCoordinator({ controller, placementAuthority: authority, workcellProfile: simpleProfile });
  assert.equal(coordinator.workcellProfile.safeClearanceZMm, SIMPLE_DEMO_CLEARANCE_MM);
  return { profile, generated, board, controller, graph, authority, coordinator };
}

async function executePlan(harness, plan) {
  let state = harness.coordinator.planQueue(plan.placements, {
    expectedWorldRevision: harness.controller.getState().worldRevision,
    streamId: plan.planId,
    mode: 'replace',
    finalChunk: true
  });
  assert.equal(state.ok, true, state.reason);
  const initialLayer = new Set(plan.placements.filter((placement) => placement.position.zMm === plan.origin.zMm).map((placement) => placement.placementId));
  assert.ok(state.queue.every((proposal) => initialLayer.has(proposal.placementId)), 'only the base layer may enter the initial active window');
  let executions = 0;
  while (state.stream.remainingPlacements > 0) {
    const next = state.queue[0];
    assert.ok(next, `stream stalled after ${executions} placements: ${JSON.stringify({
      stream: state.stream,
      entries: harness.coordinator.getStreamStatus({ streamId: plan.planId, limit: 50 }).entries,
      placed: harness.controller.getBricks().filter((brick) => brick.placementType).map((brick) => ({
        id: brick.id, position: brick.position, yawRad: brick.yawRad, connection: brick.connection
      }))
    })}`);
    const result = await harness.coordinator.execute({
      proposalId: next.proposalId,
      physicalSpeedMmS: 650,
      playbackMultiplier: 40
    });
    assert.equal(result.ok, true, `${next.placementId}: ${result.reason ?? 'unknown'} ${JSON.stringify({ details: result.details, stages: result.stages })}`);
    executions += 1;
    state = harness.coordinator.getState();
  }
  return executions;
}

test('robot showcase inventory deterministically provides twelve blue and twelve red reachable bricks', () => {
  const { generated, profile } = makeHarness(ROBOT_SHOWCASE_INVENTORY);
  assert.equal(generated.records.length, 24);
  assert.deepEqual(inventoryCounts(generated.records), { blue: 12, red: 12 });
  assert.ok(generated.records.every((brick) => brick.reachability?.reachable === true));
  assert.ok(generated.records.every((brick) => brick.position.xMm >= profile.supplyZone.minX && brick.position.xMm <= profile.supplyZone.maxX));
});

test('simple planner produces deterministic single and three-wide four-high wall plans', () => {
  const { profile } = makeHarness(ROBOT_SHOWCASE_INVENTORY);
  const single = createSimpleStructurePlan({ structure: 'single', colour: 'red' }, {
    profile,
    availableColourCounts: { red: 12, blue: 12 }
  });
  assert.equal(single.ok, true);
  assert.equal(single.ready, true);
  assert.equal(single.blockCount, 1);

  const wallSpec = { structure: 'wall', colour: 'blue', width: 3, height: 4 };
  const first = createSimpleStructurePlan(wallSpec, { profile, availableColourCounts: { blue: 12 } });
  const second = createSimpleStructurePlan(wallSpec, { profile, availableColourCounts: { blue: 12 } });
  assert.equal(first.ok, true);
  assert.equal(first.ready, true);
  assert.equal(first.blockCount, 12);
  assert.equal(first.designChecksum, second.designChecksum);
  assert.deepEqual(first.placements, second.placements);
  assert.deepEqual(first.placements.slice(0, 3).map((placement) => placement.position.xMm), [
    first.origin.xMm - 32, first.origin.xMm, first.origin.xMm + 32
  ]);
  assert.ok(first.placements.slice(3).every((placement) => placement.dependsOnPlacementIds.length === 3));
  const webMcpPlacements = toWebMcpPlacements(first);
  assert.equal(webMcpPlacements.length, 12);
  assert.deepEqual(webMcpPlacements[3].dependsOnPlacementIds, first.placements.slice(0, 3).map(({ placementId }) => placementId));
});

test('cross-laminated tower alternates two-brick layers by ninety degrees', () => {
  const { profile } = makeHarness(ROBOT_SHOWCASE_INVENTORY);
  const tower = createSimpleStructurePlan({
    structure: 'cross_laminated_tower', colour: 'red', width: 2, height: 5, blockCount: 10
  }, { profile, availableColourCounts: { red: 12 } });
  assert.equal(tower.ok, true);
  assert.equal(tower.ready, true);
  assert.equal(tower.blockCount, 10);
  for (let layer = 0; layer < 5; layer += 1) {
    const row = tower.placements.slice(layer * 2, layer * 2 + 2);
    assert.deepEqual(row.map((placement) => Math.round(placement.yawRad * 180 / Math.PI)), [layer % 2 ? 90 : 0, layer % 2 ? 90 : 0]);
    if (layer > 0) assert.ok(row.every((placement) => placement.dependsOnPlacementIds.length === 2));
  }
  assert.deepEqual(tower.origin, {
    xMm: 768,
    yMm: 30,
    zMm: profile.placementSurfaceZMm + settings.brickBodyHeightMm / 2
  });
});

test('page-local one-second cycle runner builds the twelve-brick blue wall without host polling', async () => {
  const harness = makeHarness(Array.from({ length: 12 }, () => 'blue'));
  const plan = createSimpleStructurePlan({ structure: 'wall', colour: 'blue', width: 3, height: 4 }, {
    profile: harness.profile,
    availableColourCounts: { blue: 12 }
  });
  const planned = harness.coordinator.planQueue(plan.placements, {
    expectedWorldRevision: harness.controller.getState().worldRevision,
    streamId: plan.planId,
    mode: 'replace',
    finalChunk: true,
    cycleTimeMs: 1000
  });
  assert.equal(planned.ok, true, planned.reason);
  assert.equal(planned.stream.cycleTimeMs, 1000);
  const runner = new PlannedPlacementCycleRunner({
    coordinator: harness.coordinator,
    controller: harness.controller,
    wait: async () => {}
  });
  const cycle = await runner.run({ cycleTimeMs: 1000 });
  assert.equal(cycle.ok, true, cycle.reason);
  assert.equal(cycle.completedPlacements, 12);
  assert.equal(harness.board.getPlacements().length, 12);
  assert.ok(harness.board.getPlacements().every((placement) => placement.colour === 'blue'));
  assert.equal(harness.graph.validate().pass, true);
});

test('bounded placement stream builds the ten-brick five-layer cross-laminated red tower', async () => {
  const harness = makeHarness(Array.from({ length: 10 }, () => 'red'));
  const plan = createSimpleStructurePlan({ structure: 'cross_laminated_tower', colour: 'red', width: 2, height: 5 }, {
    profile: harness.profile,
    availableColourCounts: { red: 10 }
  });
  assert.equal(await executePlan(harness, plan), 10);
  assert.equal(harness.board.getPlacements().length, 10);
  assert.ok(harness.board.getPlacements().every((placement) => placement.colour === 'red'));
  assert.equal(harness.graph.validate().pass, true);
  const layers = new Map();
  for (const brick of harness.controller.getBricks().filter((brick) => brick.placementType)) {
    const layer = Math.round((brick.position.zMm - plan.origin.zMm) / settings.brickBodyHeightMm);
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer).push(Math.round((brick.yawRad ?? 0) * 180 / Math.PI));
  }
  assert.equal(layers.size, 5);
  for (let layer = 0; layer < 5; layer += 1) {
    assert.deepEqual(layers.get(layer).sort((a, b) => a - b), [layer % 2 ? 90 : 0, layer % 2 ? 90 : 0]);
  }
});

test('simple planner rejects impossible counts and reports colour inventory shortfall', () => {
  const { profile } = makeHarness(ROBOT_SHOWCASE_INVENTORY);
  const mismatch = createSimpleStructurePlan({ structure: 'wall', colour: 'blue', width: 3, height: 4, blockCount: 11 }, { profile });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.errors.includes('block_count_mismatch'));
  const shortage = createSimpleStructurePlan({ structure: 'wall', colour: 'blue', width: 3, height: 4 }, {
    profile,
    availableColourCounts: { blue: 3 }
  });
  assert.equal(shortage.ok, true);
  assert.equal(shortage.ready, false);
  assert.deepEqual(shortage.inventory.shortfall, { blue: 9 });
});
