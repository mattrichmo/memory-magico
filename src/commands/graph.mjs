import fs from 'fs/promises';
import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { appendJsonl, readJsonl } from '../core/json.mjs';
import { parseArgs } from '../core/cli.mjs';
import { resolveNodeRef } from '../core/entities.mjs';
import { listRecords } from '../core/records.mjs';
import { readDirRecursive, readFile, mkdirp } from '../core/fs.mjs';
import { parseMarkdownPage } from '../core/frontmatter.mjs';

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

  if (sub === 'rebuild') {
    const edges = [];
    const push = (from, type, to, summary) => {
      if (!from || !to) return;
      edges.push({
        id: makeId('rel'),
        kind: 'relationship',
        from,
        to,
        type,
        strength: 'medium',
        ...(summary ? { summary } : {}),
        createdAt: new Date().toISOString(),
        createdBy: 'mm',
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
    await mkdirp(path.dirname(graphFile));
    await fs.writeFile(graphFile, edges.map(edge => JSON.stringify(edge)).join('\n') + (edges.length ? '\n' : ''), 'utf8');
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
    const relationship = {
      id: opts.id || makeId('rel'),
      kind: 'relationship',
      from: fromRef,
      to: toRef,
      type: normalizeType(relationshipType, fromRef, toRef),
      strength: opts.strength || 'medium',
      ...(opts.summary ? { summary: opts.summary } : {}),
      evidence: parseEvidence(opts.evidence),
      createdAt: new Date().toISOString(),
      createdBy: opts['created-by'] || 'mm',
    };
    await appendJsonl(graphFile, relationship);
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
      console.log(JSON.stringify(edges, null, 2));
      return;
    }
    const filtered = edges.filter(edge => edge.id === id || edge.from?.id === id || edge.to?.id === id);
    if (!filtered.length) {
      console.log('Relationship not found:', id);
      return;
    }
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  console.log('Unknown graph subcommand:', sub);
}
