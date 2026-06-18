import path from 'path';
import fs from 'fs/promises';
import { memoryRoot } from '../core/paths.mjs';
import { listSpooledResults, readSpooledResult } from '../core/result-spool.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { withLock } from '../core/lock.mjs';

const resultRoot = path.join(memoryRoot, '.mm', 'results');

export async function run(argv = []) {
  const sub = argv[1] || 'list';
  if (sub === 'list') {
    const files = await listSpooledResults();
    const items = [];
    for (const file of files) {
      const meta = JSON.parse(await fs.readFile(file, 'utf8'));
      items.push(meta);
    }
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, items });
      return;
    }
    items.forEach(item => console.log(`${item.id} ${item.command} (${item.path})`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm results show <id>');
      return;
    }
    const { meta, content } = await readSpooledResult(id);
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, meta, content: JSON.parse(content) });
      return;
    }
    console.log(content);
    return;
  }

  if (sub === 'prune') {
    const all = argv.includes('--all');
    const olderThan = argv.indexOf('--older-than') !== -1 ? argv[argv.indexOf('--older-than') + 1] : null;
    await withLock('repo-write', async () => {
      const files = await fs.readdir(resultRoot, { withFileTypes: true }).catch(() => []);
      if (!all && !olderThan) {
        console.log('Usage: mm results prune --older-than 30d | --all --yes');
        return;
      }
      for (const entry of files) {
        if (entry.isFile()) await fs.unlink(path.join(resultRoot, entry.name)).catch(() => {});
      }
      console.log('Pruned spooled results.');
    }, { command: 'mm results prune' });
    return;
  }

  console.log(`Unknown results subcommand: ${sub}`);
}
