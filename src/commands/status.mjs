import { buildDashboardData } from '../core/dashboard-data.mjs';
import { indexStatus } from '../core/retrieval.mjs';
import { readGitStatus } from '../core/git.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const json = argv.includes('--json');
  const [dashboard, index, git] = await Promise.all([
    buildDashboardData(),
    indexStatus(),
    readGitStatus(),
  ]);

  const payload = {
    ok: true,
    generatedAt: dashboard.generatedAt,
    git,
    index,
    summary: dashboard.summary,
    focus: dashboard.focus,
    indices: dashboard.indices,
  };

  if (json) {
    writeJsonOutput(payload);
    return;
  }

  console.log(`Branch: ${git.branchLine || 'unknown'}`);
  console.log(`Dirty files: ${git.dirtyFiles}`);
  console.log(`Generated dirty files: ${git.generatedDirtyCount || 0}`);
  console.log(`Authored dirty files: ${git.authoredDirtyCount || 0}`);
  console.log(`Index: ${index.ready ? 'ready' : 'needs attention'}`);
  console.log(`Tasks: ${dashboard.summary.tasks.done}/${dashboard.summary.tasks.total} done`);
  console.log(`Issues: ${dashboard.summary.issues.open} open`);
  console.log(`Raw: ${dashboard.summary.raw.unresolved} unresolved`);
  console.log(`Generated: ${dashboard.generatedAt}`);
}
