import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withJsonStdoutGuard } from '../src/core/stdout-guard.mjs';
import { InvalidJsonOutputError } from '../src/core/errors.mjs';

const repoRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('mm info --json rejects unsupported JSON mode', () => {
  const result = spawnSync('node', ['./bin/mm.mjs', 'info', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'UNSUPPORTED_JSON_OUTPUT');
});

test('json stdout guard rejects non-JSON stdout', async () => {
  await assert.rejects(async () => {
    await withJsonStdoutGuard(async () => {
      console.log('hello');
      console.log('{"ok":true}');
    });
  }, InvalidJsonOutputError);
});
