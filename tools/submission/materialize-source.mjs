import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { materializeSubmissionGate, repositoryRoot } from './bootstrap.mjs';
const destination = process.argv[2];
if (!destination) {
  process.stderr.write('Usage: node tools/submission/materialize-source.mjs OUTPUT_DIRECTORY\n');
  process.exit(2);
}
const source = await materializeSubmissionGate();
const output = path.resolve(repositoryRoot(), destination);
await rm(output, { recursive: true, force: true });
await mkdir(path.dirname(output), { recursive: true });
await cp(source, output, { recursive: true });
process.stdout.write(`${output}\n`);
