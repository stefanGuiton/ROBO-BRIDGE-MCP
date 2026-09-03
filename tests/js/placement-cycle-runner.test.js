import test from 'node:test';
import assert from 'node:assert/strict';

import { PlannedPlacementCycleRunner } from '../../apps/web/src/robot/placement-cycle-runner.js';

test('planned cycle starts bricks at a deterministic one-second cadence without host polling', async () => {
  let now = 0;
  let worldRevision = 0;
  const starts = [];
  const queue = Array.from({ length: 3 }, (_, index) => ({
    proposalId: `proposal-${index}`,
    placementId: `placement-${index}`,
    expectedWorldRevision: 0
  }));
  const coordinator = {
    getState() {
      return {
        worldRevision,
        queue: queue.map((proposal) => ({ ...proposal })),
        stream: { streamId: 'cycle-test', cycleTimeMs: 1000, remainingPlacements: queue.length }
      };
    },
    async execute({ proposalId, playbackMultiplier }) {
      starts.push(now);
      assert.equal(proposalId, queue[0].proposalId);
      now += 720;
      const completed = queue.shift();
      worldRevision += 1;
      if (queue[0]) queue[0].expectedWorldRevision = worldRevision;
      return {
        ok: true,
        proposalId,
        placementId: completed.placementId,
        brickId: `brick-${starts.length}`,
        physicalDurationMs: 10_000,
        playbackDurationMs: 10_000 / playbackMultiplier,
        executionWallDurationMs: 720,
        remainingPlacements: queue.length,
        worldRevision
      };
    }
  };
  const controller = { getState: () => ({ worldRevision }) };
  const runner = new PlannedPlacementCycleRunner({
    coordinator,
    controller,
    clock: () => now,
    wait: async (durationMs) => { now += durationMs; }
  });
  const result = await runner.run({ cycleTimeMs: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.completedPlacements, 3);
  assert.deepEqual(starts, [0, 1000, 2000]);
  assert.equal(result.overruns, 0);
});

test('planned cycle rejects unsafe timing, overlap, and oversized streams', async () => {
  const coordinator = {
    getState: () => ({ queue: [], stream: { cycleTimeMs: 1000, remainingPlacements: 51 } })
  };
  const controller = { getState: () => ({ worldRevision: 0 }) };
  const runner = new PlannedPlacementCycleRunner({ coordinator, controller });
  assert.equal((await runner.run({ cycleTimeMs: 249 })).reason, 'invalid_cycle_time');
  assert.equal((await runner.run({ cycleTimeMs: 1000 })).reason, 'cycle_placement_limit');
});

test('cadence changes apply at cycle boundaries without losing the existing queue', async () => {
  let now = 0, revision = 0, remaining = 4, runner;
  const starts = [];
  const coordinator = {
    getState: () => ({ queue: [{ proposalId: 'next', expectedWorldRevision: revision }], stream: { remainingPlacements: remaining } }),
    async execute() {
      starts.push(now); now += 100; remaining--; revision++;
      if (remaining === 3) runner.setCycleTime(1333);
      if (remaining === 2) runner.setCycleTime(1000);
      return { ok: true, placementId: String(revision), remainingPlacements: remaining, worldRevision: revision };
    }
  };
  runner = new PlannedPlacementCycleRunner({ coordinator, controller: { getState: () => ({ worldRevision: revision }) }, clock: () => now, wait: async ms => { now += ms; } });
  const result = await runner.run({ cycleTimeMs: 2000 });
  assert.equal(result.ok, true);
  assert.deepEqual(starts, [0, 2000, 3333, 4333]);
  assert.equal(result.completedPlacements, 4);
});
