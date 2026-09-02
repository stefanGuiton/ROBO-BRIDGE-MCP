import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  SKIPPED_WITH_REASON: 'SKIPPED_WITH_REASON'
});

const VALID_STATUS = new Set(Object.values(STATUS));

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function makeTest({
  id,
  area,
  status,
  required = true,
  durationMs = 0,
  reason = null,
  details = {},
  evidence = []
}) {
  if (!id || !area) throw new TypeError('Test id and area are required.');
  if (!VALID_STATUS.has(status)) throw new TypeError(`Invalid test status: ${String(status)}`);
  return {
    id,
    area,
    status,
    required: Boolean(required),
    durationMs: Math.max(0, Math.round(Number(durationMs) * 1000) / 1000),
    reason,
    details,
    evidence
  };
}

export function summarizeTests(tests) {
  const summary = Object.fromEntries([...VALID_STATUS].map((status) => [status, 0]));
  for (const item of tests) summary[item.status] = (summary[item.status] ?? 0) + 1;
  summary.total = tests.length;
  return summary;
}

export function blockingTests(tests) {
  return tests.filter((item) => item.status === STATUS.FAIL || (
    item.required && item.status === STATUS.NOT_AVAILABLE
  ));
}

export function deriveOverallStatus(tests) {
  return blockingTests(tests).length > 0 ? STATUS.FAIL : STATUS.PASS;
}

export function percentile(values, fraction = 0.95) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return Math.round(sorted[index] * 1000) / 1000;
}

export function parseTapSummary(text = '') {
  const read = (label) => {
    const match = String(text).match(new RegExp(`(?:^|\\n)#\\s*${label}\\s+(\\d+)`, 'i'));
    return match ? Number(match[1]) : null;
  };
  return {
    tests: read('tests'),
    suites: read('suites'),
    pass: read('pass'),
    fail: read('fail'),
    cancelled: read('cancelled'),
    skipped: read('skipped'),
    todo: read('todo')
  };
}

export function extractLastJsonObject(text = '') {
  const source = String(text).trim();
  for (let start = source.lastIndexOf('{'); start >= 0; start = source.lastIndexOf('{', start - 1)) {
    const candidate = source.slice(start);
    try { return JSON.parse(candidate); } catch {}
  }
  return null;
}

function schemaIssues(schema, pathName = 'inputSchema') {
  const issues = [];
  if (!isPlainObject(schema)) return [`${pathName}:NOT_OBJECT`];
  const knownTypes = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
  if (schema.type !== undefined && !knownTypes.has(schema.type)) issues.push(`${pathName}:UNKNOWN_TYPE`);
  if (schema.type === 'object') {
    if (schema.properties !== undefined && !isPlainObject(schema.properties)) issues.push(`${pathName}.properties:NOT_OBJECT`);
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [name, child] of Object.entries(properties)) issues.push(...schemaIssues(child, `${pathName}.properties.${name}`));
    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required) || schema.required.some((name) => typeof name !== 'string')) {
        issues.push(`${pathName}.required:INVALID`);
      } else {
        for (const name of schema.required) if (!(name in properties)) issues.push(`${pathName}.required.${name}:MISSING_PROPERTY`);
      }
    }
  }
  if (schema.type === 'array' && schema.items !== undefined) issues.push(...schemaIssues(schema.items, `${pathName}.items`));
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) issues.push(`${pathName}.enum:INVALID`);
  if (schema.minimum !== undefined && schema.maximum !== undefined && schema.minimum > schema.maximum) issues.push(`${pathName}:MIN_GT_MAX`);
  return issues;
}

export function auditToolDefinitions(tools, catalogue = {}) {
  const expectedMinimum = Number.isSafeInteger(catalogue.minimum) ? catalogue.minimum : 0;
  const expectedExact = Number.isSafeInteger(catalogue.exact) ? catalogue.exact : null;
  const requiredNames = Array.isArray(catalogue.requiredNames) ? catalogue.requiredNames : [];
  const names = tools.map((tool) => tool?.name).filter((name) => typeof name === 'string');
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const duplicateNames = [...counts].filter(([, count]) => count > 1).map(([name]) => name);
  const invalid = [];
  const annotations = [];

  for (const tool of tools) {
    const issues = [];
    if (!isPlainObject(tool)) issues.push('TOOL_NOT_OBJECT');
    if (typeof tool?.name !== 'string' || tool.name.length === 0) issues.push('NAME_INVALID');
    if (!isPlainObject(tool?.inputSchema) || tool.inputSchema.type !== 'object') issues.push('SCHEMA_NOT_OBJECT');
    issues.push(...schemaIssues(tool?.inputSchema));
    if (typeof tool?.execute !== 'function' && tool?.executeType !== 'function') issues.push('EXECUTE_MISSING');
    if (!isPlainObject(tool?.annotations)) issues.push('ANNOTATIONS_MISSING');
    if (issues.length) invalid.push({ tool: tool?.name ?? null, issues });

    const readOnlyHint = tool?.annotations?.readOnlyHint;
    const destructiveHint = tool?.annotations?.destructiveHint;
    const idempotentHint = tool?.annotations?.idempotentHint;
    let risk = 'LOW';
    let recommendation = 'No annotation concern found.';
    const name = String(tool?.name ?? '');
    if (name === 'plan_placement_queue' && readOnlyHint === true) {
      risk = 'HIGH';
      recommendation = 'Set readOnlyHint to false because this tool changes logical placement-stream and ghost state.';
    } else if (readOnlyHint === false && destructiveHint === undefined) {
      risk = 'MEDIUM';
      recommendation = 'Review destructiveHint and idempotentHint for this mutation tool.';
    } else if (readOnlyHint === undefined) {
      risk = 'MEDIUM';
      recommendation = 'Add an explicit readOnlyHint.';
    }
    annotations.push({ tool: name, readOnlyHint, destructiveHint, idempotentHint, risk, recommendation });
  }

  const missingRequiredNames = requiredNames.filter((name) => !counts.has(name));
  const countValid = tools.length >= expectedMinimum && (expectedExact === null || tools.length === expectedExact);
  const ok = countValid && duplicateNames.length === 0 && invalid.length === 0 && missingRequiredNames.length === 0;
  return {
    ok,
    toolCount: tools.length,
    expectedMinimum,
    expectedExact,
    names,
    duplicateNames,
    invalid,
    missingRequiredNames,
    annotations
  };
}

export function auditResponseSize({ tool, scenario, value, targetCharacters = 1500, hardLimitCharacters = 16000 }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = null; }
  }
  const characters = text.length;
  const bytes = Buffer.byteLength(text, 'utf8');
  const severity = characters > hardLimitCharacters ? 'BLOCKING'
    : characters > targetCharacters ? 'OVERSIZED'
      : 'NORMAL';
  return {
    tool,
    scenario,
    characters,
    bytes,
    truncated: Boolean(parsed?.truncated),
    pageable: Boolean(parsed && (
      Object.prototype.hasOwnProperty.call(parsed, 'nextCursor') ||
      Object.prototype.hasOwnProperty.call(parsed, 'cursor')
    )),
    validJson: parsed !== null,
    targetCharacters,
    hardLimitCharacters,
    severity
  };
}

function commandName(command, args) {
  return [command, ...args].join(' ');
}

export async function runCommand(command, args = [], options = {}) {
  const started = performance.now();
  const timeoutMs = options.timeoutMs ?? 300_000;
  const maxOutputCharacters = options.maxOutputCharacters ?? 2_000_000;
  return await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let spawnError = null;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: options.shell ?? (process.platform === 'win32'),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const append = (current, chunk) => {
      const next = current + chunk;
      return next.length > maxOutputCharacters ? next.slice(-maxOutputCharacters) : next;
    };
    child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk.toString()); });
    child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk.toString()); });
    child.on('error', (error) => { spawnError = error; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
    }, timeoutMs);
    timer.unref?.();
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command: commandName(command, args),
        exitCode: exitCode ?? (spawnError ? -1 : null),
        signal,
        timedOut,
        spawnError: spawnError ? String(spawnError.message ?? spawnError) : null,
        durationMs: performance.now() - started,
        stdout,
        stderr
      });
    });
  });
}

function escapeTable(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function reportMarkdown(report) {
  const rows = report.tests.map((item) =>
    `| ${escapeTable(item.area)} | ${escapeTable(item.id)} | ${item.status} | ${item.required ? 'yes' : 'no'} | ${escapeTable(item.reason ?? '')} | ${Math.round(item.durationMs)} |`
  ).join('\n');
  const blockers = report.blockingIssues.length
    ? report.blockingIssues.map((item) => `- ${item}`).join('\n')
    : '- None.';
  const screenshots = report.screenshots.length
    ? report.screenshots.map((item) => `- \`${item}\``).join('\n')
    : '- None generated.';
  return `# ROBO BRIDGE MCP Submission Gate\n\n` +
    `- Status: **${report.status}**\n` +
    `- Commit: \`${report.commitSha ?? 'unknown'}\`\n` +
    `- Branch: \`${report.branch ?? 'unknown'}\`\n` +
    `- Generated: ${report.timestamp}\n` +
    `- Browser: ${report.browser?.product ?? report.browser?.reason ?? 'not available'}\n` +
    `- WebMCP tools: ${report.webmcp?.toolCount ?? 'not available'}\n\n` +
    `## Result Summary\n\n` +
    `| PASS | FAIL | NOT_AVAILABLE | SKIPPED_WITH_REASON | TOTAL |\n` +
    `|---:|---:|---:|---:|---:|\n` +
    `| ${report.summary.PASS} | ${report.summary.FAIL} | ${report.summary.NOT_AVAILABLE} | ${report.summary.SKIPPED_WITH_REASON} | ${report.summary.total} |\n\n` +
    `## Tests\n\n` +
    `| Area | Test | Status | Required | Reason | ms |\n|---|---|---|---|---|---:|\n${rows}\n\n` +
    `## Blocking Issues\n\n${blockers}\n\n` +
    `## Evidence\n\n${screenshots}\n`;
}

export async function writeReport(report, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, 'submission-gate-report.json');
  const markdownPath = path.join(outputDirectory, 'submission-gate-report.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, reportMarkdown(report), 'utf8');
  return { jsonPath, markdownPath };
}
