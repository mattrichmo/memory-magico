import path from 'path';
import { memoryRoot } from './paths.mjs';
import { mkdirp } from './fs.mjs';
import { writeMarkdownPage } from './frontmatter.mjs';
import { assertSafePathSegment, isInsidePath, resolveContainedPath } from './safe-path.mjs';
import { PATH_POLICIES } from './path-policies.mjs';

const KIND_DIRS = {
  initiative: ['work', 'initiatives'],
  sprint: ['work', 'sprints'],
  phase: ['work', 'phases'],
  task: ['work', 'tasks'],
  issue: ['work', 'issues'],
  discovery: ['work', 'discoveries'],
  comment: ['work', 'comments'],
  container: ['work', 'containers'],
};

function bodyForRecord(record) {
  const sections = [
    `# ${record.title || record.id}`,
    '',
    `## Status`,
    '',
    String(record.status || 'draft'),
  ];
  if (record.description) {
    sections.push('', '## Description', '', String(record.description));
  }
  if (record.why) {
    sections.push('', '## Why', '', String(record.why));
  }
  if (record.desiredOutcome) {
    sections.push('', '## Outcome', '', String(record.desiredOutcome));
  }
  if (record.goal) {
    sections.push('', '## Goal', '', String(record.goal));
  }
  if (record.summary) {
    sections.push('', '## Summary', '', String(record.summary));
  }
  if (record.bodyMarkdown) {
    sections.push('', '## Notes', '', String(record.bodyMarkdown));
  }
  return sections.join('\n') + '\n';
}

function frontmatterForRecord(record, filePath = null) {
  const selfPath = filePath ? path.relative(memoryRoot, filePath).split(path.sep).join('/') : record?.paths?.self || null;
  const sprintFields = record.kind === 'sprint'
    ? {
        number: record.number ?? null,
        completedAt: record.completedAt || null,
        startDate: record.startDate || null,
        endDate: record.endDate || null,
        phaseIds: record.phaseIds || [],
        taskIds: record.taskIds || [],
        successGates: record.successGates || [],
        nonGoals: record.nonGoals || [],
      }
    : {};
  const phaseFields = record.kind === 'phase'
    ? {
        completedAt: record.completedAt || null,
        number: record.number ?? null,
        taskIds: record.taskIds || [],
        successGates: record.successGates || [],
        notes: record.notes || null,
      }
    : {};
  const taskFields = record.kind === 'task'
    ? {
        number: record.number ?? null,
      }
    : {};
  const commentFields = record.kind === 'comment'
    ? {
        target: record.target || null,
        bodyMarkdown: record.bodyMarkdown || null,
        sourceType: record.sourceType || null,
        author: record.author || null,
        reconciliationStatus: record.reconciliationStatus || null,
        containerId: record.containerId || null,
        relatedDiscoveryIds: record.relatedDiscoveryIds || [],
        relatedIssueIds: record.relatedIssueIds || [],
      }
    : {};
  return {
    id: record.id,
    kind: record.kind || 'note',
    title: record.title || record.summary || record.id,
    status: record.status || 'draft',
    aliases: record.aliases || [],
    tags: record.tags || [],
    sourceRefs: record.sourceRawItemIds || [],
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    description: record.description || null,
    why: record.why || null,
    desiredOutcome: record.desiredOutcome || null,
    goal: record.goal || null,
    summary: record.summary || null,
    sprintId: record.sprintId || null,
    phaseId: record.phaseId || null,
    issueIds: record.issueIds || [],
    initiativeIds: record.initiativeIds || [],
    containerIds: record.containerIds || [],
    sourceDiscoveryIds: record.sourceDiscoveryIds || [],
    sourceCommentIds: record.sourceCommentIds || [],
    acceptanceCriteria: record.acceptanceCriteria || [],
    verificationPlan: record.verificationPlan || [],
    verificationEvidence: record.verificationEvidence || [],
    issueType: record.issueType || null,
    severity: record.severity || null,
    confidence: record.confidence || null,
    risk: record.risk || null,
    dependencies: record.dependencies || null,
    ...sprintFields,
    ...phaseFields,
    ...taskFields,
    ...commentFields,
    paths: {
      self: selfPath,
    },
  };
}

export async function mirrorRecordToMarkdown(record) {
  const rel = KIND_DIRS[record?.kind];
  if (!rel) return null;
  const dir = path.join(memoryRoot, ...rel);
  await mkdirp(dir);
  const safeId = assertSafePathSegment(record?.id, 'record id');
  const existingSelf = record?.paths?.self;
  let file = null;
  if (existingSelf) {
    try {
      const normalizedSelf = String(existingSelf).replace(/^memory\//, '');
      const resolved = await resolveContainedPath(memoryRoot, normalizedSelf, PATH_POLICIES.MEMORY_WRITE);
      if (isInsidePath(dir, resolved) && resolved.endsWith('.md')) {
        file = resolved;
      }
    } catch {
      file = null;
    }
  }
  if (!file) {
    file = path.join(dir, `${safeId}.md`);
  }
  await writeMarkdownPage(file, frontmatterForRecord(record, file), bodyForRecord(record));
  return file;
}
