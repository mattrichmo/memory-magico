import { findEntityRecord } from './entities.mjs';

export const ENUMS = {
  initiativeStatus: ['idea', 'shaping', 'planned', 'active', 'shipped', 'parked', 'cancelled'],
  issueStatus: ['draft', 'ready_for_agent', 'in_progress', 'needs_review', 'needs_verification', 'verified', 'closed', 'deferred', 'blocked'],
  issueType: ['bug', 'feature', 'refactor', 'test', 'research', 'docs', 'cleanup', 'build'],
  severity: ['P0', 'P1', 'P2', 'P3', 'P4'],
  confidence: ['confirmed', 'likely', 'hypothesis', 'needs_reproduction'],
  sprintStatus: ['planned', 'active', 'paused', 'completed', 'cancelled'],
  phaseStatus: ['planned', 'active', 'paused', 'completed', 'cancelled'],
  taskStatus: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'],
  commentStatus: ['unreconciled', 'needs_research', 'promoted_to_issue', 'folded_into_issue', 'duplicate', 'deferred', 'rejected', 'resolved_by_existing_code', 'superseded', 'archived_resolved_history'],
};

export function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}. Received: ${value}`);
  }
}

export function assertNonEmpty(value, label) {
  if (!value || !String(value).trim()) throw new Error(`${label} is required.`);
}

export function assertMeaningfulList(values, label) {
  if (!Array.isArray(values) || values.length === 0 || values.some(v => !String(v || '').trim())) {
    throw new Error(`${label} must contain at least one meaningful item.`);
  }
}

export async function assertEntityExists(id, kind, label = kind) {
  if (!id) throw new Error(`${label} is required.`);
  const record = await findEntityRecord(id, kind);
  if (!record) throw new Error(`${label} not found: ${id}`);
  return record;
}

export async function assertEntityListExists(ids, kind, label = kind) {
  for (const id of ids || []) {
    await assertEntityExists(id, kind, label);
  }
}

export function evidenceFromOpts(opts = {}) {
  const tests = opts.test ? [opts.test] : [];
  const evidenceRefs = opts.evidence ? String(opts.evidence).split(',').map(s => s.trim()).filter(Boolean) : [];
  const result = opts.result || opts.note || '';
  const commits = opts.commits ? String(opts.commits).split(',').map(s => s.trim()).filter(Boolean) : [];
  const pullRequests = opts.pr ? String(opts.pr).split(',').map(s => s.trim()).filter(Boolean) : [];
  if (!tests.length && !evidenceRefs.length && !result && !commits.length && !pullRequests.length) {
    return null;
  }
  return {
    at: new Date().toISOString(),
    ...(result ? { result } : {}),
    ...(tests.length ? { tests } : {}),
    ...(evidenceRefs.length ? { evidenceRefs } : {}),
    ...(commits.length ? { commits } : {}),
    ...(pullRequests.length ? { pullRequests } : {}),
  };
}

export function assertIssueTransition(issue, nextStatus, opts = {}) {
  assertEnum(nextStatus, ENUMS.issueStatus, 'issue status');
  if (nextStatus === 'ready_for_agent') {
    if (!issue.risk || issue.risk === 'TBD') throw new Error('ready_for_agent requires a meaningful risk statement. Use --risk.');
    assertMeaningfulList(issue.acceptanceCriteria, 'ready_for_agent acceptance criteria');
    assertMeaningfulList(issue.verificationPlan, 'ready_for_agent verification plan');
  }
  if (nextStatus === 'verified') {
    const evidence = evidenceFromOpts(opts);
    if (!evidence && !(issue.verificationEvidence || []).length) {
      throw new Error('verified requires evidence: pass --test, --result, --evidence, --commits, --pr, or add prior verificationEvidence.');
    }
  }
  if (nextStatus === 'closed' && issue.status !== 'verified' && !opts.force) {
    throw new Error('closed requires verified first. Use --force only for administrative closure.');
  }
}

export function assertTaskTransition(task, nextStatus, opts = {}) {
  assertEnum(nextStatus, ENUMS.taskStatus, 'task status');
  if (nextStatus === 'in_progress') {
    assertMeaningfulList(task.acceptanceCriteria, 'in_progress acceptance criteria');
    assertMeaningfulList(task.verificationPlan, 'in_progress verification plan');
  }
  if (nextStatus === 'done') {
    const evidence = evidenceFromOpts(opts);
    if (!evidence && !(task.verificationEvidence || []).length) {
      throw new Error('done requires evidence: pass --test, --result, --evidence, --commits, --pr, or add prior verificationEvidence.');
    }
  }
}
