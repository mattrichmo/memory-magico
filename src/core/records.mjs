import fs from 'fs/promises';
import path from 'path';
import { memoryRoot } from './paths.mjs';
import { ensureDir, listJsonFiles, readJsonFile, readJsonl, writeJsonFile } from './json.mjs';
import { mirrorRecordToMarkdown } from './work-pages.mjs';
import { readDirRecursive, readFile } from './fs.mjs';
import { parseMarkdownPage } from './frontmatter.mjs';
import { PATH_POLICIES } from './path-policies.mjs';
import { assertSafePathSegment, resolveContainedPath } from './safe-path.mjs';

export function latestById(items) {
  const map = new Map();
  for (const item of items) {
    if (item && item.id) map.set(item.id, item);
  }
  return [...map.values()];
}

async function withFileLock(lockPath, fn) {
  await ensureDir(path.dirname(lockPath));
  let handle = null;
  const started = Date.now();
  while (!handle) {
    try {
      handle = await fs.open(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() - started > 5000) throw new Error(`Timed out waiting for lock: ${lockPath}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try {
    return await fn();
  } finally {
    await handle.close().catch(() => {});
    await fs.unlink(lockPath).catch(() => {});
  }
}

export async function resolveRecordJsonPath(dirPath, id, policy = PATH_POLICIES.MEMORY_READ) {
  const safeId = assertSafePathSegment(id, 'record id');
  return resolveContainedPath(dirPath, `${safeId}.json`, policy);
}

export async function rewriteJsonl(filePath, items) {
  await ensureDir(path.dirname(filePath));
  const lines = items.map(item => JSON.stringify(item));
  const payload = lines.length ? `${lines.join('\n')}\n` : '';
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, filePath);
}

export async function readLatestIndex(filePath) {
  return latestById(await readJsonl(filePath));
}

export async function listRecords(dirPath) {
  const records = [];
  const files = await listJsonFiles(dirPath);
  for (const file of files) {
    try {
      records.push(await readJsonFile(file));
    } catch {
      // Lint reports bad JSON with file context.
    }
  }
  const markdownDir = markdownMirrorDir(dirPath);
  if (markdownDir) {
    const markdownFiles = await readDirRecursive(markdownDir, { filter: filePath => filePath.endsWith('.md') });
    for (const file of markdownFiles) {
      try {
        const parsed = parseMarkdownPage(await readFile(file, 'utf8'));
        const fm = parsed.frontmatter || {};
        if (!fm.id) continue;
        records.push(markdownPageToRecord(fm, file));
      } catch {
        // markdown parse errors are linted elsewhere
      }
    }
  }
  return latestById(records).sort(compareRecords);
}

export async function listRecordsWithIndexFallback(dirPath, indexFile, filterFn = () => true) {
  const fileRecords = (await listRecords(dirPath)).filter(filterFn);
  const fileIds = new Set(fileRecords.map(record => record.id));
  const indexRecords = (await readLatestIndex(indexFile))
    .filter(filterFn)
    .filter(record => record.id && !fileIds.has(record.id));
  return [...fileRecords, ...indexRecords].sort(compareRecords);
}

export async function upsertIndexRecord(indexFile, record, toIndexRecord = item => item) {
  const lockPath = `${indexFile}.lock`;
  await withFileLock(lockPath, async () => {
    const items = await readLatestIndex(indexFile);
    const next = items.filter(item => item.id !== record.id);
    next.push(toIndexRecord(record));
    next.sort(compareRecords);
    await rewriteJsonl(indexFile, next);
  });
}

export async function findRecordById(dirPath, indexFile, id) {
  assertSafePathSegment(id, 'record id');
  const markdownDir = markdownMirrorDir(dirPath);
  if (markdownDir) {
    const markdownFiles = await readDirRecursive(markdownDir, { filter: filePath => filePath.endsWith('.md') });
    for (const file of markdownFiles) {
      try {
        const parsed = parseMarkdownPage(await readFile(file, 'utf8'));
        const fm = parsed.frontmatter || {};
        if (fm.id === id) return markdownPageToRecord(fm, file);
      } catch {
        // ignore and fall back
      }
    }
  }
  const filePath = await resolveRecordJsonPath(dirPath, id, PATH_POLICIES.MEMORY_READ);
  try {
    return await readJsonFile(filePath);
  } catch {
    const items = await readLatestIndex(indexFile);
    return items.find(item => item.id === id) || null;
  }
}

export async function persistRecord(dirPath, indexFile, record, toIndexRecord = item => item) {
  assertSafePathSegment(record?.id, 'record id');
  if (record?.kind) assertSafePathSegment(record.kind, 'record kind', { allowDot: false });
  const markdownPath = await mirrorRecordToMarkdown(record);
  if (markdownPath) {
    record.paths = {
      ...(record.paths || {}),
      self: path.relative(memoryRoot, markdownPath),
      markdown: path.relative(memoryRoot, markdownPath),
    };
  }
  await upsertIndexRecord(indexFile, record, toIndexRecord);
}

function compareRecords(a, b) {
  const aTime = a?.updatedAt || a?.createdAt || '';
  const bTime = b?.updatedAt || b?.createdAt || '';
  if (aTime !== bTime) return aTime.localeCompare(bTime);
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function markdownMirrorDir(dirPath) {
  const rel = path.relative(path.join(path.dirname(dirPath), '..'), dirPath).replaceAll(path.sep, '/');
  if (rel.endsWith('work/initiatives')) return path.join(path.dirname(dirPath), '..', 'work', 'initiatives');
  if (rel.endsWith('work/sprints')) return path.join(path.dirname(dirPath), '..', 'work', 'sprints');
  if (rel.endsWith('work/phases')) return path.join(path.dirname(dirPath), '..', 'work', 'phases');
  if (rel.endsWith('work/tasks')) return path.join(path.dirname(dirPath), '..', 'work', 'tasks');
  if (rel.endsWith('work/discoveries')) return path.join(path.dirname(dirPath), '..', 'work', 'discoveries');
  if (rel.endsWith('work/issues')) return path.join(path.dirname(dirPath), '..', 'work', 'issues');
  if (rel.endsWith('work/comments')) return path.join(path.dirname(dirPath), '..', 'work', 'comments');
  if (rel.endsWith('work/containers')) return path.join(path.dirname(dirPath), '..', 'work', 'containers');
  return null;
}

function markdownPageToRecord(frontmatter, filePath) {
  const record = {
    id: frontmatter.id,
    kind: frontmatter.kind,
    title: frontmatter.title,
    status: frontmatter.status,
    aliases: frontmatter.aliases || [],
    tags: frontmatter.tags || [],
    sourceRawItemIds: frontmatter.sourceRefs || [],
    createdAt: frontmatter.createdAt || frontmatter.created_at || null,
    updatedAt: frontmatter.updatedAt || frontmatter.updated_at || null,
    paths: { self: path.relative(memoryRoot, filePath) },
  };
  if (frontmatter.description !== undefined) record.description = frontmatter.description;
  if (frontmatter.why !== undefined) record.why = frontmatter.why;
  if (frontmatter.desiredOutcome !== undefined) record.desiredOutcome = frontmatter.desiredOutcome;
  if (frontmatter.goal !== undefined) record.goal = frontmatter.goal;
  if (frontmatter.summary !== undefined) record.summary = frontmatter.summary;
  if (frontmatter.sprintId !== undefined) record.sprintId = frontmatter.sprintId;
  if (frontmatter.phaseId !== undefined) record.phaseId = frontmatter.phaseId;
  if (frontmatter.issueIds !== undefined) record.issueIds = frontmatter.issueIds;
  if (frontmatter.initiativeIds !== undefined) record.initiativeIds = frontmatter.initiativeIds;
  if (frontmatter.containerIds !== undefined) record.containerIds = frontmatter.containerIds;
  if (frontmatter.sourceDiscoveryIds !== undefined) record.sourceDiscoveryIds = frontmatter.sourceDiscoveryIds;
  if (frontmatter.sourceCommentIds !== undefined) record.sourceCommentIds = frontmatter.sourceCommentIds;
  if (frontmatter.acceptanceCriteria !== undefined) record.acceptanceCriteria = frontmatter.acceptanceCriteria;
  if (frontmatter.verificationPlan !== undefined) record.verificationPlan = frontmatter.verificationPlan;
  if (frontmatter.verificationEvidence !== undefined) record.verificationEvidence = frontmatter.verificationEvidence;
  if (frontmatter.issueType !== undefined) record.issueType = frontmatter.issueType;
  if (frontmatter.severity !== undefined) record.severity = frontmatter.severity;
  if (frontmatter.confidence !== undefined) record.confidence = frontmatter.confidence;
  if (frontmatter.risk !== undefined) record.risk = frontmatter.risk;
  if (frontmatter.dependencies !== undefined) record.dependencies = frontmatter.dependencies;
  return record;
}
