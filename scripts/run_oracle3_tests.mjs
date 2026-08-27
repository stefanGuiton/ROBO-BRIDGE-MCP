import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testFiles = [
  'tests/js/oracle3-perception.test.js',
  'tests/js/oracle3-runtime-bridge.test.js',
  'tests/js/oracle3-agent-loop.test.js',
  'tests/js/oracle3-performance.test.js',
  'tests/js/oracle3-webmcp.test.js',
  'tests/js/oracle3-production-runtime.test.js'
];
const evidenceDir = path.join(root, 'evidence', 'oracle3');
fs.mkdirSync(evidenceDir, { recursive: true });

for (const file of testFiles) await import(pathToFileURL(path.join(root, file)).href);

const generated = [
  ['scripts/oracle3_benchmark.mjs', 'performance.json'],
  ['scripts/oracle3_reliability.mjs', 'reliability-results.json'],
  ['scripts/oracle3_visual_scenarios.mjs', 'visual-scenarios.json']
];
const scriptFailures = [];
for (const [script] of generated) {
  try {
    await import(pathToFileURL(path.join(root, script)).href);
  } catch (error) {
    scriptFailures.push({ script, error: String(error?.stack ?? error) });
    process.exitCode = 1;
  }
}

function writeResult() {
  const result = {
    project: 'LOGO ROBO',
    subsystem: 'Oracle 3 perception and primitive WebMCP integration',
    sourceBaseSha: '09e323b5fa44b80dcbac38c97440962bed13811a',
    testModules: testFiles,
    generatedScripts: generated.map(([script]) => script),
    scriptFailures,
    productionRuntimeAdapter: 'apps/web/src/logo/runtime.js',
    toolRegistration: 'apps/web/src/webmcp/register-oracle3-tools.js',
    ok: (process.exitCode ?? 0) === 0 && scriptFailures.length === 0,
    evidence: generated.map(([, output]) => `evidence/oracle3/${output}`)
  };
  fs.writeFileSync(path.join(evidenceDir, 'verification.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

process.on('exit', writeResult);
