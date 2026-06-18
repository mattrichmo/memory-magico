import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { readJsonFile, writeJsonFile } from '../core/json.mjs';
import { appendHistory } from '../core/history.mjs';
import { findRecordById, listRecords, listRecordsWithIndexFallback, persistRecord } from '../core/records.mjs';
import { parseArgs, splitList } from '../core/cli.mjs';
import { ENUMS, assertEnum, assertEntityExists, assertEntityListExists, assertMeaningfulList } from '../core/guards.mjs';

const indexFile = path.join(memoryRoot, 'work', 'phases', 'index.jsonl');
const phaseRoot = path.join(memoryRoot, 'work', 'phases');

function toIndexRecord(item) {
  return {
    id: item.id,
    kind: 'phase',
    sprintId: item.sprintId,
    number: item.number,
    title: item.title,
    status: item.status,
    issueIds: item.issueIds,
    taskIds: item.taskIds,
    path: item.paths?.self,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completedAt: item.completedAt,
  };
}

async function nextPhaseNumber(sprintId) {
  const items = await listRecords(phaseRoot);
  const numbers = items
    .filter(item => item.sprintId === sprintId)
    .map(item => Number(item.number))
    .filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

async function createPhase(opts) {
  const title = (opts.title || opts._.join(' ')).trim();
  if (!title || !opts['sprint-id']) {
    console.log('Usage: mm phase create <title> --sprint-id <sprint_id> [--number N] [--issue-ids a,b]');
    return null;
  }
  const now = new Date().toISOString();
  const id = opts.id || makeId('phase');
  const number = opts.number ? Number(opts.number) : await nextPhaseNumber(opts['sprint-id']);
  const status = opts.status || 'planned';
  assertEnum(status, ENUMS.phaseStatus, 'phase status');
  return appendHistory({
    id,
    kind: 'phase',
    sprintId: opts['sprint-id'],
    number,
    title,
    description: opts.description || title,
    status,
    issueIds: splitList(opts['issue-ids']),
    taskIds: splitList(opts['task-ids']),
    successGates: splitList(opts['success-gates']),
    ...(opts.notes ? { notes: opts.notes } : {}),
    createdAt: now,
    updatedAt: now,
  }, {
    at: now,
    event: 'created',
    status,
    note: 'Created via mm phase create.',
  });
}

async function loadPhase(id) {
  return findRecordById(phaseRoot, indexFile, id);
}

async function persistPhase(item) {
  await persistRecord(phaseRoot, indexFile, item, toIndexRecord);
}

export async function run(argv) {
  const sub = argv[1] || 'list';

  if (sub === 'create') {
    const item = await createPhase(parseArgs(argv, 2));
    if (!item) return;
    await assertEntityExists(item.sprintId, 'sprint', 'sprint');
    await assertEntityListExists(item.issueIds, 'issue', 'issue');
    await persistPhase(item);
    console.log('Created phase:', item.id);
    return;
  }

  if (sub === 'list') {
    const opts = parseArgs(argv, 2);
    const items = await listRecordsWithIndexFallback(phaseRoot, indexFile);
    const filtered = items.filter(item => {
      if (opts.status && item.status !== opts.status) return false;
      if (opts['sprint-id'] && item.sprintId !== opts['sprint-id']) return false;
      return true;
    });
    if (!filtered.length) {
      console.log('No phases found.');
      return;
    }
    filtered.forEach(item => console.log(`${item.id} [${item.status}] ${item.title}`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm phase show <id>');
      return;
    }
    const phase = await loadPhase(id);
    if (!phase) {
      console.log('Phase not found:', id);
      return;
    }
    console.log(JSON.stringify(phase, null, 2));
    return;
  }

  if (sub === 'update') {
    const id = argv[2];
    const status = argv[3];
    const opts = parseArgs(argv, 4);
    if (!id || !status) {
      console.log('Usage: mm phase update <id> <status> [--task-ids a,b] [--note "..."]');
      return;
    }
    const phase = await loadPhase(id);
    if (!phase) {
      console.log('Phase not found:', id);
      return;
    }
    assertEnum(status, ENUMS.phaseStatus, 'phase status');
    if (status === 'completed') {
      assertMeaningfulList(phase.successGates, 'completed phase success gates');
    }
    phase.status = status;
    if (opts.title) phase.title = opts.title;
    if (opts.description) phase.description = opts.description;
    if (opts['issue-ids']) phase.issueIds = splitList(opts['issue-ids']);
    if (opts['task-ids']) phase.taskIds = splitList(opts['task-ids']);
    if (opts['success-gates']) phase.successGates = splitList(opts['success-gates']);
    if (opts.notes) phase.notes = opts.notes;
    const now = new Date().toISOString();
    phase.updatedAt = now;
    if (status === 'completed') phase.completedAt = now;
    appendHistory(phase, {
      at: now,
      event: 'updated',
      status,
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.commits ? { commits: splitList(opts.commits) } : {}),
      ...(opts['deferred-reason'] ? { deferredReason: opts['deferred-reason'] } : {}),
    });
    await assertEntityExists(phase.sprintId, 'sprint', 'sprint');
    await assertEntityListExists(phase.issueIds, 'issue', 'issue');
    await persistPhase(phase);
    console.log('Updated phase:', id);
    return;
  }

  console.log('Unknown phase subcommand:', sub);
}
