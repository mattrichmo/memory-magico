import fs from 'fs/promises';
import path from 'path';
import { ensureDir } from './json.mjs';

export async function moveFile(from, to) {
  await ensureDir(path.dirname(to));
  await fs.rename(from, to);
}

export async function readJsonl(filePath) {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    return txt
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

export async function appendLine(filePath, line) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, line + '\n', 'utf8');
}
