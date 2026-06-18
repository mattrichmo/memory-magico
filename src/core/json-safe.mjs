import fs from 'fs/promises';
import { MalformedJsonError, MalformedJsonlError } from './errors.mjs';

function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

export function safeParseJson(input, fallback = null) {
  if (input == null) return fallback;
  try {
    return JSON.parse(stripBom(String(input)));
  } catch {
    return fallback;
  }
}

export function stringifyJsonStable(value) {
  const seen = new WeakSet();
  const sort = current => {
    if (!current || typeof current !== 'object') return current;
    if (seen.has(current)) return current;
    seen.add(current);
    if (Array.isArray(current)) return current.map(sort);
    const out = {};
    for (const key of Object.keys(current).sort()) out[key] = sort(current[key]);
    return out;
  };
  return JSON.stringify(sort(value), null, 2);
}

export async function readJsonFileSafe(filePath, fallback = null) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return safeParseJson(text, fallback);
  } catch {
    return fallback;
  }
}

export function parseJsonlText(text, { mode = 'strict' } = {}) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const records = [];
  const warnings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (err) {
      const detail = { line: index + 1, lineText: line, cause: err.message };
      if (mode === 'strict') throw new MalformedJsonlError(`Malformed JSONL at line ${index + 1}.`, { details: detail });
      if (mode === 'tail' && index === 0) continue;
      warnings.push(detail);
    }
  }
  return { records, warnings };
}

export async function readJsonlFileSafe(filePath, { mode = 'strict' } = {}) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return parseJsonlText(text, { mode });
  } catch (err) {
    if (err && err.code === 'ENOENT') return { records: [], warnings: [] };
    throw new MalformedJsonError(`Failed to read JSON file ${filePath}.`, { details: { cause: err.message } });
  }
}

