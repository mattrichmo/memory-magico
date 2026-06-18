import fs from 'fs/promises';
import path from 'path';
import { memoryRoot } from './paths.mjs';
import { mkdirp, exists, readDirRecursive } from './fs.mjs';
import { pageIndexRows, chunkIndexRows, scanMarkdownPages, textForSearch, parseMarkdownFile } from './pages.mjs';
import { atomicWriteText } from './atomic-write.mjs';
import { withLock } from './lock.mjs';
import { readJsonl } from './json.mjs';

const generatedRoot = path.join(memoryRoot, 'generated');
const internalSearchRoot = path.join(memoryRoot, '.mm', 'search');
const indexFile = path.join(generatedRoot, 'search-index.json');
const manifestFile = path.join(internalSearchRoot, 'manifest.json');
const pageCacheFile = path.join(internalSearchRoot, 'pages-cache.jsonl');
const pageIndexFile = path.join(generatedRoot, 'page-index.jsonl');
const chunkIndexFile = path.join(generatedRoot, 'chunks.jsonl');
const markdownRoots = [
  path.join(memoryRoot, 'wiki'),
  path.join(memoryRoot, 'work'),
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'of', 'to', 'in', 'on', 'for',
  'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'at', 'from', 'it',
  'this', 'that', 'these', 'those', 'into', 'over', 'under', 'about', 'after', 'before', 'not',
]);

export function tokenize(input = '') {
  const text = String(input)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-zA-Z0-9-\s]+/g, ' ')
    .toLowerCase();
  const base = text.split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const token of base) {
    if (STOPWORDS.has(token)) continue;
    tokens.push(token);
    if (token.includes('-')) {
      for (const part of token.split('-').filter(Boolean)) if (!STOPWORDS.has(part)) tokens.push(part);
    }
    if (/[a-z]/.test(token) && /[0-9]/.test(token)) {
      tokens.push(token.replace(/-/g, ''));
    }
  }
  const bigrams = [];
  for (let i = 0; i < tokens.length - 1; i += 1) bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  const trigrams = [];
  for (const token of tokens) {
    const compact = token.replace(/\s+/g, '');
    for (let i = 0; i < compact.length - 2; i += 1) trigrams.push(compact.slice(i, i + 3));
  }
  return [...new Set([...tokens, ...bigrams, ...trigrams].filter(Boolean))];
}

export function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function buildVector(features, dims = 2048) {
  const vector = new Array(dims).fill(0);
  for (const feature of features) {
    const hash = fnv1a(feature);
    const index = hash % dims;
    const sign = (hash & 0x80000000) ? 1 : -1;
    vector[index] += sign;
  }
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares) || 1;
  return vector.map(value => value / norm);
}

export function buildSparseVector(features, dims = 2048) {
  const weights = new Map();
  for (const feature of features) {
    const hash = fnv1a(feature);
    const index = hash % dims;
    const sign = (hash & 0x80000000) ? 1 : -1;
    weights.set(index, (weights.get(index) || 0) + sign);
  }
  let sumSquares = 0;
  for (const value of weights.values()) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares) || 1;
  return [...weights.entries()]
    .filter(([, value]) => value !== 0)
    .sort((a, b) => a[0] - b[0])
    .map(([index, value]) => [index, value / norm]);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function dotSparse(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  let i = 0;
  let j = 0;
  let sum = 0;
  while (i < a.length && j < b.length) {
    const [aIndex, aValue] = a[i];
    const [bIndex, bValue] = b[j];
    if (aIndex === bIndex) {
      sum += aValue * bValue;
      i += 1;
      j += 1;
    } else if (aIndex < bIndex) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return sum;
}

function chunkTokens(chunk) {
  return tokenize(textForSearch(chunk));
}

function pageTokens(page) {
  return tokenize(textForSearch(page));
}

function featureListFromPage(page) {
  const features = [];
  for (const token of tokenize(page.title || '')) features.push(`title:${token}`, `title:${token}:2`);
  for (const token of tokenize(page.kind || '')) features.push(`kind:${token}`);
  for (const token of tokenize(page.path || '')) features.push(`path:${token}`);
  for (const token of page.aliases || []) for (const t of tokenize(token)) features.push(`alias:${t}`, `alias:${t}:2`);
  for (const token of page.tags || []) for (const t of tokenize(token)) features.push(`tag:${t}`);
  for (const token of page.semanticTerms || []) for (const t of tokenize(token)) features.push(`semantic:${t}`);
  for (const token of page.links || []) for (const t of tokenize(token)) features.push(`link:${t}`);
  for (const token of page.sourceRefs || []) for (const t of tokenize(token)) features.push(`source:${t}`);
  for (const token of chunkTokens(page)) features.push(`body:${token}`);
  return features;
}

function featureListFromQuery(query) {
  const tokens = tokenize(query);
  return tokens.flatMap(token => [`query:${token}`, `body:${token}`]);
}

function buildBm25(chunks, tokenMap) {
  const docLengths = {};
  const terms = {};
  for (const chunk of chunks) {
    const tokens = chunkTokens(chunk);
    docLengths[chunk.chunkId] = tokens.length || 1;
    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
    for (const [token, tf] of counts.entries()) {
      if (!terms[token]) terms[token] = { df: 0, postings: [] };
      terms[token].df += 1;
      terms[token].postings.push([chunk.chunkId, tf]);
    }
    tokenMap[chunk.chunkId] = tokens;
  }
  const docCount = chunks.length || 1;
  const avgDocLength = Object.values(docLengths).reduce((a, b) => a + b, 0) / docCount || 1;
  return { docCount, avgDocLength, terms, docLengths };
}

function bm25Score(queryTokens, chunkId, bm25) {
  const k1 = 1.5;
  const b = 0.75;
  let score = 0;
  const docLen = bm25.docLengths[chunkId] || 1;
  for (const token of queryTokens) {
    const term = bm25.terms[token];
    if (!term) continue;
    const posting = term.postings.find(([id]) => id === chunkId);
    if (!posting) continue;
    const tf = posting[1];
    const idf = Math.log(1 + ((bm25.docCount - term.df + 0.5) / (term.df + 0.5)));
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docLen) / bm25.avgDocLength)));
  }
  return score;
}

function metadataBoost(queryTokens, chunk) {
  const fields = {
    title: chunk.title || '',
    heading: chunk.heading || '',
    aliases: (chunk.aliases || []).join(' '),
    tags: (chunk.tags || []).join(' '),
    semantic: (chunk.semanticTerms || []).join(' '),
    links: (chunk.links || []).join(' '),
    path: chunk.path || '',
    kind: chunk.kind || '',
  };
  const reasons = [];
  let boost = 0;
  for (const [label, value] of Object.entries(fields)) {
    const hay = value.toLowerCase();
    const hits = queryTokens.filter(token => hay.includes(token));
    if (hits.length) {
      reasons.push(`${label} match: ${hits.slice(0, 3).join(', ')}`);
      boost += label === 'title' ? 3 : label === 'heading' ? 2.25 : label === 'aliases' ? 2 : label === 'semantic' ? 1.75 : label === 'tags' ? 1.4 : label === 'links' ? 1.1 : 0.5;
    }
  }
  return { boost, reasons };
}

function normalizeVector(vector, dims = 2048) {
  if (!Array.isArray(vector)) return [];
  if (!vector.length) return [];
  if (Array.isArray(vector[0])) return vector;
  const sparse = [];
  for (let index = 0; index < vector.length; index += 1) {
    const value = Number(vector[index]);
    if (value) sparse.push([index, value]);
  }
  return sparse;
}

function scoreChunk(queryTokens, queryVector, chunk, index, mode = 'hybrid') {
  const bm25Raw = bm25Score(queryTokens, chunk.chunkId, index.bm25);
  const vectorSimilarity = dotSparse(queryVector, normalizeVector(chunk.vector));
  const meta = metadataBoost(queryTokens, chunk);
  const recencyBoost = chunk.updatedAt ? Math.min(1, Math.max(0, (Date.now() - Date.parse(chunk.updatedAt)) / (1000 * 60 * 60 * 24 * 30))) : 0;
  let score = 0;
  if (mode === 'lexical') {
    score = normalizeScore(bm25Raw, index.maxBm25);
  } else if (mode === 'vector') {
    score = Math.max(0, vectorSimilarity);
  } else {
    score = (0.52 * normalizeScore(bm25Raw, index.maxBm25))
      + (0.24 * Math.max(0, vectorSimilarity))
      + (0.16 * Math.min(1, meta.boost / 4))
      + (0.04 * chunk.kindBoost)
      + (0.04 * (1 - recencyBoost));
  }
  const reasons = [];
  if (bm25Raw > 0) reasons.push(`bm25=${bm25Raw.toFixed(3)}`);
  if (vectorSimilarity > 0) reasons.push(`vector=${vectorSimilarity.toFixed(3)}`);
  reasons.push(...meta.reasons.slice(0, 4));
  return { score, reasons };
}

function normalizeScore(score, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(1, score / max));
}

function kindBoost(kind) {
  if (kind === 'sprint' || kind === 'initiative') return 1;
  if (kind === 'task' || kind === 'issue') return 0.9;
  if (kind === 'concept' || kind === 'system') return 0.8;
  return 0.6;
}

function rootLabel(rootPath) {
  return path.relative(memoryRoot, rootPath).split(path.sep).join('/');
}

async function collectMarkdownSourceFiles(roots = markdownRoots) {
  const files = [];
  for (const root of roots) {
    const discovered = await readDirRecursive(root, {
      filter: filePath => filePath.endsWith('.md') && !filePath.includes(`${path.sep}.mm${path.sep}`),
    });
    for (const filePath of discovered) {
      const stat = await fs.stat(filePath);
      files.push({
        root: rootLabel(root),
        filePath,
        path: path.relative(memoryRoot, filePath).split(path.sep).join('/'),
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function loadPageCache() {
  if (!(await exists(pageCacheFile))) return new Map();
  const rows = await readJsonl(pageCacheFile);
  return new Map(rows.filter(row => row?.path).map(row => [row.path, row]));
}

function buildManifest(sources, pages, chunks, builtAt, mode, vectorDims) {
  const roots = {};
  for (const source of sources) {
    const root = source.root;
    const entry = roots[root] || { root, files: [], pageCount: 0, chunkCount: 0 };
    entry.files.push({ path: source.path, mtimeMs: source.mtimeMs, size: source.size });
    roots[root] = entry;
  }
  for (const page of pages) {
    const root = page.path.startsWith('wiki/') ? 'wiki' : 'work';
    const entry = roots[root] || { root, files: [], pageCount: 0, chunkCount: 0 };
    entry.pageCount += 1;
    roots[root] = entry;
  }
  for (const chunk of chunks) {
    const root = chunk.path.startsWith('wiki/') ? 'wiki' : 'work';
    const entry = roots[root] || { root, files: [], pageCount: 0, chunkCount: 0 };
    entry.chunkCount += 1;
    roots[root] = entry;
  }
  return {
    version: 2,
    builtAt,
    mode,
    vectorDims,
    pageCount: pages.length,
    chunkCount: chunks.length,
    sourceRoots: markdownRoots.map(rootLabel),
    roots,
  };
}

async function buildPagesFromSources(sources) {
  const cache = await loadPageCache();
  const nextCacheRows = [];
  const pages = [];
  for (const source of sources) {
    const cached = cache.get(source.path);
    let page = null;
    if (cached && cached.mtimeMs === source.mtimeMs && cached.size === source.size && cached.page) {
      page = cached.page;
    } else {
      page = await parseMarkdownFile(source.filePath);
    }
    pages.push(page);
    nextCacheRows.push({
      path: source.path,
      mtimeMs: source.mtimeMs,
      size: source.size,
      page,
    });
  }
  return { pages, nextCacheRows };
}

async function writeJsonl(filePath, rows) {
  await mkdirp(path.dirname(filePath));
  const payload = rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  await atomicWriteText(filePath, payload);
}

async function ensureFreshIndex() {
  const status = await indexStatus();
  if (status.ready) return loadIndex();
  return rebuildIndex();
}

export async function rebuildIndex() {
  return withLock('index-rebuild', async () => {
    const sources = await collectMarkdownSourceFiles();
    const { pages, nextCacheRows } = await buildPagesFromSources(sources);
    pages.sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
    const pageRows = pageIndexRows(pages);
    const chunks = chunkIndexRows(pages).map(chunk => {
      const vectorDims = 2048;
      return {
        ...chunk,
        tokens: chunkTokens(chunk),
        vector: buildSparseVector(featureListFromPage(chunk), vectorDims),
        kindBoost: kindBoost(chunk.kind),
      };
    });
    const tokenMap = {};
    const bm25 = buildBm25(chunks, tokenMap);
    const maxBm25 = Math.max(1, ...chunks.map(chunk => {
      const tokens = chunk.tokens;
      return tokens.reduce((sum, token) => sum + (bm25.terms[token] ? 1 : 0), 0);
    }));
    const index = {
      version: 1,
      builtAt: new Date().toISOString(),
      mode: 'hybrid',
      vectorDims: 2048,
      pageCount: pages.length,
      chunkCount: chunks.length,
      pages: pageRows,
      chunks: chunks.map(({ text: _text, tokens, ...rest }) => rest),
      bm25,
      maxBm25,
    };
    await mkdirp(generatedRoot);
    await mkdirp(internalSearchRoot);
    await atomicWriteText(indexFile, JSON.stringify(index, null, 2) + '\n');
    await atomicWriteText(manifestFile, JSON.stringify(buildManifest(sources, pages, chunks, index.builtAt, index.mode, index.vectorDims), null, 2) + '\n');
    await writeJsonl(pageCacheFile, nextCacheRows);
    await writeJsonl(pageIndexFile, pageRows);
    await writeJsonl(chunkIndexFile, chunks.map(({ vector, tokens, kindBoost: _kindBoost, ...rest }) => rest));
    return index;
  }, { command: 'mm index rebuild' });
}

export async function loadIndex() {
  if (!(await exists(indexFile))) return null;
  const txt = await fs.readFile(indexFile, 'utf8');
  return JSON.parse(txt);
}

export async function indexStatus() {
  const index = await loadIndex();
  if (!index) {
    return { ready: false, missing: true, stale: false, pageCount: 0, chunkCount: 0, builtAt: null };
  }
  const pages = await scanMarkdownPages();
  const maxSourceMtime = await latestSourceMtime();
  const builtAtTime = index.builtAt ? Date.parse(index.builtAt) : 0;
  const stale = maxSourceMtime > builtAtTime;
  const missing = !(await exists(pageIndexFile)) || !(await exists(chunkIndexFile)) || !(await exists(manifestFile));
  return {
    ready: !missing && !stale,
    missing,
    stale,
    builtAt: index.builtAt,
    pageCount: index.pageCount || pages.length,
    chunkCount: index.chunkCount || 0,
    mode: index.mode || 'hybrid',
    vectorDims: index.vectorDims || 2048,
  };
}

async function latestSourceMtime() {
  const files = await readDirRecursive(path.join(memoryRoot, 'wiki'), {
    filter: filePath => filePath.endsWith('.md') && !filePath.includes(`${path.sep}.mm${path.sep}`),
  });
  const workFiles = await readDirRecursive(path.join(memoryRoot, 'work'), {
    filter: filePath => filePath.endsWith('.md') && !filePath.includes(`${path.sep}.mm${path.sep}`),
  });
  files.push(...workFiles);
  let max = 0;
  for (const file of files) {
    const stat = await fs.stat(file);
    if (stat.mtimeMs > max) max = stat.mtimeMs;
  }
  return max;
}

async function loadChunkTextMap() {
  const rows = await readJsonl(chunkIndexFile);
  return new Map(rows.map(row => [row.chunkId, row.text || '']));
}

export async function search(query, { mode = 'hybrid', limit = 10, kind = null, includeBody = false } = {}) {
  const index = await ensureFreshIndex();
  const queryTokens = tokenize(query);
  const queryVector = buildSparseVector(featureListFromQuery(query), index.vectorDims);
  const results = new Map();
  for (const chunk of index.chunks) {
    if (kind) {
      const kinds = Array.isArray(kind) ? kind : String(kind).split(',').map(s => s.trim()).filter(Boolean);
      if (kinds.length && !kinds.includes(chunk.kind)) continue;
    }
    const { score, reasons } = scoreChunk(queryTokens, queryVector, chunk, index, mode);
    const candidate = {
      rank: 0,
      score,
      pageId: chunk.pageId,
      chunkId: chunk.chunkId,
      title: chunk.title,
      heading: chunk.heading,
      path: chunk.path,
      kind: chunk.kind,
      reasons,
      body: includeBody ? chunk.text : undefined,
    };
    const existing = results.get(chunk.pageId);
    if (!existing || existing.score < score) results.set(chunk.pageId, candidate);
  }
  const chunkTextMap = includeBody ? await loadChunkTextMap() : null;
  return [...results.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((result, idx) => ({
      ...result,
      rank: idx + 1,
      score: Number(result.score.toFixed(3)),
      ...(includeBody ? { body: chunkTextMap?.get(result.chunkId) || '' } : {}),
    }));
}

export async function resolveEntity(input, { kind = null, limit = 5 } = {}) {
  const index = await ensureFreshIndex();
  const text = String(input || '').trim();
  const lowered = text.toLowerCase();
  const searchResults = await search(text, { limit: 5, kind });
  const matches = [];
  const candidates = index.pages;

  for (const page of candidates) {
    const title = String(page.title || '').toLowerCase();
    const aliases = (page.aliases || []).map(v => String(v).toLowerCase());
    if (kind && page.kind !== kind) continue;
    let confidence = 0;
    let reason = '';
    if (page.id === text) { confidence = 1; reason = 'exact id'; }
    else if (title === lowered) { confidence = 0.98; reason = 'exact title'; }
    else if (aliases.includes(lowered)) { confidence = 0.96; reason = 'alias'; }
    else if (page.number !== null && page.number !== undefined && String(page.number) === text) { confidence = 0.94; reason = 'number'; }
    else if (title.includes(lowered) || aliases.some(alias => alias.includes(lowered))) { confidence = 0.75; reason = 'fuzzy title/alias'; }
    else {
      const found = searchResults.find(item => item.pageId === page.id);
      if (found) {
        confidence = Math.min(0.7, found.score);
        reason = 'search';
      }
    }
    if (confidence > 0) {
      matches.push({ ...page, confidence, reason });
    }
  }
  matches.sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title));
  return matches.slice(0, limit);
}

export async function searchStatus() {
  return indexStatus();
}
