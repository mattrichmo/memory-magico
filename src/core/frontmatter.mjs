import fs from 'fs/promises';
import path from 'path';
import { mkdirp } from './fs.mjs';
import { atomicWriteText } from './atomic-write.mjs';
import { sanitizeFrontmatterKey } from './string-safety.mjs';

const INDENT = '  ';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKey(key) {
  return sanitizeFrontmatterKey(key);
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === '[]') return [];
  if (value === '{}') return {};
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'))) {
    try {
      return JSON.parse(value);
    } catch {
      // fall through to plain string
    }
  }
  return value;
}

function parseLines(lines, startIndex = 0, baseIndent = 0) {
  const out = {};
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const indent = line.match(/^ */)[0].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      i += 1;
      continue;
    }
    const trimmed = line.slice(baseIndent);
    const keyMatch = trimmed.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!keyMatch) {
      i += 1;
      continue;
    }
    const key = normalizeKey(keyMatch[1]);
    const rest = keyMatch[2] ?? '';
    if (rest.trim() !== '') {
      out[key] = parseScalar(rest);
      i += 1;
      continue;
    }
    const next = lines[i + 1];
    if (!next) {
      out[key] = null;
      i += 1;
      continue;
    }
    const nextIndent = next.match(/^ */)[0].length;
    if (next.trim().startsWith('- ')) {
      const arr = [];
      i += 1;
      while (i < lines.length) {
        const current = lines[i];
        if (!current.trim()) {
          i += 1;
          continue;
        }
        const currentIndent = current.match(/^ */)[0].length;
        if (currentIndent < baseIndent + 2) break;
        const itemLine = current.slice(baseIndent + 2);
        const itemMatch = itemLine.match(/^- (.*)$/);
        if (!itemMatch) break;
        const item = itemMatch[1];
        arr.push(parseScalar(item));
        i += 1;
      }
      out[key] = arr;
      continue;
    }
    if (nextIndent > baseIndent) {
      const nested = parseLines(lines, i + 1, nextIndent);
      out[key] = nested.value;
      i = nested.nextIndex;
      continue;
    }
    out[key] = null;
    i += 1;
  }
  return { value: out, nextIndex: i };
}

function serializeScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  const text = String(value);
  if (text === '') return '""';
  if (/[:#\n\r]/.test(text) || /^\s|\s$/.test(text)) return JSON.stringify(text);
  return text;
}

function serializeValue(key, value, indentLevel = 0) {
  const indent = INDENT.repeat(indentLevel);
  if (Array.isArray(value)) {
    return `${indent}${key}: ${JSON.stringify(value)}`;
  }
  if (isObject(value)) {
    return `${indent}${key}: ${JSON.stringify(value)}`;
  }
  return `${indent}${key}: ${serializeScalar(value)}`;
}

export function parseMarkdownPage(text = '') {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') {
    return { frontmatter: {}, body: text, errors: [] };
  }
  const closeIndex = lines.indexOf('---', 1);
  if (closeIndex === -1) {
    return { frontmatter: {}, body: text, errors: ['Unclosed frontmatter block.'] };
  }
  const frontmatterLines = lines.slice(1, closeIndex);
  const { value, nextIndex } = parseLines(frontmatterLines, 0, 0);
  const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
  return { frontmatter: value, body, errors: [], frontmatterEnd: nextIndex };
}

export function serializeMarkdownPage(frontmatter = {}, body = '') {
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter || {})) {
    lines.push(serializeValue(key, value));
  }
  lines.push('---');
  if (body) lines.push(body.replace(/\s+$/, ''));
  return `${lines.join('\n')}\n`;
}

export async function readMarkdownPage(filePath) {
  const txt = await fs.readFile(filePath, 'utf8');
  const parsed = parseMarkdownPage(txt);
  return { path: filePath, ...parsed, text: txt };
}

export async function writeMarkdownPage(filePath, frontmatter, body = '') {
  await mkdirp(path.dirname(filePath));
  const content = serializeMarkdownPage(frontmatter, body);
  await atomicWriteText(filePath, content);
}

export async function updateMarkdownFrontmatter(filePath, patch = {}) {
  const page = await readMarkdownPage(filePath);
  const next = { ...(page.frontmatter || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    next[normalizeKey(key)] = value;
  }
  await writeMarkdownPage(filePath, next, page.body);
  return next;
}

export function normalizeFrontmatterKeys(input = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) out[normalizeKey(key)] = value;
  return out;
}
