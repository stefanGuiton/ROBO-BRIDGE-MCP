import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testFiles = [
  'tests/js/logo-palette.test.js',
  'tests/js/logo-compiler.test.js',
  'tests/js/logo-inventory.test.js',
  'tests/js/logo-board.test.js',
  'tests/js/logo-game.test.js'
];
const evidenceDir = path.join(root, 'evidence', 'oracle2');
fs.mkdirSync(evidenceDir, { recursive: true });

const generated = [
  {
    name: 'randomized invariants',
    script: 'scripts/run_randomized_invariants.mjs',
    output: path.join(evidenceDir, 'randomized-invariants.json')
  },
  {
    name: 'compiler benchmarks',
    script: 'scripts/run_logo_benchmarks.mjs',
    output: path.join(evidenceDir, 'compiler-benchmarks.json')
  },
  {
    name: 'manual flow',
    script: 'scripts/run_logo_manual_flow.mjs',
    output: path.join(evidenceDir, 'manual-flow.json')
  }
];

// Importing test modules in one process avoids the managed Windows policy that
// blocks Node's child-process and worker spawning. node:test still reports the
// assertions and sets the process exit code if any test fails.
for (const file of testFiles) await import(pathToFileURL(path.join(root, file)).href);

const scriptFailures = [];
for (const item of generated) {
  process.argv[2] = item.output;
  try {
    await import(pathToFileURL(path.join(root, item.script)).href);
  } catch (error) {
    scriptFailures.push({ name: item.name, error: String(error?.stack ?? error) });
    process.exitCode = 1;
  }
}

function writeResult() {
  const result = {
    project: 'LOGO ROBO',
    subsystem: 'Oracle 2 compiler and compiler-game foundation',
    sourceBaseSha: '09e323b5fa44b80dcbac38c97440962bed13811a',
    testModules: testFiles,
    generatedScripts: generated.map((item) => item.script),
    scriptFailures,
    ok: process.exitCode === undefined || process.exitCode === 0,
    evidence: generated.map((item) => path.relative(root, item.output).replaceAll(path.sep, '/'))
  };
  fs.writeFileSync(path.join(evidenceDir, 'verification.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

process.on('exit', writeResult);
