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
const issueIndexFile = path.join(memoryRoot, 'work', 'issues', 'index.jsonl');
const issueRoot = path.join(memoryRoot, 'work', 'issues');
const phaseIndexFile = path.join(memoryRoot, 'work', 'phases', 'index.jsonl');
const phaseRoot = path.join(memoryRoot, 'work', 'phases');
const taskIndexFile = path.join(memoryRoot, 'work', 'tasks', 'index.jsonl');
const taskRoot = path.join(memoryRoot, 'work', 'tasks');

function toIndexRecord(item) {
  return {
    id: item.id,
    kind: 'sprint',
    number: item.number,
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

function parseOrdinal(value, label) {
  if (value === true || value === false) {
    throw new Error(`${label} must be a positive integer`);
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

async function nextSprintNumber() {
  const items = await listRecordsWithIndexFallback(sprintRoot, indexFile);
  const numbers = items
    .map(item => Number(item.number))
    .filter(number => Number.isInteger(number) && number > 0);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function compareNumberedRecords(a, b) {
  const aNum = Number(a.number || 0);
  const bNum = Number(b.number || 0);
  if (aNum && bNum && aNum !== bNum) return aNum - bNum;
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;
  const aTime = a.createdAt || a.updatedAt || '';
  const bTime = b.createdAt || b.updatedAt || '';
  if (aTime !== bTime) return aTime.localeCompare(bTime);
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function toPhaseIndexRecord(item) {
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

function toTaskIndexRecord(item) {
  return {
    id: item.id,
    kind: 'task',
    number: item.number,
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

async function createSprint(opts) {
  const title = (opts.title || opts._.join(' ')).trim();
  if (!title) {
    console.log('Usage: mm sprint create <title> [--number N] [--goal "..."] [--initiative-ids a,b] [--issue-ids a,b] [--container-ids a,b] [--success-gates "a,b"]');
    return null;
  }
  const now = new Date().toISOString();
  const id = opts.id || makeId('sprint');
  const number = opts.number ? parseOrdinal(opts.number, 'sprint number') : await nextSprintNumber();
  const status = opts.status || 'planned';
  assertEnum(status, ENUMS.sprintStatus, 'sprint status');
  return appendHistory({
    id,
    kind: 'sprint',
    number,
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

function issueTaskTitle(issue, opts) {
  const prefix = opts['task-prefix'] || 'Fix';
  return `${prefix} ${issue.title || issue.id}`;
}

async function composeSprint(opts) {
  const title = (opts.title || opts._.join(' ')).trim();
  const issueIds = splitList(opts['issue-ids']);
  if (!title || !issueIds.length) {
    console.log('Usage: mm sprint compose <title> --issue-ids issue_a,issue_b [--phase-title "..."] [--goal "..."]');
    return null;
  }

  const issues = [];
  for (const id of issueIds) {
    const issue = await findRecordById(issueRoot, issueIndexFile, id);
    if (!issue) throw new Error(`issue not found: ${id}`);
    issues.push(issue);
  }

  const now = new Date().toISOString();
  const sprintId = opts.id || makeId('sprint');
  const phaseId = opts['phase-id'] || makeId('phase');
  const sprintNumber = opts['sprint-number'] ? parseOrdinal(opts['sprint-number'], 'sprint number') : await nextSprintNumber();
  const phaseNumber = opts['phase-number']
    ? parseOrdinal(opts['phase-number'], 'phase number')
    : opts.number
      ? parseOrdinal(opts.number, 'phase number')
      : 1;
  const sprintStatus = opts.status || 'planned';
  assertEnum(sprintStatus, ENUMS.sprintStatus, 'sprint status');
  const requestedTaskIds = opts['task-ids'] ? splitList(opts['task-ids']) : [];
  if (requestedTaskIds.length && requestedTaskIds.length !== issues.length) {
    throw new Error('task id count must match issue count when --task-ids is provided');
  }

  const tasks = issues.map((issue, index) => {
    const taskId = requestedTaskIds[index] || makeId('task');
    const acceptanceCriteria = issue.acceptanceCriteria?.length
      ? issue.acceptanceCriteria
      : [`Resolve issue ${issue.id}: ${issue.title || issue.id}`];
    const verificationPlan = issue.verificationPlan?.length
      ? issue.verificationPlan
      : [`Run targeted verification for issue ${issue.id}`];
    return appendHistory({
      id: taskId,
      kind: 'task',
      number: index + 1,
      sprintId,
      phaseId,
      issueIds: [issue.id],
      containerIds: issue.containerIds || [],
      title: issueTaskTitle(issue, opts),
      description: issue.description || issue.title || issue.id,
      status: 'todo',
      filesAffected: issue.filesAffected || [],
      acceptanceCriteria,
      verificationPlan,
      verificationEvidence: [],
      blockers: [],
      createdAt: now,
      updatedAt: now,
    }, {
      at: now,
      event: 'created',
      status: 'todo',
      note: `Created via mm sprint compose from ${issue.id}.`,
    });
  });

  const taskIds = tasks.map(task => task.id);
  const phase = appendHistory({
    id: phaseId,
    kind: 'phase',
    sprintId,
    number: phaseNumber,
    title: opts['phase-title'] || 'Implementation',
    description: opts['phase-description'] || `Execute ${title}.`,
    status: 'planned',
    issueIds,
    taskIds,
    successGates: splitList(opts['phase-success-gates']),
    createdAt: now,
    updatedAt: now,
  }, {
    at: now,
    event: 'created',
    status: 'planned',
    note: 'Created via mm sprint compose.',
  });

  const sprint = appendHistory({
    id: sprintId,
    kind: 'sprint',
    number: sprintNumber,
    title,
    description: opts.description || title,
    goal: opts.goal || `Resolve ${issueIds.length} issue${issueIds.length === 1 ? '' : 's'}: ${issues.map(issue => issue.title || issue.id).join('; ')}`,
    status: sprintStatus,
    containerIds: splitList(opts['container-ids']),
    initiativeIds: splitList(opts['initiative-ids']),
    issueIds,
    phaseIds: [phaseId],
    taskIds,
    successGates: splitList(opts['success-gates']),
    nonGoals: splitList(opts['non-goals']),
    paths: {},
    createdAt: now,
    updatedAt: now,
  }, {
    at: now,
    event: 'created',
    status: sprintStatus,
    note: 'Created via mm sprint compose.',
  });

  await assertEntityListExists(sprint.containerIds, 'container', 'container');
  await assertEntityListExists(sprint.initiativeIds, 'initiative', 'initiative');
  await persistSprint(sprint);
  await persistRecord(phaseRoot, phaseIndexFile, phase, toPhaseIndexRecord);
  for (const task of tasks) {
    await persistRecord(taskRoot, taskIndexFile, task, toTaskIndexRecord);
  }

  return { sprint, phase, tasks, issues };
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
    const sprint = await createSprint(parseArgs(argv, 2));
    if (!sprint) return;
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

  if (sub === 'compose') {
    const result = await composeSprint(parseArgs(argv, 2));
    if (!result) return;
    if (json) {
      writeJsonOutput({ ok: true, ...result });
      return;
    }
    console.log('Created sprint:', result.sprint.id);
    console.log('Created phase:', result.phase.id);
    result.tasks.forEach(task => console.log('Created task:', task.id));
    return;
  }

  if (sub === 'list') {
    const opts = parseArgs(argv, 2);
    const items = await listRecordsWithIndexFallback(sprintRoot, indexFile);
    const filtered = items
      .filter(item => !opts.status || item.status === opts.status)
      .sort(compareNumberedRecords);
    if (json) {
      writeJsonOutput({ ok: true, items: filtered });
      return;
    }
    if (!filtered.length) {
      console.log('No sprints found.');
      return;
    }
    filtered.forEach(item => {
      const number = item.number ? `#${item.number} ` : '';
      console.log(`${item.id} [${item.status}] ${number}${item.title}`);
    });
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
      console.log('Usage: mm sprint update <id> <status> [--goal "..."] [--success-gates "a,b"] [--note "..."]');
      return;
    }
    const sprint = await loadSprint(id);
    if (!sprint) {
      console.log('Sprint not found:', id);
      return;
    }
    assertEnum(status, ENUMS.sprintStatus, 'sprint status');
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
    if (status === 'completed') {
      assertMeaningfulList(sprint.successGates, 'completed sprint success gates');
    }
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
