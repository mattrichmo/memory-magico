import path from 'path';
import { memoryRoot } from './paths.mjs';
import { parseMarkdownPage, normalizeFrontmatterKeys } from './frontmatter.mjs';
import { readDirRecursive, readFile, stat } from './fs.mjs';
import { slugify } from './slugs.mjs';

const DEFAULT_ROOTS = [
  path.join(memoryRoot, 'wiki'),
  path.join(memoryRoot, 'work'),
];

const PAGE_CACHE = new Map();

function isGeneratedPath(filePath) {
  const rel = path.relative(memoryRoot, filePath);
  if (!rel || rel.startsWith('..')) return true;
  const parts = rel.split(path.sep);
  if (parts.some(part => part === '.mm' || part === 'generated')) return true;
  if (parts.some(part => part.startsWith('.'))) return true;
  return false;
}

function firstHeading(body) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function extractWikiLinks(body) {
  const out = [];
  const wikiLink = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  for (const match of body.matchAll(wikiLink)) out.push(match[1].trim());
  const mdLink = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of body.matchAll(mdLink)) {
    const href = match[1].trim();
    if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) continue;
    out.push(href);
  }
  return [...new Set(out.filter(Boolean))];
}

function collectTextTokens(text) {
  return String(text || '')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
}

export function chunkMarkdown(body = '', title = '') {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const chunks = [];
  let current = { heading: title || 'Overview', level: 1, lines: [] };
  const headingStack = [{ level: 0, title: title || 'Overview' }];

  function pushCurrent() {
    const text = current.lines.join('\n').trim() || current.heading || title || 'Overview';
    if (text) {
      chunks.push({
        heading: current.heading,
        level: current.level,
        headingPath: headingStack.map(item => item.title),
        text,
      });
    }
  }

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      pushCurrent();
      const level = match[1].length;
      const heading = match[2].trim();
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
      headingStack.push({ level, title: heading });
      current = { heading, level, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  pushCurrent();
  return chunks;
}

export async function scanMarkdownPages(roots = DEFAULT_ROOTS) {
  const files = [];
  for (const root of roots) {
    const discovered = await readDirRecursive(root, {
      filter: filePath => filePath.endsWith('.md') && !isGeneratedPath(filePath),
    });
    files.push(...discovered);
  }
  const pages = [];
  for (const filePath of files) {
    const fileStat = await stat(filePath);
    const cached = PAGE_CACHE.get(filePath);
    if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
      pages.push(cached.page);
      continue;
    }
    const page = await parseMarkdownFile(filePath);
    pages.push(page);
    PAGE_CACHE.set(filePath, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, page: pages[pages.length - 1] });
  }
  return pages;
}

export async function parseMarkdownFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  const parsed = parseMarkdownPage(text);
  const frontmatter = normalizeFrontmatterKeys(parsed.frontmatter || {});
  const body = parsed.body || '';
  const title = frontmatter.title || firstHeading(body) || path.basename(filePath, '.md');
  const rel = path.relative(memoryRoot, filePath);
  const slug = frontmatter.slug || slugify(title);
  const id = frontmatter.id || `${frontmatter.kind || 'page'}_${slug}`;
  const chunks = chunkMarkdown(body, title);
  return {
    id,
    kind: frontmatter.kind || 'note',
    title,
    path: rel,
    slug,
    aliases: Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [],
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    semanticTerms: Array.isArray(frontmatter.semanticTerms) ? frontmatter.semanticTerms : [],
    links: extractWikiLinks(body),
    sourceRefs: Array.isArray(frontmatter.sourceRefs) ? frontmatter.sourceRefs : [],
    status: frontmatter.status || 'draft',
    createdAt: frontmatter.createdAt || frontmatter.created_at || null,
    updatedAt: frontmatter.updatedAt || frontmatter.updated_at || null,
    number: frontmatter.number ?? null,
    body,
    chunks,
    frontmatter,
    errors: parsed.errors || [],
  };
}

export function pageIndexRows(pages) {
  return pages.map(page => ({
    id: page.id,
    kind: page.kind,
    title: page.title,
    status: page.status,
    number: page.number,
    slug: page.slug,
    path: page.path,
    aliases: page.aliases,
    tags: page.tags,
    semanticTerms: page.semanticTerms,
    sourceRefs: page.sourceRefs,
    links: page.links,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  }));
}

export function chunkIndexRows(pages) {
  const chunks = [];
  for (const page of pages) {
    page.chunks.forEach((chunk, index) => {
      chunks.push({
        chunkId: `${page.id}#${index + 1}`,
        pageId: page.id,
        path: page.path,
        title: page.title,
        kind: page.kind,
        heading: chunk.heading,
        headingPath: chunk.headingPath,
        text: chunk.text,
        aliases: page.aliases,
        tags: page.tags,
        semanticTerms: page.semanticTerms,
        links: page.links,
        sourceRefs: page.sourceRefs,
        updatedAt: page.updatedAt,
      });
    });
  }
  return chunks;
}

export function textForSearch(pageOrChunk) {
  return [
    pageOrChunk.title,
    pageOrChunk.heading,
    pageOrChunk.path,
    ...(pageOrChunk.aliases || []),
    ...(pageOrChunk.tags || []),
    ...(pageOrChunk.semanticTerms || []),
    ...(pageOrChunk.links || []),
    ...(pageOrChunk.sourceRefs || []),
    pageOrChunk.text,
    pageOrChunk.body,
  ].filter(Boolean).join(' ');
}
