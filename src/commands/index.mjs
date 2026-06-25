import path from 'path';
import fs from 'fs/promises';
import { memoryRoot } from '../core/paths.mjs';
import { chunksForPage, explainSearch, indexStats, rebuildIndex, searchStatus, termPostings } from '../core/retrieval.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv) {
  const sub = argv[1] || 'status';
  if (sub === 'rebuild') {
    const index = await rebuildIndex();
    if (argv.includes('--json')) {
      writeJsonOutput({
        ok: true,
        builtAt: index.builtAt,
        pageCount: index.pageCount,
        chunkCount: index.chunkCount,
        mode: index.mode,
        vectorDims: index.vectorDims,
      });
      return;
    }
    console.log(`Search index rebuilt: ${index.pageCount} pages, ${index.chunkCount} chunks.`);
    return;
  }

  if (sub === 'status') {
    const status = await searchStatus();
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, ...status });
      return;
    }
    console.log(`Search index: ${status.ready ? 'ready' : 'needs rebuild'}`);
    console.log(`Built: ${status.builtAt || 'missing'}`);
    console.log(`Pages: ${status.pageCount}`);
    console.log(`Chunks: ${status.chunkCount}`);
    console.log(`Mode: ${status.mode || 'hybrid'}`);
    console.log(`Backend: ${status.backend || 'unknown'}`);
    console.log(`Vector dims: ${status.vectorDims || 2048}`);
    console.log(`Postings shards: ${status.shardCount || 0}`);
    console.log(`Stale files: ${status.stale ? 1 : 0}`);
    console.log(`Missing files: ${status.missing ? 1 : 0}`);
    if (status.missingShardCount) console.log(`Missing posting shards: ${status.missingShardCount}`);
    return;
  }

  if (sub === 'stats') {
    const stats = await indexStats();
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, ...stats });
      return;
    }
    console.log(`Search index: ${stats.ready ? 'ready' : 'needs rebuild'}`);
    console.log(`Backend: ${stats.backend || 'unknown'}`);
    console.log(`Built: ${stats.builtAt || 'missing'}`);
    console.log(`Pages: ${stats.pageCount}`);
    console.log(`Chunks: ${stats.chunkCount}`);
    for (const file of stats.files || []) console.log(`${file.path}: ${file.bytes} bytes`);
    return;
  }

  if (sub === 'terms') {
    const term = argv[2];
    if (!term) {
      console.log('Usage: mm index terms <term> [--limit N] [--json]');
      return;
    }
    const limitIndex = argv.indexOf('--limit');
    const limit = limitIndex !== -1 ? Number(argv[limitIndex + 1]) || 20 : 20;
    const payload = await termPostings(term, { limit });
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, ...payload });
      return;
    }
    console.log(`${payload.term}: df=${payload.df}`);
    for (const [chunkId, tf] of payload.postings || []) console.log(`${chunkId} tf=${tf}`);
    return;
  }

  if (sub === 'chunks') {
    const pageIndex = argv.indexOf('--page');
    const pageId = pageIndex !== -1 ? argv[pageIndex + 1] : argv[2];
    if (!pageId) {
      console.log('Usage: mm index chunks --page <page-id-or-path> [--json]');
      return;
    }
    const chunks = await chunksForPage(pageId);
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, pageId, chunks });
      return;
    }
    if (!chunks.length) {
      console.log('No chunks found.');
      return;
    }
    for (const chunk of chunks) console.log(`${chunk.chunkId} ${chunk.path}#${chunk.heading || 'Overview'}`);
    return;
  }

  if (sub === 'explain') {
    const queryParts = [];
    for (let i = 2; i < argv.length; i += 1) {
      const arg = argv[i];
      if (['--kind', '--limit', '--mode', '--path', '--since'].includes(arg)) {
        i += 1;
        continue;
      }
      if (arg.startsWith('--')) continue;
      queryParts.push(arg);
    }
    const query = queryParts.join(' ').trim();
    if (!query) {
      console.log('Usage: mm index explain <query> [--kind <kind>] [--path <prefix>] [--since 30d|date] [--json]');
      return;
    }
    const kindIndex = argv.indexOf('--kind');
    const modeIndex = argv.indexOf('--mode');
    const limitIndex = argv.indexOf('--limit');
    const pathIndex = argv.indexOf('--path');
    const sinceIndex = argv.indexOf('--since');
    const payload = await explainSearch(query, {
      kind: kindIndex !== -1 ? argv[kindIndex + 1] : null,
      mode: modeIndex !== -1 ? argv[modeIndex + 1] : 'hybrid',
      limit: limitIndex !== -1 ? Number(argv[limitIndex + 1]) || 10 : 10,
      path: pathIndex !== -1 ? argv[pathIndex + 1] : null,
      since: sinceIndex !== -1 ? argv[sinceIndex + 1] : null,
    });
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, ...payload });
      return;
    }
    console.log(`Backend: ${payload.backend}`);
    console.log(`Tokens: ${payload.tokens.join(', ')}`);
    console.log(`Matched terms: ${payload.matchedTerms.map(term => `${term.term}(${term.df})`).join(', ') || 'none'}`);
    for (const result of payload.results) console.log(`${result.rank}. ${result.title} ${result.path} score=${result.score}`);
    return;
  }

  if (sub === 'show') {
    const file = path.join(memoryRoot, 'generated', 'search-index.json');
    try {
      const text = await fs.readFile(file, 'utf8');
      if (argv.includes('--json')) {
        writeJsonOutput({ ok: true, index: JSON.parse(text) });
        return;
      }
      console.log(text);
    } catch {
      if (argv.includes('--json')) {
        writeJsonOutput({
          ok: false,
          error: {
            code: 'MISSING_INDEX',
            message: 'Search index not found. Run `mm index rebuild`.',
          },
        });
        return;
      }
      console.log('Search index not found. Run `mm index rebuild`.');
    }
    return;
  }

  console.log('Usage: mm index <rebuild|status|stats|terms|chunks|explain|show>');
}
