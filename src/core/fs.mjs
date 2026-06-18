import fs from 'fs/promises';

export async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readFile(path, encoding = 'utf8') {
  return fs.readFile(path, { encoding });
}

export async function stat(path) {
  return fs.stat(path);
}

export async function mkdirp(path) {
  await fs.mkdir(path, { recursive: true });
}

export async function readDirRecursive(root, { filter = () => true, includeDirs = false } = {}) {
  const out = [];
  async function walk(current) {
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        if (includeDirs && filter(full, entry)) out.push(full);
        await walk(full);
        continue;
      }
      if (filter(full, entry)) out.push(full);
    }
  }
  await walk(root);
  return out;
}
