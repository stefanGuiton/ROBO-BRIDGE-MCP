import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPackagedModule, runPackagedCli } from './bootstrap.mjs';
const m = await loadPackagedModule('tools/submission/submission-gate.mjs');
export const { runSubmissionGate } = m;
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPackagedCli('tools/submission/submission-gate.mjs').then((code) => process.exit(code), (error) => {
    process.stderr.write(`${error.stack ?? error.message ?? String(error)}\n`);
    process.exit(1);
  });
}
