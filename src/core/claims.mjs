import fs from 'fs/promises';
import path from 'path';
import { memoryRoot } from './paths.mjs';
import { mkdirp } from './fs.mjs';

const claimsFile = path.join(memoryRoot, 'wiki', 'claims.jsonl');

export async function readClaims() {
  try {
    const txt = await fs.readFile(claimsFile, 'utf8');
    return txt.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

export async function appendClaim(claim) {
  await mkdirp(path.dirname(claimsFile));
  await fs.appendFile(claimsFile, `${JSON.stringify(claim)}\n`, 'utf8');
}

export async function writeClaims(claims) {
  await mkdirp(path.dirname(claimsFile));
  await fs.writeFile(claimsFile, claims.map(claim => JSON.stringify(claim)).join('\n') + (claims.length ? '\n' : ''), 'utf8');
}
