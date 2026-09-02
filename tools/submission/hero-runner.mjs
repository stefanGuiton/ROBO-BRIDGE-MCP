import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSubmissionGate } from './submission-gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ROBO_BRIDGE_REPO_ROOT ? path.resolve(process.env.ROBO_BRIDGE_REPO_ROOT) : path.resolve(HERE, '..', '..');
const attempts = Number(process.argv[2] ?? 1);
if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 100) {
  process.stderr.write('Hero attempts must be an integer from 1 to 100.\n');
  process.exit(2);
}

const result = await runSubmissionGate({
  browserOnly: true,
  smoke: false,
  profile: 'auto',
  heroAttempts: attempts,
  resetCycles: Math.min(50, Math.max(3, attempts)),
  output: path.join(ROOT, 'artifacts', 'submission-evidence', `hero-${attempts}`)
});
process.exit(result.exitCode);
