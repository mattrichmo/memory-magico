import fs from 'fs/promises';
import path from 'path';
import { projectConfigFile } from './paths.mjs';
import { mkdirp } from './fs.mjs';
import { atomicWriteText } from './atomic-write.mjs';

function relativeJsonPath(fromDir, targetPath) {
  let rel = path.relative(fromDir, targetPath).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

export async function writeProjectConfig(projectRoot, memoryRoot, workspaceId, { force = false } = {}) {
  await mkdirp(projectRoot);
  const configPath = path.join(projectRoot, projectConfigFile);
  const realProjectRoot = await fs.realpath(projectRoot).catch(() => path.resolve(projectRoot));
  const realMemoryRoot = await fs.realpath(memoryRoot).catch(() => path.resolve(memoryRoot));
  const payload = {
    schemaVersion: 1,
    memoryRoot: relativeJsonPath(realProjectRoot, realMemoryRoot),
    workspaceId,
  };
  try {
    const existing = JSON.parse(await fs.readFile(configPath, 'utf8'));
    if (!force && existing.workspaceId && existing.workspaceId !== workspaceId) {
      throw new Error(`${projectConfigFile} already points at ${existing.workspaceId}. Use --force to replace it.`);
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err;
  }
  await atomicWriteText(configPath, `${JSON.stringify(payload, null, 2)}\n`);
  return configPath;
}
