import { spawnSync } from 'node:child_process';

const testFiles = [
  'tests/js/robot-kinematics.test.js',
  'tests/js/robot-controller.test.js',
  'tests/js/latch-collision.test.js',
  'tests/js/reliability.test.js',
  'tests/js/logo-webmcp.test.js'
];
const checks = [
  ...testFiles.map((file) => [process.execPath, [file]]),
  [process.execPath, ['scripts/qualify_workspace.mjs']],
  [process.execPath, ['scripts/reliability.mjs']],
  [process.execPath, ['scripts/performance_check.mjs']]
];
for (const [command, args] of checks) {
  console.log('\n$ ' + [command, ...args].join(' '));
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
