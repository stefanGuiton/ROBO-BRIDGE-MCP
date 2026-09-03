import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STATUS,
  extractLastJsonObject,
  makeTest,
  parseTapSummary,
  runCommand,
  summarizeTests,
  writeReport
} from './core.mjs';
import { runBrowserSuite } from './browser-suite.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ROBO_BRIDGE_REPO_ROOT ? path.resolve(process.env.ROBO_BRIDGE_REPO_ROOT) : path.resolve(HERE, '..', '..');
const REQUIRED_BASELINE_SHA = 'dc062cfa8f986b4a05228fe5c48f7b82c5d6bb6a';

function parseArguments(argv) {
  const options = {
    smoke: false,
    browserOnly: false,
    profile: process.env.SUBMISSION_PROFILE ?? 'auto',
    catalogueName: process.env.SUBMISSION_TOOL_CATALOGUE ?? null,
    heroAttempts: Number(process.env.SUBMISSION_HERO_ATTEMPTS ?? 1),
    resetCycles: Number(process.env.SUBMISSION_RESET_CYCLES ?? 50),
    output: process.env.SUBMISSION_EVIDENCE_DIR ?? path.join(ROOT, 'artifacts', 'submission-evidence')
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--smoke') options.smoke = true;
    else if (item === '--browser-only') options.browserOnly = true;
    else if (item === '--profile') options.profile = argv[++index];
    else if (item === '--catalogue') options.catalogueName = argv[++index];
    else if (item === '--hero-attempts') options.heroAttempts = Number(argv[++index]);
    else if (item === '--reset-cycles') options.resetCycles = Number(argv[++index]);
    else if (item === '--output') options.output = path.resolve(ROOT, argv[++index]);
    else if (item === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  if (!['auto', 'current', 'final'].includes(options.profile)) throw new Error('profile must be auto, current, or final.');
  if (!Number.isSafeInteger(options.heroAttempts) || options.heroAttempts < 0 || options.heroAttempts > 100) throw new Error('hero-attempts must be an integer from 0 to 100.');
  if (!Number.isSafeInteger(options.resetCycles) || options.resetCycles < 1 || options.resetCycles > 500) throw new Error('reset-cycles must be an integer from 1 to 500.');
  if (options.smoke) {
    options.heroAttempts = Math.min(options.heroAttempts || 1, 1);
    options.resetCycles = Math.min(options.resetCycles, 3);
  }
  return options;
}

function usage() {
  return `ROBO BRIDGE MCP submission gate\n\n` +
    `node tools/submission/submission-gate.mjs [options]\n\n` +
    `--smoke                 Run the short regression and browser path.\n` +
    `--browser-only          Skip command-line regression suites.\n` +
    `--profile auto|current|final\n` +
    `--catalogue minimum|current|final\n` +
    `--hero-attempts N\n` +
    `--reset-cycles N\n` +
    `--output PATH\n`;
}

function executable(name) {
  if (name === 'npm') return process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (name === 'python') return process.platform === 'win32' ? 'python' : 'python3';
  return name;
}

function commandReason(result) {
  if (result.timedOut) return 'COMMAND_TIMEOUT';
  if (result.spawnError) return 'COMMAND_NOT_AVAILABLE';
  return result.exitCode === 0 ? null : 'COMMAND_FAILED';
}

async function runOneCommand(spec) {
  const result = await runCommand(executable(spec.command), spec.args, {
    cwd: ROOT,
    timeoutMs: spec.timeoutMs,
    maxOutputCharacters: 3_000_000,
    env: spec.env
  });
  const combined = `${result.stdout}\n${result.stderr}`;
  const tap = spec.tap ? parseTapSummary(combined) : null;
  const json = spec.json ? extractLastJsonObject(result.stdout) : null;
  const status = result.exitCode === 0 && !result.timedOut && !result.spawnError ? STATUS.PASS : STATUS.FAIL;
  return {
    spec,
    result,
    test: makeTest({
      id: spec.id,
      area: spec.area,
      status,
      reason: status === STATUS.PASS ? null : commandReason(result),
      durationMs: result.durationMs,
      details: {
        command: result.command,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        spawnError: result.spawnError,
        tap,
        json
      }
    })
  };
}

function commandPlan(options) {
  if (options.browserOnly) return [];
  if (options.smoke) {
    return [
      { id: 'submission_gate_unit', area: 'UNIT', command: 'node', args: ['--test', '--test-concurrency=1', 'tests/js/submission-gate.test.js'], timeoutMs: 120_000, tap: true },
      { id: 'webmcp_regression', area: 'WEBMCP', command: 'npm', args: ['run', 'test:webmcp'], timeoutMs: 300_000, tap: true }
    ];
  }
  return [
    { id: 'release_build', area: 'BUILD', command: 'npm', args: ['run', 'build:release'], timeoutMs: 1_200_000, json: true },
    { id: 'javascript_regression', area: 'UNIT', command: 'npm', args: ['run', 'test:js'], timeoutMs: 900_000, tap: true },
    { id: 'webmcp_regression', area: 'WEBMCP', command: 'npm', args: ['run', 'test:webmcp'], timeoutMs: 300_000, tap: true },
    { id: 'robot_regression', area: 'UNIT', command: 'npm', args: ['run', 'test:robot'], timeoutMs: 300_000, tap: true },
    { id: 'player_regression', area: 'UNIT', command: 'npm', args: ['run', 'test:player'], timeoutMs: 300_000, tap: true },
    { id: 'compiler_regression', area: 'UNIT', command: 'npm', args: ['run', 'test:compiler'], timeoutMs: 300_000, tap: true },
    { id: 'existing_reliability_20', area: 'RELIABILITY', command: 'npm', args: ['run', 'test:reliability'], timeoutMs: 300_000, json: true }
  ];
}

async function gitValue(args) {
  const result = await runCommand('git', args, { cwd: ROOT, timeoutMs: 20_000, maxOutputCharacters: 20_000 });
  return { result, value: result.exitCode === 0 ? result.stdout.trim() : null };
}

async function sourceTests() {
  const tests = [];
  const ancestor = await gitValue(['merge-base', '--is-ancestor', REQUIRED_BASELINE_SHA, 'HEAD']);
  tests.push(makeTest({
    id: 'source.required_baseline_ancestor',
    area: 'STATIC',
    status: ancestor.result.exitCode === 0 ? STATUS.PASS : STATUS.FAIL,
    reason: ancestor.result.exitCode === 0 ? null : 'REQUIRED_BASELINE_NOT_ANCESTOR',
    details: { requiredBaselineSha: REQUIRED_BASELINE_SHA, command: ancestor.result.command, stderr: ancestor.result.stderr }
  }));
  const status = await gitValue(['status', '--porcelain', '--untracked-files=no']);
  tests.push(makeTest({
    id: 'source.no_tracked_worktree_changes',
    area: 'STATIC',
    status: status.result.exitCode === 0 && !status.value ? STATUS.PASS : STATUS.FAIL,
    reason: status.result.exitCode !== 0 ? 'GIT_STATUS_FAILED' : status.value ? 'TRACKED_WORKTREE_CHANGES_PRESENT' : null,
    details: { porcelain: status.value ?? '', command: status.result.command }
  }));
  return tests;
}

async function staticToolingTest() {
  const files = [
    'tools/submission/core.mjs',
    'tools/submission/cdp-browser.mjs',
    'tools/submission/browser-preload.mjs',
    'tools/submission/browser-support.mjs',
    'tools/submission/current-contracts.mjs',
    'tools/submission/future-contracts.mjs',
    'tools/submission/current-acceptance.mjs',
    'tools/submission/future-acceptance.mjs',
    'tools/submission/browser-suite.mjs',
    'tools/submission/submission-gate.mjs',
    'tools/submission/hero-runner.mjs',
    'tests/js/submission-gate.test.js'
  ];
  const results = [];
  for (const file of files) {
    results.push(await runCommand('node', ['--check', file], { cwd: ROOT, timeoutMs: 30_000, maxOutputCharacters: 50_000 }));
  }
  let catalogueError = null;
  try { JSON.parse(await readFile(path.join(HERE, 'catalogues.json'), 'utf8')); }
  catch (error) { catalogueError = String(error.message ?? error); }
  const failures = results.filter((item) => item.exitCode !== 0 || item.timedOut || item.spawnError);
  return makeTest({
    id: 'static_submission_tooling',
    area: 'STATIC',
    status: failures.length === 0 && !catalogueError ? STATUS.PASS : STATUS.FAIL,
    reason: failures.length === 0 && !catalogueError ? null : 'SUBMISSION_TOOLING_STATIC_CHECK_FAILED',
    durationMs: results.reduce((sum, item) => sum + item.durationMs, 0),
    details: {
      files,
      catalogueError,
      failures: failures.map((item) => ({ command: item.command, exitCode: item.exitCode, stderr: item.stderr }))
    }
  });
}

function buildRegressionSummary(commandResults) {
  const summary = {};
  for (const item of commandResults) {
    summary[item.spec.id] = {
      status: item.test.status,
      durationMs: item.test.durationMs,
      tests: item.test.details.tap?.tests ?? item.test.details.json?.trialCount ?? null,
      passes: item.test.details.tap?.pass ?? item.test.details.json?.passCount ?? null,
      failures: item.test.details.tap?.fail ?? item.test.details.json?.failCount ?? null,
      exitCode: item.result.exitCode
    };
  }
  return summary;
}

function mandatoryNotAvailable(test, profile) {
  if (test.status !== STATUS.NOT_AVAILABLE) return false;
  if (profile === 'final') return true;
  return Boolean(test.required);
}

async function persistCommandLogs(commandResults, evidenceDirectory) {
  const directory = path.join(evidenceDirectory, 'logs');
  await mkdir(directory, { recursive: true });
  const files = [];
  for (const item of commandResults) {
    const stdout = path.join(directory, `${item.spec.id}.stdout.log`);
    const stderr = path.join(directory, `${item.spec.id}.stderr.log`);
    await writeFile(stdout, item.result.stdout, 'utf8');
    await writeFile(stderr, item.result.stderr, 'utf8');
    files.push(path.relative(evidenceDirectory, stdout).replaceAll('\\', '/'));
    files.push(path.relative(evidenceDirectory, stderr).replaceAll('\\', '/'));
  }
  return files;
}

async function existingFiles(directory, names) {
  const present = [];
  const missing = [];
  for (const name of names) {
    try { await access(path.join(directory, name)); present.push(name); }
    catch { missing.push(name); }
  }
  return { present, missing };
}

export async function runSubmissionGate(rawOptions = {}) {
  const options = { ...parseArguments([]), ...rawOptions };
  await rm(options.output, { recursive: true, force: true });
  await mkdir(options.output, { recursive: true });
  const catalogues = JSON.parse(await readFile(path.join(HERE, 'catalogues.json'), 'utf8'));
  const commandResults = [];
  const tests = [];

  tests.push(...await sourceTests());
  tests.push(await staticToolingTest());

  for (const spec of commandPlan(options)) {
    const item = await runOneCommand(spec);
    commandResults.push(item);
    tests.push(item.test);
    process.stdout.write(`[${item.test.status}] ${item.spec.area} ${item.spec.id}\n`);
  }

  const browserResult = await runBrowserSuite({
    rootDirectory: ROOT,
    evidenceDirectory: options.output,
    catalogues,
    catalogueName: options.catalogueName,
    profile: options.profile,
    heroAttempts: options.heroAttempts,
    resetCycles: options.resetCycles
  });
  tests.push(...browserResult.tests);

  const evidenceFiles = await persistCommandLogs(commandResults, options.output);
  const requiredEvidence = [
    ...(process.env.ROBO_BRIDGE_CAPTURE_SCREENSHOTS === '1' ? ['01-load.png', '02-bridge-before-update.png', '03-bridge-after-update.png', '12-reset.png'] : []),
    'final-runtime.html',
    'runtime-metadata.json',
    'console-log.json',
    'webmcp-browser-audit.json'
  ];
  const evidence = await existingFiles(options.output, requiredEvidence);
  if (process.env.ROBO_BRIDGE_CAPTURE_SCREENSHOTS !== '1') tests.push(makeTest({
    id: 'evidence.visual_user_verification', area: 'EVIDENCE', status: STATUS.SKIPPED_WITH_REASON,
    reason: 'VISUAL: USER-VERIFY PENDING', details: { screenshots: 'Not captured by user instruction; visual acceptance is not claimed.' }
  }));
  tests.push(makeTest({
    id: 'evidence_current_runtime_package',
    area: 'EVIDENCE',
    status: evidence.missing.length === 0 ? STATUS.PASS : STATUS.FAIL,
    reason: evidence.missing.length === 0 ? null : 'REQUIRED_CURRENT_EVIDENCE_MISSING',
    details: { required: requiredEvidence, present: evidence.present, missing: evidence.missing, commandLogs: evidenceFiles }
  }));

  const testIdCounts = new Map();
  for (const item of tests) testIdCounts.set(item.id, (testIdCounts.get(item.id) ?? 0) + 1);
  const duplicateTestIds = [...testIdCounts].filter(([, count]) => count > 1).map(([id]) => id);
  tests.push(makeTest({
    id: 'static.unique_test_ids',
    area: 'STATIC',
    status: duplicateTestIds.length === 0 ? STATUS.PASS : STATUS.FAIL,
    reason: duplicateTestIds.length === 0 ? null : 'DUPLICATE_TEST_IDS',
    details: { duplicateTestIds }
  }));

  const commit = await gitValue(['rev-parse', 'HEAD']);
  const branch = await gitValue(['branch', '--show-current']);
  const blockingTests = tests.filter((item) => item.status === STATUS.FAIL || mandatoryNotAvailable(item, options.profile));
  const annotationWarnings = (browserResult.webmcp?.annotationAudit ?? []).filter((item) => item.risk === 'HIGH' || item.risk === 'MEDIUM');
  const responseWarnings = (browserResult.webmcp?.responseSizes ?? []).filter((item) => item.severity !== 'NORMAL');
  const blockingIssues = blockingTests.map((item) => `${item.area}/${item.id}: ${item.reason ?? item.status}`);
  const status = blockingIssues.length ? STATUS.FAIL : STATUS.PASS;
  const summary = summarizeTests(tests);
  const report = {
    schemaVersion: 'robo-bridge.submission-gate.v2',
    project: 'ROBO BRIDGE MCP MAIN_DEMO',
    status,
    commitSha: commit.value,
    branch: branch.value,
    requiredBaselineSha: REQUIRED_BASELINE_SHA,
    timestamp: new Date().toISOString(),
    mode: {
      smoke: options.smoke,
      browserOnly: options.browserOnly,
      profile: options.profile,
      catalogue: browserResult.webmcp?.catalogueName ?? options.catalogueName ?? (options.profile === 'final' ? 'final' : 'current'),
      heroAttempts: options.heroAttempts,
      resetCycles: options.resetCycles
    },
    browser: browserResult.browser,
    tests,
    summary,
    regressions: buildRegressionSummary(commandResults),
    webmcp: browserResult.webmcp,
    console: browserResult.console ?? { errors: [], warnings: [], exceptions: [], blocking: [] },
    heroReliability: browserResult.heroReliability,
    trainResult: browserResult.trainResult ?? browserResult.heroReliability?.runs?.at(-1)?.finalTrainResult ?? null,
    missionResult: browserResult.missionResult ?? (browserResult.heroReliability?.runs?.at(-1)?.checks?.phaseComplete === true ? 'COMPLETE' : null),
    futureAvailability: browserResult.futureAvailability,
    screenshots: browserResult.screenshots,
    evidenceFiles: [...requiredEvidence.filter((name) => evidence.present.includes(name)), ...evidenceFiles],
    auditFindings: { annotationWarnings, responseWarnings },
    blockingIssues,
    rerun: {
      completeGate: 'npm run submission:gate',
      smoke: 'npm run submission:smoke',
      webmcpAudit: 'npm run webmcp:audit',
      hero1: 'npm run hero:1',
      hero3: 'npm run hero:3',
      hero10: 'npm run hero:10',
      finalStrictEvidence: 'npm run release:evidence'
    },
    notes: [
      'Future services are not mocked. Missing services remain NOT_AVAILABLE.',
      'A production service that exists without an acceptance facade fails the gate.',
      'The injected document.modelContext captures the production registration path. Native WebMCP browser acceptance remains a separate final check.'
    ]
  };
  const paths = await writeReport(report, options.output);
  process.stdout.write(`${JSON.stringify({ status, summary, report: paths.jsonPath, markdown: paths.markdownPath, blockingIssues }, null, 2)}\n`);
  return { report, paths, exitCode: status === STATUS.PASS ? 0 : 1 };
}

async function main() {
  let options;
  try { options = parseArguments(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${error.message}\n${usage()}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const result = await runSubmissionGate(options);
  return result.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => process.exit(exitCode), (error) => {
    process.stderr.write(`${error.stack ?? error.message ?? String(error)}\n`);
    process.exit(1);
  });
}
