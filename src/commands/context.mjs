import { resolveEntity, search } from '../core/retrieval.mjs';
import { maybeSpoolJsonResult } from '../core/result-spool.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { sanitizeSearchQuery } from '../core/string-safety.mjs';

export async function run(argv) {
  const queryParts = [];
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) continue;
    queryParts.push(arg);
  }
  const query = sanitizeSearchQuery(queryParts.join(' ').trim());
  if (!query) {
    console.log('Usage: mm context <id-or-query> [--deep] [--json]');
    return;
  }
  const deep = argv.includes('--deep') || argv.includes('--for-agent');
  const matches = await resolveEntity(query, { limit: 1 });
  if (!matches.length) {
    const fallback = await search(query, { limit: 5, includeBody: deep });
    if (argv.includes('--json')) {
      const payload = await maybeSpoolJsonResult('context', { input: query, matches: fallback }, 30000);
      writeJsonOutput({ ok: true, ...payload.value });
      return;
    }
    fallback.forEach(result => console.log(`${result.rank}. ${result.title} (${result.path})`));
    return;
  }
  const match = matches[0];
  const payload = {
    input: query,
    resolved: match,
    related: deep ? await search(match.title, { limit: 8, includeBody: true }) : [],
  };
  if (argv.includes('--json')) {
    const maybe = await maybeSpoolJsonResult('context', payload, 30000);
    writeJsonOutput({ ok: true, ...maybe.value });
    return;
  }
  console.log(`${match.title} [${match.kind}]`);
  console.log(match.path);
  if (deep && payload.related.length) {
    console.log('\nRelated:');
    payload.related.forEach(result => console.log(`${result.rank}. ${result.title} (${result.path})`));
  }
}
