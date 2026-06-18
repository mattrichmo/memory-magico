import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { readDirRecursive } from '../core/fs.mjs';
import { parseMarkdownPage } from '../core/frontmatter.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

async function collectTasks() {
  const taskRoot = path.join(memoryRoot, 'work', 'tasks');
  const files = await readDirRecursive(taskRoot, { filter: filePath => filePath.endsWith('.md') });
  const tasks = [];
  for (const file of files) {
    const text = await import('fs/promises').then(fs => fs.readFile(file, 'utf8'));
    const parsed = parseMarkdownPage(text);
    const fm = parsed.frontmatter || {};
    tasks.push({
      id: fm.id || path.basename(file, '.md'),
      title: fm.title || path.basename(file, '.md'),
      status: fm.status || 'todo',
      sprint: fm.sprint || fm.sprintId || null,
      phase: fm.phase || fm.phaseId || null,
      priority: fm.priority || 'medium',
      updatedAt: fm.updatedAt || fm.updated_at || null,
      path: path.relative(memoryRoot, file),
    });
  }
  return tasks;
}

export async function run(argv) {
  const sprintFilterIndex = argv.indexOf('--sprint-id');
  const sprintId = sprintFilterIndex !== -1 ? argv[sprintFilterIndex + 1] : null;
  const phaseFilterIndex = argv.indexOf('--phase-id');
  const phaseId = phaseFilterIndex !== -1 ? argv[phaseFilterIndex + 1] : null;
  const json = argv.includes('--json');
  const tasks = await collectTasks();
  const filtered = tasks.filter(task => {
    if (sprintId && task.sprint !== sprintId) return false;
    if (phaseId && task.phase !== phaseId) return false;
    return ['todo', 'blocked', 'in_progress', 'ready'].includes(task.status);
  });
  if (json) {
    writeJsonOutput({ ok: true, tasks: filtered });
    return;
  }
  if (!filtered.length) {
    console.log('No open tasks.');
    return;
  }
  filtered.forEach(task => console.log(`${task.id} [${task.status}] ${task.title} (${task.path})`));
}
