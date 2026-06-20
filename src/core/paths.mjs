import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const toolRoot = path.resolve(__dirname, '..', '..');

function isWorkspaceRoot(dirPath) {
  if (!dirPath) return false;
  // Explicit marker written by `mm init` — most reliable signal
  if (fs.existsSync(path.join(dirPath, 'memory', '.mm', 'workspace.json'))) return true;
  // Legacy: this tool's own repo (package.json + bin/mm.mjs co-located)
  const packageFile = path.join(dirPath, 'package.json');
  const binFile = path.join(dirPath, 'bin', 'mm.mjs');
  if (fs.existsSync(packageFile) && fs.existsSync(binFile)) return true;
  return false;
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
  return findAncestor(startDir, isWorkspaceRoot) || null;
}

export function requireRepoRoot(startDir = process.cwd()) {
  const root = findRepoRoot(startDir);
  if (!root) {
    console.error('No MemoryMagico workspace found. Run `mm init` to create one.');
    process.exit(1);
  }
  return root;
}

// repoRoot may be null when no workspace exists (e.g. during `mm init`)
export const repoRoot = findRepoRoot() ?? toolRoot;
export const memoryRoot = path.join(repoRoot, 'memory');
export const schemasRoot = path.join(toolRoot, 'schemas');
// Bundled defaults shipped with the package — source of truth for system agent
// roles, seeded into a project's memory/agents/roles/ and refreshed by `mm
// install --update`. Never read project-specific custom roles from here.
export const systemRolesDir = path.join(toolRoot, 'templates', 'agents', 'roles');

export function join(...parts) {
  return path.join(...parts);
}
