import fs from 'fs/promises';
import path from 'path';
import { atomicWriteText } from './atomic-write.mjs';
import { parseJsonlText, safeParseJson, stringifyJsonStable } from './json-safe.mjs';

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJsonFile(filePath, obj) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await atomicWriteText(filePath, `${stringifyJsonStable(obj)}\n`);
}

export async function readJsonFile(filePath) {
  const txt = await fs.readFile(filePath, 'utf8');
  const invalid = Symbol('invalid-json');
  const parsed = safeParseJson(txt, invalid);
  if (parsed === invalid) {
    throw new Error(`Malformed JSON: ${filePath}`);
  }
  return parsed;
}

export async function appendJsonl(filePath, obj) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const line = JSON.stringify(obj) + '\n';
  await fs.appendFile(filePath, line, 'utf8');
}

export async function readJsonl(filePath, { mode = 'tolerant' } = {}) {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    return parseJsonlText(txt, { mode }).records;
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    if (mode === 'strict') throw err;
    return [];
  }
}

export async function readJsonlStrict(filePath) {
  return readJsonl(filePath, { mode: 'strict' });
}

export async function listJsonFiles(dirPath) {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    return items
      .filter(d => d.isFile() && d.name.endsWith('.json'))
      .map(d => path.join(dirPath, d.name));
  } catch {
    return [];
  }
}
