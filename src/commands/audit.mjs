import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { memoryRoot } from '../core/paths.mjs';
import { buildDashboardData } from '../core/dashboard-data.mjs';
import { indexStatus } from '../core/retrieval.mjs';
import { validateGraph } from '../core/graph-queries.mjs';
import { runCli, runCliJson } from '../core/cli-probe.mjs';
import { resolveMemoryPath } from '../core/safe-path.mjs';
import { resolveRecordJsonPath } from '../core/records.mjs';
import { readJsonl } from '../core/json.mjs';
import { scanMarkdownPages } from '../core/pages.mjs';
import { ENUMS, assertEnum } from '../core/guards.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const json = argv.includes('--json');
  const [dashboard, index, graph, lint] = await Promise.all([
    buildDashboardData(),
    indexStatus(),
    validateGraph(),
    runCliJson(['lint']),
  ]);

  const infoResult = (() => {
    const result = runCli(['info', '--json']);
    try {
      const payload = result.stdout ? JSON.parse(result.stdout) : null;
      return {
        name: 'json-contract',
        ok: result.status !== 0 && payload?.error?.code === 'UNSUPPORTED_JSON_OUTPUT',
        status: result.status,
        errorCode: payload?.error?.code || null,
      };
    } catch (error) {
      return { name: 'json-contract', ok: false, error: error?.message || String(error) };
    }
  })();

  const pathResult = await (async () => {
    try {
      await resolveMemoryPath(memoryRoot, '../outside.md', 'memory-read');
      return { name: 'path-safety', ok: false, error: 'path traversal was not rejected' };
    } catch (error) {
      return { name: 'path-safety', ok: true, error: error?.message || String(error) };
    }
  })();

  const recordResult = await (async () => {
    try {
      await resolveRecordJsonPath(path.join(memoryRoot, 'work', 'tasks'), '../../../package', 'memory-write');
      return { name: 'record-path-safety', ok: false, error: 'record path traversal was not rejected' };
    } catch (error) {
      return { name: 'record-path-safety', ok: true, error: error?.message || String(error) };
    }
  })();

  const enumResult = await (async () => {
    try {
      assertEnum('banana', ENUMS.rawSourceType, 'raw source type');
      return { name: 'enum-safety', ok: false, error: 'invalid enum was not rejected' };
    } catch (error) {
      return { name: 'enum-safety', ok: true, error: error?.message || String(error) };
    }
  })();

  const largeFileResult = await (async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-audit-'));
    try {
      const largeFile = path.join(tmpDir, 'oversize.txt');
      const fakeImage = path.join(tmpDir, 'fake.png');
      await fs.writeFile(largeFile, 'x'.repeat(2048), 'utf8');
      await fs.writeFile(fakeImage, 'not an image', 'utf8');
      const addResult = runCli(['add', largeFile, '--max-bytes', '1']);
      const imageResult = runCli(['image', 'encode', fakeImage, '--max-bytes', '1024']);
      const ok = addResult.status !== 0 && /exceeds/i.test(`${addResult.stdout}\n${addResult.stderr}`) && imageResult.status !== 0 && /unsupported image file/i.test(`${imageResult.stdout}\n${imageResult.stderr}`);
      return {
        name: 'large-file-guardrails',
        ok,
        addStatus: addResult.status,
        imageStatus: imageResult.status,
      };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  })();

  const promptMarkerResult = await (async () => {
    const markers = [
      /ignore previous instructions/i,
      /system prompt/i,
      /prompt injection/i,
      /developer message/i,
    ];
    const hits = [];
    const pages = await scanMarkdownPages([path.join(memoryRoot, 'wiki'), path.join(memoryRoot, 'work')]);
    for (const page of pages) {
      const haystack = [page.title, page.body, page.frontmatter?.summary, page.frontmatter?.description, page.frontmatter?.why, page.frontmatter?.goal].filter(Boolean).join('\n');
      for (const marker of markers) {
        if (marker.test(haystack)) hits.push({ path: page.path, marker: String(marker) });
      }
    }
    const rawItems = await readJsonl(path.join(memoryRoot, 'inbox', 'raw-items.jsonl'));
    for (const item of rawItems) {
      const haystack = [item.title, item.summary, item.sourceType].filter(Boolean).join('\n');
      for (const marker of markers) {
        if (marker.test(haystack)) hits.push({ path: `memory/inbox/raw-items.jsonl:${item.id}`, marker: String(marker) });
      }
    }
    return { name: 'prompt-markers', ok: hits.length === 0, hits };
  })();

  const results = [infoResult, pathResult, recordResult, enumResult, largeFileResult, promptMarkerResult];
  const checks = [
    { name: 'dashboard', ok: Boolean(dashboard?.generatedAt && dashboard?.summary) },
    { name: 'index', ok: index.ready },
    { name: 'graph', ok: graph.ok },
    { name: 'lint', ok: Boolean(lint.payload?.ok) },
    ...results.map(result => ({ name: result.name, ok: result.ok, ...(result.error ? { error: result.error } : {}) })),
  ];
  const ok = checks.every(check => check.ok);
  const payload = {
    ok,
    dashboard,
    index,
    graph,
    lint: lint.payload,
    checks,
  };

  if (json) {
    writeJsonOutput(payload);
    return;
  }

  console.log(ok ? 'Audit passed.' : 'Audit found issues.');
  checks.forEach(check => console.log(`${check.ok ? 'OK ' : 'FAIL'} ${check.name}`));
  if (!ok) process.exitCode = 2;
}
