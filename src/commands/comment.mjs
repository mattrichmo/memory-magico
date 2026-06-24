import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { findRecordById, listRecordsWithIndexFallback, persistRecord } from '../core/records.mjs';
import { findEntityRecord, inferKindFromId, resolveNodeRef, entityRefExists } from '../core/entities.mjs';
import { parseArgs, splitList } from '../core/cli.mjs';
import { ENUMS, assertEnum } from '../core/guards.mjs';
import { InvalidArgumentError } from '../core/errors.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

const commentRoot = path.join(memoryRoot, 'work', 'comments');
const indexFile = path.join(commentRoot, 'index.jsonl');
const SUPPORTED_TARGET_KINDS = new Set(['issue', 'discovery', 'raw_item']);
const NOTE_HISTORY_TARGET_KINDS = new Set(['initiative', 'sprint', 'phase', 'task']);

function toIndexRecord(item) {
  return {
    id: item.id,
    kind: 'comment',
    summary: item.summary,
    reconciliationStatus: item.reconciliationStatus,
    containerId: item.containerId,
    relatedIssueIds: item.relatedIssueIds,
    path: item.paths?.self,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function inferCommentContext(targetId) {
  const target = await findEntityRecord(targetId);
  if (!target) return { relatedIssueIds: [], relatedDiscoveryIds: [] };
  const kind = target.kind || inferKindFromId(targetId);
  if (kind === 'issue') {
    return {
      containerId: target.containerIds?.[0],
      relatedIssueIds: [targetId],
      relatedDiscoveryIds: [],
    };
  }
  if (kind === 'discovery') {
    return {
      containerId: target.containerId,
      relatedIssueIds: [],
      relatedDiscoveryIds: [targetId],
    };
  }
  if (kind === 'raw_item') {
    return { relatedIssueIds: [], relatedDiscoveryIds: [] };
  }
  return { relatedIssueIds: [], relatedDiscoveryIds: [] };
}

function noteHistoryHint(target) {
  if (!target?.id || !target?.kind || !NOTE_HISTORY_TARGET_KINDS.has(target.kind)) return '';
  const status = target.status || '<current-status>';
  return `Use \`mm ${target.kind} update ${target.id} ${status} --note "..."\` to record scope or acceptance notes on the work item history.`;
}

function assertSupportedCommentTarget(target) {
  const kind = target?.kind || inferKindFromId(target?.id);
  if (SUPPORTED_TARGET_KINDS.has(kind)) return;

  const hint = NOTE_HISTORY_TARGET_KINDS.has(kind)
    ? noteHistoryHint(target)
    : 'Supported comment targets are issues, discoveries, and raw items.';
  throw new InvalidArgumentError(`mm comment add does not support ${kind || 'unknown'} targets.`, { hint });
}

async function loadComment(id) {
  return findRecordById(commentRoot, indexFile, id);
}

async function persistComment(item) {
  await persistRecord(commentRoot, indexFile, item, toIndexRecord);
}

export async function run(argv) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'add' || sub === 'create') {
    const targetId = argv[2];
    const opts = parseArgs(argv, 3);
    const text = opts.body || opts._.join(' ').trim();
    if (!targetId || !text) {
      console.log('Usage: mm comment add <issue|discovery|raw-id> <text> [--container-id <id>] [--source-raw-item-ids a,b]');
      return;
    }

    const targetRecord = await findEntityRecord(targetId);
    const target = targetRecord
      ? {
          id: targetRecord.id,
          kind: targetRecord.kind || inferKindFromId(targetId),
          status: targetRecord.status,
        }
      : { id: targetId, kind: inferKindFromId(targetId) };
    assertSupportedCommentTarget(target);

    const inferred = await inferCommentContext(targetId);
    const now = new Date().toISOString();
    const id = opts.id || makeId('comment');
    const comment = {
      id,
      kind: 'comment',
      ...(opts['container-id'] || inferred.containerId ? { containerId: opts['container-id'] || inferred.containerId } : {}),
      target: await resolveNodeRef(targetId),
      sourceType: opts['source-type'] || 'manual',
      ...(opts.author ? { author: opts.author } : {}),
      title: opts.title || `Comment on ${targetId}`,
      status: opts.status || 'draft',
      summary: opts.summary || text.slice(0, 200),
      bodyMarkdown: text,
      reconciliationStatus: opts['reconciliation-status'] || 'unreconciled',
      relatedDiscoveryIds: splitList(opts['related-discovery-ids']).length
        ? splitList(opts['related-discovery-ids'])
        : inferred.relatedDiscoveryIds,
      relatedIssueIds: splitList(opts['related-issue-ids']).length
        ? splitList(opts['related-issue-ids'])
        : inferred.relatedIssueIds,
      sourceRawItemIds: splitList(opts['source-raw-item-ids']),
      paths: {
        ...(opts.source ? { source: opts.source } : {}),
      },
      createdAt: now,
      updatedAt: now,
    };
    assertEnum(comment.reconciliationStatus, ENUMS.commentStatus, 'comment reconciliation status');
    if (!(await entityRefExists(comment.target))) throw new Error(`comment target not found: ${targetId}`);
    await persistComment(comment);
    if (json) {
      writeJsonOutput({ ok: true, item: comment });
      return;
    }
    console.log('Added comment:', comment.id);
    return;
  }

  if (sub === 'list') {
    const comments = await listRecordsWithIndexFallback(commentRoot, indexFile, item => item.kind === 'comment');
    if (json) {
      writeJsonOutput({ ok: true, items: comments });
      return;
    }
    if (!comments.length) {
      console.log('No comments found.');
      return;
    }
    comments.forEach(comment => console.log(`${comment.id} [${comment.reconciliationStatus}] ${comment.summary}`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm comment show <id>');
      return;
    }
    const comment = await loadComment(id);
    if (!comment) {
      console.log('Comment not found:', id);
      return;
    }
    if (json) {
      writeJsonOutput({ ok: true, item: comment });
      return;
    }
    console.log(JSON.stringify(comment, null, 2));
    return;
  }

  console.log('Unknown comment subcommand:', sub);
}
