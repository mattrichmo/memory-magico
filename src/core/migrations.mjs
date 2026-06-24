import path from 'node:path';
import { memoryRoot } from './paths.mjs';
import { listJsonFiles, readJsonFile, writeJsonFile } from './json.mjs';
import { listRecords, persistRecord } from './records.mjs';
import { rebuildIndex } from './retrieval.mjs';
import { rebuildGraphRelationships } from '../commands/graph.mjs';

const migrationsStateFile = path.join(memoryRoot, '.mm', 'migrations.json');

const WORK_SCOPES = [
  { kind: 'initiative', legacyDir: path.join(memoryRoot, 'initiatives', 'items'), dir: path.join(memoryRoot, 'work', 'initiatives'), index: path.join(memoryRoot, 'work', 'initiatives', 'index.jsonl') },
  { kind: 'sprint', legacyDir: path.join(memoryRoot, 'sprints', 'items'), dir: path.join(memoryRoot, 'work', 'sprints'), index: path.join(memoryRoot, 'work', 'sprints', 'index.jsonl') },
  { kind: 'phase', legacyDir: path.join(memoryRoot, 'phases', 'items'), dir: path.join(memoryRoot, 'work', 'phases'), index: path.join(memoryRoot, 'work', 'phases', 'index.jsonl') },
  { kind: 'task', legacyDir: path.join(memoryRoot, 'tasks', 'items'), dir: path.join(memoryRoot, 'work', 'tasks'), index: path.join(memoryRoot, 'work', 'tasks', 'index.jsonl') },
  { kind: 'issue', legacyDir: path.join(memoryRoot, 'issues', 'issues'), dir: path.join(memoryRoot, 'work', 'issues'), index: path.join(memoryRoot, 'work', 'issues', 'index.jsonl') },
  { kind: 'discovery', legacyDir: path.join(memoryRoot, 'discoveries', 'items'), dir: path.join(memoryRoot, 'work', 'discoveries'), index: path.join(memoryRoot, 'work', 'discoveries', 'index.jsonl') },
  { kind: 'comment', legacyDir: path.join(memoryRoot, 'issues', 'comments'), dir: path.join(memoryRoot, 'work', 'comments'), index: path.join(memoryRoot, 'work', 'comments', 'index.jsonl') },
  { kind: 'container', legacyDir: path.join(memoryRoot, 'issues', 'containers'), dir: path.join(memoryRoot, 'work', 'containers'), index: path.join(memoryRoot, 'work', 'containers', 'index.jsonl') },
];

function slashPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function memoryRelative(filePath) {
  return slashPath(path.relative(memoryRoot, filePath));
}

function genericIndexRecord(item) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    status: item.status,
    number: item.number,
    issueType: item.issueType,
    severity: item.severity,
    confidence: item.confidence,
    reconciliationStatus: item.reconciliationStatus,
    sprintId: item.sprintId,
    phaseId: item.phaseId,
    containerId: item.containerId,
    containerIds: item.containerIds,
    initiativeIds: item.initiativeIds,
    issueIds: item.issueIds,
    phaseIds: item.phaseIds,
    taskIds: item.taskIds,
    relatedIssueIds: item.relatedIssueIds,
    path: item.paths?.self,
    markdownPath: item.paths?.markdown,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completedAt: item.completedAt,
    closedAt: item.closedAt,
    archivedAt: item.archivedAt,
  };
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function compareWorkRecords(a, b) {
  const aTime = a.createdAt || a.updatedAt || '';
  const bTime = b.createdAt || b.updatedAt || '';
  if (aTime !== bTime) return aTime.localeCompare(bTime);
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function assignMissingNumbers(records) {
  const used = new Set();
  const missing = [];

  for (const record of [...records].sort(compareWorkRecords)) {
    const number = positiveInteger(record.number);
    if (number && !used.has(number)) {
      used.add(number);
    } else {
      missing.push(record);
    }
  }

  let next = 1;
  let changed = 0;
  for (const record of missing) {
    while (used.has(next)) next += 1;
    record.number = next;
    used.add(next);
    changed += 1;
  }

  return changed;
}

function taskNumberScope(item) {
  if (item.phaseId) return `phase:${item.phaseId}`;
  if (item.sprintId) return `sprint:${item.sprintId}`;
  return '__unscoped__';
}

export async function backfillWorkItemNumbers({ rebuild = true } = {}) {
  const sprintScope = WORK_SCOPES.find(scope => scope.kind === 'sprint');
  const phaseScope = WORK_SCOPES.find(scope => scope.kind === 'phase');
  const taskScope = WORK_SCOPES.find(scope => scope.kind === 'task');
  const result = {
    sprints: 0,
    phases: 0,
    tasks: 0,
  };

  const sprints = await listRecords(sprintScope.dir);
  result.sprints = assignMissingNumbers(sprints);
  for (const sprint of sprints) {
    await persistRecord(sprintScope.dir, sprintScope.index, sprint, genericIndexRecord);
  }

  const phases = await listRecords(phaseScope.dir);
  const phaseGroups = new Map();
  for (const phase of phases) {
    const sprintId = phase.sprintId || '__unscoped__';
    if (!phaseGroups.has(sprintId)) phaseGroups.set(sprintId, []);
    phaseGroups.get(sprintId).push(phase);
  }
  for (const group of phaseGroups.values()) {
    result.phases += assignMissingNumbers(group);
  }
  for (const phase of phases) {
    await persistRecord(phaseScope.dir, phaseScope.index, phase, genericIndexRecord);
  }

  const tasks = await listRecords(taskScope.dir);
  const taskGroups = new Map();
  for (const task of tasks) {
    const scope = taskNumberScope(task);
    if (!taskGroups.has(scope)) taskGroups.set(scope, []);
    taskGroups.get(scope).push(task);
  }
  for (const group of taskGroups.values()) {
    result.tasks += assignMissingNumbers(group);
  }
  for (const task of tasks) {
    await persistRecord(taskScope.dir, taskScope.index, task, genericIndexRecord);
  }

  if (!rebuild) return result;
  const index = await rebuildIndex();
  const graph = await rebuildGraphRelationships();
  return {
    ...result,
    search: {
      pages: index.pageCount,
      chunks: index.chunkCount,
    },
    graph: graph.length,
  };
}

function normalizeLegacyRecord(record, scope, file) {
  const id = record?.id;
  if (!id || typeof id !== 'string') return null;
  const targetJson = path.join(scope.dir, `${id}.json`);
  const legacySelf = record.paths?.self || `memory/${memoryRelative(file)}`;
  return {
    ...record,
    kind: scope.kind,
    paths: {
      ...(record.paths || {}),
      legacySelf,
      self: memoryRelative(targetJson),
    },
  };
}

export async function importLegacyEntityRecords({ kinds = null, rebuild = true } = {}) {
  const result = {
    imported: {},
    skipped: {},
    invalid: {},
    totalImported: 0,
    totalSkipped: 0,
    totalInvalid: 0,
  };
  const selectedKinds = kinds ? new Set(kinds) : null;

  for (const scope of WORK_SCOPES) {
    if (selectedKinds && !selectedKinds.has(scope.kind)) continue;
    const existingIds = new Set((await listRecords(scope.dir)).map(record => record.id).filter(Boolean));
    const files = await listJsonFiles(scope.legacyDir);
    result.imported[scope.kind] = 0;
    result.skipped[scope.kind] = 0;
    result.invalid[scope.kind] = 0;

    for (const file of files) {
      let record;
      try {
        record = await readJsonFile(file);
      } catch {
        result.invalid[scope.kind] += 1;
        result.totalInvalid += 1;
        continue;
      }

      const normalized = normalizeLegacyRecord(record, scope, file);
      if (!normalized) {
        result.invalid[scope.kind] += 1;
        result.totalInvalid += 1;
        continue;
      }

      if (existingIds.has(normalized.id)) {
        result.skipped[scope.kind] += 1;
        result.totalSkipped += 1;
        continue;
      }

      await persistRecord(scope.dir, scope.index, normalized, genericIndexRecord);
      existingIds.add(normalized.id);
      result.imported[scope.kind] += 1;
      result.totalImported += 1;
    }
  }

  if (!rebuild) return result;

  const index = await rebuildIndex();
  const graph = await rebuildGraphRelationships();
  return {
    ...result,
    search: {
      pages: index.pageCount,
      chunks: index.chunkCount,
    },
    graph: graph.length,
  };
}

const MIGRATIONS = [
  {
    version: '2026-06-24-backfill-work-item-numbers',
    description: 'Backfill missing sprint numbers globally plus phase/task numbers within their work scope.',
    async run() {
      return backfillWorkItemNumbers();
    },
  },
  {
    version: '2026-06-23-import-legacy-entity-records',
    description: 'Import legacy JSON entity records into memory/work without deleting the old files.',
    async run() {
      return importLegacyEntityRecords();
    },
  },
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
