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
const postingsRoot = path.join(internalSearchRoot, 'postings');
const chunkMetaFile = path.join(internalSearchRoot, 'chunks-meta.jsonl');
const SEARCH_BACKEND = 'jsonl-shards';
const POSTING_SHARDS = 64;
const VECTOR_DIMS = 2048;
const markdownRoots = [
  path.join(memoryRoot, 'wiki'),
  path.join(memoryRoot, 'work'),
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'of', 'to', 'in', 'on', 'for',
  'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'at', 'from', 'it',
  'this', 'that', 'these', 'those', 'into', 'over', 'under', 'about', 'after', 'before', 'not',
]);

export function tokenize(input = '', { trigrams: includeTrigrams = true } = {}) {
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
    if (/[a-z]/.test(token) && /[0-9]/.test(token)) tokens.push(token.replace(/-/g, ''));
  }
  const bigrams = [];
  for (let i = 0; i < tokens.length - 1; i += 1) bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  const trigrams = [];
  if (includeTrigrams) {
    for (const token of tokens) {
      const compact = token.replace(/\s+/g, '');
      for (let i = 0; i < compact.length - 2; i += 1) trigrams.push(compact.slice(i, i + 3));
    }
  }
  return [...new Set([...tokens, ...bigrams, ...trigrams].filter(Boolean))];
}

function tokenizeLexical(input = '') {
  return tokenize(input, { trigrams: false });
}

export function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function buildSparseVector(features, dims = VECTOR_DIMS) {
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
    .map(([index, value]) => [index, Number((value / norm).toFixed(4))])
    .filter(([, value]) => value !== 0);
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
  return tokenizeLexical(textForSearch(chunk));
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

function buildPostingStore(chunks) {
  const docLengths = {};
  const terms = new Map();
  for (const chunk of chunks) {
    const tokens = chunk.tokens || chunkTokens(chunk);
    docLengths[chunk.chunkId] = tokens.length || 1;
    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
    for (const [term, tf] of counts.entries()) {
      const row = terms.get(term) || { term, df: 0, postings: [] };
      row.df += 1;
      row.postings.push([chunk.chunkId, tf]);
      terms.set(term, row);
    }
  }
  const docCount = chunks.length || 1;
  const avgDocLength = Object.values(docLengths).reduce((a, b) => a + b, 0) / docCount || 1;
  return { docCount, avgDocLength, terms };
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
      const base = label === 'title' ? 3 : label === 'heading' ? 2.25 : label === 'aliases' ? 2 : label === 'semantic' ? 1.75 : label === 'tags' ? 1.4 : label === 'links' ? 1.1 : 0.5;
      const coverage = Math.min(1, hits.length / Math.max(1, queryTokens.length));
      boost += base * (0.75 + coverage);
    }
  }
  return { boost, reasons };
}

function normalizeVector(vector) {
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

function shardForTerm(term) {
  return String(fnv1a(term) % POSTING_SHARDS).padStart(2, '0');
}

function postingShardFile(shard) {
  return path.join(postingsRoot, `${shard}.jsonl`);
}

function expectedPostingShardFiles() {
  return Array.from({ length: POSTING_SHARDS }, (_, shard) => postingShardFile(String(shard).padStart(2, '0')));
}

function compactIndexSummary(manifest) {
  return {
    version: 3,
    builtAt: manifest.builtAt,
    backend: SEARCH_BACKEND,
    mode: manifest.mode,
    vectorDims: manifest.vectorDims,
    pageCount: manifest.pageCount,
    chunkCount: manifest.chunkCount,
    shardCount: manifest.shardCount,
    artifacts: manifest.artifacts,
  };
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
    version: 3,
    builtAt,
    backend: SEARCH_BACKEND,
    mode,
    vectorDims,
    pageCount: pages.length,
    chunkCount: chunks.length,
    docCount: chunks.length || 1,
    shardCount: POSTING_SHARDS,
    sourceRoots: markdownRoots.map(rootLabel),
    artifacts: {
      index: path.relative(memoryRoot, indexFile).split(path.sep).join('/'),
      pages: path.relative(memoryRoot, pageIndexFile).split(path.sep).join('/'),
      chunks: path.relative(memoryRoot, chunkIndexFile).split(path.sep).join('/'),
      chunkMeta: path.relative(memoryRoot, chunkMetaFile).split(path.sep).join('/'),
      postings: path.relative(memoryRoot, postingsRoot).split(path.sep).join('/'),
    },
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
  if (status.ready) return loadSearchManifest();
  await rebuildIndex();
  return loadSearchManifest();
}

export async function rebuildIndex() {
  return withLock('index-rebuild', async () => {
    const sources = await collectMarkdownSourceFiles();
    const { pages, nextCacheRows } = await buildPagesFromSources(sources);
    pages.sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
    const pageRows = pageIndexRows(pages);
    const chunks = chunkIndexRows(pages).map(chunk => ({
      ...chunk,
      tokens: chunkTokens(chunk),
      vector: buildSparseVector(featureListFromPage(chunk), VECTOR_DIMS),
      kindBoost: kindBoost(chunk.kind),
    }));
    const builtAt = new Date().toISOString();
    const postingStore = buildPostingStore(chunks);
    const manifest = {
      ...buildManifest(sources, pages, chunks, builtAt, 'hybrid', VECTOR_DIMS),
      docCount: postingStore.docCount,
      avgDocLength: postingStore.avgDocLength,
    };
    const index = compactIndexSummary(manifest);
    const chunkMetaRows = chunks.map(({ text: _text, tokens, ...rest }) => ({
      ...rest,
      tokenCount: tokens.length || 1,
    }));
    const shards = new Map();
    for (const row of postingStore.terms.values()) {
      const shard = shardForTerm(row.term);
      const rows = shards.get(shard) || [];
      rows.push(row);
      shards.set(shard, rows);
    }
    await mkdirp(generatedRoot);
    await mkdirp(internalSearchRoot);
    await fs.rm(postingsRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
    await mkdirp(postingsRoot);
    await atomicWriteText(indexFile, JSON.stringify(index, null, 2) + '\n');
    await atomicWriteText(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    await writeJsonl(pageCacheFile, nextCacheRows);
    await writeJsonl(pageIndexFile, pageRows);
    await writeJsonl(chunkMetaFile, chunkMetaRows);
    await writeJsonl(chunkIndexFile, chunks.map(({ vector, tokens, kindBoost: _kindBoost, ...rest }) => rest));
    for (let shard = 0; shard < POSTING_SHARDS; shard += 1) {
      const key = String(shard).padStart(2, '0');
      const rows = (shards.get(key) || []).sort((a, b) => a.term.localeCompare(b.term));
      await writeJsonl(postingShardFile(key), rows);
    }
    return index;
  }, { command: 'mm index rebuild' });
}

export async function loadIndex() {
  const manifest = await loadSearchManifest();
  if (manifest?.backend === SEARCH_BACKEND) return compactIndexSummary(manifest);
  if (!(await exists(indexFile))) return null;
  const txt = await fs.readFile(indexFile, 'utf8');
  return JSON.parse(txt);
}

async function loadSearchManifest() {
  if (!(await exists(manifestFile))) return null;
  const txt = await fs.readFile(manifestFile, 'utf8');
  return JSON.parse(txt);
}

export async function indexStatus() {
  const manifest = await loadSearchManifest();
  if (!manifest) {
    return {
      ready: false,
      missing: true,
      stale: false,
      pageCount: 0,
      chunkCount: 0,
      builtAt: null,
      backend: SEARCH_BACKEND,
      missingShardCount: POSTING_SHARDS,
      missingShards: expectedPostingShardFiles().slice(0, 10).map(filePath => path.relative(memoryRoot, filePath).split(path.sep).join('/')),
    };
  }
  const pages = await scanMarkdownPages();
  const maxSourceMtime = await latestSourceMtime();
  const builtAtTime = manifest.builtAt ? Date.parse(manifest.builtAt) : 0;
  const stale = maxSourceMtime > builtAtTime;
  const missingShardFiles = [];
  for (const shardFile of expectedPostingShardFiles()) {
    if (!(await exists(shardFile))) missingShardFiles.push(path.relative(memoryRoot, shardFile).split(path.sep).join('/'));
  }
  const missing = manifest.backend !== SEARCH_BACKEND
    || !(await exists(indexFile))
    || !(await exists(pageIndexFile))
    || !(await exists(chunkIndexFile))
    || !(await exists(chunkMetaFile))
    || !(await exists(postingsRoot))
    || missingShardFiles.length > 0;
  return {
    ready: !missing && !stale,
    missing,
    stale,
    builtAt: manifest.builtAt,
    pageCount: manifest.pageCount || pages.length,
    chunkCount: manifest.chunkCount || 0,
    mode: manifest.mode || 'hybrid',
    backend: manifest.backend || 'legacy-json',
    vectorDims: manifest.vectorDims || VECTOR_DIMS,
    shardCount: manifest.shardCount || 0,
    missingShardCount: missingShardFiles.length,
    missingShards: missingShardFiles.slice(0, 10),
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

async function loadPageRows() {
  if (!(await exists(pageIndexFile))) return [];
  return readJsonl(pageIndexFile);
}

async function loadChunkMetaRows(filterIds = null) {
  const rows = await readJsonl(chunkMetaFile);
  if (!filterIds) return rows;
  return rows.filter(row => filterIds.has(row.chunkId));
}

async function loadPostingsForTerms(terms) {
  const requested = new Set(terms);
  const shards = new Map();
  for (const term of requested) {
    const shard = shardForTerm(term);
    const list = shards.get(shard) || [];
    list.push(term);
    shards.set(shard, list);
  }
  const out = new Map();
  for (const [shard, shardTerms] of shards.entries()) {
    const wanted = new Set(shardTerms);
    const rows = await readJsonl(postingShardFile(shard));
    for (const row of rows) {
      if (wanted.has(row.term)) out.set(row.term, row);
    }
  }
  return out;
}

function bm25TermScore(tf, df, docLen, docCount, avgDocLength) {
  const k1 = 1.5;
  const b = 0.75;
  const safeDocLen = docLen || 1;
  const idf = Math.log(1 + (((docCount || 1) - df + 0.5) / (df + 0.5)));
  return idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * safeDocLen) / (avgDocLength || 1))));
}

function normalizeKinds(kind) {
  return kind ? (Array.isArray(kind) ? kind : String(kind).split(',')).map(s => s.trim()).filter(Boolean) : [];
}

function sinceCutoffMs(since) {
  if (!since) return null;
  const raw = String(since).trim();
  const relative = raw.match(/^(\d+)(d|day|days|h|hour|hours)$/i);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const ms = unit.startsWith('h') ? n * 60 * 60 * 1000 : n * 24 * 60 * 60 * 1000;
    return Date.now() - ms;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesSearchFilters(chunk, { kinds = [], pathPrefix = null, sinceMs = null } = {}) {
  if (kinds.length && !kinds.includes(chunk.kind)) return false;
  if (pathPrefix && !String(chunk.path || '').startsWith(pathPrefix)) return false;
  if (sinceMs) {
    const updatedAt = Date.parse(chunk.updatedAt || '');
    if (!Number.isFinite(updatedAt) || updatedAt < sinceMs) return false;
  }
  return true;
}

function scoreStoredChunk(queryTokens, queryVector, chunk, candidate, manifest, { mode, maxBm25 }) {
  const bm25Raw = candidate?.bm25Raw || 0;
  const vectorSimilarity = mode === 'lexical' ? 0 : dotSparse(queryVector, normalizeVector(chunk.vector));
  const meta = metadataBoost(queryTokens, chunk);
  const recencyBoost = chunk.updatedAt ? Math.min(1, Math.max(0, (Date.now() - Date.parse(chunk.updatedAt)) / (1000 * 60 * 60 * 24 * 30))) : 0;
  let score = 0;
  if (mode === 'lexical') {
    score = normalizeScore(bm25Raw, maxBm25);
  } else if (mode === 'vector') {
    score = Math.max(0, vectorSimilarity);
  } else {
    score = (0.42 * normalizeScore(bm25Raw, maxBm25))
      + (0.18 * Math.max(0, vectorSimilarity))
      + (0.30 * Math.min(1, meta.boost / 6))
      + (0.05 * chunk.kindBoost)
      + (0.05 * (1 - recencyBoost));
  }
  const reasons = [];
  if (bm25Raw > 0) reasons.push(`bm25=${bm25Raw.toFixed(3)}`);
  if (vectorSimilarity > 0) reasons.push(`vector=${vectorSimilarity.toFixed(3)}`);
  reasons.push(...meta.reasons.slice(0, 4));
  return { score, reasons };
}

async function lexicalCandidates(queryTokens, manifest) {
  const postings = await loadPostingsForTerms(queryTokens);
  const candidates = new Map();
  for (const [term, row] of postings.entries()) {
    const df = row.df || row.postings?.length || 1;
    for (const [chunkId, tf] of row.postings || []) {
      const candidate = candidates.get(chunkId) || { chunkId, terms: [], bm25Raw: 0 };
      candidate.terms.push({ term, tf, df });
      candidates.set(chunkId, candidate);
    }
  }
  if (!candidates.size) return candidates;
  const metas = await loadChunkMetaRows(new Set(candidates.keys()));
  const tokenCounts = new Map(metas.map(row => [row.chunkId, row.tokenCount || 1]));
  for (const candidate of candidates.values()) {
    const docLen = tokenCounts.get(candidate.chunkId) || 1;
    candidate.bm25Raw = candidate.terms.reduce(
      (sum, term) => sum + bm25TermScore(term.tf, term.df, docLen, manifest.docCount, manifest.avgDocLength),
      0,
    );
  }
  return candidates;
}

export async function search(query, { mode = 'hybrid', limit = 10, kind = null, path: pathPrefix = null, since = null, includeBody = false } = {}) {
  const manifest = await ensureFreshIndex();
  const queryTokens = tokenizeLexical(query);
  if (!queryTokens.length) return [];
  const queryVector = buildSparseVector(featureListFromQuery(query), manifest.vectorDims || VECTOR_DIMS);
  const kinds = normalizeKinds(kind);
  const sinceMs = sinceCutoffMs(since);
  const candidates = mode === 'vector' ? new Map() : await lexicalCandidates(queryTokens, manifest);
  const candidateIds = candidates.size ? new Set(candidates.keys()) : null;
  const candidateChunks = mode === 'vector' ? await loadChunkMetaRows() : await loadChunkMetaRows(candidateIds);
  const filteredChunks = candidateChunks.filter(chunk => matchesSearchFilters(chunk, { kinds, pathPrefix, sinceMs }));
  const maxBm25 = Math.max(1, ...filteredChunks.map(chunk => candidates.get(chunk.chunkId)?.bm25Raw || 0));
  const results = new Map();
  for (const chunk of filteredChunks) {
    const lexicalCandidate = candidates.get(chunk.chunkId);
    const { score, reasons } = scoreStoredChunk(queryTokens, queryVector, chunk, lexicalCandidate, manifest, { mode, maxBm25 });
    if (score <= 0 && mode !== 'hybrid') continue;
    const result = {
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
    if (!existing || existing.score < score) results.set(chunk.pageId, result);
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
  await ensureFreshIndex();
  const text = String(input || '').trim();
  const lowered = text.toLowerCase();
  const searchResults = await search(text, { limit: 5, kind });
  const matches = [];
  const candidates = await loadPageRows();
  const kinds = normalizeKinds(kind);

  for (const page of candidates) {
    const title = String(page.title || '').toLowerCase();
    const aliases = (page.aliases || []).map(v => String(v).toLowerCase());
    if (kinds.length && !kinds.includes(page.kind)) continue;
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
    if (confidence > 0) matches.push({ ...page, confidence, reason });
  }
  matches.sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title));
  return matches.slice(0, limit);
}

export async function searchStatus() {
  return indexStatus();
}

export async function indexStats() {
  const status = await indexStatus();
  const manifest = await loadSearchManifest();
  const files = [];
  for (const filePath of [indexFile, pageIndexFile, chunkIndexFile, chunkMetaFile, manifestFile]) {
    try {
      const stat = await fs.stat(filePath);
      files.push({
        path: path.relative(memoryRoot, filePath).split(path.sep).join('/'),
        bytes: stat.size,
      });
    } catch {
      // Missing files are already represented in status.
    }
  }
  return {
    ...status,
    artifacts: manifest?.artifacts || {},
    files,
  };
}

export async function termPostings(term, { limit = 20 } = {}) {
  await ensureFreshIndex();
  const normalized = tokenizeLexical(term)[0] || String(term || '').trim().toLowerCase();
  if (!normalized) return { term: '', df: 0, postings: [] };
  const rows = await loadPostingsForTerms([normalized]);
  const row = rows.get(normalized);
  if (!row) return { term: normalized, df: 0, postings: [] };
  return {
    term: row.term,
    df: row.df,
    postings: (row.postings || []).slice(0, limit),
  };
}

export async function chunksForPage(pageId, { limit = 50 } = {}) {
  await ensureFreshIndex();
  const rows = await readJsonl(chunkIndexFile);
  return rows
    .filter(row => row.pageId === pageId || row.path === pageId)
    .slice(0, limit);
}

export async function explainSearch(query, options = {}) {
  const manifest = await ensureFreshIndex();
  const queryTokens = tokenizeLexical(query);
  const postings = await loadPostingsForTerms(queryTokens);
  const results = await search(query, { ...options, limit: options.limit || 10 });
  return {
    query,
    backend: manifest.backend,
    tokens: queryTokens,
    matchedTerms: queryTokens
      .filter(term => postings.has(term))
      .map(term => ({ term, df: postings.get(term).df })),
    results,
  };
}
