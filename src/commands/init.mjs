import path from 'path';
import fs from 'fs/promises';
import { memoryRoot } from '../core/paths.mjs';
import { ensureWorkspaceStructure, writeWorkspaceStarterFiles } from '../core/workspace.mjs';
import { mkdirp } from '../core/fs.mjs';
import { rebuildIndex } from '../core/retrieval.mjs';
import { atomicWriteText } from '../core/atomic-write.mjs';
import { withLock } from '../core/lock.mjs';
import { run as installRun } from './install.mjs';

const legacyScaffold = [
  ['inbox/raw-items.jsonl', ''],
  ['issues/index.jsonl', ''],
  ['issues/relationships.jsonl', ''],
  ['discoveries/index.jsonl', ''],
  ['sprints/index.jsonl', ''],
  ['phases/index.jsonl', ''],
  ['tasks/index.jsonl', ''],
  ['initiatives/index.jsonl', ''],
  ['issues/containers', null],
  ['issues/issues', null],
  ['issues/comments', null],
  ['discoveries/items', null],
  ['sprints/items', null],
  ['phases/items', null],
  ['tasks/items', null],
  ['initiatives/items', null],
  ['build-log/events.jsonl', ''],
];

async function ensureLegacyScaffold() {
  for (const [rel, content] of legacyScaffold) {
    const full = path.join(memoryRoot, rel);
    if (content === null) {
      await mkdirp(full);
      continue;
    }
    await mkdirp(path.dirname(full));
    try {
      await fs.access(full);
    } catch {
      await atomicWriteText(full, content);
    }
  }
}

export async function run(argv) {
  return withLock('workspace-write', async () => {
    const force = argv.includes('--force');
    const skipAgentInstall = argv.includes('--skip-agent-install');
    if (!force) {
      try {
        await fs.access(memoryRoot);
      } catch {
        // fresh workspace, continue
      }
    }
    await ensureWorkspaceStructure();
    await writeWorkspaceStarterFiles();
    await ensureLegacyScaffold();
    await rebuildIndex();
    if (!skipAgentInstall) {
      await installRun(['install', 'all', '--roles', 'memorymagico-orchestrator']);
    }
    console.log(`Initialized MemoryMagico workspace at ${memoryRoot}`);
  }, { command: 'mm init' });
}
