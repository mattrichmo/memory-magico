import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { readJsonFile, writeJsonFile } from '../core/json.mjs';
import { appendHistory } from '../core/history.mjs';
import { findRecordById, listRecordsWithIndexFallback, persistRecord } from '../core/records.mjs';
import { parseArgs, splitList } from '../core/cli.mjs';
import { ENUMS, assertEnum, assertEntityListExists, assertMeaningfulList } from '../core/guards.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

const indexFile = path.join(memoryRoot, 'work', 'sprints', 'index.jsonl');
const sprintRoot = path.join(memoryRoot, 'work', 'sprints');

function toIndexRecord(item) {
  return {
    id: item.id,
    kind: 'sprint',
    title: item.title,
    status: item.status,
    containerIds: item.containerIds,
    initiativeIds: item.initiativeIds,
    issueIds: item.issueIds,
    phaseIds: item.phaseIds,
    taskIds: item.taskIds,
    path: item.paths?.self,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completedAt: item.completedAt,
  };
}

function createSprint(opts) {
  const title = (opts.title || opts._.join(' ')).trim();
  if (!title) {
    console.log('Usage: mm sprint create <title> [--goal "..."] [--initiative-ids a,b] [--issue-ids a,b] [--container-ids a,b]');
    return null;
  }
  const now = new Date().toISOString();
  const id = opts.id || makeId('sprint');
  const status = opts.status || 'planned';
  assertEnum(status, ENUMS.sprintStatus, 'sprint status');
  return appendHistory({
    id,
    kind: 'sprint',
    title,
    description: opts.description || title,
    goal: opts.goal || title,
    status,
    ...(opts['start-date'] ? { startDate: opts['start-date'] } : {}),
    ...(opts['end-date'] ? { endDate: opts['end-date'] } : {}),
    containerIds: splitList(opts['container-ids']),
    initiativeIds: splitList(opts['initiative-ids']),
    issueIds: splitList(opts['issue-ids']),
    phaseIds: splitList(opts['phase-ids']),
    taskIds: splitList(opts['task-ids']),
    successGates: splitList(opts['success-gates']),
    nonGoals: splitList(opts['non-goals']),
    paths: {
      ...(opts.archive ? { archive: opts.archive } : {}),
      ...(opts.summary ? { summary: opts.summary } : {}),
    },
    ...(opts.milestone ? { github: { milestoneNumber: Number(opts.milestone) } } : {}),
    createdAt: now,
    updatedAt: now,
  }, {
    at: now,
    event: 'created',
    status,
    note: 'Created via mm sprint create.',
  });
}

async function loadSprint(id) {
  return findRecordById(sprintRoot, indexFile, id);
}

async function persistSprint(item) {
  await persistRecord(sprintRoot, indexFile, item, toIndexRecord);
}

export async function run(argv) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'create') {
    const sprint = createSprint(parseArgs(argv, 2));
    if (!sprint) return;
    await assertEntityListExists(sprint.containerIds, 'container', 'container');
    await assertEntityListExists(sprint.initiativeIds, 'initiative', 'initiative');
    await assertEntityListExists(sprint.issueIds, 'issue', 'issue');
    await assertEntityListExists(sprint.containerIds, 'container', 'container');
    await assertEntityListExists(sprint.initiativeIds, 'initiative', 'initiative');
    await assertEntityListExists(sprint.issueIds, 'issue', 'issue');
    await persistSprint(sprint);
    if (json) {
      writeJsonOutput({ ok: true, item: sprint });
      return;
    }
    console.log('Created sprint:', sprint.id);
    return;
  }

  if (sub === 'list') {
    const opts = parseArgs(argv, 2);
    const items = await listRecordsWithIndexFallback(sprintRoot, indexFile);
    const filtered = items.filter(item => !opts.status || item.status === opts.status);
    if (json) {
      writeJsonOutput({ ok: true, items: filtered });
      return;
    }
    if (!filtered.length) {
      console.log('No sprints found.');
      return;
    }
    filtered.forEach(item => console.log(`${item.id} [${item.status}] ${item.title}`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm sprint show <id>');
      return;
    }
    const sprint = await loadSprint(id);
    if (!sprint) {
      console.log('Sprint not found:', id);
      return;
    }
    if (json) {
      writeJsonOutput({ ok: true, item: sprint });
      return;
    }
    console.log(JSON.stringify(sprint, null, 2));
    return;
  }

  if (sub === 'update') {
    const id = argv[2];
    const status = argv[3];
    const opts = parseArgs(argv, 4);
    if (!id || !status) {
      console.log('Usage: mm sprint update <id> <status> [--goal "..."] [--note "..."]');
      return;
    }
    const sprint = await loadSprint(id);
    if (!sprint) {
      console.log('Sprint not found:', id);
      return;
    }
    assertEnum(status, ENUMS.sprintStatus, 'sprint status');
    if (status === 'completed') {
      assertMeaningfulList(sprint.successGates, 'completed sprint success gates');
    }
    sprint.status = status;
    if (opts.title) sprint.title = opts.title;
    if (opts.description) sprint.description = opts.description;
    if (opts.goal) sprint.goal = opts.goal;
    if (opts['container-ids']) sprint.containerIds = splitList(opts['container-ids']);
    if (opts['initiative-ids']) sprint.initiativeIds = splitList(opts['initiative-ids']);
    if (opts['issue-ids']) sprint.issueIds = splitList(opts['issue-ids']);
    if (opts['phase-ids']) sprint.phaseIds = splitList(opts['phase-ids']);
    if (opts['task-ids']) sprint.taskIds = splitList(opts['task-ids']);
    if (opts['success-gates']) sprint.successGates = splitList(opts['success-gates']);
    if (opts['non-goals']) sprint.nonGoals = splitList(opts['non-goals']);
    const now = new Date().toISOString();
    sprint.updatedAt = now;
    if (status === 'completed') sprint.completedAt = now;
    appendHistory(sprint, {
      at: now,
      event: 'updated',
      status,
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.commits ? { commits: splitList(opts.commits) } : {}),
      ...(opts['deferred-reason'] ? { deferredReason: opts['deferred-reason'] } : {}),
    });
    await assertEntityListExists(sprint.containerIds, 'container', 'container');
    await assertEntityListExists(sprint.initiativeIds, 'initiative', 'initiative');
    await assertEntityListExists(sprint.issueIds, 'issue', 'issue');
    await persistSprint(sprint);
    if (json) {
      writeJsonOutput({ ok: true, item: sprint });
      return;
    }
    console.log('Updated sprint:', id);
    return;
  }

  console.log('Unknown sprint subcommand:', sub);
}
