import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('release packaging selects tracked hydrated assets without local/private files', () => {
  const script = fileURLToPath(new URL('../python/test_release_package.py', import.meta.url));
  const result = spawnSync('python', ['-B', script, '-v'], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /^Ran [1-9]\d* tests? in /m);
});
