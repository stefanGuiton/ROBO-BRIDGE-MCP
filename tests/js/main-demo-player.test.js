import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { makeBrick } from '../../apps/web/src/bricks/brick-spec.js';
import { findLatchCandidate } from '../../apps/web/src/bricks/latch.js';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { parseCubeLUT } from '../../apps/web/src/player/color-grading.js';
import { ConnectionGraph } from '../../apps/web/src/player/connection-graph.js';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';
import { fixedStepAdvance } from '../../apps/web/src/player/math.js';
import { PlacementIntentEngine } from '../../apps/web/src/player/placement-intent.js';
import { PlayerSettingsStore, PLAYER_FALLBACK_SETTINGS, PLAYER_SOURCE_PROVENANCE } from '../../apps/web/src/player/player-settings.js';

const settings = {
  ...PLAYER_FALLBACK_SETTINGS,
  connectionCenterBandMm: 4,
  connectionSwitchHysteresisPct: 15,
  gridPitchMm: 8,
  snapSearchRadiusMm: 22
};

function makeRuntime() {
  const clock = new RevisionClock();
  const board = new BuildBoard([{
    id: 'target-red',
    colour: 'red',
    position: { xMm: 100, yMm: 100, zMm: 4.8 },
    yawRad: 0
  }], { revisionClock: clock });
  const bricks = [
    makeBrick({ id: 'brick-red', colour: 'red', xMm: 0, yMm: 0, zMm: 4.8, yawRad: 0 }),
    makeBrick({ id: 'brick-blue', colour: 'blue', xMm: 48, yMm: 0, zMm: 4.8, yawRad: 0 })
  ];
  const controller = new RobotController({ board, bricks, revisionClock: clock, timeScale: 0 });
  const graph = new ConnectionGraph();
  const placementEngine = new PlacementIntentEngine(settings, board, graph);
  const adapter = new HumanBuildAdapter({ controller, board, graph, placementEngine });
  return { clock, board, controller, graph, placementEngine, adapter };
}

test('supplied V8 player settings are provenance-locked and production disables collapse', async () => {
  const path = fileURLToPath(new URL('../../apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', import.meta.url));
  const bytes = await readFile(path);
  const normalizedBytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  assert.equal(createHash('sha256').update(normalizedBytes).digest('hex'), PLAYER_SOURCE_PROVENANCE.suppliedSettingsSha256);
  const attributes = await readFile(fileURLToPath(new URL('../../.gitattributes', import.meta.url)), 'utf8');
  assert.match(attributes, /^apps\/web\/config\/player\/LOGO_ROBO_PLAYER_SETTINGS\.json -text$/m);
  const supplied = JSON.parse(bytes.toString('utf8'));
  assert.equal(supplied.fovDeg, 62);
  assert.equal(supplied.cameraZoom, 1.2999999999999994);
  assert.equal(supplied.physicsHz, 240);
  assert.equal(supplied.structuralCollapseEnabled, true);
  assert.equal(PLAYER_FALLBACK_SETTINGS.structuralCollapseEnabled, false);
  const store = new PlayerSettingsStore(supplied);
  assert.ok(Object.keys(store.get()).length >= Object.keys(supplied).length);
  for (const [key, value] of Object.entries(supplied)) {
    assert.deepEqual(store.get()[key], key === 'structuralCollapseEnabled' ? false : value, key);
  }
});

test('240 Hz fixed-step schedule is independent of 60/90/120/144 render cadence', () => {
  const totals = [];
  for (const renderHz of [60, 90, 120, 144]) {
    let accumulator = 0;
    let steps = 0;
    const frames = renderHz * 5;
    for (let frame = 0; frame < frames; frame += 1) {
      const advance = fixedStepAdvance(accumulator, 1 / renderHz, 1 / 240, 8);
      accumulator = advance.accumulator;
      steps += advance.steps;
    }
    totals.push(steps);
  }
  assert.deepEqual(totals, [1200, 1200, 1200, 1200]);
});

test('fixed-step catch-up is capped after a suspended browser frame', () => {
  const advance = fixedStepAdvance(0, 12, 1 / 240, 8);
  assert.equal(advance.steps, 8);
  assert.ok(advance.accumulator < 1 / 240);
});

test('L/M/R connector masks overlap by two studs and reject duplicate occupancy', () => {
  const graph = new ConnectionGraph();
  assert.deepEqual(graph.connectorCells('L').map((cell) => cell.column), [0, 0, 1, 1]);
  assert.deepEqual(graph.connectorCells('M').map((cell) => cell.column), [1, 1, 2, 2]);
  assert.deepEqual(graph.connectorCells('R').map((cell) => cell.column), [2, 2, 3, 3]);
  assert.equal(graph.addConnection({
    lowerBrickId: 'lower',
    lowerConnector: 'L',
    upperBrickId: 'upper',
    upperConnector: 'R'
  }), true);
  assert.equal(graph.addConnection({
    lowerBrickId: 'lower',
    lowerConnector: 'L',
    upperBrickId: 'other',
    upperConnector: 'M'
  }), false);
  assert.equal(graph.validate().pass, true);
});

test('placement engine produces exact L/M/R support candidates and blocks collisions', () => {
  const { placementEngine } = makeRuntime();
  const support = { id: 'support', position: { xMm: 200, yMm: 0, zMm: 4.8 }, yawRad: 0 };
  const carried = { id: 'carried', position: { xMm: 0, yMm: 0, zMm: 4.8 }, yawRad: 0 };
  const left = placementEngine.connectionCandidate(
    support,
    { xMm: 188, yMm: 0, zMm: 9.6 },
    carried,
    [support, carried]
  );
  assert.equal(left.side, 'L');
  assert.equal(left.position.xMm, 192);
  assert.ok(Math.abs(left.position.zMm - 14.4) < 1e-9);
  const middle = placementEngine.connectionCandidate(
    support,
    { xMm: 200, yMm: 0, zMm: 9.6 },
    carried,
    [support, carried]
  );
  assert.equal(middle.side, 'M');
  const right = placementEngine.connectionCandidate(
    support,
    { xMm: 212, yMm: 0, zMm: 9.6 },
    carried,
    [support, carried]
  );
  assert.equal(right.side, 'R');
  const blocker = { id: 'blocker', position: { ...right.position }, yawRad: right.yawRad };
  const blocked = placementEngine.connectionCandidate(
    support,
    { xMm: 212, yMm: 0, zMm: 9.6 },
    carried,
    [support, carried, blocker]
  );
  assert.equal(blocked.valid, false);
  assert.equal(blocked.blockedReason, 'COLLISION:blocker');
});

test('human pickup and placement use controller, board, ownership, and one revision clock', () => {
  const { controller, board, graph, placementEngine, adapter } = makeRuntime();
  const before = controller.getState().worldRevision;
  const pickup = adapter.pickup('brick-red');
  assert.equal(pickup.ok, true);
  const afterPickup = controller.getState().worldRevision;
  assert.ok(afterPickup > before);
  assert.equal(controller.getBricks().find((brick) => brick.id === 'brick-red').ownership, 'human');
  const candidate = placementEngine.matCandidate(
    { xMm: 32, yMm: 32, zMm: 0 },
    { id: 'brick-red' },
    controller.getBricks()
  );
  adapter.setPreview(candidate);
  assert.equal(controller.getState().worldRevision, afterPickup, 'preview must not mutate world state');
  const release = adapter.release();
  assert.equal(release.ok, true);
  assert.ok(controller.getState().worldRevision > afterPickup);
  const brick = controller.getBricks().find((entry) => entry.id === 'brick-red');
  assert.equal(brick.ownership, null);
  assert.equal(brick.placementType, 'mat');
  assert.deepEqual(brick.position, candidate.position);
  assert.equal(board.getPlacements().at(0).actor, 'human');
  assert.equal(graph.snapshot().matRoots.includes('brick-red'), true);
  assert.equal(controller.moveLooseBrick('brick-red', { xMm: 80, yMm: 80, zMm: 4.8 }).reason, 'operation_in_progress');
  assert.equal(findLatchCandidate({ ...brick.position, zMm: brick.position.zMm + 7.7 }, controller.getBricks()).reason, 'no_brick_in_capture');
});

test('TEST mode locks player edits and returning to BUILD restores pickup', () => {
  const { adapter } = makeRuntime();
  assert.equal(adapter.setMode('TEST'), true);
  assert.deepEqual(adapter.pickup('brick-red'), { ok: false, reason: 'test_mode_locked' });
  assert.equal(adapter.setMode('BUILD'), true);
  assert.equal(adapter.pickup('brick-red').ok, true);
});

test('human pickup fails closed while robot motion is queued', async () => {
  const { controller, adapter } = makeRuntime();
  const current = controller.getState().tcp;
  const motion = controller.moveTool({
    xMm: current.xMm,
    yMm: current.yMm,
    zMm: current.zMm + 1,
    speedMmS: 100
  });
  const pickup = adapter.pickup('brick-red');
  assert.equal(pickup.ok, false);
  assert.equal(pickup.reason, 'operation_in_progress');
  await motion;
});

test('cube LUT parser accepts local 3D data and rejects unsupported production sizes', () => {
  const cube = [
    'TITLE "Identity 2"',
    'LUT_3D_SIZE 2',
    'DOMAIN_MIN 0 0 0',
    'DOMAIN_MAX 1 1 1',
    '0 0 0', '1 0 0', '0 1 0', '1 1 0',
    '0 0 1', '1 0 1', '0 1 1', '1 1 1'
  ].join('\n');
  const parsed = parseCubeLUT(cube, [2]);
  assert.equal(parsed.size, 2);
  assert.equal(parsed.data.length, 32);
  assert.throws(() => parseCubeLUT(cube), /not supported/);
});
