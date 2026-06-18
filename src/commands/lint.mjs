import fs from 'node:fs/promises';
import path from 'path';
import { memoryRoot, repoRoot, schemasRoot } from '../core/paths.mjs';
import { readJsonFile, readJsonl } from '../core/json.mjs';
import { readDirRecursive } from '../core/fs.mjs';
import { readMarkdownPage } from '../core/frontmatter.mjs';
import { validateAgainstSchema } from '../core/validation.mjs';
import { entityRefExists, findEntityRecord } from '../core/entities.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { scanMarkdownPages } from '../core/pages.mjs';
import { detectSuspiciousUnicode } from '../core/string-safety.mjs';
import { validateRoleContract } from '../core/role-contracts.mjs';

const checks = [
  { label: 'containers', schema: 'container.schema.json', dir: path.join(memoryRoot, 'work', 'containers') },
  { label: 'initiatives', schema: 'initiative.schema.json', dir: path.join(memoryRoot, 'work', 'initiatives') },
  { label: 'issues', schema: 'issue.schema.json', dir: path.join(memoryRoot, 'work', 'issues') },
  { label: 'discoveries', schema: 'discovery.schema.json', dir: path.join(memoryRoot, 'work', 'discoveries') },
  { label: 'comments', schema: 'comment.schema.json', dir: path.join(memoryRoot, 'work', 'comments') },
  { label: 'sprints', schema: 'sprint.schema.json', dir: path.join(memoryRoot, 'work', 'sprints') },
  { label: 'phases', schema: 'phase.schema.json', dir: path.join(memoryRoot, 'work', 'phases') },
  { label: 'tasks', schema: 'task.schema.json', dir: path.join(memoryRoot, 'work', 'tasks') },
];

function repoRelative(filePath) { return path.relative(repoRoot, filePath) || filePath; }
async function loadSchema(schemaFile) { return readJsonFile(path.join(schemasRoot, schemaFile)); }
async function readDirRecords(dir) {
  const files = await readDirRecursive(dir, { filter: filePath => filePath.endsWith('.md') });
  return files.map(file => ({ file }));
}
async function readJsonDirRecords(dir) {
  const files = await readDirRecursive(dir, { filter: filePath => filePath.endsWith('.json') });
  return files.map(file => ({ file }));
}
async function validateIdList(errors, warnings, ownerLabel, ids, explicitKind, severity = 'error') {
  for (const id of ids || []) {
    if (typeof id === 'string' && id.startsWith('github:')) continue;
    const exists = await findEntityRecord(id, explicitKind);
    if (!exists) {
      const message = `${ownerLabel}: missing ${explicitKind || 'linked'} record ${id}`;
      if (severity === 'warning') warnings.push(message); else errors.push(message);
    }
  }
}
function needEvidence(record) { return Array.isArray(record.verificationEvidence) && record.verificationEvidence.length > 0; }
function needMeaningful(values) { return Array.isArray(values) && values.some(v => String(v || '').trim()); }

async function lintClaims(errors, warnings) {
  const claims = await readJsonl(path.join(memoryRoot, 'wiki', 'claims.jsonl'));
  for (const [index, claim] of claims.entries()) {
    const prefix = `memory/wiki/claims.jsonl:${index + 1}`;
    if (!claim.id || !claim.subject || !claim.text) errors.push(`${prefix}: claim requires id, subject, and text`);
    if (!claim.confidence) warnings.push(`${prefix}: claim missing confidence`);
    if (claim.status === 'contradiction' && (!Array.isArray(claim.sourceRefs) || claim.sourceRefs.length < 2)) {
      errors.push(`${prefix}: contradiction claim requires two source refs`);
    }
    for (const ref of claim.sourceRefs || []) {
      const normalized = typeof ref === 'string' ? { id: ref, kind: ref.startsWith('raw_') ? 'raw_item' : 'source' } : ref;
      if (!(await entityRefExists(normalized))) warnings.push(`${prefix}: unresolved source ref ${normalized.id || normalized.path || 'unknown'}`);
    }
  }
}

async function lintRawItems(errors, warnings) {
  const schema = await loadSchema('raw-item.schema.json');
  const items = await readJsonl(path.join(memoryRoot, 'inbox', 'raw-items.jsonl'));
  for (const [index, item] of items.entries()) {
    const prefix = `memory/inbox/raw-items.jsonl:${index + 1}`;
    validateAgainstSchema(schema, item).forEach(msg => errors.push(`${prefix}: ${msg}`));
    if (item.status === 'processed' && item.reconciledTo) {
      for (const ref of item.reconciledTo) {
        if (!(await entityRefExists(ref))) errors.push(`${prefix}: processed target missing (${ref.kind} ${ref.id || ref.path})`);
      }
    }
  }
}

async function lintStructuredRecords(errors, warnings, bag) {
  const seenIds = new Map();
  const registerRecord = (record, rel, sourceType, label) => {
    if (!record?.id) return;
    const entry = seenIds.get(record.id) || { markdown: null, json: null, other: null };
    if (entry[sourceType]) {
      errors.push(`${rel}: duplicate record id ${record.id} already seen in ${entry[sourceType]}`);
      return;
    }
    entry[sourceType] = rel;
    seenIds.set(record.id, entry);
    if (label !== 'discoveries') {
      const known = [entry.markdown, entry.json, entry.other].filter(Boolean);
      if (known.length > 1) {
        const previous = known.find(value => value !== rel) || known[0];
        errors.push(`${rel}: duplicate record id ${record.id} already seen in ${previous}`);
      }
    }
  };

  for (const check of checks) {
    const schema = await loadSchema(check.schema);
    for (const entry of await readDirRecords(check.dir)) {
      const rel = repoRelative(entry.file);
      const page = await readMarkdownPage(entry.file);
      if (page.errors?.length) {
        errors.push(`${rel}: invalid markdown (${page.errors.join('; ')})`);
        continue;
      }
      const record = page.frontmatter || {};
      bag[check.label].push(record);
      registerRecord(record, rel, 'markdown', check.label);
      validateAgainstSchema(schema, record).forEach(message => errors.push(`${rel}: ${message}`));

      if (check.label === 'initiatives') {
        await validateIdList(errors, warnings, rel, record.containerIds, 'container', 'warning');
        await validateIdList(errors, warnings, rel, record.sprintIds, 'sprint');
        await validateIdList(errors, warnings, rel, record.issueIds, 'issue');
      }
      if (check.label === 'issues') {
        await validateIdList(errors, warnings, rel, record.containerIds, 'container', 'warning');
        await validateIdList(errors, warnings, rel, record.initiativeIds, 'initiative');
        await validateIdList(errors, warnings, rel, record.sourceDiscoveryIds, 'discovery');
        await validateIdList(errors, warnings, rel, record.sourceCommentIds, 'comment');
        await validateIdList(errors, warnings, rel, record.dependencies?.blockedByIssueIds, 'issue');
        if (record.status === 'ready_for_agent' && (!needMeaningful(record.acceptanceCriteria) || !needMeaningful(record.verificationPlan) || !record.risk || record.risk === 'TBD')) {
          errors.push(`${rel}: ready_for_agent requires risk, acceptanceCriteria, and verificationPlan`);
        }
        if (['verified', 'closed'].includes(record.status) && !needEvidence(record)) {
          errors.push(`${rel}: ${record.status} issue requires verificationEvidence`);
        }
      }
      if (check.label === 'comments') {
        if (!record.target || !(await entityRefExists(record.target))) errors.push(`${rel}: comment target missing`);
        if (record.containerId) await validateIdList(errors, warnings, rel, [record.containerId], 'container', 'warning');
        await validateIdList(errors, warnings, rel, record.relatedDiscoveryIds, 'discovery');
        await validateIdList(errors, warnings, rel, record.relatedIssueIds, 'issue');
      }
      if (check.label === 'sprints') {
        await validateIdList(errors, warnings, rel, record.initiativeIds, 'initiative');
        await validateIdList(errors, warnings, rel, record.containerIds, 'container', 'warning');
        await validateIdList(errors, warnings, rel, record.issueIds, 'issue');
        await validateIdList(errors, warnings, rel, record.phaseIds, 'phase', 'warning');
        await validateIdList(errors, warnings, rel, record.taskIds, 'task', 'warning');
        if (record.status === 'completed' && !needMeaningful(record.successGates)) errors.push(`${rel}: completed sprint requires successGates`);
      }
      if (check.label === 'phases') {
        await validateIdList(errors, warnings, rel, [record.sprintId], 'sprint');
        await validateIdList(errors, warnings, rel, record.issueIds, 'issue');
        await validateIdList(errors, warnings, rel, record.taskIds, 'task', 'warning');
        if (record.status === 'completed' && !needMeaningful(record.successGates)) errors.push(`${rel}: completed phase requires successGates`);
      }
      if (check.label === 'tasks') {
        await validateIdList(errors, warnings, rel, [record.sprintId], 'sprint');
        if (record.phaseId) await validateIdList(errors, warnings, rel, [record.phaseId], 'phase');
        await validateIdList(errors, warnings, rel, record.issueIds, 'issue');
        await validateIdList(errors, warnings, rel, record.containerIds, 'container', 'warning');
        if (record.status === 'in_progress' && (!needMeaningful(record.acceptanceCriteria) || !needMeaningful(record.verificationPlan))) {
          errors.push(`${rel}: in_progress task requires acceptanceCriteria and verificationPlan`);
        }
        if (record.status === 'done' && !needEvidence(record)) errors.push(`${rel}: done task requires verificationEvidence`);
      }
    }
    for (const entry of await readJsonDirRecords(check.dir)) {
      const rel = repoRelative(entry.file);
      let record;
      try {
        record = await readJsonFile(entry.file);
      } catch (err) {
        errors.push(`${rel}: malformed JSON (${err.message})`);
        continue;
      }
      bag[check.label].push(record);
      registerRecord(record, rel, 'json', check.label);
      validateAgainstSchema(schema, record).forEach(message => errors.push(`${rel}: ${message}`));
    }
  }
}

function lintCrossRecordInvariants(errors, warnings, bag) {
  const sprintById = new Map(bag.sprints.map(x => [x.id, x]));
  const phaseById = new Map(bag.phases.map(x => [x.id, x]));
  for (const task of bag.tasks) {
    const sprint = sprintById.get(task.sprintId);
    if (task.phaseId) {
      const phase = phaseById.get(task.phaseId);
      if (phase && phase.sprintId !== task.sprintId) errors.push(`${task.id}: task.phaseId belongs to ${phase.sprintId}, not task.sprintId ${task.sprintId}`);
      if (phase && Array.isArray(phase.taskIds) && phase.taskIds.length && !phase.taskIds.includes(task.id)) warnings.push(`${task.id}: phase.taskIds does not include task; derived arrays may be stale`);
    }
    if (sprint && Array.isArray(sprint.taskIds) && sprint.taskIds.length && !sprint.taskIds.includes(task.id)) warnings.push(`${task.id}: sprint.taskIds does not include task; derived arrays may be stale`);
  }
  for (const phase of bag.phases) {
    const sprint = sprintById.get(phase.sprintId);
    if (sprint && Array.isArray(sprint.phaseIds) && sprint.phaseIds.length && !sprint.phaseIds.includes(phase.id)) warnings.push(`${phase.id}: sprint.phaseIds does not include phase; derived arrays may be stale`);
  }
}

async function lintRelationships(errors, warnings) {
  const schema = await loadSchema('relationship.schema.json');
  const file = path.join(memoryRoot, 'issues', 'relationships.jsonl');
  const edges = await readJsonl(file);
  const seen = new Set();
  edges.forEach((edge, index) => {
    const prefix = `memory/issues/relationships.jsonl:${index + 1}`;
    validateAgainstSchema(schema, edge).forEach(message => errors.push(`${prefix}: ${message}`));
    const key = JSON.stringify([edge.from, edge.to, edge.type]);
    if (seen.has(key)) errors.push(`${prefix}: duplicate relationship edge`);
    seen.add(key);
  });
  for (const [index, edge] of edges.entries()) {
    const prefix = `memory/issues/relationships.jsonl:${index + 1}`;
    if (!(await entityRefExists(edge.from))) errors.push(`${prefix}: from ref missing (${edge.from?.kind || 'unknown'} ${edge.from?.id || edge.from?.path || 'unknown'})`);
    if (!(await entityRefExists(edge.to))) errors.push(`${prefix}: to ref missing (${edge.to?.kind || 'unknown'} ${edge.to?.id || edge.to?.path || 'unknown'})`);
  }
}

async function lintFrontmatter(errors, warnings) {
  const pages = await scanMarkdownPages();
  for (const page of pages) {
    if (page.errors?.length) {
      errors.push(`${page.path}: ${page.errors.join('; ')}`);
    }
    const fm = page.frontmatter || {};
    for (const field of ['title', 'kind', 'status']) {
      const value = fm[field] ?? page[field];
      if (!value) continue;
      const suspicious = detectSuspiciousUnicode(value);
      if (suspicious.hasSuspiciousUnicode) warnings.push(`${page.path}: suspicious unicode in ${field}`);
    }
  }
}

async function lintUnicode(errors, warnings) {
  const pages = await scanMarkdownPages();
  for (const page of pages) {
    for (const value of [page.title, page.path, ...(page.aliases || []), ...(page.tags || []), ...(page.semanticTerms || [])]) {
      if (!value) continue;
      if (detectSuspiciousUnicode(value).hasSuspiciousUnicode) warnings.push(`${page.path}: suspicious unicode in value ${String(value).slice(0, 60)}`);
    }
  }
  const items = await readJsonl(path.join(memoryRoot, 'inbox', 'raw-items.jsonl'));
  for (const item of items) {
    for (const value of [item.title, item.summary, item.sourceType]) {
      if (!value) continue;
      if (detectSuspiciousUnicode(value).hasSuspiciousUnicode) warnings.push(`memory/inbox/raw-items.jsonl:${item.id}: suspicious unicode in raw item`);
    }
  }
}

async function lintJsonl(errors, warnings) {
  for (const rel of [
    'inbox/raw-items.jsonl',
    'issues/relationships.jsonl',
    'generated/page-index.jsonl',
    'generated/chunks.jsonl',
  ]) {
    try {
      const rows = await readJsonl(path.join(memoryRoot, rel), { mode: 'strict' });
      if (!Array.isArray(rows)) errors.push(`${rel}: could not parse JSONL`);
    } catch (err) {
      errors.push(`${rel}: ${err.message}`);
    }
  }
}

function validateGeneratedShape(errors, rel, data, requiredKeys = []) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(`${rel}: expected JSON object`);
    return;
  }
  for (const key of requiredKeys) {
    if (!(key in data)) errors.push(`${rel}: missing ${key}`);
  }
}

async function lintGeneratedArtifacts(errors) {
  const generatedFiles = [
    {
      rel: 'generated/dashboard.json',
      kind: 'json',
      requiredKeys: ['generatedAt', 'summary', 'focus', 'indices'],
    },
    {
      rel: 'generated/search-index.json',
      kind: 'json',
      requiredKeys: ['builtAt', 'pages', 'chunks', 'bm25'],
    },
    {
      rel: '.mm/search/manifest.json',
      kind: 'json',
      requiredKeys: ['builtAt', 'mode', 'pageCount', 'chunkCount', 'vectorDims'],
    },
  ];

  for (const file of generatedFiles) {
    const fullPath = path.join(memoryRoot, file.rel);
    try {
      const data = await readJsonFile(fullPath);
      validateGeneratedShape(errors, file.rel, data, file.requiredKeys);
    } catch (err) {
      errors.push(`${file.rel}: ${err.message}`);
    }
  }
}

async function lintRoleContracts(errors) {
  const rolesRoot = path.join(memoryRoot, 'agents', 'roles');
  let entries = [];
  try {
    entries = await fs.readdir(rolesRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const agentPath = path.join(rolesRoot, entry.name, 'AGENT.md');
    try {
      const page = await readMarkdownPage(agentPath);
      const findings = validateRoleContract({
        slug: entry.name,
        allowedTools: Array.isArray(page.frontmatter?.allowed_tools) ? page.frontmatter.allowed_tools : [],
        forbiddenTools: Array.isArray(page.frontmatter?.forbidden_tools) ? page.frontmatter.forbidden_tools : [],
        skillGroups: Array.isArray(page.frontmatter?.skill_groups) ? page.frontmatter.skill_groups : [],
      });
      for (const finding of findings) {
        errors.push(`memory/agents/roles/${entry.name}/AGENT.md: ${finding}`);
      }
    } catch (err) {
      errors.push(`memory/agents/roles/${entry.name}/AGENT.md: ${err.message}`);
    }
  }
}

export async function run(argv = []) {
  const json = argv.includes('--json');
  const sub = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'all';
  const errors = [];
  const warnings = [];
  const bag = { containers: [], initiatives: [], issues: [], discoveries: [], comments: [], sprints: [], phases: [], tasks: [] };
  if (sub === 'frontmatter') {
    await lintFrontmatter(errors, warnings);
  } else if (sub === 'unicode') {
    await lintUnicode(errors, warnings);
  } else if (sub === 'jsonl') {
    await lintJsonl(errors, warnings);
  } else {
    await lintStructuredRecords(errors, warnings, bag);
    await lintRawItems(errors, warnings);
    await lintClaims(errors, warnings);
    lintCrossRecordInvariants(errors, warnings, bag);
    await lintRelationships(errors, warnings);
    await lintFrontmatter(errors, warnings);
    await lintUnicode(errors, warnings);
    await lintJsonl(errors, warnings);
    await lintGeneratedArtifacts(errors);
    await lintRoleContracts(errors);
  }
  if (json) {
    writeJsonOutput({
      ok: errors.length === 0,
      summary: { errors: errors.length, warnings: warnings.length },
      findings: [
        ...warnings.map(message => ({ severity: 'warning', message })),
        ...errors.map(message => ({ severity: 'error', message })),
      ],
    });
    if (errors.length) process.exitCode = 2;
    return;
  }
  if (!errors.length && !warnings.length) return console.log('Lint passed.');
  warnings.forEach(message => console.log(`WARN  ${message}`));
  errors.forEach(message => console.log(`FAIL  ${message}`));
  if (errors.length) { console.log(`\nLint failed with ${errors.length} error(s) and ${warnings.length} warning(s).`); process.exitCode = 2; return; }
  console.log(`\nLint passed with ${warnings.length} warning(s).`);
}
