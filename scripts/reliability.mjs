import fs from 'node:fs';
import path from 'node:path';
import { BoardAdapter } from '../apps/web/src/bricks/board-adapter.js';
import { makeBrick } from '../apps/web/src/bricks/brick-spec.js';
import { RobotController } from '../apps/web/src/robot/controller.js';
import { CHALLENGE_LAYOUT } from '../apps/web/src/robot/ur10-definition.js';

async function oneTrial(index) {
  const board = new BoardAdapter([{ id: 'target', colour: 'white', position: { xMm: 655, yMm: 220, zMm: 34.8 }, yawRad: 0 }]);
  const brick = makeBrick({ id: 'brick-' + index, colour: 'white', xMm: 520, yMm: -230, zMm: 34.8 });
  const robot = new RobotController({ board, bricks: [brick], timeScale: 0 });
  const started = performance.now();
  try {
    await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 560 });
    await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupTcp, speedMmS: 260 });
    const latch = robot.latch();
    if (!latch.success) throw new Error('latch:' + latch.reason);
    await robot.moveTool({ ...CHALLENGE_LAYOUT.pickupAboveTcp, speedMmS: 300 });
    await robot.moveTool({ ...CHALLENGE_LAYOUT.targetAboveTcp, speedMmS: 560 });
    await robot.moveTool({ ...CHALLENGE_LAYOUT.targetTcp, speedMmS: 250 });
    const release = robot.unlatch();
    if (!release.success || !release.snapped) throw new Error('unlatch:' + release.reason);
    await robot.moveTool({ ...CHALLENGE_LAYOUT.targetAboveTcp, speedMmS: 300 });
    const final = robot.getBricks()[0];
    const correct = final.snapped && final.placedTargetId === 'target' &&
      final.position.xMm === 655 && final.position.yMm === 220;
    if (!correct) throw new Error('final_state_mismatch');
    return {
      trial: index,
      ok: true,
      durationMs: performance.now() - started,
      robotRevision: robot.robotRevision,
      worldRevision: robot.worldRevision
    };
  } catch (error) {
    return {
      trial: index,
      ok: false,
      durationMs: performance.now() - started,
      reason: error.code ?? error.message,
      details: error.details ?? null
    };
  }
}

const results = [];
for (let i = 1; i <= 50; i += 1) results.push(await oneTrial(i));
const passCount = results.filter((row) => row.ok).length;
const summary = {
  trialCount: 50,
  passCount,
  failCount: 50 - passCount,
  acceptanceMet: passCount >= 49,
  meanDurationMs: results.reduce((sum, row) => sum + row.durationMs, 0) / results.length,
  failures: results.filter((row) => !row.ok)
};
const out = path.resolve('evidence/oracle1/reliability-results.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (!summary.acceptanceMet) process.exitCode = 1;
