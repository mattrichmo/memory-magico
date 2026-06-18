import fs from 'node:fs/promises';
import path from 'node:path';
import { memoryRoot } from '../core/paths.mjs';
import { readMarkdownPage } from '../core/frontmatter.mjs';
import { readDirRecursive } from '../core/fs.mjs';
import { listJsonFiles, readJsonFile, writeJsonFile } from '../core/json.mjs';
import { listRecords, persistRecord, rewriteJsonl } from '../core/records.mjs';
import { rebuildIndex } from '../core/retrieval.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { rebuildGraphRelationships } from './graph.mjs';

const workScopes = [
  { kind: 'initiative', dir: path.join(memoryRoot, 'work', 'initiatives'), index: path.join(memoryRoot, 'work', 'initiatives', 'index.jsonl') },
  { kind: 'sprint', dir: path.join(memoryRoot, 'work', 'sprints'), index: path.join(memoryRoot, 'work', 'sprints', 'index.jsonl') },
  { kind: 'phase', dir: path.join(memoryRoot, 'work', 'phases'), index: path.join(memoryRoot, 'work', 'phases', 'index.jsonl') },
  { kind: 'task', dir: path.join(memoryRoot, 'work', 'tasks'), index: path.join(memoryRoot, 'work', 'tasks', 'index.jsonl') },
  { kind: 'issue', dir: path.join(memoryRoot, 'work', 'issues'), index: path.join(memoryRoot, 'work', 'issues', 'index.jsonl') },
  { kind: 'discovery', dir: path.join(memoryRoot, 'work', 'discoveries'), index: path.join(memoryRoot, 'work', 'discoveries', 'index.jsonl') },
  { kind: 'comment', dir: path.join(memoryRoot, 'work', 'comments'), index: path.join(memoryRoot, 'work', 'comments', 'index.jsonl') },
];

const containerScope = {
  kind: 'container',
  dir: path.join(memoryRoot, 'work', 'containers'),
  index: path.join(memoryRoot, 'work', 'containers', 'index.jsonl'),
};

function canonicalScore(entry) {
  const basename = path.basename(entry.file, path.extname(entry.file));
  let score = 0;
  if (basename === entry.id) score += 1000;
  if (entry.format === 'md') score += 100;
  if (entry.kind === 'container') score += 50;
  if (entry.updatedAt) score += Math.min(999, Math.floor(Date.parse(entry.updatedAt) / 1000000000) || 0);
  return score;
}

function chooseCanonical(entries) {
  return [...entries].sort((a, b) => canonicalScore(b) - canonicalScore(a) || a.file.localeCompare(b.file))[0] || null;
}

async function collectEntries() {
  const entries = [];
  for (const scope of workScopes) {
    const files = await readDirRecursive(scope.dir, { filter: filePath => filePath.endsWith('.md') });
    for (const file of files) {
      try {
        const page = await readMarkdownPage(file);
        const fm = page.frontmatter || {};
        if (!fm.id) continue;
        entries.push({
          id: fm.id,
          kind: fm.kind || scope.kind,
          file,
          format: 'md',
          updatedAt: fm.updatedAt || fm.updated_at || null,
        });
      } catch {
        // ignored for repair discovery
      }
    }
  }
  const markdownWikiFiles = await readDirRecursive(path.join(memoryRoot, 'wiki'), { filter: filePath => filePath.endsWith('.md') });
  for (const file of markdownWikiFiles) {
    try {
      const page = await readMarkdownPage(file);
      const fm = page.frontmatter || {};
      if (!fm.id) continue;
      entries.push({
        id: fm.id,
        kind: fm.kind || 'wiki_page',
        file,
        format: 'md',
        updatedAt: fm.updatedAt || fm.updated_at || null,
      });
    } catch {
      // ignored
    }
  }
  const jsonFiles = await listJsonFiles(containerScope.dir);
  for (const file of jsonFiles) {
    try {
      const record = await readJsonFile(file);
      if (!record?.id) continue;
      entries.push({
        id: record.id,
        kind: record.kind || 'container',
        file,
        format: 'json',
        updatedAt: record.updatedAt || null,
      });
    } catch {
      // ignored
    }
  }
  return entries;
}

async function rewriteContainerIndex() {
  const files = await listJsonFiles(containerScope.dir);
  const records = [];
  for (const file of files) {
    try {
      const record = await readJsonFile(file);
      if (!record?.id) continue;
      record.paths = {
        ...(record.paths || {}),
        self: path.relative(memoryRoot, file).split(path.sep).join('/'),
      };
      await writeJsonFile(file, record);
      records.push({
        id: record.id,
        kind: 'container',
        title: record.title,
        status: record.status,
        domain: record.domain,
        path: record.paths.self,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    } catch {
      // ignore malformed container record during repair
    }
  }
  await rewriteJsonl(containerScope.index, records);
  return records.length;
}

async function repairPaths() {
  const results = { work: 0, containers: 0 };
  for (const scope of workScopes) {
    const records = await listRecords(scope.dir);
    for (const record of records) {
      await persistRecord(scope.dir, scope.index, record);
      results.work += 1;
    }
  }
  results.containers = await rewriteContainerIndex();
  results.indexes = await repairIndexes();
  return results;
}

async function repairIndexes() {
  const [search, graph] = await Promise.all([
    rebuildIndex(),
    rebuildGraphRelationships(),
  ]);
  const containers = await rewriteContainerIndex();
  return {
    search: {
      builtAt: search.builtAt,
      pageCount: search.pageCount,
      chunkCount: search.chunkCount,
    },
    graph: graph.length,
    containers,
  };
}

async function repairDuplicateIds({ dryRun = false } = {}) {
  const entries = await collectEntries();
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.id)) groups.set(entry.id, []);
    groups.get(entry.id).push(entry);
  }

  const duplicates = [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([id, items]) => ({ id, items: items.sort((a, b) => canonicalScore(b) - canonicalScore(a) || a.file.localeCompare(b.file)) }));

  const removed = [];
  for (const group of duplicates) {
    const [canonical, ...extras] = group.items;
    for (const entry of extras) {
      if (dryRun) {
        removed.push({ ...entry, dryRun: true, keptBy: canonical.file });
        continue;
      }
      await fs.rm(entry.file, { force: true });
      removed.push({ ...entry, keptBy: canonical.file });
    }
  }

  if (!dryRun) {
    await repairPaths();
  }

  return {
    dryRun,
    duplicates: duplicates.map(group => ({
      id: group.id,
      canonical: group.items[0]?.file || null,
      extras: group.items.slice(1).map(item => item.file),
    })),
    removed,
  };
}

export { collectEntries, repairDuplicateIds, repairIndexes, repairPaths };

export async function run(argv = []) {
  const sub = argv[1] || 'paths';
  const json = argv.includes('--json');
  const dryRun = argv.includes('--dry-run');

  if (sub === 'duplicate-ids') {
    const result = await repairDuplicateIds({ dryRun });
    if (json) {
      writeJsonOutput({ ok: true, ...result });
      return;
    }
    console.log(`${dryRun ? 'Would repair' : 'Repaired'} ${result.duplicates.length} duplicate id group(s).`);
    result.duplicates.forEach(group => {
      console.log(`${group.id}: ${group.canonical}`);
      group.extras.forEach(extra => console.log(`  - ${extra}`));
    });
    return;
  }

  if (sub === 'paths') {
    const result = await repairPaths();
    if (json) {
      writeJsonOutput({ ok: true, result });
      return;
    }
    console.log(`Repaired work paths: ${result.work}`);
    console.log(`Repaired container paths: ${result.containers}`);
    return;
  }

  if (sub === 'indexes') {
    const result = await repairIndexes();
    if (json) {
      writeJsonOutput({ ok: true, result });
      return;
    }
    console.log(`Rebuilt search index: ${result.search.pageCount} pages, ${result.search.chunkCount} chunks.`);
    console.log('Rebuilt graph relationships.');
    console.log(`Repaired container indexes: ${result.containers}`);
    return;
  }

  console.log('Usage: mm repair <duplicate-ids|paths|indexes>');
}
