import fs from 'fs/promises';
import path from 'path';
import { exists } from './fs.mjs';
import { sanitizeCliString } from './string-safety.mjs';

export function slugify(input = '') {
  return sanitizeCliString(input)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function uniqueMarkdownPath(dirPath, title, extension = '.md') {
  await fs.mkdir(dirPath, { recursive: true });
  const base = slugify(title) || 'page';
  let candidate = path.join(dirPath, `${base}${extension}`);
  let suffix = 2;
  while (await exists(candidate)) {
    candidate = path.join(dirPath, `${base}-${suffix}${extension}`);
    suffix += 1;
  }
  return candidate;
}
