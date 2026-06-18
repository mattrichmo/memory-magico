import path from 'path';
import { memoryRoot } from './paths.mjs';
import { mkdirp } from './fs.mjs';
import { slugify } from './slugs.mjs';
import { writeMarkdownPage } from './frontmatter.mjs';

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

function frontmatterForRecord(record) {
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
  };
}

export async function mirrorRecordToMarkdown(record) {
  const rel = KIND_DIRS[record?.kind];
  if (!rel) return null;
  const dir = path.join(memoryRoot, ...rel);
  await mkdirp(dir);
  const file = path.join(dir, `${slugify(record.title || record.id)}.md`);
  await writeMarkdownPage(file, frontmatterForRecord(record), bodyForRecord(record));
  return file;
}
