import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { breakLock, inspectLock, listLocks, withLock } from '../core/lock.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

function lockSummary(lock) {
  if (!lock) return null;
  const state = lock.corrupt ? 'corrupt' : lock.active ? 'active' : 'stale';
  const command = lock.payload?.command || '';
  return {
    name: lock.name,
    path: path.relative(memoryRoot, lock.path),
    pid: lock.pid,
    state,
    active: lock.active,
    stale: lock.stale,
    corrupt: lock.corrupt,
    command,
    createdAt: lock.payload?.createdAt || null,
    cwd: lock.payload?.cwd || null,
  };
}

export async function run(argv = []) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'list') {
    const locks = (await listLocks()).map(lockSummary).filter(Boolean);
    if (json) {
      writeJsonOutput({ ok: true, locks });
      return;
    }
    if (!locks.length) {
      console.log('No locks found.');
      return;
    }
    for (const lock of locks) {
      console.log(`${lock.name} [${lock.state}] ${lock.path}${lock.pid ? ` (pid ${lock.pid})` : ''}`);
    }
    return;
  }

  if (sub === 'inspect') {
    const name = argv[2];
    if (!name) {
      console.log('Usage: mm lock inspect <name>');
      return;
    }
    const lock = lockSummary(await inspectLock(name));
    if (!lock) {
      if (json) {
        writeJsonOutput({
          ok: false,
          error: { code: 'LOCK_NOT_FOUND', message: `Lock not found: ${name}` },
          warnings: [],
        });
        return;
      }
      console.log('Lock not found:', name);
      return;
    }
    if (json) {
      writeJsonOutput({ ok: true, lock });
      return;
    }
    console.log(JSON.stringify(lock, null, 2));
    return;
  }

  if (sub === 'break') {
    const name = argv[2];
    const staleOnly = argv.includes('--stale-only');
    if (!name) {
      console.log('Usage: mm lock break <name> --stale-only');
      return;
    }
    const result = await withLock('repo-write', () => breakLock(name, { staleOnly }), { command: 'mm lock break' });
    if (json) {
      writeJsonOutput({ ok: true, result });
      return;
    }
    if (!result.broken) {
      console.log(`Lock not broken: ${name} (${result.reason})`);
      return;
    }
    console.log(`Broke lock: ${name}`);
    return;
  }

  console.log('Unknown lock subcommand:', sub);
}
