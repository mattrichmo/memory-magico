import { resolveEntity } from '../core/retrieval.mjs';
import { maybeSpoolJsonResult } from '../core/result-spool.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { sanitizeSearchQuery } from '../core/string-safety.mjs';

export async function run(argv) {
  const queryParts = [];
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (['--kind', '--limit'].includes(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) continue;
    queryParts.push(arg);
  }
  const query = sanitizeSearchQuery(queryParts.join(' ').trim());
  const kindFlagIndex = argv.indexOf('--kind');
  const kind = kindFlagIndex !== -1 ? argv[kindFlagIndex + 1] : null;
  const limitFlagIndex = argv.indexOf('--limit');
  const limit = limitFlagIndex !== -1 ? Number(argv[limitFlagIndex + 1]) || 5 : 5;
  if (!query) {
    console.log('Usage: mm resolve <query> [--kind <kind>] [--limit N] [--json]');
    return;
  }
  const matches = await resolveEntity(query, { kind, limit });
  if (argv.includes('--json')) {
    const payload = await maybeSpoolJsonResult('resolve', { input: query, matches }, 20000);
    writeJsonOutput({ ok: true, ...payload.value });
    return;
  }
  if (!matches.length) {
    console.log(`No matches for ${query}`);
    return;
  }
  if (matches.length === 1) {
    const match = matches[0];
    console.log(`${match.id} [${match.kind}] ${match.title} (${match.path})`);
    return;
  }
  for (const match of matches) {
    console.log(`${match.id} [${match.kind}] ${match.title} (${match.path}) ${match.reason ? `- ${match.reason}` : ''}`);
  }
}
