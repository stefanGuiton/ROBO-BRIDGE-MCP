import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotController } from '../../apps/web/src/robot/controller.js';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { makeBrick } from '../../apps/web/src/bricks/brick-spec.js';
import { colourHex, V8_COLOUR_HEX } from '../../apps/web/src/player/v8-brick-visual.js';
import { createRecolourLooseBricksTool } from '../../apps/web/src/workcell/recolour-loose-bricks-tool.js';
import { simpleHarness } from '../helpers/simple-demo-harness.js';

function fixture(extra = {}) {
  const board = new BuildBoard([]);
  const controller = new RobotController({ board, timeScale: 0, bricks: Array.from({ length: 4 }, (_, i) => ({
    ...makeBrick({ id: `b${i}`, colour: 'red', xMm: 300 + i * 40, yMm: 0, zMm: 4.8 }), displayHex: 0xff0000,
    ...(i === 3 ? extra : {})
  })) });
  return { controller, board, apply: changes => controller.recolourLooseBricks({ changes, expectedWorldRevision: controller.worldRevision }) };
}

test('recolour batch changes only colour and stale tint; one revision and no-op is stable', () => {
  const h = fixture(), before = h.controller.getBricks(), state = h.controller.getState();
  const result = h.apply(['green', 'orange', 'purple'].map((colour, i) => ({ brickId: `b${i}`, colour })));
  assert.equal(result.ok, true);
  assert.equal(result.changedCount, 3);
  assert.equal(result.worldRevision, state.worldRevision + 1);
  for (const [i, brick] of h.controller.getBricks().entries()) {
    assert.deepEqual(brick.position, before[i].position);
    if (i < 3) { assert.equal(brick.displayHex, undefined); assert.equal(colourHex(brick), V8_COLOUR_HEX[brick.colour]); }
  }
  assert.deepEqual(h.controller.getState().tcp, state.tcp);
  assert.deepEqual(h.board.getPlacements(), []);
  assert.equal(h.apply([{ brickId: 'b0', colour: 'green' }]).changedCount, 0);
  assert.equal(h.controller.worldRevision, result.worldRevision);
});

test('malformed and unavailable batch entries reject atomically', () => {
  for (const bad of [[], Array(51).fill({ brickId: 'b0', colour: 'blue' }),
    [{ brickId: 'b0', colour: 'blue' }, { brickId: 'b0', colour: 'green' }],
    [{ brickId: 'b0', colour: 'green' }, { brickId: 'missing', colour: 'blue' }],
    [{ brickId: 'b0', colour: 'pink' }]]) {
    const h = fixture(), before = h.controller.getBricks(), revision = h.controller.worldRevision;
    assert.equal(h.apply(bad).ok, false);
    assert.deepEqual(h.controller.getBricks(), before);
    assert.equal(h.controller.worldRevision, revision);
  }
});

test('held, snapped, placed, owned, bridge and board-only placements remain protected', () => {
  for (const extra of [{ heldBy: 'human' }, { snapped: true }, { placementType: 'free-build' },
    { placedTargetId: 't1' }, { ownership: 'human' }, { bridgePart: {} }]) {
    const h = fixture(extra), before = h.controller.getBricks();
    assert.equal(h.apply([{ brickId: 'b0', colour: 'blue' }, { brickId: 'b3', colour: 'green' }]).ok, false);
    assert.deepEqual(h.controller.getBricks(), before);
  }
  const h = fixture();
  h.board.acceptPlacement({ brickId: 'b3', colour: 'red', position: { xMm: 700, yMm: 0, zMm: 8.6 } });
  const before = h.board.getPlacements();
  assert.equal(h.apply([{ brickId: 'b3', colour: 'blue' }]).ok, false);
  assert.deepEqual(h.board.getPlacements(), before);
});

test('revision, cancellation and exclusive operation gates fail closed', () => {
  const h = fixture(), changes = [{ brickId: 'b0', colour: 'blue' }], revision = h.controller.worldRevision;
  assert.equal(h.controller.recolourLooseBricks({ changes, expectedWorldRevision: revision + 1 }).reason, 'stale_state');
  const abort = new AbortController(); abort.abort();
  assert.equal(h.controller.recolourLooseBricks({ changes, expectedWorldRevision: revision, signal: abort.signal }).reason, 'cancelled');
  const token = h.controller.beginExclusiveOperation('test').token;
  assert.equal(h.apply(changes).reason, 'operation_in_progress');
  h.controller.endExclusiveOperation(token);
  assert.equal(h.controller.worldRevision, revision);
});

test('tool guards mode, runner and reservations; controller event repairs waiting sources', async () => {
  const h = await simpleHarness();
  let mode = true;
  const tool = createRecolourLooseBricksTool({ ...h, isSimpleMode: () => mode });
  const plan = await h.call('plan_placement_queue', { streamId: 'recolour', mode: 'replace', finalChunk: true,
    placements: [{ placementId: 'p', colour: 'purple', xMm: 800, yMm: 0, zMm: 8.6 }], expectedWorldRevision: h.controller.worldRevision });
  assert.equal(plan.ok, true);
  const brickId = h.controller.getBricks()[0].id;
  const input = () => ({ changes: [{ brickId, colour: 'purple' }], expectedWorldRevision: h.controller.worldRevision });
  mode = false; assert.equal(tool.execute(input()).reason, 'unsupported_demo_level');
  mode = true;
  const busyTool = createRecolourLooseBricksTool({ ...h, runner: { getState: () => ({ running: true }) }, isSimpleMode: () => true });
  const beforeBusy = h.controller.getBricks(), revisionBeforeBusy = h.controller.worldRevision;
  assert.equal(busyTool.execute(input()).reason, 'operation_in_progress');
  assert.deepEqual(h.controller.getBricks(), beforeBusy);
  assert.equal(h.controller.worldRevision, revisionBeforeBusy);
  assert.equal(tool.execute(input()).ok, true);
  assert.equal(h.coordinator.getState().queue[0].brickId, brickId);
  assert.equal(tool.execute({ ...input(), changes: [{ brickId, colour: 'green' }] }).reason, 'source_unavailable');
  const abort = new AbortController(); abort.abort();
  assert.equal(tool.execute(input(), { signal: abort.signal }).reason, 'cancelled');
});
