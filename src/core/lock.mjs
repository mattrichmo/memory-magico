import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { memoryRoot } from './paths.mjs';
import { mkdirp } from './fs.mjs';
import { LockError } from './errors.mjs';

async function isProcessAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function withLock(name, fn, { command = 'mm', root = memoryRoot } = {}) {
  const lockDir = path.join(root, '.mm', 'locks');
  const lockFile = path.join(lockDir, `${name}.lock.json`);
  await mkdirp(lockDir);

  try {
    const existing = await fs.readFile(lockFile, 'utf8').then(text => JSON.parse(text)).catch(() => null);
    if (existing?.pid && await isProcessAlive(existing.pid)) {
      throw new LockError(`Lock is held by process ${existing.pid}.`, {
        details: { name, lockFile, pid: existing.pid, command: existing.command },
        hint: 'Retry after the active command exits.',
      });
    }
    if (existing) await fs.unlink(lockFile).catch(() => {});
  } catch (err) {
    if (err instanceof LockError) throw err;
  }

  const payload = {
    name,
    pid: process.pid,
    createdAt: new Date().toISOString(),
    command,
    cwd: process.cwd(),
    hostname: os.hostname(),
  };

  const handle = await fs.open(lockFile, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }

  try {
    return await fn();
  } finally {
    await fs.unlink(lockFile).catch(() => {});
  }
}

