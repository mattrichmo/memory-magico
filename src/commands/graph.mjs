import path from 'path';
import crypto from 'crypto';
import { memoryRoot } from '../core/paths.mjs';
import { readJsonl } from '../core/json.mjs';
import { parseArgs } from '../core/cli.mjs';
import { resolveNodeRef } from '../core/entities.mjs';
import { listRecords, rewriteJsonl } from '../core/records.mjs';
import { readDirRecursive, readFile, mkdirp } from '../core/fs.mjs';
import { parseMarkdownPage } from '../core/frontmatter.mjs';
import { ENUMS, assertEnum } from '../core/guards.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { validateGraph, graphNeighborhood, graphOrphans, graphContradictions, graphLinks, graphBacklinks } from '../core/graph-queries.mjs';

const graphFile = path.join(memoryRoot, 'issues', 'relationships.jsonl');

const TYPE_ALIASES = {
  source: 'derived_from',
  related: 'related_to',
  blocks: 'blocks',
  resolves: 'implemented_by',
  documents: 'documents',
};

function normalizeType(type, fromRef, toRef) {
  if (type === 'source' && fromRef.kind === 'issue' && toRef.kind === 'discovery') {
    return 'promoted_from';
  }
  return TYPE_ALIASES[type] || type;
}

function relationKey(fromRef, type, toRef) {
  return [
    fromRef?.kind || 'unknown',
    fromRef?.id || '',
    type,
    toRef?.kind || 'unknown',
    toRef?.id || '',
  ].join('|');
}

function relationId(key) {
  return `rel_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)}`;
}

function compareEdges(a, b) {
  const aKey = relationKey(a.from, a.type, a.to);
  const bKey = relationKey(b.from, b.type, b.to);
  if (aKey !== bKey) return aKey.localeCompare(bKey);
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export async function rebuildGraphRelationships() {
  const existing = await readJsonl(graphFile);
  const existingByKey = new Map();
  for (const edge of existing) {
    const normalizedType = normalizeType(edge.type, edge.from, edge.to);
    if (!ENUMS.relationshipType.includes(normalizedType)) continue;
    const key = relationKey(edge.from, normalizedType, edge.to);
    existingByKey.set(key, {
      ...edge,
      type: normalizedType,
      id: relationId(key),
    });
  }
  const edgesByKey = new Map();
  const push = (from, type, to, summary) => {
    if (!from || !to) return;
    if (from.id && to.id && from.id === to.id) return;
    const normalizedType = normalizeType(type, from, to);
    assertEnum(normalizedType, ENUMS.relationshipType, 'relationship type');
    const key = relationKey(from, normalizedType, to);
    const previous = existingByKey.get(key);
    edgesByKey.set(key, {
      ...(previous || {}),
      id: relationId(key),
      kind: 'relationship',
      from,
      to,
      type: normalizedType,
      strength: previous?.strength || 'medium',
      ...(summary ? { summary } : previous?.summary ? { summary: previous.summary } : {}),
      evidence: Array.isArray(previous?.evidence) ? previous.evidence : [],
      createdAt: previous?.createdAt || new Date().toISOString(),
      createdBy: previous?.createdBy || 'mm',
    });
  };
  const records = [
    ...(await listRecords(path.join(memoryRoot, 'work', 'initiatives'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'sprints'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'phases'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'tasks'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'issues'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'discoveries'))),
    ...(await listRecords(path.join(memoryRoot, 'work', 'comments'))),
  ];
  for (const record of records) {
    const from = { id: record.id, kind: record.kind || 'note', path: record.paths?.self };
    if (record.kind === 'sprint') {
      for (const initId of record.initiativeIds || []) push(from, 'belongs_to', { id: initId, kind: 'initiative' }, 'sprint belongs to initiative');
    }
    if (record.kind === 'phase') {
      push(from, 'belongs_to', { id: record.sprintId, kind: 'sprint' }, 'phase belongs to sprint');
    }
    if (record.kind === 'task') {
      push(from, 'belongs_to', { id: record.sprintId, kind: 'sprint' }, 'task belongs to sprint');
      if (record.phaseId) push(from, 'belongs_to', { id: record.phaseId, kind: 'phase' }, 'task belongs to phase');
      for (const issueId of record.issueIds || []) push(from, 'related_to', { id: issueId, kind: 'issue' }, 'task relates to issue');
    }
    if (record.kind === 'issue') {
      for (const initId of record.initiativeIds || []) push(from, 'belongs_to', { id: initId, kind: 'initiative' }, 'issue belongs to initiative');
    }
    if (record.kind === 'comment' && record.target) {
      push(from, 'related_to', record.target, 'comment target');
    }
    if (record.kind === 'discovery' && record.promotedIssueId) {
      push(from, 'derived_from', { id: record.promotedIssueId, kind: 'issue' }, 'discovery promoted to issue');
    }
  }
  const wikiFiles = await readDirRecursive(path.join(memoryRoot, 'wiki'), { filter: filePath => filePath.endsWith('.md') });
  for (const file of wikiFiles) {
    const text = await readFile(file, 'utf8');
    const parsed = parseMarkdownPage(text);
    const fm = parsed.frontmatter || {};
    const from = { id: fm.id || path.basename(file, '.md'), kind: fm.kind || 'note', path: path.relative(memoryRoot, file) };
    const links = [...String(text).matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map(match => match[1].trim());
    for (const link of links) push(from, 'related_to', { id: link, kind: 'wiki_page' }, 'wiki link');
  }
  for (const edge of existing) {
    const normalizedType = normalizeType(edge.type, edge.from, edge.to);
    if (!ENUMS.relationshipType.includes(normalizedType)) continue;
    const key = relationKey(edge.from, normalizedType, edge.to);
    if (!edgesByKey.has(key)) {
      edgesByKey.set(key, {
        ...edge,
        type: normalizedType,
        id: relationId(key),
      });
    }
  }
  const edges = [...edgesByKey.values()].sort(compareEdges);
  await mkdirp(path.dirname(graphFile));
  await rewriteJsonl(graphFile, edges);
  return edges;
}

function parseEvidence(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      const [type, ref, ...noteParts] = token.split(':');
      return {
        type,
        ref,
        ...(noteParts.length ? { note: noteParts.join(':') } : {}),
      };
    });
}

export async function run(argv) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'rebuild') {
    const edges = await rebuildGraphRelationships();
    if (json) {
      writeJsonOutput({ ok: true, relationships: edges.length, graphFile: path.relative(memoryRoot, graphFile) });
      return;
    }
    console.log(`Rebuilt graph: ${edges.length} relationships`);
    return;
  }

  if (sub === 'add') {
    const fromId = argv[2];
    const relationshipType = argv[3];
    const toId = argv[4];
    const opts = parseArgs(argv, 5);
    if (!fromId || !relationshipType || !toId) {
      console.log('Usage: mm graph add <from-id> <type> <to-id> [--summary "..."] [--strength weak|medium|strong]');
      return;
    }
    const fromRef = await resolveNodeRef(fromId, { kind: opts['from-kind'], path: opts['from-path'], url: opts['from-url'] });
    const toRef = await resolveNodeRef(toId, { kind: opts['to-kind'], path: opts['to-path'], url: opts['to-url'] });
    if (fromRef.id && toRef.id && fromRef.id === toRef.id) {
      console.log('Self relationships are not allowed.');
      process.exitCode = 2;
      return;
    }
    const normalizedType = normalizeType(relationshipType, fromRef, toRef);
    assertEnum(normalizedType, ENUMS.relationshipType, 'relationship type');
    const key = relationKey(fromRef, normalizedType, toRef);
    const relationship = {
      id: relationId(key),
      kind: 'relationship',
      from: fromRef,
      to: toRef,
      type: normalizedType,
      strength: opts.strength || 'medium',
      ...(opts.summary ? { summary: opts.summary } : {}),
      evidence: parseEvidence(opts.evidence),
      createdAt: new Date().toISOString(),
      createdBy: opts['created-by'] || 'mm',
    };
    const edges = await readJsonl(graphFile);
    const next = edges.filter(edge => relationKey(edge.from, edge.type, edge.to) !== key);
    next.push(relationship);
    next.sort(compareEdges);
    await rewriteJsonl(graphFile, next);
    if (json) {
      writeJsonOutput({ ok: true, relationship });
      return;
    }
    console.log('Added relationship:', relationship.id);
    return;
  }

  if (sub === 'list') {
    const opts = parseArgs(argv, 2);
    const edges = await readJsonl(graphFile);
    const filtered = edges.filter(edge => {
      if (opts.type && edge.type !== opts.type) return false;
      if (opts.id && edge.id !== opts.id) return false;
      if (opts.node && edge.from?.id !== opts.node && edge.to?.id !== opts.node) return false;
      return true;
    });
    if (json) {
      writeJsonOutput({ ok: true, edges: filtered });
      return;
    }
    if (!filtered.length) {
      console.log('No graph relationships found.');
      return;
    }
    filtered.forEach(edge => console.log(`${edge.id} ${edge.from?.id} -[${edge.type}]-> ${edge.to?.id}`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    const edges = await readJsonl(graphFile);
    if (!id) {
      if (json) {
        writeJsonOutput({ ok: true, edges });
        return;
      }
      console.log(JSON.stringify(edges, null, 2));
      return;
    }
    const filtered = edges.filter(edge => edge.id === id || edge.from?.id === id || edge.to?.id === id);
    if (!filtered.length) {
      console.log('Relationship not found:', id);
      return;
    }
    if (json) {
      writeJsonOutput({ ok: true, edges: filtered });
      return;
    }
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  if (sub === 'validate') {
    const validation = await validateGraph();
    if (json) {
      writeJsonOutput(validation);
      return;
    }
    console.log(validation.ok ? 'Graph valid.' : 'Graph has issues.');
    validation.findings.forEach(finding => console.log(`${finding.level.toUpperCase()} ${finding.message}`));
    return;
  }

  if (sub === 'neighborhood') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm graph neighborhood <id>');
      return;
    }
    const neighborhood = await graphNeighborhood(id);
    if (json) {
      writeJsonOutput({ ok: true, ...neighborhood });
      return;
    }
    console.log(`Node: ${id}`);
    neighborhood.outgoing.forEach(edge => console.log(`OUT ${edge.id} ${edge.from?.id} -[${edge.type}]-> ${edge.to?.id}`));
    neighborhood.incoming.forEach(edge => console.log(`IN  ${edge.id} ${edge.from?.id} -[${edge.type}]-> ${edge.to?.id}`));
    return;
  }

  if (sub === 'orphans') {
    const orphans = await graphOrphans();
    if (json) {
      writeJsonOutput({ ok: true, nodes: orphans });
      return;
    }
    if (!orphans.length) {
      console.log('No orphan nodes found.');
      return;
    }
    orphans.forEach(node => console.log(`${node.id} [${node.kind}] ${node.title}`));
    return;
  }

  if (sub === 'contradictions') {
    const contradictions = await graphContradictions();
    if (json) {
      writeJsonOutput({ ok: true, edges: contradictions });
      return;
    }
    if (!contradictions.length) {
      console.log('No contradictions found.');
      return;
    }
    contradictions.forEach(edge => console.log(`${edge.id} ${edge.from?.id} -[${edge.type}]-> ${edge.to?.id}`));
    return;
  }

  if (sub === 'links') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm graph links <id>');
      return;
    }
    const edges = await graphLinks(id);
    if (json) {
      writeJsonOutput({ ok: true, edges });
      return;
    }
    edges.forEach(edge => console.log(`${edge.id} ${edge.from?.id} -[${edge.type}]-> ${edge.to?.id}`));
    return;
  }

  if (sub === 'backlinks') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm graph backlinks <id>');
      return;
    }
    const edges = await graphBacklinks(id);
    if (json) {
      writeJsonOutput({ ok: true, edges });
      return;
    }
    edges.forEach(edge => console.log(`${edge.id} ${edge.from?.id} -[${edge.type}]-> ${edge.to?.id}`));
    return;
  }

  console.log('Unknown graph subcommand:', sub);
}
