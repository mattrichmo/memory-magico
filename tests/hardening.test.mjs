import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { detectBinaryType } from '../src/core/binary-detect.mjs';
import { readJsonl } from '../src/core/json.mjs';
import { readMarkdownPage, writeMarkdownPage } from '../src/core/frontmatter.mjs';
import { safeParseJson } from '../src/core/json-safe.mjs';
import { resolveMemoryPath } from '../src/core/safe-path.mjs';
import { memoryRoot } from '../src/core/paths.mjs';
import { getCommand } from '../src/core/command-registry.mjs';
import { indexStatus, rebuildIndex } from '../src/core/retrieval.mjs';

const repoRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('registry exposes commands and aliases', () => {
  assert.ok(getCommand('commands'));
  assert.equal(getCommand('find')?.name, 'search');
});

test('safeParseJson strips a BOM', () => {
  assert.deepEqual(safeParseJson('\uFEFF{"ok":true}'), { ok: true });
});

test('memory path helper rejects traversal', async () => {
  await assert.rejects(() => resolveMemoryPath(memoryRoot, '../outside.md', 'memory-read'));
});

test('mm commands --json is parseable', () => {
  const result = spawnSync('node', ['./bin/mm.mjs', 'commands', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.commands));
  assert.ok(payload.commands.some(command => command.name === 'read'));
});

test('mm read --json is parseable', () => {
  const result = spawnSync('node', ['./bin/mm.mjs', 'read', 'memory/README.md', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.path.endsWith('memory/README.md'), true);
});

test('mm doctor --json is parseable', () => {
  const result = spawnSync('node', ['./bin/mm.mjs', 'doctor', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.checks));
});

test('mm lint --json is parseable', () => {
  const result = spawnSync('node', ['./bin/mm.mjs', 'lint', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(typeof payload.ok, 'boolean');
  assert.ok(payload.summary);
});

test('mm raw list --json is parseable', () => {
  const result = spawnSync('node', ['./bin/mm.mjs', 'raw', 'list', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.items));
});

test('mm ledger inspect and repair are parseable', async () => {
  const ledgerPath = path.join(repoRoot, 'memory', '.tmp-ledger.jsonl');
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, '{"ok":true}\n{"bad":\n', 'utf8');

  try {
    const inspect = spawnSync('node', ['./bin/mm.mjs', 'ledger', 'inspect', 'memory/.tmp-ledger.jsonl', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(inspect.status, 0, inspect.stderr);
    const inspected = JSON.parse(inspect.stdout);
    assert.equal(inspected.ok, true);
    assert.equal(inspected.format, 'jsonl');
    assert.equal(inspected.records.length, 1);

    const repair = spawnSync('node', ['./bin/mm.mjs', 'ledger', 'repair', 'memory/.tmp-ledger.jsonl', '--quarantine-bad-lines', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(repair.status, 0, repair.stderr);
    const repaired = JSON.parse(repair.stdout);
    assert.equal(repaired.ok, true);
    assert.equal(repaired.repaired, true);
    assert.equal(repaired.kept, 1);
  } finally {
    await fs.rm(ledgerPath, { force: true });
    await fs.rm(path.join(repoRoot, 'memory', '.tmp-ledger.quarantine.jsonl'), { force: true });
  }
});

test('mm install supports role selection', () => {
  const result = spawnSync('node', ['./bin/mm.mjs', 'install', 'claude', '--roles', 'memorymagico-orchestrator', '--dry-run'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installing 1 role\(s\) as claude/);
  assert.match(result.stdout, /memorymagico-orchestrator/);
});

test('binary detection checks magic bytes before null-byte fallback', () => {
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x01, 0x02, 0x03,
  ]);
  assert.equal(detectBinaryType(pngHeader), 'image/png');
});

test('strict JSONL parsing fails on malformed rows', async () => {
  const ledgerPath = path.join(repoRoot, 'memory', '.tmp-hardening.jsonl');
  await fs.writeFile(ledgerPath, '{"ok":true}\n{"bad":\n', 'utf8');
  try {
    await assert.rejects(() => readJsonl(ledgerPath, { mode: 'strict' }), /Malformed JSONL/);
  } finally {
    await fs.rm(ledgerPath, { force: true });
  }
});

test('frontmatter round-trips arrays of objects', async () => {
  const pagePath = path.join(repoRoot, 'memory', '.tmp-frontmatter.md');
  const frontmatter = {
    id: 'task_tmp_frontmatter',
    kind: 'task',
    title: 'Frontmatter Round Trip',
    status: 'todo',
    aliases: [],
    tags: [],
    sourceRefs: [],
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    verificationEvidence: [
      {
        at: '2026-06-17T00:00:00.000Z',
        result: 'ok',
        evidenceRefs: ['memory/README.md'],
      },
    ],
    dependencies: {
      blockedByIssueIds: ['issue_123'],
    },
  };

  try {
    await writeMarkdownPage(pagePath, frontmatter, '# Frontmatter Round Trip\n');
    const page = await readMarkdownPage(pagePath);
    assert.deepEqual(page.frontmatter.verificationEvidence, frontmatter.verificationEvidence);
    assert.deepEqual(page.frontmatter.dependencies, frontmatter.dependencies);
  } finally {
    await fs.rm(pagePath, { force: true });
  }
});

test('search index freshness includes work pages', async () => {
  const tempPath = path.join(repoRoot, 'memory', 'work', '.tmp-freshness-test.md');
  const frontmatter = {
    id: 'task_tmp_freshness',
    kind: 'task',
    title: 'Freshness Sentinel',
    status: 'todo',
    aliases: [],
    tags: [],
    sourceRefs: [],
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
  };

  try {
    await writeMarkdownPage(tempPath, frontmatter, '# Freshness Sentinel\n\nThis page is for freshness checks.\n');
    await rebuildIndex();
    const before = await indexStatus();
    assert.equal(before.stale, false);

    await fs.writeFile(tempPath, `${await fs.readFile(tempPath, 'utf8')}\nAdditional freshness marker.\n`, 'utf8');
    const after = await indexStatus();
    assert.equal(after.stale, true);
  } finally {
    await fs.rm(tempPath, { force: true });
    await rebuildIndex();
  }
});
