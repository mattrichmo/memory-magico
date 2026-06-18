import fs from 'fs/promises';
import path from 'path';
import { repoRoot } from '../core/paths.mjs';
import { resolveRepoPath } from '../core/safe-path.mjs';
import { parseJsonlText, safeParseJson, stringifyJsonStable } from '../core/json-safe.mjs';
import { atomicWriteText } from '../core/atomic-write.mjs';
import { withLock } from '../core/lock.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

function parseTailLines(text, limit = 20) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => line.trim())
    .slice(-Math.max(0, limit));
}

function jsonlRepairPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath).replace(/\.jsonl$/i, '');
  return path.join(dir, `${base}.quarantine.jsonl`);
}

async function inspectLedger(filePath, tail = 0) {
  const text = await readTextFile(filePath);
  if (filePath.toLowerCase().endsWith('.jsonl')) {
    const parsed = parseJsonlText(text, { mode: 'tolerant' });
    const tailLines = tail > 0 ? parseTailLines(text, tail) : [];
    return {
      format: 'jsonl',
      path: path.relative(repoRoot, filePath),
      records: parsed.records,
      warnings: parsed.warnings,
      tailLines,
    };
  }

  const value = safeParseJson(text, undefined);
  return {
    format: 'json',
    path: path.relative(repoRoot, filePath),
    valid: value !== undefined || String(text || '').trim() === 'null',
    value,
  };
}

async function repairJsonl(filePath, { quarantineBadLines = false, dryRun = false } = {}) {
  const text = await readTextFile(filePath);
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const records = [];
  const badLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (err) {
      badLines.push({
        line: index + 1,
        raw: line,
        cause: err.message,
        source: path.relative(repoRoot, filePath),
        repairedAt: new Date().toISOString(),
      });
    }
  }

  const repairedText = records.map(record => `${stringifyJsonStable(record)}\n`).join('');
  const quarantinePath = quarantineBadLines ? jsonlRepairPath(filePath) : null;

  if (!dryRun) {
    await atomicWriteText(filePath, repairedText);
    if (quarantinePath) {
      await atomicWriteText(quarantinePath, badLines.map(entry => `${stringifyJsonStable(entry)}\n`).join(''));
    }
  }

  return {
    format: 'jsonl',
    path: path.relative(repoRoot, filePath),
    dryRun,
    quarantinePath: quarantinePath ? path.relative(repoRoot, quarantinePath) : null,
    kept: records.length,
    dropped: badLines.length,
    badLines,
    repaired: badLines.length > 0,
  };
}

export async function run(argv = []) {
  const sub = argv[1] || 'inspect';
  const json = argv.includes('--json');

  if (sub === 'inspect') {
    const target = argv[2];
    if (!target) {
      console.log('Usage: mm ledger inspect <path> [--tail N] [--json]');
      return;
    }
    const filePath = await resolveRepoPath(repoRoot, target, 'repo-read');
    const tailIndex = argv.indexOf('--tail');
    const tail = tailIndex !== -1 ? Number(argv[tailIndex + 1]) || 0 : 0;
    const result = await inspectLedger(filePath, tail);
    if (json) {
      writeJsonOutput({ ok: true, ...result });
      return;
    }
    console.log(`${result.format.toUpperCase()} ledger: ${result.path}`);
    if (result.format === 'jsonl') {
      console.log(`Records: ${result.records.length}`);
      console.log(`Warnings: ${result.warnings.length}`);
      if (result.tailLines.length) {
        console.log('');
        console.log('Tail:');
        for (const line of result.tailLines) console.log(line);
      }
      return;
    }
    console.log(`Valid: ${result.valid ? 'yes' : 'no'}`);
    if (result.value && typeof result.value === 'object') {
      console.log(`Keys: ${Object.keys(result.value).join(', ')}`);
    }
    return;
  }

  if (sub === 'repair') {
    const target = argv[2];
    if (!target) {
      console.log('Usage: mm ledger repair <path> [--quarantine-bad-lines] [--dry-run] [--json]');
      return;
    }
    const filePath = await resolveRepoPath(repoRoot, target, 'repo-write');
    const quarantineBadLines = argv.includes('--quarantine-bad-lines');
    const dryRun = argv.includes('--dry-run');
    const repairResult = await withLock('ledger-repair', () => repairJsonl(filePath, { quarantineBadLines, dryRun }), {
      command: 'mm ledger repair',
    });
    if (json) {
      writeJsonOutput({ ok: true, ...repairResult });
      return;
    }
    if (repairResult.repaired) {
      console.log(`${dryRun ? 'Would repair' : 'Repaired'} ${repairResult.path}`);
      console.log(`Kept ${repairResult.kept} line(s); dropped ${repairResult.dropped}.`);
      if (repairResult.quarantinePath) {
        console.log(`Quarantine: ${repairResult.quarantinePath}`);
      }
      return;
    }
    console.log(`No malformed JSONL lines found in ${repairResult.path}.`);
    return;
  }

  console.log(`Unknown ledger subcommand: ${sub}`);
}
