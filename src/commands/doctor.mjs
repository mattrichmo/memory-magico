import path from 'path';
import { exists } from '../core/fs.mjs';
import { memoryRoot } from '../core/paths.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

const expected = [
  'README.md',
  'AGENTS.md',
  'wiki/index.md',
  'wiki/log.md',
  'wiki/overview.md',
  'wiki/open-questions.md',
  'work/initiatives',
  'work/sprints',
  'work/phases',
  'work/tasks',
  'work/issues',
  'work/discoveries',
  'work/comments',
  'work/containers',
  'generated',
  '.mm/search',
];

export async function run(argv = []) {
  const json = argv.includes('--json');
  if (!json) console.log('Running doctor checks...');
  const checks = [];
  let ok = true;
  for (const rel of expected) {
    const full = path.join(memoryRoot, rel);
    const flag = await exists(full);
    if (!json) console.log(`${flag ? 'OK ' : 'MISSING'}  memory/${rel}`);
    checks.push({ path: `memory/${rel}`, ok: flag });
    if (!flag) ok = false;
  }
  if (!ok) {
    if (!json) console.log('\nOne or more required files/folders are missing.');
    process.exitCode = 2;
    if (json) writeJsonOutput({ ok: false, checks });
    return;
  }
  if (!json) console.log('\nDoctor checks passed.');
  if (json) writeJsonOutput({ ok: true, checks });
}
