import test from 'node:test';
import assert from 'node:assert/strict';
import { HumanBuildAdapter } from '../../apps/web/src/player/human-build-adapter.js';
import { createSimpleStructurePlan, toWebMcpPlacements } from '../../apps/web/src/robot/simple-structure-planner.js';
import { simpleHarness } from '../helpers/simple-demo-harness.js';
import { HumanSimulator } from '../helpers/human-simulator.js';

async function makeTowerHarness(height = 6, { strictColour = false, wait = async () => {} } = {}) {
  const harness = await simpleHarness({ wait });
  const plan = createSimpleStructurePlan({ structure: 'cross_laminated_tower', height, colour: 'red' }, { profile: harness.profile });
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  const placements = toWebMcpPlacements(plan).map((placement) => ({
    ...placement,
    colour: strictColour ? 'red' : null,
    preferredColour: 'red'
  }));
  const queued = await harness.call('plan_placement_queue', {
    placements,
    streamId: `human-sim-${height}`,
    mode: 'replace',
    finalChunk: true,
    expectedWorldRevision: harness.controller.worldRevision
  });
  assert.equal(queued.ok, true, JSON.stringify(queued));
  const adapter = new HumanBuildAdapter({
    controller: harness.controller,
    board: harness.board,
    graph: harness.graph,
    placementEngine: harness.engine
  });
  const simulator = new HumanSimulator({
    adapter,
    authority: harness.authority,
    coordinator: harness.coordinator,
    controller: harness.controller
  });
  return { ...harness, plan, adapter, simulator, streamId: `human-sim-${height}` };
}

test('HumanSimulator adopts one blue brick through the normal path and Codex continues the 12-target tower', async () => {
  const h = await makeTowerHarness(6);
  const selected = h.simulator.chooseEligiblePendingTarget({ sourceColour: 'blue' });
  assert.equal(selected.ok, true, JSON.stringify(selected));
  assert.equal(selected.source.colour, 'blue');
  assert.equal(selected.guide.placementId, h.plan.placements[1].placementId);

  const human = await h.simulator.placeNext({ sourceColour: 'blue' });
  assert.equal(human.ok, true, JSON.stringify(human));
  assert.equal(human.actor, 'human');
  assert.equal(human.simulation, true);
  assert.equal(human.evidence.actor, 'human');
  assert.equal(human.evidence.simulation, true);
  assert.equal(human.evidence.targetStatus, 'ADOPTED');

  const adopted = h.coordinator.getStreamStatus({ streamId: h.streamId, limit: 20 }).entries
    .find((entry) => entry.placementId === human.placementId);
  assert.equal(adopted.status, 'ADOPTED');
  assert.equal(adopted.actor, 'human');
  assert.equal(h.controller.getBricks().find((brick) => brick.id === adopted.actualBrickId).colour, 'blue');
  assert.equal(h.board.getPlacements().filter((placement) => placement.actor === 'human').length, 1);

  const continued = await h.runner.run({ cycleTimeMs: 1000, maximumPlacements: 11 });
  assert.equal(continued.ok, true, JSON.stringify(continued));
  assert.equal(h.coordinator.summary().satisfiedPlacements, 12);
  assert.equal(h.board.getPlacements().length, 12);
  assert.equal(h.board.getPlacements().filter((placement) => placement.actor === 'agent').length, 11);
  assert.equal(new Set(h.board.getPlacements().map((placement) => placement.brickId)).size, 12);
  assert.equal(h.simulator.getEvidence().length, 1);
});

test('HumanSimulator rejects a wrong-yaw interjection without placement or colour change', async () => {
  const h = await makeTowerHarness(1);
  const source = h.controller.getBricks().find((brick) => brick.colour === 'blue');
  const before = { position: source.position, yawRad: source.yawRad, colour: source.colour, displayHex: source.displayHex };
  const result = await h.simulator.placeNext({ sourceId: source.id, yawOffsetRad: Math.PI / 2 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rotate_to_pending_target');
  assert.equal(result.actor, 'human');
  assert.equal(result.simulation, true);
  assert.equal(result.evidence.status, 'REJECTED');
  assert.equal(result.evidence.simulation, true);
  assert.equal(h.board.getPlacements().length, 0);
  assert.equal(h.coordinator.summary().satisfiedPlacements, 0);
  const after = h.controller.getBricks().find((brick) => brick.id === source.id);
  assert.equal(after.heldBy, null);
  assert.equal(after.colour, before.colour);
  assert.equal(after.displayHex, before.displayHex);
  assert.deepEqual(after.position, before.position);
  assert.equal(after.yawRad, before.yawRad);
});

test('HumanSimulator selection respects busy state, strict colour, and dependencies', async () => {
  const h = await makeTowerHarness(2, { strictColour: true });
  const second = h.plan.placements[2];
  const busyToken = h.controller.beginExclusiveOperation('human-simulator-test');
  assert.equal(busyToken.ok, true);
  const busy = await h.simulator.placeNext({ sourceColour: 'blue' });
  assert.equal(busy.ok, false);
  assert.equal(busy.reason, 'operation_in_progress');
  h.controller.endExclusiveOperation(busyToken.token);

  const strictColour = h.simulator.chooseEligiblePendingTarget({ sourceColour: 'blue' });
  assert.equal(strictColour.ok, false);
  assert.equal(strictColour.reason, 'no_eligible_pending_target');
  assert.equal(h.adapter.getState().heldBrickId, null);

  const dependency = h.simulator.chooseEligiblePendingTarget({ placementId: second.placementId, sourceColour: 'red' });
  assert.equal(dependency.ok, false);
  assert.equal(dependency.reason, 'target_not_eligible');
  assert.equal(h.coordinator.summary().satisfiedPlacements, 0);
});

test('HumanSimulator cancellation after pickup restores the shared source and leaves the stream untouched', async () => {
  const h = await makeTowerHarness(1);
  const source = h.controller.getBricks().find((brick) => brick.colour === 'blue');
  const before = h.controller.getBricks().find((brick) => brick.id === source.id);
  const aborter = new AbortController();
  const result = await h.simulator.placeNext({
    sourceId: source.id,
    signal: aborter.signal,
    onStage: (stage) => { if (stage === 'after_pickup') aborter.abort(); }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(result.actor, 'human');
  assert.equal(result.simulation, true);
  assert.equal(result.evidence.status, 'REJECTED');
  assert.equal(result.evidence.stage, 'cancelled');
  assert.equal(h.adapter.getState().heldBrickId, null);
  assert.equal(h.board.getPlacements().length, 0);
  assert.equal(h.coordinator.summary().satisfiedPlacements, 0);
  const after = h.controller.getBricks().find((brick) => brick.id === source.id);
  assert.equal(after.colour, before.colour);
  assert.equal(after.displayHex, before.displayHex);
  assert.deepEqual(after.position, before.position);
});

test('HumanSimulator interleaves at a legal idle boundary while the runner remains active, then Codex completes the tower', async () => {
  let h = null;
  let simulator = null;
  let boundary = null;
  let humanPlacement = null;
  const wait = async (requestedDelayMs, signal) => {
    if (signal?.aborted) throw signal.reason ?? new Error('runner_cancelled');
    if (!humanPlacement) {
      boundary = {
        requestedDelayMs,
        runnerRunning: h.runner.getState().running,
        controllerIdle: h.controller.getState().operationState === 'idle'
      };
      humanPlacement = simulator.placeNext({
        sourceColour: 'blue',
        onStage: (stage) => {
          if (stage === 'after_pickup') {
            boundary.runnerRunningAtPickup = h.runner.getState().running;
            boundary.controllerIdleAtPickup = h.controller.getState().operationState === 'idle';
          }
        }
      });
      boundary.result = await humanPlacement;
    }
  };

  h = await makeTowerHarness(6, { wait });
  simulator = h.simulator;
  const controllerEvents = [];
  const unsubscribe = h.controller.subscribe((event) => controllerEvents.push(event.type));
  const run = await h.runner.run({ cycleTimeMs: 1000, maximumPlacements: 12 });
  unsubscribe();

  assert.ok(boundary, 'runner must expose a nonzero between-cycle boundary');
  assert.ok(boundary.requestedDelayMs > 0);
  assert.equal(boundary.runnerRunning, true);
  assert.equal(boundary.runnerRunningAtPickup, true);
  assert.equal(boundary.controllerIdle, true);
  assert.equal(boundary.controllerIdleAtPickup, true);
  assert.equal(boundary.result.ok, true, JSON.stringify(boundary.result));
  assert.equal(boundary.result.actor, 'human');
  assert.equal(boundary.result.simulation, true);
  assert.equal(boundary.result.evidence.targetStatus, 'ADOPTED');

  const status = h.coordinator.getStreamStatus({ streamId: h.streamId, limit: 20 });
  assert.equal(status.satisfiedPlacements, 12);
  assert.equal(status.remainingPlacements, 0);
  assert.equal(status.entries.filter((entry) => entry.status === 'ADOPTED').length, 1);
  assert.equal(status.entries.filter((entry) => entry.status === 'COMPLETED').length, 11);
  assert.equal(h.board.getPlacements().length, 12);
  assert.equal(h.board.getPlacements().filter((placement) => placement.actor === 'human').length, 1);
  assert.equal(h.board.getPlacements().filter((placement) => placement.actor === 'agent').length, 11);
  assert.equal(new Set(h.board.getPlacements().map((placement) => placement.brickId)).size, 12);
  const adopted = status.entries.find((entry) => entry.status === 'ADOPTED');
  assert.equal(h.controller.getBricks().find((brick) => brick.id === adopted.actualBrickId).colour, 'blue');
  assert.equal(controllerEvents.filter((type) => ['reset', 'world_reset'].includes(type)).length, 0);
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.equal(run.reason, null);
  assert.equal(h.runner.getState().running, false);
});
