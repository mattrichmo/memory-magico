import path from 'node:path';
import { memoryRoot, schemasRoot } from './paths.mjs';
import { readJsonl, readJsonFile } from './json.mjs';
import { listRecords } from './records.mjs';
import { scanMarkdownPages } from './pages.mjs';
import { entityRefExists } from './entities.mjs';
import { validateAgainstSchema } from './validation.mjs';

const relationshipFile = path.join(memoryRoot, 'issues', 'relationships.jsonl');

async function loadRelationshipSchema() {
  return readJsonFile(path.join(schemasRoot, 'relationship.schema.json'));
}

function compareEdges(a, b) {
  const aKey = `${a.from?.kind || ''}/${a.from?.id || ''}/${a.type || ''}/${a.to?.kind || ''}/${a.to?.id || ''}`;
  const bKey = `${b.from?.kind || ''}/${b.from?.id || ''}/${b.type || ''}/${b.to?.kind || ''}/${b.to?.id || ''}`;
  return aKey.localeCompare(bKey) || String(a.id || '').localeCompare(String(b.id || ''));
}

export async function readRelationships() {
  return readJsonl(relationshipFile);
}

export async function validateGraph() {
  const schema = await loadRelationshipSchema();
  const edges = await readRelationships();
  const findings = [];
  const seen = new Set();

  edges.forEach((edge, index) => {
    const prefix = `memory/issues/relationships.jsonl:${index + 1}`;
    for (const message of validateAgainstSchema(schema, edge)) {
      findings.push({ level: 'error', code: 'INVALID_RELATIONSHIP', message: `${prefix}: ${message}` });
    }
    const key = JSON.stringify([edge.from, edge.to, edge.type]);
    if (seen.has(key)) {
      findings.push({ level: 'error', code: 'DUPLICATE_RELATIONSHIP', message: `${prefix}: duplicate relationship edge` });
    }
    seen.add(key);
  });

  for (const [index, edge] of edges.entries()) {
    const prefix = `memory/issues/relationships.jsonl:${index + 1}`;
    if (edge.from?.id && edge.to?.id && edge.from.id === edge.to.id) {
      findings.push({ level: 'error', code: 'SELF_RELATIONSHIP', message: `${prefix}: self relationships are not allowed for ${edge.type}` });
    }
    if (!(await entityRefExists(edge.from))) {
      findings.push({ level: 'error', code: 'MISSING_RELATIONSHIP_SOURCE', message: `${prefix}: missing source ${edge.from?.kind || 'unknown'} ${edge.from?.id || edge.from?.path || 'unknown'}` });
    }
    if (!(await entityRefExists(edge.to))) {
      findings.push({ level: 'error', code: 'MISSING_RELATIONSHIP_TARGET', message: `${prefix}: missing target ${edge.to?.kind || 'unknown'} ${edge.to?.id || edge.to?.path || 'unknown'}` });
    }
  }

  const cycles = findDependencyCycles(edges);
  cycles.forEach((cycle, index) => {
    findings.push({
      level: 'error',
      code: 'DEPENDENCY_CYCLE',
      message: `dependency cycle ${index + 1}: ${cycle.join(' -> ')}`,
    });
  });

  return {
    ok: findings.filter(finding => finding.level === 'error').length === 0,
    edges,
    findings,
  };
}

function findDependencyCycles(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (edge.type !== 'depends_on' || !edge.from?.id || !edge.to?.id) continue;
    if (!adjacency.has(edge.from.id)) adjacency.set(edge.from.id, new Set());
    adjacency.get(edge.from.id).add(edge.to.id);
  }

  const visited = new Set();
  const active = new Set();
  const parent = new Map();
  const cycles = [];
  const seen = new Set();

  function recordCycle(start, end) {
    const path = [end];
    let current = start;
    while (current && current !== end) {
      path.push(current);
      current = parent.get(current);
    }
    path.push(end);
    path.reverse();
    const key = path.join('>');
    if (!seen.has(key)) {
      seen.add(key);
      cycles.push(path);
    }
  }

  function visit(node) {
    visited.add(node);
    active.add(node);
    for (const next of adjacency.get(node) || []) {
      if (!visited.has(next)) {
        parent.set(next, node);
        visit(next);
      } else if (active.has(next)) {
        recordCycle(node, next);
      }
    }
    active.delete(node);
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) visit(node);
  }

  return cycles;
}

async function loadWikiNodes() {
  const pages = await scanMarkdownPages([path.join(memoryRoot, 'wiki')]);
  return pages.map(page => ({
    id: page.id,
    kind: page.kind || 'wiki_page',
    title: page.title,
    path: page.path,
    updatedAt: page.updatedAt,
  }));
}

async function loadWorkNodes() {
  const records = [
    ...(await listRecords(path.join(memoryRoot, 'work', 'initiatives'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'sprints'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'phases'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'tasks'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'issues'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'discoveries'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'comments'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'containers'))),
  ];
  return records
    .filter(record => record?.id)
    .map(record => ({
      id: record.id,
      kind: record.kind || 'unknown',
      title: record.title || record.id,
      path: record.paths?.self || '',
      updatedAt: record.updatedAt || record.createdAt || null,
    }));
}

export async function loadGraphNodes() {
  return [...await loadWorkNodes(), ...await loadWikiNodes()];
}

export async function graphNeighborhood(id) {
  const edges = await readRelationships();
  const nodes = await loadGraphNodes();
  const node = nodes.find(entry => entry.id === id) || null;
  const outgoing = edges.filter(edge => edge.from?.id === id).sort(compareEdges);
  const incoming = edges.filter(edge => edge.to?.id === id).sort(compareEdges);
  const relatedIds = new Set([
    ...outgoing.map(edge => edge.to?.id).filter(Boolean),
    ...incoming.map(edge => edge.from?.id).filter(Boolean),
  ]);
  const relatedNodes = nodes.filter(entry => relatedIds.has(entry.id));
  return { node, outgoing, incoming, relatedNodes };
}

export async function graphBacklinks(id) {
  const { incoming } = await graphNeighborhood(id);
  return incoming;
}

export async function graphLinks(id) {
  const { outgoing } = await graphNeighborhood(id);
  return outgoing;
}

export async function graphOrphans() {
  const edges = await readRelationships();
  const nodes = await loadGraphNodes();
  const connected = new Set();
  for (const edge of edges) {
    if (edge.from?.id) connected.add(edge.from.id);
    if (edge.to?.id) connected.add(edge.to.id);
  }
  return nodes.filter(node => !connected.has(node.id));
}

export async function graphContradictions() {
  const edges = await readRelationships();
  return edges.filter(edge => ['contradicts', 'duplicates'].includes(edge.type));
}

export async function graphSummaries() {
  const [validation, nodes] = await Promise.all([validateGraph(), loadGraphNodes()]);
  return {
    validation,
    nodes,
    orphanCount: (await graphOrphans()).length,
    contradictionCount: (await graphContradictions()).length,
  };
}
