import path from 'node:path';
import { memoryRoot } from './paths.mjs';
import { readJsonFile, writeJsonFile } from './json.mjs';
import { listRecords, persistRecord } from './records.mjs';
import { rebuildIndex } from './retrieval.mjs';
import { rebuildGraphRelationships } from '../commands/graph.mjs';

const migrationsStateFile = path.join(memoryRoot, '.mm', 'migrations.json');

const MIGRATIONS = [
  {
    version: '2026-06-18-normalize-work-record-paths',
    description: 'Normalize work record markdown paths and rebuild the search index.',
    async run() {
      const scopes = [
        { dir: path.join(memoryRoot, 'work', 'initiatives'), index: path.join(memoryRoot, 'work', 'initiatives', 'index.jsonl') },
        { dir: path.join(memoryRoot, 'work', 'sprints'), index: path.join(memoryRoot, 'work', 'sprints', 'index.jsonl') },
        { dir: path.join(memoryRoot, 'work', 'phases'), index: path.join(memoryRoot, 'work', 'phases', 'index.jsonl') },
        { dir: path.join(memoryRoot, 'work', 'tasks'), index: path.join(memoryRoot, 'work', 'tasks', 'index.jsonl') },
        { dir: path.join(memoryRoot, 'work', 'issues'), index: path.join(memoryRoot, 'work', 'issues', 'index.jsonl') },
        { dir: path.join(memoryRoot, 'work', 'discoveries'), index: path.join(memoryRoot, 'work', 'discoveries', 'index.jsonl') },
        { dir: path.join(memoryRoot, 'work', 'comments'), index: path.join(memoryRoot, 'work', 'comments', 'index.jsonl') },
        { dir: path.join(memoryRoot, 'work', 'containers'), index: path.join(memoryRoot, 'work', 'containers', 'index.jsonl') },
      ];
      let rewritten = 0;
      for (const scope of scopes) {
        const records = await listRecords(scope.dir);
        for (const record of records) {
          await persistRecord(scope.dir, scope.index, record);
          rewritten += 1;
        }
      }
      await rebuildIndex();
      const graph = await rebuildGraphRelationships();
      return { rewritten, graph: graph.length };
    },
  },
];

async function loadState() {
  try {
    const state = await readJsonFile(migrationsStateFile);
    return {
      applied: Array.isArray(state.applied) ? state.applied : [],
    };
  } catch {
    return { applied: [] };
  }
}

async function saveState(state) {
  await writeJsonFile(migrationsStateFile, state);
}

export async function listMigrations() {
  const state = await loadState();
  return MIGRATIONS.map(migration => ({
    version: migration.version,
    description: migration.description,
    applied: state.applied.includes(migration.version),
  }));
}

export async function runMigration(version) {
  const state = await loadState();
  const migration = MIGRATIONS.find(entry => entry.version === version);
  if (!migration) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Unknown migration: ${version}` } };
  }
  if (state.applied.includes(version)) {
    return { ok: true, version, applied: true, result: { skipped: true } };
  }
  const result = await migration.run();
  state.applied = [...state.applied, version];
  await saveState(state);
  return { ok: true, version, applied: false, result };
}
