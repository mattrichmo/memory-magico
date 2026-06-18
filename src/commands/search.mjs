import { search } from '../core/retrieval.mjs';
import { maybeSpoolJsonResult } from '../core/result-spool.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { sanitizeSearchQuery } from '../core/string-safety.mjs';

export async function run(argv) {
  const queryParts = [];
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (['--kind', '--limit', '--mode'].includes(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) continue;
    queryParts.push(arg);
  }
  const query = sanitizeSearchQuery(queryParts.join(' ').trim());
  if (!query) {
    console.log('Usage: mm search <query> [--kind <kind>] [--limit N] [--mode lexical|vector|hybrid] [--json] [--explain]');
    return;
  }
  const kindFlagIndex = argv.indexOf('--kind');
  const kind = kindFlagIndex !== -1 ? argv[kindFlagIndex + 1] : null;
  const limitFlagIndex = argv.indexOf('--limit');
  const limit = limitFlagIndex !== -1 ? Number(argv[limitFlagIndex + 1]) || 10 : 10;
  const modeFlagIndex = argv.indexOf('--mode');
  const mode = modeFlagIndex !== -1 ? argv[modeFlagIndex + 1] : 'hybrid';
  const includeBody = argv.includes('--include-body') || argv.includes('--body');
  const results = await search(query, { kind, limit, mode, includeBody });
  if (argv.includes('--json')) {
    const payload = await maybeSpoolJsonResult('search', { query, mode, results }, 20000);
    writeJsonOutput({ ok: true, ...payload.value });
    return;
  }
  if (!results.length) {
    console.log('No matches.');
    return;
  }
  results.forEach(result => {
    console.log(`${result.rank}. ${result.title}`);
    console.log(`   ${result.path}#${result.heading || 'Overview'}`);
    console.log(`   score: ${result.score}`);
    if (argv.includes('--explain') && result.reasons?.length) {
      console.log(`   matched: ${result.reasons.join(', ')}`);
    }
  });
}
