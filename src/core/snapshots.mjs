import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { memoryRoot } from './paths.mjs';
import { mkdirp } from './fs.mjs';
import { atomicWriteText } from './atomic-write.mjs';

const snapshotsRoot = path.join(memoryRoot, '.mm', 'snapshots');

function snapshotId() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '');
  const suffix = crypto.randomBytes(3).toString('hex');
  return `snapshot_${timestamp}_${suffix}`;
}

async function copyEntry(sourcePath, targetPath) {
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.cp(sourcePath, targetPath, { recursive: true, force: true, errorOnExist: false });
    return;
  }
  await mkdirp(path.dirname(targetPath));
  await fs.cp(sourcePath, targetPath, { force: true, errorOnExist: false });
}

async function listSourceEntries() {
  const entries = await fs.readdir(memoryRoot, { withFileTypes: true });
  const sources = [];
  for (const entry of entries) {
    if (entry.name === '.mm') continue;
    sources.push(entry.name);
  }
  const internalSearch = path.join(memoryRoot, '.mm', 'search');
  try {
    const stat = await fs.stat(internalSearch);
    if (stat.isDirectory()) sources.push(path.join('.mm', 'search'));
  } catch {
    // ignore
  }
  return sources.sort();
}

function contentRootFor(snapshotDir) {
  return path.join(snapshotDir, 'content');
}

export async function createSnapshot({ note = '', label = '' } = {}) {
  await mkdirp(snapshotsRoot);
  const id = snapshotId();
  const snapshotDir = path.join(snapshotsRoot, id);
  const contentRoot = contentRootFor(snapshotDir);
  await mkdirp(contentRoot);

  const sources = await listSourceEntries();
  for (const source of sources) {
    const sourcePath = path.join(memoryRoot, source);
    const targetPath = path.join(contentRoot, source);
    await copyEntry(sourcePath, targetPath);
  }

  const manifest = {
    id,
    createdAt: new Date().toISOString(),
    note,
    label,
    sources,
  };
  await atomicWriteText(path.join(snapshotDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function listSnapshots() {
  try {
    const entries = await fs.readdir(snapshotsRoot, { withFileTypes: true });
    const snapshots = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(snapshotsRoot, entry.name, 'manifest.json');
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        snapshots.push({
          ...manifest,
          path: path.relative(memoryRoot, manifestPath),
        });
      } catch {
        snapshots.push({
          id: entry.name,
          createdAt: null,
          note: '',
          label: '',
          sources: [],
          path: path.relative(memoryRoot, manifestPath),
          corrupt: true,
        });
      }
    }
    return snapshots.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  } catch {
    return [];
  }
}

async function removeTargetEntry(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

export async function restoreSnapshot(id) {
  const snapshotDir = path.join(snapshotsRoot, id);
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  const contentRoot = contentRootFor(snapshotDir);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  for (const source of manifest.sources || []) {
    const targetPath = path.join(memoryRoot, source);
    await removeTargetEntry(targetPath);
    const sourcePath = path.join(contentRoot, source);
    await copyEntry(sourcePath, targetPath);
  }
  return manifest;
}

export async function snapshotExists(id) {
  try {
    await fs.access(path.join(snapshotsRoot, id, 'manifest.json'));
    return true;
  } catch {
    return false;
  }
}
