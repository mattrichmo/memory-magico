import fs from 'fs/promises';
import path from 'path';
import { memoryRoot, repoRoot } from '../core/paths.mjs';
import { readJsonl } from '../core/json.mjs';
import { mkdirp } from '../core/fs.mjs';
import { readMarkdownPage, writeMarkdownPage } from '../core/frontmatter.mjs';
import { slugify, uniqueMarkdownPath } from '../core/slugs.mjs';
import { rebuildIndex } from '../core/retrieval.mjs';
import { resolveRepoPath } from '../core/safe-path.mjs';

const rawIndexFile = path.join(memoryRoot, 'inbox', 'raw-items.jsonl');
const sourcesRoot = path.join(memoryRoot, 'wiki', 'sources');

export async function run(argv) {
  const target = argv[1];
  if (!target) {
    console.log('Usage: mm ingest <raw-id> [--json]');
    return;
  }
  const items = await readJsonl(rawIndexFile);
  const rawItem = items.find(item => item.id === target);
  if (!rawItem) {
    console.log('Raw item not found:', target);
    return;
  }
  await mkdirp(sourcesRoot);
  const fileName = await uniqueMarkdownPath(sourcesRoot, rawItem.title || rawItem.id);
  let body = `# ${rawItem.title || rawItem.id}\n\n`;
  if (rawItem.path) {
    const payloadPath = await resolveRepoPath(repoRoot, rawItem.path, 'repo-read');
    try {
      const text = await fs.readFile(payloadPath, 'utf8');
      body += `## Raw Payload\n\n\`\`\`\n${text.trimEnd()}\n\`\`\`\n`;
    } catch {
      body += '## Raw Payload\n\nUnavailable.\n';
    }
  }
  const frontmatter = {
    id: `source_${slugify(rawItem.title || rawItem.id)}`,
    kind: 'source',
    title: rawItem.title || rawItem.id,
    status: 'active',
    aliases: [],
    tags: rawItem.tags || [],
    sourceRefs: [rawItem.id],
    related: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeMarkdownPage(fileName, frontmatter, body);
  const nextItems = items.map(item => item.id === rawItem.id ? { ...item, status: 'processed', processedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reconciledTo: [{ kind: 'wiki_page', id: frontmatter.id, path: path.relative(memoryRoot, fileName) }] } : item);
  await fs.writeFile(rawIndexFile, nextItems.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  await rebuildIndex();
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ rawId: rawItem.id, sourcePage: path.relative(memoryRoot, fileName) }, null, 2));
    return;
  }
  console.log(`Ingested ${rawItem.id} -> ${path.relative(memoryRoot, fileName)}`);
}
