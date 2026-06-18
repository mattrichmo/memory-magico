import { makeId } from '../core/ids.mjs';
import { appendClaim, readClaims, writeClaims } from '../core/claims.mjs';
import { resolveNodeRef } from '../core/entities.mjs';

export async function run(argv) {
  const sub = argv[1] || 'list';
  if (sub === 'add') {
    const subject = argv[2];
    const textParts = [];
    for (let i = 3; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === '--confidence' || arg === '--source') {
        i += 1;
        continue;
      }
      if (arg.startsWith('--')) continue;
      textParts.push(arg);
    }
    const text = textParts.join(' ').trim();
    const confidenceIndex = argv.indexOf('--confidence');
    const confidence = confidenceIndex !== -1 ? argv[confidenceIndex + 1] : 'likely';
    const sourceIndex = argv.indexOf('--source');
    const sourceRefs = sourceIndex !== -1 && argv[sourceIndex + 1]
      ? [await resolveNodeRef(argv[sourceIndex + 1])]
      : [];
    if (!subject || !text) {
      console.log('Usage: mm claim add <subject> <text> [--confidence high|likely|hypothesis|needs_review] [--source raw_...]');
      return;
    }
    const claim = {
      id: makeId('claim'),
      subject,
      text,
      confidence,
      status: 'active',
      sourceRefs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await appendClaim(claim);
    console.log('Added claim:', claim.id);
    return;
  }

  if (sub === 'list') {
    const subject = argv[2];
    const claims = await readClaims();
    const filtered = subject ? claims.filter(claim => claim.subject === subject) : claims;
    if (!filtered.length) {
      console.log('No claims found.');
      return;
    }
    filtered.forEach(claim => {
      const sourceLabel = Array.isArray(claim.sourceRefs) && claim.sourceRefs.length
        ? ` [${claim.sourceRefs.map(ref => ref.id || ref).join(', ')}]`
        : '';
      console.log(`${claim.id} [${claim.confidence}] ${claim.subject}${sourceLabel}: ${claim.text}`);
    });
    return;
  }

  if (sub === 'contradict') {
    const a = argv[2];
    const b = argv[3];
    const reason = argv.slice(4).filter(arg => !arg.startsWith('--')).join(' ').trim();
    if (!a || !b || !reason) {
      console.log('Usage: mm claim contradict <claim-a> <claim-b> <reason>');
      return;
    }
    const claims = await readClaims();
    const now = new Date().toISOString();
    claims.push({
      id: makeId('claim'),
      subject: `contradiction:${a}:${b}`,
      text: reason,
      confidence: 'high',
      status: 'contradiction',
      sourceRefs: [await resolveNodeRef(a), await resolveNodeRef(b)],
      createdAt: now,
      updatedAt: now,
    });
    await writeClaims(claims);
    console.log(`Contradiction recorded between ${a} and ${b}`);
    return;
  }

  console.log('Unknown claim subcommand:', sub);
}
