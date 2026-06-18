import fs from 'fs/promises';
import path from 'path';
import { PathSafetyError } from './errors.mjs';
import { PATH_POLICIES } from './path-policies.mjs';

function normalizeForComparison(input) {
  return String(input || '').normalize('NFKC').replace(/\\/g, '/');
}

function rejectNullBytes(input) {
  if (String(input || '').includes('\0')) {
    throw new PathSafetyError('Null bytes are not allowed in paths.', { details: { input } });
  }
}

function rejectEncodedTraversal(input) {
  const lower = String(input || '').toLowerCase();
  if (/%2e|%2f|%5c/.test(lower)) {
    throw new PathSafetyError('Encoded traversal is not allowed in paths.', { details: { input } });
  }
}

function rejectBackslashTraversal(input) {
  if (String(input || '').includes('\\')) {
    throw new PathSafetyError('Backslashes are not allowed in relative paths.', { details: { input } });
  }
}

function validateRelativeKey(input) {
  const value = normalizeForComparison(input).trim();
  if (!value) throw new PathSafetyError('Path cannot be empty.', { details: { input } });
  if (path.isAbsolute(value)) throw new PathSafetyError('Absolute paths are not allowed here.', { details: { input } });
  if (value.startsWith('..') || value.includes('/../') || value.includes('../')) {
    throw new PathSafetyError('Path traversal is not allowed.', { details: { input } });
  }
  if (/^[a-zA-Z]:\//.test(value) || /^\/\//.test(value)) {
    throw new PathSafetyError('Absolute or UNC-style paths are not allowed here.', { details: { input } });
  }
  return value;
}

export function assertSafePathSegment(input, label = 'path segment', { allowDot = false } = {}) {
  const value = normalizeForComparison(input).trim();
  if (!value) {
    throw new PathSafetyError(`${label} cannot be empty.`, { details: { input } });
  }
  if (value.includes('/') || value.includes('\\')) {
    throw new PathSafetyError(`${label} must be a single path segment.`, { details: { input } });
  }
  if (value === '.' || value === '..') {
    throw new PathSafetyError(`${label} cannot be a traversal marker.`, { details: { input } });
  }
  const pattern = allowDot ? /^[A-Za-z0-9][A-Za-z0-9._-]*$/ : /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
  if (!pattern.test(value)) {
    throw new PathSafetyError(`${label} contains unsafe characters.`, { details: { input } });
  }
  return value;
}

function isInsidePath(rootPath, candidatePath) {
  const rel = path.relative(rootPath, candidatePath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function realpathDeepestExisting(targetPath) {
  let current = path.resolve(targetPath);
  const suffix = [];
  while (true) {
    try {
      const real = await fs.realpath(current);
      return path.join(real, ...suffix.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(targetPath);
      suffix.push(path.basename(current));
      current = parent;
    }
  }
}

async function assertRealPathInside(rootPath, candidatePath) {
  const resolvedRoot = await fs.realpath(rootPath);
  const resolvedCandidate = await realpathDeepestExisting(candidatePath);
  if (!isInsidePath(resolvedRoot, resolvedCandidate)) {
    throw new PathSafetyError('Path escapes the allowed root.', {
      details: { rootPath: resolvedRoot, candidatePath: resolvedCandidate },
    });
  }
  return resolvedCandidate;
}

async function assertNoSymlinkWrite(targetPath) {
  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      throw new PathSafetyError('Symlink writes are refused by default.', { details: { targetPath } });
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    if (err instanceof PathSafetyError) throw err;
  }
}

async function resolveRelativeUnderRoot(rootPath, input, policy) {
  const key = validateRelativeKey(input);
  const candidate = path.resolve(rootPath, key);
  const resolved = await assertRealPathInside(rootPath, candidate);
  if (policy?.includes('write')) await assertNoSymlinkWrite(resolved);
  return resolved;
}

export async function resolveContainedPath(rootPath, input, policy = PATH_POLICIES.REPO_READ) {
  rejectNullBytes(input);
  rejectEncodedTraversal(input);
  rejectBackslashTraversal(input);
  return resolveRelativeUnderRoot(rootPath, input, policy);
}

export async function resolveRepoPath(repoRoot, input, policy = PATH_POLICIES.REPO_READ) {
  return resolveContainedPath(repoRoot, input, policy);
}

export async function resolveMemoryPath(memoryRoot, input, policy = PATH_POLICIES.MEMORY_READ) {
  return resolveContainedPath(memoryRoot, input, policy);
}

export function resolveExternalSourcePath(input) {
  rejectNullBytes(input);
  return path.resolve(process.cwd(), normalizeForComparison(input));
}

export {
  normalizeForComparison,
  rejectNullBytes,
  rejectEncodedTraversal,
  rejectBackslashTraversal,
  validateRelativeKey,
  realpathDeepestExisting,
  assertRealPathInside,
  assertNoSymlinkWrite,
  isInsidePath,
};
