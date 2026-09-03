import test from 'node:test';
import assert from 'node:assert/strict';
import { BuildBoard } from '../../apps/web/src/bricks/build-board.js';
import { RevisionClock } from '../../apps/web/src/state/revision-clock.js';
import { createTrainBoardFingerprint } from '../../apps/web/src/train-integration/train-board-fingerprint.js';

test('Train fingerprint caches private board geometry only until the existing board ledger changes', () => {
  const clock = new RevisionClock();
  const board = new BuildBoard({ blueprintId: 'one', targets: [] }, { revisionClock: clock });
  board.loadBlueprint({ blueprintId: 'one', targets: [] }, { expectedWorldRevision: clock.value });
  const controller = { bricks: [{ id: 'red-one', colour: 'red', position: { xMm: 500, yMm: 0, zMm: 4.8 } }] };
  const fingerprint = createTrainBoardFingerprint({ board, controller });
  const getTargets = board.getTargets.bind(board); let targetReads = 0;
  board.getTargets = () => { targetReads++; return getTargets(); };
  const initialRevision = clock.value, initial = fingerprint();
  assert.equal(fingerprint(), initial); assert.equal(targetReads, 1); assert.equal(clock.value, initialRevision);
  clock.bump('robot-motion');
  assert.equal(fingerprint(), initial); assert.equal(targetReads, 1);
  board.acceptPlacement({ brickId: 'red-one', colour: 'red', position: { xMm: 500, yMm: 0, zMm: 4.8 }, actor: 'human' });
  const accepted = fingerprint(); assert.notEqual(accepted, initial); assert.equal(targetReads, 2);
  board.removeBrick('red-one', 'human');
  assert.notEqual(fingerprint(), accepted); assert.equal(targetReads, 3);
  board.loadBlueprint({ blueprintId: 'two', targets: [] }, { expectedWorldRevision: clock.value });
  const beforeRead = targetReads;
  assert.notEqual(fingerprint(), initial); assert.equal(targetReads, beforeRead + 1);
});

test('an emptied board ledger cannot reuse a same-blueprint cached geometry fingerprint', () => {
  const target = xMm => ({ id: 'slot', position: { xMm, yMm: 0, zMm: 4.8 } });
  const board = new BuildBoard({ blueprintId: 'same', targets: [target(500)] });
  const fingerprint = createTrainBoardFingerprint({ board, controller: { bricks: [] } });
  const before = fingerprint();
  board.loadBlueprint({ blueprintId: 'same', targets: [target(600)] }, { expectedWorldRevision: board.worldRevision });
  board.reset();
  assert.equal(board.eventCursor.count, 0);
  assert.notEqual(fingerprint(), before);
  const revision = board.worldRevision, cursor = board.eventCursor;
  cursor.count = 100;
  assert.equal(board.eventCursor.count, 0); assert.equal(board.worldRevision, revision);
});

test('Train fingerprint always reads live sources including unversioned colour, geometry and pose changes', () => {
  const board = new BuildBoard([]), controller = { bricks: [{ id: 'one', colour: 'blue', position: { xMm: 500 }, bridgePart: { definitionId: 'arch', collisionProxy: { heightMm: 20 } } }] };
  const fingerprint = createTrainBoardFingerprint({ board, controller });
  let previous = fingerprint();
  for (const mutate of [() => { controller.bricks[0].colour = 'red'; }, () => { controller.bricks[0].position.xMm++; },
    () => { controller.bricks[0].bridgePart.collisionProxy.heightMm++; }, () => { controller.bricks[0].heldBy = 'human'; }]) {
    const revision = board.worldRevision; mutate(); const current = fingerprint();
    assert.notEqual(current, previous); assert.equal(board.worldRevision, revision); previous = current;
  }
});
