import { runPackagedCli } from './bootstrap.mjs';
runPackagedCli('tools/submission/hero-runner.mjs').then((code) => process.exit(code), (error) => {
  process.stderr.write(`${error.stack ?? error.message ?? String(error)}\n`);
  process.exit(1);
});
