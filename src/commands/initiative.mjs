import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { appendHistory } from '../core/history.mjs';
import { findRecordById, listRecordsWithIndexFallback, persistRecord } from '../core/records.mjs';
import { parseArgs, splitList } from '../core/cli.mjs';
import { ENUMS, assertEnum, assertEntityListExists } from '../core/guards.mjs';

const indexFile = path.join(memoryRoot, 'work', 'initiatives', 'index.jsonl');
const itemRoot = path.join(memoryRoot, 'work', 'initiatives');

function toIndexRecord(item) {
  return {
    id: item.id,
    kind: 'initiative',
    title: item.title,
    status: item.status,
    containerIds: item.containerIds,
    sprintIds: item.sprintIds,
    issueIds: item.issueIds,
    path: item.paths?.self,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completedAt: item.completedAt,
  };
}

function createInitiative(opts) {
  const title = (opts.title || opts._.join(' ')).trim();
  if (!title) {
    console.log('Usage: mm initiative create <title> [--why "..."] [--outcome "..."] [--container-ids a,b]');
    return null;
  }
  const now = new Date().toISOString();
  const id = opts.id || makeId('init');
  const status = opts.status || 'idea';
  assertEnum(status, ENUMS.initiativeStatus, 'initiative status');
  return appendHistory({
    id,
    kind: 'initiative',
    title,
    status,
    why: opts.why || opts.description || title,
    desiredOutcome: opts.outcome || opts['desired-outcome'] || title,
    containerIds: splitList(opts['container-ids']),
    sourceRawItemIds: splitList(opts['source-raw-item-ids']),
    sourceWikiPageIds: splitList(opts['source-wiki-page-ids']),
    sprintIds: splitList(opts['sprint-ids']),
    issueIds: splitList(opts['issue-ids']),
    openQuestions: splitList(opts.questions),
    nonGoals: splitList(opts['non-goals']),
    createdAt: now,
    updatedAt: now,
  }, { at: now, event: 'created', status, note: 'Created via mm initiative create.' });
}

async function loadInitiative(id) {
  return findRecordById(itemRoot, indexFile, id);
}

async function persistInitiative(item) {
  await persistRecord(itemRoot, indexFile, item, toIndexRecord);
}

export async function run(argv) {
  const sub = argv[1] || 'list';

  if (sub === 'create') {
    const item = createInitiative(parseArgs(argv, 2));
    if (!item) return;
    await assertEntityListExists(item.containerIds, 'container', 'container');
    await assertEntityListExists(item.sprintIds, 'sprint', 'sprint');
    await assertEntityListExists(item.issueIds, 'issue', 'issue');
    await persistInitiative(item);
    console.log('Created initiative:', item.id);
    return;
  }

  if (sub === 'list') {
    const opts = parseArgs(argv, 2);
    const items = await listRecordsWithIndexFallback(itemRoot, indexFile);
    const filtered = items.filter(item => !opts.status || item.status === opts.status);
    if (!filtered.length) return console.log('No initiatives found.');
    filtered.forEach(item => console.log(`${item.id} [${item.status}] ${item.title}`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) return console.log('Usage: mm initiative show <id>');
    const item = await loadInitiative(id);
    if (!item) return console.log('Initiative not found:', id);
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  if (sub === 'update') {
    const id = argv[2];
    const status = argv[3];
    const opts = parseArgs(argv, 4);
    if (!id || !status) return console.log('Usage: mm initiative update <id> <status> [--note "..."]');
    const item = await loadInitiative(id);
    if (!item) return console.log('Initiative not found:', id);
    assertEnum(status, ENUMS.initiativeStatus, 'initiative status');
    item.status = status;
    if (opts.title) item.title = opts.title;
    if (opts.why) item.why = opts.why;
    if (opts.outcome || opts['desired-outcome']) item.desiredOutcome = opts.outcome || opts['desired-outcome'];
    if (opts['container-ids']) item.containerIds = splitList(opts['container-ids']);
    if (opts['sprint-ids']) item.sprintIds = splitList(opts['sprint-ids']);
    if (opts['issue-ids']) item.issueIds = splitList(opts['issue-ids']);
    if (opts.questions) item.openQuestions = splitList(opts.questions);
    if (opts['non-goals']) item.nonGoals = splitList(opts['non-goals']);
    const now = new Date().toISOString();
    item.updatedAt = now;
    if (status === 'shipped') item.completedAt = now;
    appendHistory(item, { at: now, event: 'updated', status, ...(opts.note ? { note: opts.note } : {}) });
    await assertEntityListExists(item.containerIds, 'container', 'container');
    await assertEntityListExists(item.sprintIds, 'sprint', 'sprint');
    await assertEntityListExists(item.issueIds, 'issue', 'issue');
    await persistInitiative(item);
    console.log('Updated initiative:', id);
    return;
  }

  console.log('Unknown initiative subcommand:', sub);
}
