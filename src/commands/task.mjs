import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { readJsonFile, writeJsonFile } from '../core/json.mjs';
import { appendHistory } from '../core/history.mjs';
import { findRecordById, listRecordsWithIndexFallback, persistRecord } from '../core/records.mjs';
import { parseArgs, splitList } from '../core/cli.mjs';
import { ENUMS, assertEnum, assertEntityExists, assertEntityListExists, assertTaskTransition, evidenceFromOpts } from '../core/guards.mjs';

const indexFile = path.join(memoryRoot, 'work', 'tasks', 'index.jsonl');
const taskRoot = path.join(memoryRoot, 'work', 'tasks');

function toIndexRecord(item) {
  return {
    id: item.id,
    kind: 'task',
    title: item.title,
    status: item.status,
    sprintId: item.sprintId,
    phaseId: item.phaseId,
    issueIds: item.issueIds,
    containerIds: item.containerIds,
    path: item.paths?.self,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completedAt: item.completedAt,
    history: item.history,
  };
}

function createTask(opts) {
  const title = (opts.title || opts._.join(' ')).trim();
  if (!title || !opts['sprint-id']) {
    console.log('Usage: mm task create <title> --sprint-id <sprint_id> [--phase-id <phase_id>] [--issue-ids a,b]');
    return null;
  }
  const now = new Date().toISOString();
  const id = opts.id || makeId('task');
  return appendHistory({
    id,
    kind: 'task',
    sprintId: opts['sprint-id'],
    ...(opts['phase-id'] ? { phaseId: opts['phase-id'] } : {}),
    issueIds: splitList(opts['issue-ids']),
    containerIds: splitList(opts['container-ids']),
    title,
    description: opts.description || title,
    status: (() => { const st = opts.status || 'todo'; assertEnum(st, ENUMS.taskStatus, 'task status'); return st; })(),
    ...(opts.assignee ? { assignee: opts.assignee } : {}),
    filesAffected: splitList(opts['files-affected']),
    acceptanceCriteria: splitList(opts.acceptance),
    verificationPlan: splitList(opts.verification),
    verificationEvidence: [],
    blockers: splitList(opts.blockers),
    ...(opts.notes ? { notes: opts.notes } : {}),
    createdAt: now,
    updatedAt: now,
  }, {
    at: now,
    event: 'created',
    status: (() => { const st = opts.status || 'todo'; assertEnum(st, ENUMS.taskStatus, 'task status'); return st; })(),
    note: 'Created via mm task create.',
  });
}

async function loadTask(id) {
  return findRecordById(taskRoot, indexFile, id);
}

async function persistTask(item) {
  await persistRecord(taskRoot, indexFile, item, toIndexRecord);
}

export async function run(argv) {
  const sub = argv[1] || 'list';

  if (sub === 'create') {
    const task = createTask(parseArgs(argv, 2));
    if (!task) return;
    await assertEntityExists(task.sprintId, 'sprint', 'sprint');
    if (task.phaseId) await assertEntityExists(task.phaseId, 'phase', 'phase');
    await assertEntityListExists(task.issueIds, 'issue', 'issue');
    await assertEntityListExists(task.containerIds, 'container', 'container');
    await assertEntityExists(task.sprintId, 'sprint', 'sprint');
    if (task.phaseId) await assertEntityExists(task.phaseId, 'phase', 'phase');
    await assertEntityListExists(task.issueIds, 'issue', 'issue');
    await assertEntityListExists(task.containerIds, 'container', 'container');
    await persistTask(task);
    console.log('Created task:', task.id);
    return;
  }

  if (sub === 'list') {
    const opts = parseArgs(argv, 2);
    const items = await listRecordsWithIndexFallback(taskRoot, indexFile);
    const filtered = items.filter(item => {
      if (opts.status && item.status !== opts.status) return false;
      if (opts['sprint-id'] && item.sprintId !== opts['sprint-id']) return false;
      if (opts['phase-id'] && item.phaseId !== opts['phase-id']) return false;
      return true;
    });
    if (!filtered.length) {
      console.log('No tasks found.');
      return;
    }
    filtered.forEach(item => console.log(`${item.id} [${item.status}] ${item.title}`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm task show <id>');
      return;
    }
    const task = await loadTask(id);
    if (!task) {
      console.log('Task not found:', id);
      return;
    }
    console.log(JSON.stringify(task, null, 2));
    return;
  }

  if (sub === 'update') {
    const id = argv[2];
    const status = argv[3];
    const opts = parseArgs(argv, 4);
    if (!id || !status) {
      console.log('Usage: mm task update <id> <status> [--issue-ids a,b] [--note "..."]');
      return;
    }
    const task = await loadTask(id);
    if (!task) {
      console.log('Task not found:', id);
      return;
    }
    assertTaskTransition(task, status, opts);
    task.status = status;
    if (opts.title) task.title = opts.title;
    if (opts.description) task.description = opts.description;
    if (opts['phase-id']) task.phaseId = opts['phase-id'];
    if (opts['issue-ids']) task.issueIds = splitList(opts['issue-ids']);
    if (opts['container-ids']) task.containerIds = splitList(opts['container-ids']);
    if (opts['files-affected']) task.filesAffected = splitList(opts['files-affected']);
    if (opts.acceptance) task.acceptanceCriteria = splitList(opts.acceptance);
    if (opts.verification) task.verificationPlan = splitList(opts.verification);
    const ev = evidenceFromOpts(opts);
    if (ev) task.verificationEvidence = [...(task.verificationEvidence || []), ev];
    if (opts.blockers) task.blockers = splitList(opts.blockers);
    if (opts.notes) task.notes = opts.notes;
    const now = new Date().toISOString();
    task.updatedAt = now;
    if (status === 'done') task.completedAt = now;
    appendHistory(task, {
      at: now,
      event: 'updated',
      status,
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.commits ? { commits: splitList(opts.commits) } : {}),
      ...(ev?.result ? { result: ev.result } : {}),
      ...(ev?.tests ? { tests: ev.tests } : {}),
      ...(ev?.evidenceRefs ? { evidenceRefs: ev.evidenceRefs } : {}),
      ...(opts['deferred-reason'] ? { deferredReason: opts['deferred-reason'] } : {}),
    });
    await persistTask(task);
    console.log('Updated task:', id);
    return;
  }

  if (sub === 'complete') {
    const id = argv[2];
    const opts = parseArgs(argv, 3);
    if (!id) {
      console.log('Usage: mm task complete <id> --test "npm test" --result "pass" [--evidence path] [--commits sha1,sha2]');
      return;
    }
    const task = await loadTask(id);
    if (!task) {
      console.log('Task not found:', id);
      return;
    }
    assertTaskTransition(task, 'done', opts);
    const ev = evidenceFromOpts(opts);
    if (ev) task.verificationEvidence = [...(task.verificationEvidence || []), ev];
    const now = new Date().toISOString();
    task.status = 'done';
    task.completedAt = now;
    task.updatedAt = now;
    appendHistory(task, {
      at: now,
      event: 'completed',
      status: 'done',
      note: opts.note || 'Marked complete via mm task complete.',
      ...(opts.commits ? { commits: splitList(opts.commits) } : {}),
      ...(ev?.result ? { result: ev.result } : {}),
      ...(ev?.tests ? { tests: ev.tests } : {}),
      ...(ev?.evidenceRefs ? { evidenceRefs: ev.evidenceRefs } : {}),
    });
    await persistTask(task);
    console.log('Completed task:', id);
    return;
  }

  console.log('Unknown task subcommand:', sub);
}
