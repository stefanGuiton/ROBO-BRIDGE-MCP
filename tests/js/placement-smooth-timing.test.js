import test from 'node:test';
import assert from 'node:assert/strict';
import { PlannedPlacementCycleRunner } from '../../apps/web/src/robot/placement-cycle-runner.js';
import { createPlacementStreamControl } from '../../apps/web/src/webmcp/placement-stream-control.js';
import { simpleHarness, simplePlacements } from '../helpers/simple-demo-harness.js';

function timingHarness({ durations = [6000, 8000, 7000], overhead = 0, blueprintId = 'simple-bricks' } = {}) {
  let now = 0, revision = 0, index = 0, active = 0;
  const starts = [], rates = [], signals = [];
  const controller = { board: { blueprintId }, getState: () => ({ worldRevision: revision }) };
  const coordinator = {
    getState: () => ({ worldRevision: revision,
      queue: index < durations.length ? [{ proposalId: `p${index}`, expectedWorldRevision: revision }] : [],
      stream: { streamId: 'smooth-test', remainingPlacements: durations.length - index } }),
    async estimateCycleTiming({ signal }) { signals.push(signal); return { ok: true, physicalDurationMs: durations[index], stages: [] }; },
    async execute({ proposalId, physicalSpeedMmS, playbackMultiplier, signal }) {
      assert.equal(active++, 0, 'never overlap placements');
      assert.equal(proposalId, `p${index}`);
      assert.equal(physicalSpeedMmS, 650);
      starts.push(now); rates.push(playbackMultiplier); signals.push(signal);
      const duration = durations[index++];
      now += duration / playbackMultiplier + overhead;
      revision++; active--;
      return { ok: true, placementId: proposalId, brickId: `b${index}`, worldRevision: revision,
        physicalDurationMs: duration, playbackDurationMs: duration / playbackMultiplier,
        executionWallDurationMs: duration / playbackMultiplier + overhead, stages: [], remainingPlacements: durations.length - index };
    }
  };
  const runner = new PlannedPlacementCycleRunner({ coordinator, controller, clock: () => now, wait: async ms => { now += ms; } });
  return { coordinator, controller, runner, starts, rates, signals, advanceRevision: () => revision++, advanceTime: ms => { now += ms; } };
}

test('smooth cycles adapt to path durations, stay sequential and forward cancellation signals', async () => {
  const h = timingHarness();
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
  assert.equal(result.ok, true);
  assert.deepEqual(h.starts, [0, 1000, 2000]);
  assert.deepEqual(h.rates, [6, 8, 7]);
  assert.ok(h.signals.every(s => s === h.signals[0] && s instanceof AbortSignal));
  assert.equal(result.totalElapsedMs, 3000);
  assert.equal(result.overruns, 0);
  assert.ok(result.results.every(r => r.executionElapsedMs === 1000 && r.timingMode === 'simple-smooth'));
});

test('simulation playback remains bounded and actual overruns are reported including last brick', async () => {
  const h = timingHarness({ durations: [50, 80000] });
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
  assert.deepEqual(h.rates, [1, 40]);
  assert.equal(result.overruns, 1);
  assert.equal(result.results[1].overrunMs, 1000);
  assert.equal(result.results[1].physicalDurationMs, 80000);
  assert.equal(result.results[1].executionWallDurationMs, 2000);
  assert.equal(result.totalElapsedMs, 3000);
});

test('smooth minimum and mid-run cadence changes do not change bridge limits', async () => {
  const h = timingHarness();
  assert.equal((await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 999 })).reason, 'invalid_cycle_time');
  const execute = h.coordinator.execute;
  h.coordinator.execute = async options => {
    const result = await execute(options);
    assert.equal(h.runner.setCycleTime(999).reason, 'invalid_cycle_time');
    h.runner.setCycleTime(h.starts.length === 1 ? 1333 : 1000);
    return result;
  };
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 2000 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.results.map(r => r.cycleTimeMs), [2000, 1333, 1000]);
  assert.deepEqual(h.starts, [0, 2000, 3333]);
  assert.equal(h.runner.setCycleTime(300).ok, true, 'idle shared runner retains bridge range');
  const defaults = timingHarness({ durations: [6000] });
  assert.equal((await defaults.runner.run({ timingMode: 'simple-smooth' })).cycleTimeMs, 2000);
});

test('observed overhead informs next cycle without erasing first-cycle overrun', async () => {
  const h = timingHarness({ durations: [6000, 6000], overhead: 100 });
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
  assert.equal(result.overruns, 1);
  assert.equal(result.results[0].overrunMs, 100);
  assert.equal(result.results[1].executionElapsedMs, 1000);
  assert.equal(h.rates[1], 6000 / 900);
});

test('failed and cancelled attempts report actual elapsed time and overruns without accepting a brick', async () => {
  for (const scenario of ['collision', 'cancelled', 'throw']) {
    const h = timingHarness(), abort = new AbortController();
    h.coordinator.execute = async () => {
      h.advanceTime(1500);
      if (scenario === 'cancelled') { abort.abort(); throw abort.signal.reason; }
      if (scenario === 'throw') throw new Error('failed motion');
      return { ok: false, reason: 'collision' };
    };
    const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000, signal: abort.signal });
    assert.equal(result.ok, false);
    assert.equal(result.reason, scenario === 'throw' ? 'internal_error' : scenario);
    assert.equal(result.completedPlacements, 0);
    assert.equal(result.attemptedPlacements, 1);
    assert.deepEqual(result.results, []);
    assert.equal(result.totalElapsedMs, 1500);
    assert.equal(result.overruns, 1);
    assert.equal(result.failedCycle.executionWallDurationMs, 1500);
    assert.equal(result.failedCycle.overrunMs, 500);
    assert.equal(result.failedCycle.physicalDurationMs, null);
    assert.equal(result.failedCycle.playbackDurationMs, null);
    assert.equal(result.failedCycle.completed, false);
    assert.equal(h.runner.getState().lastResult.failedCycle.overrunMs, 500);
  }
});

test('failed attempt after completed cycles and cancelled preparation retain separate timing', async () => {
  const h = timingHarness(), execute = h.coordinator.execute;
  h.coordinator.execute = async options => {
    if (!h.starts.length) return execute(options);
    h.advanceTime(1500);
    return { ok: false, reason: 'collision' };
  };
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
  assert.equal(result.completedPlacements, 1);
  assert.equal(result.attemptedPlacements, 2);
  assert.equal(result.results.length, 1);
  assert.equal(result.overruns, 1);
  assert.equal(result.totalElapsedMs, 2500);
  assert.equal(result.failedCycle.proposalId, 'p1');
  const preparing = timingHarness(), abort = new AbortController();
  preparing.coordinator.estimateCycleTiming = async () => { preparing.advanceTime(1200); abort.abort(); throw abort.signal.reason; };
  const cancelled = await preparing.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000, signal: abort.signal });
  assert.equal(cancelled.reason, 'cancelled');
  assert.equal(cancelled.completedPlacements, 0);
  assert.equal(cancelled.attemptedPlacements, 0);
  assert.equal(cancelled.failedCycle.executionStarted, false);
  assert.equal(cancelled.failedCycle.preparationElapsedMs, 1200);
  assert.equal(cancelled.failedCycle.executionWallDurationMs, 0);
  assert.equal(cancelled.failedCycle.overrunMs, 200);
  assert.equal(cancelled.overruns, 1);
});

test('ordinary bridge cadence keeps 40x playback and never invokes timing estimation', async () => {
  const h = timingHarness({ blueprintId: 'bridge', durations: [6000, 8000] });
  h.coordinator.travelPolicy = { safeTcpTravelZMm: 400 };
  h.coordinator.estimateCycleTiming = () => { throw new Error('bridge must not estimate'); };
  assert.equal((await h.runner.run({ cycleTimeMs: 1000 })).ok, true);
  assert.deepEqual(h.rates, [40, 40]);
  assert.deepEqual(h.starts, [0, 1000]);
  assert.equal((await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 })).reason, 'wrong_mode');
});

test('stale revisions after responsive timing yield prevent execution', async () => {
  const h = timingHarness();
  h.coordinator.estimateCycleTiming = async () => { h.advanceRevision(); return { ok: true, physicalDurationMs: 6000, stages: [] }; };
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
  assert.equal(result.reason, 'stale_state');
  assert.equal(h.starts.length, 0);
  assert.equal(h.runner.getState().lastResult.reason, 'stale_state');
});

test('cancellation during timing stops before pickup and releases runner', async () => {
  const h = timingHarness(), abort = new AbortController();
  h.coordinator.estimateCycleTiming = async () => { abort.abort(); return { ok: true, physicalDurationMs: 6000, stages: [] }; };
  assert.equal((await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000, signal: abort.signal })).reason, 'cancelled');
  assert.equal(h.starts.length, 0);
  assert.equal(h.runner.getState().running, false);
});

test('cancelling a cadence wait retains the completed placement and its timing', async () => {
  const h = timingHarness({ durations: [50, 6000] }), abort = new AbortController();
  h.runner.wait = async () => { abort.abort(); throw abort.signal.reason; };
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000, signal: abort.signal });
  assert.equal(result.reason, 'cancelled');
  assert.equal(result.completedPlacements, 1);
  assert.equal(result.results[0].physicalDurationMs, 50);
  assert.equal(result.failedCycle, null, 'a cancelled cadence wait is not a failed placement');
  assert.equal(result.attemptedPlacements, 1);
  assert.equal(h.starts.length, 1);
});

test('smooth cleanup restores on executor errors, preserves external rates, and leaves legacy rates alone', async () => {
  for (const scenario of ['success', 'throw', 'failure', 'external', 'legacy']) {
    const h = timingHarness({ durations: [6000] });
    let rate = 3;
    const getState = h.controller.getState;
    h.controller.getState = () => ({ ...getState(), operationState: 'idle', moving: false, simulationPlaybackMultiplier: rate });
    h.controller.operationBlocked = () => false;
    h.controller.setSimulationPlaybackMultiplier = value => { rate = value; return { ok: true }; };
    const execute = h.coordinator.execute;
    h.coordinator.execute = async options => {
      rate = options.playbackMultiplier;
      if (scenario === 'throw') throw new Error('execution failed');
      if (scenario === 'failure') return { ok: false, reason: 'collision' };
      const result = await execute(options);
      if (scenario === 'external') rate = 2;
      return result;
    };
    const result = await h.runner.run({ timingMode: scenario === 'legacy' ? 'cadence' : 'simple-smooth', cycleTimeMs: 1000 });
    assert.equal(rate, scenario === 'legacy' ? 40 : scenario === 'external' ? 2 : 3, scenario);
    assert.equal(h.runner.getState().running, false);
    if (scenario === 'throw') assert.equal(result.reason, 'internal_error');
    if (scenario === 'failure') assert.equal(result.reason, 'collision');
  }
});

test('empty source window pauses with current partial completion rather than a stale success', async () => {
  const h = timingHarness();
  const get = h.coordinator.getState;
  h.coordinator.getState = () => { const s = get(); if (h.starts.length) s.queue = []; return s; };
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
  assert.equal(result.reason, 'cycle_waiting');
  assert.equal(result.completedPlacements, 1);
  assert.equal(h.runner.getState().lastResult.reason, 'cycle_waiting');
});

test('second-cycle pre-rate rejection restores the prior owned rate but preserves external changes', async () => {
  for (const scenario of ['returned', 'thrown', 'external-returned', 'external-thrown']) {
    const h = timingHarness({ durations: [6000, 8000] });
    let rate = 3, calls = 0;
    const getState = h.controller.getState;
    h.controller.getState = () => ({ ...getState(), operationState: 'idle', moving: false, simulationPlaybackMultiplier: rate });
    h.controller.operationBlocked = () => false;
    h.controller.setSimulationPlaybackMultiplier = value => { rate = value; return { ok: true }; };
    const execute = h.coordinator.execute;
    h.coordinator.execute = async options => {
      if (++calls === 1) {
        rate = options.playbackMultiplier;
        assert.equal(rate, 6);
        return execute(options);
      }
      assert.equal(options.playbackMultiplier, 8, 'next requested rate differs from the applied first rate');
      assert.equal(rate, 6);
      if (scenario.startsWith('external')) rate = 2;
      h.advanceTime(1500);
      if (scenario.endsWith('thrown')) throw new Error('pre-rate failure');
      return { ok: false, reason: 'stale_state' };
    };
    const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
    assert.equal(result.ok, false);
    assert.equal(result.completedPlacements, 1);
    assert.equal(result.attemptedPlacements, 2);
    assert.equal(result.failedCycle.overrunMs, 500);
    assert.equal(result.overruns, 1);
    assert.equal(rate, scenario.startsWith('external') ? 2 : 3, scenario);
    assert.equal(h.runner.getState().running, false);
  }
});

test('existing control opts in only Simple and preserves 2000 default, 1333 option and 1000 minimum', async () => {
  for (const blueprintId of ['simple-bricks', 'bridge']) {
    let config;
    const controller = { worldRevision: 3, board: { blueprintId }, operationState: 'idle', operationBlocked: () => false };
    const coordinator = { summary: () => ({ remainingPlacements: 1 }), getState: () => ({ queue: [{}] }) };
    const runner = { cycleTimeMs: 0, getState: () => ({ running: false }), setCycleTime(ms) { this.cycleTimeMs = ms; },
      async run(options) { config = options; return { ok: true }; } };
    const control = createPlacementStreamControl({ runner, coordinator, controller });
    const call = input => control.tool.execute({ expectedWorldRevision: 3, ...input });
    assert.equal(control.getState().cycleTimeMs, 2000);
    await call({ action: 'start' });
    assert.equal(config.cycleTimeMs, 2000);
    assert.equal(config.timingMode, blueprintId === 'simple-bricks' ? 'simple-smooth' : 'cadence');
    assert.equal((await call({ action: 'set_speed', cycleTimeMs: 1333 })).cycleTimeMs, 1333);
    assert.equal((await call({ action: 'set_speed', cycleTimeMs: 500 })).cycleTimeMs, 1000);
    assert.equal((await call({ action: 'set_speed', cycleTimeMs: 2000, expectedWorldRevision: 2 })).reason, 'stale_state');
  }
});

test('real timing helper is read-only, cancellation-aware and speed-limit bounded', async () => {
  const h = await simpleHarness();
  const placements = simplePlacements({ width: 1, height: 1, depth: 1, prefix: 'estimate' }, await h.call('get_workspace', {}));
  await h.call('plan_placement_queue', { streamId: 'estimate', mode: 'replace', finalChunk: true, placements, expectedWorldRevision: h.controller.worldRevision });
  const before = h.controller.getState(), board = h.board.getPlacements();
  const timing = await h.coordinator.estimateCycleTiming();
  assert.equal(timing.ok, true);
  assert.equal(timing.stages.length, 6);
  assert.ok(timing.physicalDurationMs > 0);
  assert.deepEqual(h.controller.getState(), before);
  assert.deepEqual(h.board.getPlacements(), board);
  assert.equal((await h.coordinator.estimateCycleTiming({ physicalSpeedMmS: 651 })).reason, 'speed_limit');
  const abort = new AbortController(); abort.abort();
  assert.equal((await h.coordinator.estimateCycleTiming({ signal: abort.signal })).reason, 'cancelled');
});

test('live Human adoption and source reassignment continue between smooth cycles', async () => {
  const h = await simpleHarness();
  h.board.loadBlueprint({ blueprintId: 'simple-bricks', targets: [] }, { expectedWorldRevision: h.controller.worldRevision });
  const placements = simplePlacements({ width: 3, height: 1, depth: 1, prefix: 'human-smooth' }, await h.call('get_workspace', {}));
  await h.call('plan_placement_queue', { streamId: 'human-smooth', mode: 'replace', finalChunk: true,
    placements, cycleTimeMs: 1000, expectedWorldRevision: h.controller.worldRevision });
  const execute = h.coordinator.execute.bind(h.coordinator);
  let humanBrickId, stolenSourceId;
  h.coordinator.execute = async options => {
    const result = await execute(options);
    if (result.ok && !humanBrickId) {
      const queue = h.coordinator.getState().queue;
      const adopted = queue[1];
      const blue = h.controller.getBricks().find(b => b.colour === 'blue' && !b.heldBy && !b.placementType);
      humanBrickId = blue.id;
      assert.equal(h.controller.beginHumanCarry(blue.id).ok, true);
      const preview = h.authority.preview({ brickId: blue.id, position: adopted.candidate.position, yawRad: adopted.yawRad });
      assert.equal(preview.ok, true);
      assert.equal(h.controller.commitHumanPlacement({ brickId: blue.id, position: preview.candidate.position, yawRad: preview.candidate.yawRad }).ok, true);
      stolenSourceId = h.coordinator.getState().queue[0].brickId;
      assert.equal(h.controller.beginHumanCarry(stolenSourceId).ok, true, 'take the next planned source before the next cycle');
      assert.notEqual(h.coordinator.getState().queue[0].brickId, stolenSourceId);
    }
    return result;
  };
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.completedPlacements, 2);
  const status = h.coordinator.getStreamStatus({ streamId: 'human-smooth', limit: 50 });
  assert.deepEqual(status.counts, { COMPLETED: 2, ADOPTED: 1 });
  assert.equal(status.entries.filter(e => e.actualBrickId === humanBrickId).length, 1);
  assert.ok(status.entries.some(e => e.sourceReassigned));
  assert.equal(h.controller.getBricks().find(b => b.id === stolenSourceId).heldBy, 'human');
  assert.equal(h.controller.getBricks().find(b => b.id === humanBrickId).colour, 'blue');
});

test('live cancellation during motion stops the stream without starting the next placement', async () => {
  const h = await simpleHarness(), abort = new AbortController();
  h.board.loadBlueprint({ blueprintId: 'simple-bricks', targets: [] }, { expectedWorldRevision: h.controller.worldRevision });
  const placements = simplePlacements({ width: 2, height: 1, depth: 1, prefix: 'cancel-smooth' }, await h.call('get_workspace', {}));
  await h.call('plan_placement_queue', { streamId: 'cancel-smooth', mode: 'replace', finalChunk: true,
    placements, expectedWorldRevision: h.controller.worldRevision });
  assert.equal(h.controller.setSimulationPlaybackMultiplier(3).ok, true);
  let starts = 0;
  const unsubscribe = h.controller.subscribe(event => { if (event.type === 'motion_started') { starts++; abort.abort(); } });
  try {
    const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000, signal: abort.signal });
    assert.equal(result.reason, 'cancelled');
    assert.equal(starts, 1);
    assert.equal(result.completedPlacements, 0);
    assert.equal(h.board.getPlacements().length, 0);
    assert.equal(h.controller.getState().operationState, 'idle');
    assert.equal(h.controller.operationBlocked(), false);
    assert.equal(h.runner.getState().running, false);
    assert.equal(h.controller.getState().simulationPlaybackMultiplier, 3);
  } finally { unsubscribe(); }
});

test('smooth early failure after one completed cycle restores the previous playback rate', async () => {
  const h = await simpleHarness();
  h.board.loadBlueprint({ blueprintId: 'simple-bricks', targets: [] }, { expectedWorldRevision: h.controller.worldRevision });
  const placements = simplePlacements({ width: 2, height: 1, depth: 1, prefix: 'pause-restore' }, await h.call('get_workspace', {}));
  await h.call('plan_placement_queue', { streamId: 'pause-restore', mode: 'replace', finalChunk: true,
    placements, expectedWorldRevision: h.controller.worldRevision });
  assert.equal(h.controller.setSimulationPlaybackMultiplier(3).ok, true);
  const get = h.coordinator.getState.bind(h.coordinator);
  h.coordinator.getState = () => { const state = get(); if (h.board.getPlacements().length) state.queue = []; return state; };
  const result = await h.runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
  assert.equal(result.reason, 'cycle_waiting');
  assert.equal(result.completedPlacements, 1);
  assert.equal(h.controller.getState().operationState, 'idle');
  assert.equal(h.controller.getState().simulationPlaybackMultiplier, 3);
});

test('real controller continuous 3x4 wall: timing, legal placements and unchanged limits', async t => {
  const h = await simpleHarness();
  h.board.loadBlueprint({ blueprintId: 'simple-bricks', targets: [] }, { expectedWorldRevision: h.controller.worldRevision });
  const placements = simplePlacements({ width: 3, height: 4, depth: 1, prefix: 'smooth-wall' }, await h.call('get_workspace', {}));
  const planned = await h.call('plan_placement_queue', { streamId: 'smooth-wall', mode: 'replace', finalChunk: true,
    cycleTimeMs: 1000, placements, expectedWorldRevision: h.controller.worldRevision });
  assert.equal(planned.ok, true);
  const limits = [h.controller.speedLimitMmS, h.controller.accelerationLimitMmS2, h.controller.jointSpeedLimitRadS, h.controller.jointAccelerationLimitRadS2];
  // Use real wall-clock playback and the production cadence wait in this test.
  const runner = new PlannedPlacementCycleRunner({ coordinator: h.coordinator, controller: h.controller });
  assert.equal(h.controller.setSimulationPlaybackMultiplier(3).ok, true);
  const result = await runner.run({ timingMode: 'simple-smooth', cycleTimeMs: 1000 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.completedPlacements, 12);
  assert.equal(h.board.getPlacements().length, 12);
  assert.equal(h.coordinator.summary().remainingPlacements, 0);
  assert.equal(new Set(h.board.getPlacements().map(b => b.brickId)).size, 12);
  assert.equal(h.controller.getState().heldBrickId, null);
  assert.equal(h.controller.getState().operationState, 'idle');
  assert.equal(h.controller.getState().simulationPlaybackMultiplier, 3);
  assert.deepEqual([h.controller.speedLimitMmS, h.controller.accelerationLimitMmS2, h.controller.jointSpeedLimitRadS, h.controller.jointAccelerationLimitRadS2], limits);
  assert.ok(result.results.every(r => r.playbackMultiplier >= 1 && r.playbackMultiplier <= 40));
  assert.equal(result.overruns, result.results.filter(r => r.executionElapsedMs > 1000).length);
  t.diagnostic(JSON.stringify({ label: 'Node real-controller timing; not browser acceptance', totalElapsedMs: result.totalElapsedMs,
    overruns: result.overruns, cycles: result.results.map(r => ({ elapsedMs: r.executionElapsedMs, physicalMs: r.physicalDurationMs,
      playbackMs: r.playbackDurationMs, multiplier: r.playbackMultiplier, overrunMs: r.overrunMs })) }));
});
