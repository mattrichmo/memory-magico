import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { memoryRoot } from './paths.mjs';
import { mkdirp } from './fs.mjs';
import { LockError } from './errors.mjs';
import { assertSafePathSegment } from './safe-path.mjs';

const LOCK_SUFFIX = '.lock.json';

function lockDirForRoot(root = memoryRoot) {
  return path.join(root, '.mm', 'locks');
}

function lockFileForName(name, root = memoryRoot) {
  const safeName = assertSafePathSegment(name, 'lock name');
  return path.join(lockDirForRoot(root), `${safeName}${LOCK_SUFFIX}`);
}

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
  const lockDir = lockDirForRoot(root);
  const lockFile = lockFileForName(name, root);
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

async function readLockRecord(lockFile) {
  try {
    const text = await fs.readFile(lockFile, 'utf8');
    const payload = JSON.parse(text);
    const pid = Number(payload?.pid);
    const active = Number.isFinite(pid) ? await isProcessAlive(pid) : false;
    return {
      name: path.basename(lockFile).replace(LOCK_SUFFIX, ''),
      path: lockFile,
      payload,
      pid: Number.isFinite(pid) ? pid : null,
      active,
      stale: !active,
      corrupt: false,
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    return {
      name: path.basename(lockFile).replace(LOCK_SUFFIX, ''),
      path: lockFile,
      payload: null,
      pid: null,
      active: false,
      stale: true,
      corrupt: true,
      error: err.message,
    };
  }
}

export async function listLocks(root = memoryRoot) {
  const lockDir = lockDirForRoot(root);
  try {
    const entries = await fs.readdir(lockDir, { withFileTypes: true });
    const files = entries.filter(entry => entry.isFile() && entry.name.endsWith(LOCK_SUFFIX));
    const locks = [];
    for (const entry of files) {
      const lock = await readLockRecord(path.join(lockDir, entry.name));
      if (lock) locks.push(lock);
    }
    return locks.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function inspectLock(name, root = memoryRoot) {
  return readLockRecord(lockFileForName(name, root));
}

export async function breakLock(name, { root = memoryRoot, staleOnly = false } = {}) {
  const lockFile = lockFileForName(name, root);
  const record = await readLockRecord(lockFile);
  if (!record) {
    return { broken: false, reason: 'missing', name, path: lockFile };
  }
  if (staleOnly && record.active && !record.corrupt) {
    return { broken: false, reason: 'active', ...record };
  }
  await fs.unlink(lockFile).catch(() => {});
  return { broken: true, reason: record.active ? 'active' : record.corrupt ? 'corrupt' : 'stale', ...record };
}
