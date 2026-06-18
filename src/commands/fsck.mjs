import { indexStatus } from '../core/retrieval.mjs';
import { validateGraph } from '../core/graph-queries.mjs';
import { runCliJson } from '../core/cli-probe.mjs';
import { repairDuplicateIds } from './repair.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const json = argv.includes('--json');
  const [lint, graph, index, duplicates] = await Promise.all([
    runCliJson(['lint']),
    validateGraph(),
    indexStatus(),
    repairDuplicateIds({ dryRun: true }),
  ]);

  const git = await (await import('../core/git.mjs')).readGitStatus();
  const ok = Boolean(lint.payload?.ok) && graph.ok && index.ready && duplicates.duplicates.length === 0 && git.generatedDirtyCount === 0;
  const payload = {
    ok,
    lint: lint.payload,
    graph,
    index,
    duplicates,
    git,
  };

  if (json) {
    writeJsonOutput(payload);
    return;
  }

  console.log(ok ? 'FSCK passed.' : 'FSCK found issues.');
  console.log(`Lint: ${lint.payload?.ok ? 'ok' : 'fail'}`);
  console.log(`Graph: ${graph.ok ? 'ok' : 'fail'}`);
  console.log(`Index: ${index.ready ? 'ready' : 'stale'}`);
  console.log(`Duplicate ids: ${duplicates.duplicates.length}`);
  console.log(`Generated dirty files: ${git.generatedDirtyCount}`);
  if (!ok) process.exitCode = 2;
}
