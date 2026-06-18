import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const toolRoot = path.resolve(__dirname, '..', '..');

function isWorkspaceRoot(dirPath) {
  if (!dirPath) return false;
  const packageFile = path.join(dirPath, 'package.json');
  const binFile = path.join(dirPath, 'bin', 'mm.mjs');
  if (fs.existsSync(packageFile) && fs.existsSync(binFile)) return true;
  return fs.existsSync(path.join(dirPath, 'memory'));
}

function findAncestor(startDir, predicate) {
  let current = path.resolve(startDir);
  while (true) {
    if (predicate(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function findRepoRoot(startDir = process.cwd()) {
  const explicit = process.env.MEMORYMAGICO_REPO_ROOT;
  if (explicit) return path.resolve(explicit);
  return findAncestor(startDir, isWorkspaceRoot) || toolRoot;
}

export const repoRoot = findRepoRoot();
export const memoryRoot = path.join(repoRoot, 'memory');
export const schemasRoot = path.join(toolRoot, 'schemas');

export function join(...parts) {
  return path.join(...parts);
}
