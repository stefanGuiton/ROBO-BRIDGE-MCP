import fs from 'node:fs';
import path from 'node:path';
import { inverseKinematics, forwardKinematics } from '../apps/web/src/robot/kinematics.js';
import { UR10_DEFINITION } from '../apps/web/src/robot/ur10-definition.js';
import { sampleChallengeWorkspace } from '../apps/web/src/robot/workspace.js';
import { angleDistance, distance3 } from '../apps/web/src/robot/math.js';

const points = sampleChallengeWorkspace(1000);
let prior = Array.from(UR10_DEFINITION.homeJointsRad);
const rows = [];
for (let i = 0; i < points.length; i += 1) {
  const target = points[i];
  const result = inverseKinematics(target, prior, UR10_DEFINITION, { maxBranchJumpRad: 1.65 });
  if (!result.ok) {
    rows.push({ index: i, ok: false, target, reason: result.reason, diagnostics: result.diagnostics ?? null });
    continue;
  }
  const fk = forwardKinematics(result.jointsRad, UR10_DEFINITION);
  const positionErrorMm = distance3(fk.tcp, target);
  const maxJointJumpRad = Math.max(...result.jointsRad.map((value, j) => angleDistance(value, prior[j])));
  rows.push({
    index: i,
    ok: true,
    target,
    positionErrorMm,
    orientationErrorRad: result.orientationErrorRad,
    maxJointJumpRad,
    iterations: result.iterations
  });
  prior = result.jointsRad;
}
const passed = rows.filter((row) => row.ok);
const sorted = passed.map((row) => row.positionErrorMm).sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? null;
const summary = {
  sampleCount: rows.length,
  passCount: passed.length,
  failCount: rows.length - passed.length,
  meanPositionErrorMm: passed.length ? passed.reduce((sum, row) => sum + row.positionErrorMm, 0) / passed.length : null,
  p95PositionErrorMm: p95,
  maxPositionErrorMm: sorted.at(-1) ?? null,
  maxOrientationErrorRad: passed.length ? Math.max(...passed.map((row) => row.orientationErrorRad)) : null,
  maxJointJumpRad: passed.length ? Math.max(...passed.map((row) => row.maxJointJumpRad)) : null,
  failures: rows.filter((row) => !row.ok).slice(0, 20)
};
const out = path.resolve('evidence/oracle1/workspace-qualification.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (summary.failCount) process.exitCode = 1;
