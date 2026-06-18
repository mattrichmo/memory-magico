import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { readJsonFile, writeJsonFile } from '../core/json.mjs';
import { findRecordById, listRecordsWithIndexFallback, resolveRecordJsonPath, upsertIndexRecord } from '../core/records.mjs';
import { parseArgs, splitList } from '../core/cli.mjs';
import { mirrorRecordToMarkdown } from '../core/work-pages.mjs';
import { ENUMS, assertEnum } from '../core/guards.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

const indexFile = path.join(memoryRoot, 'work', 'discoveries', 'index.jsonl');
const discoveryRoot = path.join(memoryRoot, 'work', 'discoveries');

function toIndexRecord(item) {
  return {
    id: item.id,
    kind: item.kind || 'discovery',
    title: item.title,
    summary: item.summary,
    status: item.status,
    recommendedAction: item.recommendedAction,
    containerId: item.containerId,
    path: item.paths?.self,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function createDiscovery(opts) {
  const title = (opts.title || opts._.join(' ')).trim();
  if (!title) {
    console.log('Usage: mm discovery add <title> [--summary "..."] [--container-id <id>] [--source-raw-item-ids a,b]');
    return null;
  }
  const now = new Date().toISOString();
  const id = opts.id || makeId('discovery');
  const sourceType = opts['source-type'] || 'user_request';
  const status = opts.status || 'needs_research';
  const severity = opts.severity || 'P2';
  const confidence = opts.confidence || 'likely';
  const issueType = opts['issue-type'] || 'research';
  assertEnum(sourceType, ENUMS.discoverySourceType, 'discovery source type');
  assertEnum(status, ENUMS.discoveryStatus, 'discovery status');
  assertEnum(severity, ENUMS.severity, 'severity');
  assertEnum(confidence, ENUMS.confidence, 'confidence');
  assertEnum(issueType, ENUMS.issueType, 'issue type');
  return {
    id,
    kind: 'discovery',
    ...(opts['container-id'] ? { containerId: opts['container-id'] } : {}),
    sourceType,
    sourceRawItemIds: splitList(opts['source-raw-item-ids']),
    title,
    summary: opts.summary || title,
    ...(opts.description ? { description: opts.description } : {}),
    risk: opts.risk || 'TBD',
    severity,
    confidence,
    issueType,
    status,
    recommendedAction: opts['recommended-action'] || 'needs_research',
    filesAffected: splitList(opts['files-affected']),
    relatedContainers: splitList(opts['related-containers']),
    relatedDiscoveries: splitList(opts['related-discoveries']),
    ...(opts['duplicate-of'] ? { duplicateOfDiscoveryId: opts['duplicate-of'] } : {}),
    ...(opts['folded-into-issue-id'] ? { foldedIntoIssueId: opts['folded-into-issue-id'] } : {}),
    ...(opts['promoted-issue-id'] ? { promotedIssueId: opts['promoted-issue-id'] } : {}),
    paths: {
      ...(opts.wiki ? { wiki: opts.wiki } : {}),
      ...(opts.source ? { source: opts.source } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
}

async function loadDiscovery(id) {
  return findRecordById(discoveryRoot, indexFile, id);
}

async function persistDiscovery(item) {
  const file = await resolveRecordJsonPath(discoveryRoot, item.id, 'memory-write');
  item.paths = {
    ...(item.paths || {}),
    self: path.relative(memoryRoot, file).split(path.sep).join('/'),
  };
  await writeJsonFile(file, item);
  await upsertIndexRecord(indexFile, item, toIndexRecord);
  await mirrorRecordToMarkdown(item).catch(() => {});
}

export async function run(argv) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'add' || sub === 'create') {
    const item = createDiscovery(parseArgs(argv, 2));
    if (!item) return;
    await persistDiscovery(item);
    if (json) {
      writeJsonOutput({ ok: true, item });
      return;
    }
    console.log('Added discovery:', item.id);
    return;
  }

  if (sub === 'list') {
    const opts = parseArgs(argv, 2);
    const items = await listRecordsWithIndexFallback(discoveryRoot, indexFile);
    const filtered = items.filter(item => {
      if (opts.status && item.status !== opts.status) return false;
      if (opts['source-type'] && item.sourceType !== opts['source-type']) return false;
      return true;
    });
    if (json) {
      writeJsonOutput({ ok: true, items: filtered });
      return;
    }
    if (!filtered.length) {
      console.log('No discoveries found.');
      return;
    }
    filtered.forEach(item => console.log(`${item.id} [${item.status}] ${item.title}`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm discovery show <id>');
      return;
    }
    const item = await loadDiscovery(id);
    if (!item) {
      console.log('Discovery not found:', id);
      return;
    }
    if (json) {
      writeJsonOutput({ ok: true, item });
      return;
    }
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  if (sub === 'update') {
    const id = argv[2];
    const status = argv[3];
    const opts = parseArgs(argv, 4);
    if (!id || !status) {
      console.log('Usage: mm discovery update <id> <status> [--recommended-action <action>]');
      return;
    }
    const item = await loadDiscovery(id);
    if (!item) {
      console.log('Discovery not found:', id);
      return;
    }
    assertEnum(status, ENUMS.discoveryStatus, 'discovery status');
    item.status = status;
    if (opts.summary) item.summary = opts.summary;
    if (opts.description) item.description = opts.description;
    if (opts.risk) item.risk = opts.risk;
    if (opts.severity) { assertEnum(opts.severity, ENUMS.severity, 'severity'); item.severity = opts.severity; }
    if (opts.confidence) { assertEnum(opts.confidence, ENUMS.confidence, 'confidence'); item.confidence = opts.confidence; }
    if (opts['issue-type']) { assertEnum(opts['issue-type'], ENUMS.issueType, 'issue type'); item.issueType = opts['issue-type']; }
    if (opts['recommended-action']) item.recommendedAction = opts['recommended-action'];
    if (opts['promoted-issue-id']) item.promotedIssueId = opts['promoted-issue-id'];
    if (opts['folded-into-issue-id']) item.foldedIntoIssueId = opts['folded-into-issue-id'];
    if (opts['duplicate-of']) item.duplicateOfDiscoveryId = opts['duplicate-of'];
    item.updatedAt = new Date().toISOString();
    await persistDiscovery(item);
    if (json) {
      writeJsonOutput({ ok: true, item });
      return;
    }
    console.log('Updated discovery:', id);
    return;
  }

  console.log('Unknown discovery subcommand:', sub);
}
