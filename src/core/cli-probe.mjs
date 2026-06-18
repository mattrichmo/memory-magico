import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { toolRoot } from './paths.mjs';

export function runCli(argv, { cwd = toolRoot, encoding = 'utf8' } = {}) {
  const result = spawnSync('node', [path.join(toolRoot, 'bin', 'mm.mjs'), ...argv], {
    cwd,
    encoding,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    signal: result.signal || null,
    error: result.error || null,
  };
}

export function runCliJson(argv, options = {}) {
  const result = runCli([...argv, '--json'], options);
  let payload = null;
  try {
    payload = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    payload = null;
  }
  return { ...result, payload };
}
