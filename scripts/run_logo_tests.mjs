import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [
  'tests/js/logo-palette.test.js',
  'tests/js/logo-compiler.test.js',
  'tests/js/logo-inventory.test.js',
  'tests/js/logo-board.test.js',
  'tests/js/logo-game.test.js'
];

for (const file of files) await import(pathToFileURL(path.join(root, file)).href);
