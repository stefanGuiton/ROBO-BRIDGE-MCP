import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { extractSubmissionPackage } from './package-extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, '..', '..');
const PACKAGE_SHA256 = 'e1e52a57970a2868a60b6d7d7a43c3b9b4eec3e397868c7a51efcc68d8a0eb22';
let materialization = null;

async function patchRepositoryRoot(runtimeRoot) {
  const replacement = "const ROOT = process.env.ROBO_BRIDGE_REPO_ROOT ? path.resolve(process.env.ROBO_BRIDGE_REPO_ROOT) : path.resolve(HERE, '..', '..');";
  for (const relative of ['tools/submission/submission-gate.mjs', 'tools/submission/hero-runner.mjs']) {
    const target = path.join(runtimeRoot, ...relative.split('/'));
    const source = await readFile(target, 'utf8');
    const updated = source.replace("const ROOT = path.resolve(HERE, '..', '..');", replacement);
    if (updated === source) throw new Error(`Repository-root patch point is missing: ${relative}`);
    await writeFile(target, updated, 'utf8');
  }
}

export function repositoryRoot() {
  return REPOSITORY_ROOT;
}

export async function materializeSubmissionGate() {
  if (!materialization) {
    materialization = (async () => {
      const runtimeRoot = path.join(os.tmpdir(), `robo-bridge-submission-gate-${PACKAGE_SHA256.slice(0, 16)}-${process.pid}`);
      await rm(runtimeRoot, { recursive: true, force: true });
      await mkdir(runtimeRoot, { recursive: true });
      await extractSubmissionPackage({ packageDirectory: path.join(HERE, 'package'), destination: runtimeRoot, expectedSha256: PACKAGE_SHA256 });
      await patchRepositoryRoot(runtimeRoot);
      process.env.ROBO_BRIDGE_REPO_ROOT = REPOSITORY_ROOT;
      return runtimeRoot;
    })();
  }
  return await materialization;
}

export async function loadPackagedModule(relativePath) {
  const runtimeRoot = await materializeSubmissionGate();
  return await import(pathToFileURL(path.join(runtimeRoot, ...relativePath.split('/'))).href);
}

export async function runPackagedCli(relativePath, args = process.argv.slice(2)) {
  const runtimeRoot = await materializeSubmissionGate();
  const target = path.join(runtimeRoot, ...relativePath.split('/'));
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [target, ...args], {
      cwd: REPOSITORY_ROOT,
      env: { ...process.env, ROBO_BRIDGE_REPO_ROOT: REPOSITORY_ROOT },
      stdio: 'inherit',
      windowsHide: true
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
