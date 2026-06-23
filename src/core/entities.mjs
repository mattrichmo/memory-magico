import path from 'path';
import { memoryRoot, repoRoot } from './paths.mjs';
import { exists } from './fs.mjs';
import { findRecordById, readLatestIndex } from './records.mjs';
import { resolveRepoPath } from './safe-path.mjs';

const rawIndexFile = path.join(memoryRoot, 'inbox', 'raw-items.jsonl');

const ENTITY_CONFIGS = {
  container: {
    kind: 'container',
    dir: path.join(memoryRoot, 'work', 'containers'),
    index: path.join(memoryRoot, 'work', 'containers', 'index.jsonl'),
  },
  comment: {
    kind: 'comment',
    dir: path.join(memoryRoot, 'work', 'comments'),
    index: path.join(memoryRoot, 'work', 'comments', 'index.jsonl'),
  },
  discovery: {
    kind: 'discovery',
    dir: path.join(memoryRoot, 'work', 'discoveries'),
    index: path.join(memoryRoot, 'work', 'discoveries', 'index.jsonl'),
  },
  issue: {
    kind: 'issue',
    dir: path.join(memoryRoot, 'work', 'issues'),
    index: path.join(memoryRoot, 'work', 'issues', 'index.jsonl'),
  },
  initiative: {
    kind: 'initiative',
    dir: path.join(memoryRoot, 'work', 'initiatives'),
    index: path.join(memoryRoot, 'work', 'initiatives', 'index.jsonl'),
  },
  sprint: {
    kind: 'sprint',
    dir: path.join(memoryRoot, 'work', 'sprints'),
    index: path.join(memoryRoot, 'work', 'sprints', 'index.jsonl'),
  },
  phase: {
    kind: 'phase',
    dir: path.join(memoryRoot, 'work', 'phases'),
    index: path.join(memoryRoot, 'work', 'phases', 'index.jsonl'),
  },
  task: {
    kind: 'task',
    dir: path.join(memoryRoot, 'work', 'tasks'),
    index: path.join(memoryRoot, 'work', 'tasks', 'index.jsonl'),
  },
  raw_item: {
    kind: 'raw_item',
    index: rawIndexFile,
  },
};

function kindCandidatesFromId(id) {
  if (!id) return [];
  if (id.startsWith('container_')) return ['container'];
  if (id.startsWith('comment_')) return ['comment'];
  if (id.startsWith('discovery_') || id.startsWith('disc_')) return ['discovery'];
  if (id.startsWith('issue_') || id.startsWith('build_')) return ['issue'];
  if (id.startsWith('init_')) return ['initiative'];
  if (id.startsWith('sprint_')) return ['sprint'];
  if (id.startsWith('phase_')) return ['phase'];
  if (id.startsWith('task_')) return ['task'];
  if (id.startsWith('raw_')) return ['raw_item'];
  return [];
}

function asRepoPath(maybeRelativePath) {
  if (!maybeRelativePath) return null;
  return resolveRepoPath(repoRoot, maybeRelativePath, 'repo-read').catch(() => null);
}

export function inferKindFromId(id) {
  return kindCandidatesFromId(id)[0] || null;
}

export function getEntityConfig(kind) {
  return ENTITY_CONFIGS[kind] || null;
}

export function entitySelfPath(record) {
  return record?.paths?.self || record?.path || null;
}

export function entityIndexRecord(record) {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    status: record.status,
    sprintId: record.sprintId,
    phaseId: record.phaseId,
    initiativeIds: record.initiativeIds,
    path: entitySelfPath(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    archivedAt: record.archivedAt,
  };
}

export async function findEntityRecord(id, explicitKind = null) {
  const candidateKinds = explicitKind ? [explicitKind] : kindCandidatesFromId(id);
  for (const kind of candidateKinds) {
    const config = getEntityConfig(kind);
    if (!config) continue;
    if (kind === 'raw_item') {
      const items = await readLatestIndex(config.index);
      const item = items.find(entry => entry.id === id);
      if (item) return item;
      continue;
    }
    const record = await findRecordById(config.dir, config.index, id);
    if (record) return record;
  }
  return null;
}

export async function resolveNodeRef(id, options = {}) {
  const explicitKind = options.kind || null;
  const record = await findEntityRecord(id, explicitKind);
  if (record) {
    return {
      id: record.id,
      kind: record.kind || explicitKind || inferKindFromId(id) || 'source',
      ...(entitySelfPath(record) ? { path: entitySelfPath(record) } : {}),
    };
  }

  const inferredKind = explicitKind || inferKindFromId(id) || 'source';
  return {
    id,
    kind: inferredKind,
    ...(options.path ? { path: options.path } : {}),
    ...(options.url ? { url: options.url } : {}),
  };
}

export async function entityRefExists(nodeRef) {
  if (!nodeRef || !nodeRef.kind) return false;

  if (nodeRef.kind === 'file' || nodeRef.kind === 'wiki_page') {
    if (!nodeRef.path) return false;
    const resolved = await asRepoPath(nodeRef.path);
    return resolved ? exists(resolved) : false;
  }

  if (['github_issue', 'github_pr', 'commit', 'concept', 'decision', 'relationship', 'source'].includes(nodeRef.kind)) {
    return true;
  }

  if (nodeRef.kind === 'raw_item') {
    if (nodeRef.id) {
      return Boolean(await findEntityRecord(nodeRef.id, 'raw_item'));
    }
    if (!nodeRef.path) return false;
    const resolved = await asRepoPath(nodeRef.path);
    return resolved ? exists(resolved) : false;
  }

  if (nodeRef.id) {
    const record = await findEntityRecord(nodeRef.id, nodeRef.kind);
    if (record) return true;
  }

  if (nodeRef.path) {
    const resolved = await asRepoPath(nodeRef.path);
    return resolved ? exists(resolved) : false;
  }

  return false;
}
