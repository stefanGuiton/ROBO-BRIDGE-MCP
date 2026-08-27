import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { BoardAdapter } from '../apps/web/src/bricks/board-adapter.js';
import { makeBrick } from '../apps/web/src/bricks/brick-spec.js';
import { RobotController } from '../apps/web/src/robot/controller.js';
import { CHALLENGE_LAYOUT } from '../apps/web/src/robot/ur10-definition.js';

const brickZ = CHALLENGE_LAYOUT.tray.floorZ + 4.8;
const targetZ = CHALLENGE_LAYOUT.board.surfaceZ + 4.8;
const board = new BoardAdapter([{ id: 'target', colour: 'white', position: { xMm: 655, yMm: 220, zMm: targetZ }, yawRad: 0 }]);
const robot = new RobotController({
  board,
  bricks: [makeBrick({ id: 'brick', colour: 'white', xMm: 520, yMm: -230, zMm: brickZ })],
  timeScale: 0
});
const sequence = [
  ['pickup-above', CHALLENGE_LAYOUT.pickupAboveTcp, 560],
  ['pickup', CHALLENGE_LAYOUT.pickupTcp, 260],
  ['lift', CHALLENGE_LAYOUT.pickupAboveTcp, 300],
  ['target-above', CHALLENGE_LAYOUT.targetAboveTcp, 560],
  ['target', CHALLENGE_LAYOUT.targetTcp, 250],
  ['retreat', CHALLENGE_LAYOUT.targetAboveTcp, 300]
];
const rows = [];
for (const [name, target, speedMmS] of sequence) {
  const started = performance.now();
  const plan = robot.planMove({ ...target, speedMmS });
  const planningMs = performance.now() - started;
  if (!plan.ok) throw new Error(name + ': ' + plan.reason);
  rows.push({ name, distanceMm: plan.distanceMm, commandedDurationMs: plan.durationMs, planningMs, samples: plan.points.length });
  await robot.moveTool({ ...target, speedMmS });
  if (name === 'pickup') robot.latch();
  if (name === 'target') robot.unlatch();
}
const result = {
  environment: 'Node.js local benchmark; planning and controller timing only',
  sequence: rows,
  totalCommandedDurationMs: rows.reduce((sum, row) => sum + row.commandedDurationMs, 0),
  totalPlanningMs: rows.reduce((sum, row) => sum + row.planningMs, 0),
  maxPlanningMs: Math.max(...rows.map((row) => row.planningMs))
};
const out = path.resolve('evidence/oracle1/performance-results.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
