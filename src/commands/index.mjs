import path from 'path';
import fs from 'fs/promises';
import { memoryRoot } from '../core/paths.mjs';
import { rebuildIndex, searchStatus } from '../core/retrieval.mjs';

export async function run(argv) {
  const sub = argv[1] || 'status';
  if (sub === 'rebuild') {
    const index = await rebuildIndex();
    if (argv.includes('--json')) {
      console.log(JSON.stringify({
        builtAt: index.builtAt,
        pageCount: index.pageCount,
        chunkCount: index.chunkCount,
        mode: index.mode,
        vectorDims: index.vectorDims,
      }, null, 2));
      return;
    }
    console.log(`Search index rebuilt: ${index.pageCount} pages, ${index.chunkCount} chunks.`);
    return;
  }

  if (sub === 'status') {
    const status = await searchStatus();
    if (argv.includes('--json')) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    console.log(`Search index: ${status.ready ? 'ready' : 'needs rebuild'}`);
    console.log(`Built: ${status.builtAt || 'missing'}`);
    console.log(`Pages: ${status.pageCount}`);
    console.log(`Chunks: ${status.chunkCount}`);
    console.log(`Mode: ${status.mode || 'hybrid'}`);
    console.log(`Vector dims: ${status.vectorDims || 2048}`);
    console.log(`Stale files: ${status.stale ? 1 : 0}`);
    console.log(`Missing files: ${status.missing ? 1 : 0}`);
    return;
  }

  if (sub === 'show') {
    const file = path.join(memoryRoot, 'generated', 'search-index.json');
    try {
      console.log(await fs.readFile(file, 'utf8'));
    } catch {
      console.log('Search index not found. Run `mm index rebuild`.');
    }
    return;
  }

  console.log('Usage: mm index <rebuild|status|show>');
}
