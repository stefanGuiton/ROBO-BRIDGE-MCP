import { createLiveHarness, runToolOnlyRound } from '../tests/helpers/live-harness.js';

const TRIALS = 20;
const REQUIRED_PASSES = 19;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0x10c0de);
const { controller, handlers } = createLiveHarness({ timeScale: 0 });
const results = [];

for (let trial = 1; trial <= TRIALS; trial += 1) {
  const started = performance.now();
  try {
    if (trial > 1) {
      const before = await handlers.getRobotState();
      const reset = await handlers.resetWorkcell({ expectedWorldRevision: before.worldRevision });
      if (!reset.ok) throw new Error(`reset:${reset.reason}`);
    }

    // Small deterministic human interference before each round. This changes the
    // authoritative world revision and proves that perception follows live state.
    for (const brick of controller.getBricks().filter((item) => !item.snapped)) {
      const dx = (rng() * 2 - 1) * 1.25;
      const dy = (rng() * 2 - 1) * 1.25;
      const moved = controller.moveLooseBrick(brick.id, {
        xMm: brick.position.xMm + dx,
        yMm: brick.position.yMm + dy,
        zMm: brick.position.zMm
      });
      if (!moved.ok) throw new Error(`human_interference:${moved.reason}`);
    }

    const round = await runToolOnlyRound(handlers);
    if (!round.ok) throw new Error(`${round.stage}:${round.result?.reason ?? round.latch?.reason ?? round.release?.reason ?? 'round_failed'}`);
    const final = await handlers.getBuildState({ limit: 20 });
    const correct = final.progress.correctTargets === final.progress.totalTargets &&
      final.progress.totalTargets >= 2 && final.contributions.agent === final.progress.totalTargets;
    if (!correct) throw new Error('final_state_mismatch');
    results.push({ trial, ok: true, durationMs: performance.now() - started, worldRevision: final.worldRevision });
  } catch (error) {
    results.push({ trial, ok: false, durationMs: performance.now() - started, reason: error?.code ?? error?.message ?? String(error) });
  }
}

const passCount = results.filter((item) => item.ok).length;
const durations = results.map((item) => item.durationMs).sort((a, b) => a - b);
const percentile = (p) => durations[Math.min(durations.length - 1, Math.floor((durations.length - 1) * p))] ?? null;
const summary = {
  trialCount: TRIALS,
  requiredPasses: REQUIRED_PASSES,
  passCount,
  failCount: TRIALS - passCount,
  acceptanceMet: passCount >= REQUIRED_PASSES,
  p50DurationMs: percentile(0.5),
  p95DurationMs: percentile(0.95),
  failures: results.filter((item) => !item.ok)
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.acceptanceMet) process.exitCode = 1;
