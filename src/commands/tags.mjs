import path from 'node:path';
import { memoryRoot } from '../core/paths.mjs';
import { readJsonl, readJsonFile, writeJsonFile, listJsonFiles, appendJsonl } from '../core/json.mjs';
import { scanMarkdownPages } from '../core/pages.mjs';
import { readMarkdownPage, updateMarkdownFrontmatter } from '../core/frontmatter.mjs';
import { listRecords } from '../core/records.mjs';
import { rebuildIndex } from '../core/retrieval.mjs';
import { withLock } from '../core/lock.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

const wikiRoot = path.join(memoryRoot, 'wiki');
const workRoot = path.join(memoryRoot, 'work');
const containerRoot = path.join(memoryRoot, 'work', 'containers');
const rawFile = path.join(memoryRoot, 'inbox', 'raw-items.jsonl');

function normalizeTag(tag) {
  const value = String(tag || '').trim();
  return value || null;
}

function uniqueTags(tags) {
  const seen = new Set();
  const result = [];
  for (const tag of tags || []) {
    const value = normalizeTag(tag);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function replaceTag(tags, fromTag, toTag) {
  return uniqueTags((tags || []).map(tag => (tag === fromTag ? toTag : tag)));
}

function pageEntry(page, source) {
  return {
    kind: page.kind || source,
    id: page.id,
    title: page.title || page.id,
    path: page.path || null,
    tags: uniqueTags(page.tags || page.frontmatter?.tags || []),
    source,
  };
}

function tagKey(value) {
  return normalizeTag(value)?.toLowerCase() || '';
}

async function collectEntries() {
  const entries = [];

  const pages = await scanMarkdownPages([wikiRoot, workRoot]);
  for (const page of pages) {
    for (const tag of uniqueTags(page.tags || page.frontmatter?.tags || [])) {
      entries.push({ tag, ...pageEntry(page, page.kind === 'note' || page.path.startsWith('wiki/') ? 'wiki' : 'work') });
    }
  }

  const containers = await listRecords(containerRoot);
  for (const container of containers) {
    for (const tag of uniqueTags(container.tags || [])) {
      entries.push({
        tag,
        kind: 'container',
        id: container.id,
        title: container.title || container.id,
        path: container.paths?.self || null,
        tags: uniqueTags(container.tags || []),
        source: 'container',
      });
    }
  }

  const rawItems = await readJsonl(rawFile);
  const latestRawById = new Map();
  for (const item of rawItems) {
    if (item?.id) latestRawById.set(item.id, item);
  }
  for (const item of latestRawById.values()) {
    for (const tag of uniqueTags(item.tags || [])) {
      entries.push({
        tag,
        kind: 'raw_item',
        id: item.id,
        title: item.title || item.summary || item.id,
        path: item.path || null,
        tags: uniqueTags(item.tags || []),
        source: 'raw',
      });
    }
  }

  return entries;
}

async function collectTagIndex() {
  const entries = await collectEntries();
  const map = new Map();
  for (const entry of entries) {
    const key = tagKey(entry.tag);
    if (!key) continue;
    const existing = map.get(key) || {
      tag: normalizeTag(entry.tag),
      count: 0,
      kinds: new Set(),
      items: [],
    };
    existing.count += 1;
    existing.kinds.add(entry.kind);
    existing.items.push(entry);
    map.set(key, existing);
  }
  return [...map.values()]
    .map(item => ({
      tag: item.tag,
      count: item.count,
      kinds: [...item.kinds].sort(),
      items: item.items.sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || String(a.title).localeCompare(String(b.title))),
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

async function renameMarkdownTags(oldTag, newTag) {
  const pages = await scanMarkdownPages([wikiRoot, workRoot]);
  let updated = 0;
  for (const page of pages) {
    const tags = uniqueTags(page.tags || page.frontmatter?.tags || []);
    if (!tags.some(tag => tag === oldTag)) continue;
    const next = replaceTag(tags, oldTag, newTag);
    if (next.join('\0') === tags.join('\0')) continue;
    await updateMarkdownFrontmatter(path.join(memoryRoot, page.path), { tags: next });
    updated += 1;
  }
  return updated;
}

async function renameContainerTags(oldTag, newTag) {
  const files = await listJsonFiles(containerRoot);
  let updated = 0;
  for (const file of files) {
    const container = await readJsonFile(file).catch(() => null);
    if (!container?.id) continue;
    const tags = uniqueTags(container.tags || []);
    if (!tags.some(tag => tag === oldTag)) continue;
    const next = replaceTag(tags, oldTag, newTag);
    if (next.join('\0') === tags.join('\0')) continue;
    await writeJsonFile(file, { ...container, tags: next, updatedAt: new Date().toISOString() });
    updated += 1;
  }
  return updated;
}

async function renameRawTags(oldTag, newTag) {
  const rows = await readJsonl(rawFile);
  const latest = new Map();
  for (const row of rows) {
    if (row?.id) latest.set(row.id, row);
  }
  const now = new Date().toISOString();
  let updated = 0;
  for (const item of latest.values()) {
    const tags = uniqueTags(item.tags || []);
    if (!tags.some(tag => tag === oldTag)) continue;
    const next = replaceTag(tags, oldTag, newTag);
    if (next.join('\0') === tags.join('\0')) continue;
    await appendJsonl(rawFile, { ...item, tags: next, updatedAt: now });
    updated += 1;
  }
  return updated;
}

export async function run(argv = []) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'list') {
    const tags = await collectTagIndex();
    if (json) {
      writeJsonOutput({ ok: true, tags });
      return;
    }
    if (!tags.length) {
      console.log('No tags found.');
      return;
    }
    tags.forEach(item => console.log(`${item.tag} (${item.count})`));
    return;
  }

  if (sub === 'show') {
    const tag = normalizeTag(argv[2]);
    if (!tag) {
      console.log('Usage: mm tags show <tag>');
      return;
    }
    const tags = await collectTagIndex();
    const found = tags.find(item => tagKey(item.tag) === tagKey(tag));
    if (!found) {
      if (json) writeJsonOutput({ ok: false, error: { code: 'NOT_FOUND', message: `Unknown tag: ${tag}` } });
      else console.log(`Unknown tag: ${tag}`);
      process.exitCode = 2;
      return;
    }
    if (json) {
      writeJsonOutput({ ok: true, tag: found });
      return;
    }
    console.log(`${found.tag} (${found.count})`);
    found.items.forEach(item => console.log(`- ${item.kind} ${item.id} ${item.title}`.trim()));
    return;
  }

  if (sub === 'rename') {
    const oldTag = normalizeTag(argv[2]);
    const newTag = normalizeTag(argv[3]);
    if (!oldTag || !newTag) {
      console.log('Usage: mm tags rename <old> <new>');
      return;
    }
    const result = await withLock('repo-write', async () => {
      const markdownPages = await renameMarkdownTags(oldTag, newTag);
      const containers = await renameContainerTags(oldTag, newTag);
      const rawItems = await renameRawTags(oldTag, newTag);
      const index = await rebuildIndex();
      return { markdownPages, containers, rawItems, index };
    }, { command: 'mm tags rename' });
    if (json) {
      writeJsonOutput({ ok: true, from: oldTag, to: newTag, result });
      return;
    }
    console.log(`Renamed tag ${oldTag} -> ${newTag}`);
    console.log(`Markdown pages: ${result.markdownPages}`);
    console.log(`Containers: ${result.containers}`);
    console.log(`Raw items: ${result.rawItems}`);
    return;
  }

  console.log('Usage: mm tags <list|show|rename>');
}
