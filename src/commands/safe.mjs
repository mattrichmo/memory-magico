import { indexStatus } from '../core/retrieval.mjs';
import { readGitStatus } from '../core/git.mjs';
import { validateGraph } from '../core/graph-queries.mjs';
import { runCliJson } from '../core/cli-probe.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

function checkResult(name, ok, details = {}) {
  return { name, ok, ...details };
}

export async function run(argv = []) {
  const json = argv.includes('--json');
  const [doctor, lint, graph, index, git] = await Promise.all([
    Promise.resolve(runCliJson(['doctor'])),
    Promise.resolve(runCliJson(['lint'])),
    validateGraph(),
    indexStatus(),
    readGitStatus(),
  ]);

  const checks = [
    checkResult('doctor', Boolean(doctor.payload?.ok), { payload: doctor.payload }),
    checkResult('lint', Boolean(lint.payload?.ok), { findings: lint.payload?.findings || [] }),
    checkResult('graph', graph.ok, { findings: graph.findings }),
    checkResult('index', index.ready, { status: index }),
    checkResult('generated', git.generatedDirtyCount === 0, { generatedDirtyFiles: git.generatedDirtyFiles || [] }),
    checkResult('git', true, { dirtyFiles: git.dirtyFiles, branchLine: git.branchLine }),
  ];
  const warnings = [];
  if (git.dirtyFiles > 0) warnings.push(`Git worktree has ${git.dirtyFiles} dirty file(s).`);
  if (git.generatedDirtyCount > 0) warnings.push(`Generated files are dirty: ${git.generatedDirtyCount}.`);
  if (index.stale) warnings.push('Search index is stale.');
  if (!doctor.payload?.ok) warnings.push('Workspace scaffold is incomplete.');

  const ok = checks.every(check => check.ok);
  const payload = {
    ok,
    checks,
    warnings,
    git,
    index,
    graph,
  };

  if (json) {
    writeJsonOutput(payload);
    return;
  }

  console.log(ok ? 'Workspace is safe.' : 'Workspace is not safe.');
  for (const check of checks) {
    console.log(`${check.ok ? 'OK ' : 'FAIL'} ${check.name}`);
  }
  for (const warning of warnings) {
    console.log(`WARN ${warning}`);
  }
  if (!ok) process.exitCode = 2;
}
