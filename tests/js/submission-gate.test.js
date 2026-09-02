import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { materializeSubmissionGate } from '../../tools/submission/bootstrap.mjs';
const runtimeRoot = await materializeSubmissionGate();
await import(pathToFileURL(path.join(runtimeRoot, 'tests', 'js', 'submission-gate.test.js')).href);
