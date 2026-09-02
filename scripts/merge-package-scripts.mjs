import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(process.argv[2] ?? process.cwd());
const apply = process.argv.includes('--apply');
const packagePath = path.join(packageRoot, 'package.json');
const mergePath = path.resolve(here, '..', 'package-scripts.merge.json');

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
const requiredScripts = JSON.parse(await readFile(mergePath, 'utf8'));
const existing = packageJson.scripts ?? {};
const conflicts = [];
const missing = [];
const present = [];

for (const [name, command] of Object.entries(requiredScripts)) {
  if (existing[name] === command) present.push(name);
  else if (existing[name] === undefined) missing.push(name);
  else conflicts.push({ name, existing: existing[name], required: command });
}

if (conflicts.length) {
  console.error(JSON.stringify({ ok: false, reason: 'SCRIPT_CONFLICT', conflicts }, null, 2));
  process.exit(1);
}

if (apply && missing.length) {
  packageJson.scripts = { ...existing, ...Object.fromEntries(missing.map((name) => [name, requiredScripts[name]])) };
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  ok: true,
  mode: apply ? 'apply' : 'check',
  packagePath,
  present,
  missing: apply ? [] : missing,
  added: apply ? missing : []
}, null, 2));
