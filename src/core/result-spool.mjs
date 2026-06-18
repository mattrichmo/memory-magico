import fs from 'fs/promises';
import path from 'path';
import { memoryRoot } from './paths.mjs';
import { atomicWriteJson, atomicWriteText } from './atomic-write.mjs';
import { makeId } from './ids.mjs';
import { stringifyJsonStable } from './json-safe.mjs';

const resultRoot = path.join(memoryRoot, '.mm', 'results');

async function ensureRoot() {
  await fs.mkdir(resultRoot, { recursive: true });
}

export async function spoolResult(command, format, value, preview = null) {
  await ensureRoot();
  const id = makeId('result');
  const ext = format === 'json' ? '.json' : '.md';
  const filePath = path.join(resultRoot, `${id}${ext}`);
  const metaPath = path.join(resultRoot, `${id}.meta.json`);
  if (format === 'json') await atomicWriteJson(filePath, value);
  else await atomicWriteText(filePath, String(value || ''));
  await atomicWriteJson(metaPath, {
    id,
    command,
    format,
    path: path.relative(memoryRoot, filePath),
    previewPath: preview ? path.relative(memoryRoot, path.join(resultRoot, `${id}.preview.json`)) : null,
    createdAt: new Date().toISOString(),
  });
  if (preview !== null) await atomicWriteJson(path.join(resultRoot, `${id}.preview.json`), preview);
  return {
    id,
    path: path.relative(memoryRoot, filePath),
    format,
  };
}

export async function maybeSpoolJsonResult(command, value, maxChars = 30000) {
  const serialized = stringifyJsonStable(value);
  if (serialized.length <= maxChars) {
    return { spooled: false, value };
  }
  const preview = {
    note: 'Result truncated and spooled to disk.',
    preview: serialized.slice(0, 2000),
  };
  const result = await spoolResult(command, 'json', value, preview);
  return {
    spooled: true,
    value: {
      ok: true,
      truncated: true,
      preview,
      fullResult: result,
    },
  };
}

export async function listSpooledResults() {
  await ensureRoot();
  const files = await fs.readdir(resultRoot, { withFileTypes: true }).catch(() => []);
  return files
    .filter(entry => entry.isFile() && entry.name.endsWith('.meta.json'))
    .map(entry => path.join(resultRoot, entry.name));
}

export async function readSpooledResult(id) {
  await ensureRoot();
  const metaPath = path.join(resultRoot, `${id}.meta.json`);
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  const content = await fs.readFile(path.join(resultRoot, path.basename(meta.path)), 'utf8');
  return { meta, content };
}
