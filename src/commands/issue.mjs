import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { readJsonFile, writeJsonFile } from '../core/json.mjs';
import { findRecordById, listRecordsWithIndexFallback, persistRecord } from '../core/records.mjs';
import { parseArgs, splitList } from '../core/cli.mjs';
import { ENUMS, assertEnum, assertEntityListExists, assertIssueTransition, evidenceFromOpts } from '../core/guards.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

const indexFile = path.join(memoryRoot, 'work', 'issues', 'index.jsonl');
const issueRoot = path.join(memoryRoot, 'work', 'issues');

function toIndexRecord(item) {
  return {
    id: item.id,
    kind: 'issue',
    title: item.title,
    status: item.status,
    issueType: item.issueType,
    severity: item.severity,
    confidence: item.confidence,
    containerIds: item.containerIds,
    path: item.paths?.self,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    closedAt: item.closedAt,
  };
}

function usage() {
  console.log('Usage: mm issue <create|list|show|update|close|link-pr|verify|block|unblock> ...');
}

function applyArrayUpdates(item, opts) {
  if (opts['container-ids']) item.containerIds = splitList(opts['container-ids']);
  if (opts['initiative-ids']) item.initiativeIds = splitList(opts['initiative-ids']);
  if (opts['source-discovery-ids']) item.sourceDiscoveryIds = splitList(opts['source-discovery-ids']);
  if (opts['source-comment-ids']) item.sourceCommentIds = splitList(opts['source-comment-ids']);
  if (opts['files-affected']) item.filesAffected = splitList(opts['files-affected']);
  if (opts['success-gates']) item.successGates = splitList(opts['success-gates']);
  if (opts.acceptance) item.acceptanceCriteria = splitList(opts.acceptance);
  if (opts.verification) item.verificationPlan = splitList(opts.verification);
  if (opts['non-goals']) item.nonGoals = splitList(opts['non-goals']);
  if (opts['blocked-by']) item.dependencies.blockedByIssueIds = splitList(opts['blocked-by']);
  if (opts.blocks) item.dependencies.blocksIssueIds = splitList(opts.blocks);
  if (opts.related) item.dependencies.relatedIssueIds = splitList(opts.related);
  if (opts['commit-shas']) item.implementation.commitShas = splitList(opts['commit-shas']);
}

function applyScalarUpdates(item, opts) {
  if (opts.title) item.title = opts.title;
  if (opts.description) item.description = opts.description;
  if (opts.risk) item.risk = opts.risk;
  if (opts.status) { assertEnum(opts.status, ENUMS.issueStatus, 'issue status'); item.status = opts.status; }
  if (opts['issue-type']) { assertEnum(opts['issue-type'], ENUMS.issueType, 'issue type'); item.issueType = opts['issue-type']; }
  if (opts.severity) { assertEnum(opts.severity, ENUMS.severity, 'severity'); item.severity = opts.severity; }
  if (opts.confidence) { assertEnum(opts.confidence, ENUMS.confidence, 'confidence'); item.confidence = opts.confidence; }
  if (opts.assignee) item.implementation.assignee = opts.assignee;
  if (opts.branch) item.implementation.branchName = opts.branch;
  if (opts.mode) item.implementation.assignedAgentMode = opts.mode;
  if (opts.wiki) item.paths.wiki = opts.wiki;
}

function applyGithubUpdates(item, opts) {
  const github = { ...(item.github || {}) };
  if (opts.repo) github.repository = opts.repo;
  if (opts['issue-number']) github.issueNumber = Number(opts['issue-number']);
  if (opts['issue-url']) github.issueUrl = opts['issue-url'];
  if (opts['parent-issue-numbers']) {
    github.parentIssueNumbers = splitList(opts['parent-issue-numbers']).map(value => Number(value)).filter(Number.isFinite);
  }
  if (opts.labels) github.labels = splitList(opts.labels);
  if (Object.keys(github).length) item.github = github;
}

function createIssueFromOptions(opts) {
  const title = (opts.title || opts._.join(' ')).trim();
  if (!title) {
    console.log('Usage: mm issue create <title> [--description "..."] [--container-ids a,b] [--source-discovery-ids a,b]');
    return null;
  }

  const now = new Date().toISOString();
  const id = opts.id || makeId('issue');
  const issue = {
    id,
    kind: 'issue',
    title,
    description: opts.description || title,
    risk: opts.risk || 'TBD',
    status: opts.status || 'draft',
    issueType: opts['issue-type'] || 'feature',
    severity: opts.severity || 'P2',
    confidence: opts.confidence || 'likely',
    initiativeIds: splitList(opts['initiative-ids']),
    containerIds: splitList(opts['container-ids']),
    sourceDiscoveryIds: splitList(opts['source-discovery-ids']),
    sourceCommentIds: splitList(opts['source-comment-ids']),
    filesAffected: splitList(opts['files-affected']),
    successGates: splitList(opts['success-gates']),
    acceptanceCriteria: splitList(opts.acceptance),
    verificationPlan: splitList(opts.verification),
    nonGoals: splitList(opts['non-goals']),
    dependencies: {
      blockedByIssueIds: splitList(opts['blocked-by']),
      blocksIssueIds: splitList(opts.blocks),
      relatedIssueIds: splitList(opts.related),
    },
    verificationEvidence: [],
    history: [{ at: now, event: 'created', status: opts.status || 'draft', note: 'Created via mm issue create.' }],
    implementation: {
      ...(opts.mode ? { assignedAgentMode: opts.mode } : {}),
      ...(opts.assignee ? { assignee: opts.assignee } : {}),
      ...(opts.branch ? { branchName: opts.branch } : {}),
      pullRequestUrls: splitList(opts['pull-request']),
      commitShas: splitList(opts['commit-shas']),
    },
    paths: {
      ...(opts.wiki ? { wiki: opts.wiki } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
  assertEnum(issue.status, ENUMS.issueStatus, 'issue status');
  assertEnum(issue.issueType, ENUMS.issueType, 'issue type');
  assertEnum(issue.severity, ENUMS.severity, 'severity');
  assertEnum(issue.confidence, ENUMS.confidence, 'confidence');
  applyGithubUpdates(issue, opts);
  return issue;
}

async function loadIssue(id) {
  return findRecordById(issueRoot, indexFile, id);
}

async function persistIssue(issue) {
  await persistRecord(issueRoot, indexFile, issue, toIndexRecord);
}

export async function run(argv) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'create') {
    const issue = createIssueFromOptions(parseArgs(argv, 2));
    if (!issue) return;
    await assertEntityListExists(issue.containerIds, 'container', 'container');
    await assertEntityListExists(issue.initiativeIds || [], 'initiative', 'initiative');
    await assertEntityListExists(issue.sourceDiscoveryIds, 'discovery', 'discovery');
    await assertEntityListExists(issue.sourceCommentIds, 'comment', 'comment');
    await persistIssue(issue);
    if (json) {
      writeJsonOutput({ ok: true, item: issue });
      return;
    }
    console.log('Created issue:', issue.id);
    return;
  }

  if (sub === 'list') {
    const opts = parseArgs(argv, 2);
    const items = await listRecordsWithIndexFallback(issueRoot, indexFile, item => item.kind === 'issue');
    const filtered = items.filter(item => {
      if (opts.status && item.status !== opts.status) return false;
      if (opts['issue-type'] && item.issueType !== opts['issue-type']) return false;
      if (opts.severity && item.severity !== opts.severity) return false;
      return true;
    });
    if (json) {
      writeJsonOutput({ ok: true, items: filtered });
      return;
    }
    if (!filtered.length) {
      console.log('No issues found.');
      return;
    }
    filtered.forEach(item => console.log(`${item.id} [${item.status}] ${item.title}`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm issue show <id>');
      return;
    }
    const opts = parseArgs(argv, 3);
    const issue = await loadIssue(id);
    if (!issue) {
      console.log('Issue not found:', id);
      return;
    }
    if (json) {
      writeJsonOutput({ ok: true, item: issue });
      return;
    }
    console.log(JSON.stringify(issue, null, 2));
    return;
  }

  if (sub === 'update') {
    const id = argv[2];
    const status = argv[3];
    const opts = parseArgs(argv, 4);
    if (!id || !status) {
      console.log('Usage: mm issue update <id> <status> [--description "..."] [--note "..."]');
      return;
    }
    const issue = await loadIssue(id);
    if (!issue) {
      console.log('Issue not found:', id);
      return;
    }
    applyScalarUpdates(issue, opts);
    applyArrayUpdates(issue, opts);
    assertIssueTransition(issue, status, opts);
    issue.status = status;
    applyGithubUpdates(issue, opts);
    const ev = evidenceFromOpts(opts);
    if (ev) issue.verificationEvidence = [...(issue.verificationEvidence || []), ev];
    const now = new Date().toISOString();
    issue.updatedAt = now;
    issue.history = [...(issue.history || []), { at: now, event: 'updated', status, ...(opts.note ? { note: opts.note } : {}) }];
    await persistIssue(issue);
    if (json) {
      writeJsonOutput({ ok: true, item: issue });
      return;
    }
    console.log('Updated issue:', id);
    return;
  }

  if (sub === 'close') {
    const id = argv[2];
    const opts = parseArgs(argv, 3);
    if (!id) {
      console.log('Usage: mm issue close <id>');
      return;
    }
    const issue = await loadIssue(id);
    if (!issue) {
      console.log('Issue not found:', id);
      return;
    }
    const now = new Date().toISOString();
    assertIssueTransition(issue, 'closed', opts);
    issue.status = 'closed';
    issue.closedAt = now;
    issue.updatedAt = now;
    await persistIssue(issue);
    if (json) {
      writeJsonOutput({ ok: true, item: issue });
      return;
    }
    console.log('Closed issue:', id);
    return;
  }

  if (sub === 'link-pr') {
    const id = argv[2];
    const pr = argv[3];
    if (!id || !pr) {
      console.log('Usage: mm issue link-pr <id> <pr-url>');
      return;
    }
    const issue = await loadIssue(id);
    if (!issue) {
      console.log('Issue not found:', id);
      return;
    }
    const links = new Set(issue.implementation?.pullRequestUrls || []);
    links.add(pr);
    issue.implementation = {
      ...(issue.implementation || {}),
      pullRequestUrls: [...links],
      commitShas: Array.isArray(issue.implementation?.commitShas) ? issue.implementation.commitShas : [],
    };
    issue.updatedAt = new Date().toISOString();
    await persistIssue(issue);
    if (json) {
      writeJsonOutput({ ok: true, item: issue });
      return;
    }
    console.log('Linked PR to issue:', id);
    return;
  }

  if (sub === 'verify') {
    const id = argv[2];
    const opts = parseArgs(argv, 3);
    if (!id) {
      console.log('Usage: mm issue verify <id>');
      return;
    }
    const issue = await loadIssue(id);
    if (!issue) {
      console.log('Issue not found:', id);
      return;
    }
    assertIssueTransition(issue, 'verified', opts);
    const ev = evidenceFromOpts(opts);
    if (ev) issue.verificationEvidence = [...(issue.verificationEvidence || []), ev];
    issue.status = 'verified';
    const now = new Date().toISOString();
    issue.updatedAt = now;
    issue.history = [...(issue.history || []), { at: now, event: 'verified', status: 'verified', ...(opts.note ? { note: opts.note } : {}) }];
    await persistIssue(issue);
    if (json) {
      writeJsonOutput({ ok: true, item: issue });
      return;
    }
    console.log('Verified issue:', id);
    return;
  }

  if (sub === 'block' || sub === 'unblock') {
    const id = argv[2];
    const opts = parseArgs(argv, 3);
    if (!id) {
      console.log(`Usage: mm issue ${sub} <id> [--status <status>]`);
      return;
    }
    const issue = await loadIssue(id);
    if (!issue) {
      console.log('Issue not found:', id);
      return;
    }
    issue.status = sub === 'block' ? 'blocked' : (opts.status || 'ready_for_agent');
    issue.updatedAt = new Date().toISOString();
    await persistIssue(issue);
    if (json) {
      writeJsonOutput({ ok: true, item: issue });
      return;
    }
    console.log(`${sub === 'block' ? 'Blocked' : 'Unblocked'} issue:`, id);
    return;
  }

  usage();
}
