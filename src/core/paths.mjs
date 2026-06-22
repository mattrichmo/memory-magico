import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const toolRoot = path.resolve(__dirname, '..', '..');
export const projectConfigFile = '.memorymagico.json';
export const memoryManifestFile = path.join('.mm', 'manifest.json');

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function argvValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function isMemoryRoot(dirPath) {
  if (!dirPath) return false;
  if (fs.existsSync(path.join(dirPath, memoryManifestFile))) return true;
  if (fs.existsSync(path.join(dirPath, '.mm', 'workspace.json'))) return true;
  return false;
}

function isLegacyWorkspaceRoot(dirPath) {
  if (!dirPath) return false;
  // Explicit marker written by `mm init` — most reliable signal
  if (fs.existsSync(path.join(dirPath, 'memory', '.mm', 'workspace.json'))) return true;
  if (fs.existsSync(path.join(dirPath, 'memory', memoryManifestFile))) return true;
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

function resolveWorkspaceFromConfig(startDir) {
  const configDir = findAncestor(startDir, dir => fs.existsSync(path.join(dir, projectConfigFile)));
  if (!configDir) return null;
  const configPath = path.join(configDir, projectConfigFile);
  const config = readJsonFile(configPath);
  if (!config || typeof config.memoryRoot !== 'string') {
    console.error(`Invalid MemoryMagico project config at ${configPath}.`);
    console.error('Expected a JSON object with a memoryRoot string.');
    process.exit(1);
  }
  const resolvedMemoryRoot = path.resolve(configDir, config.memoryRoot);
  const manifest = readJsonFile(path.join(resolvedMemoryRoot, memoryManifestFile));
  if (config.workspaceId && !manifest?.workspaceId) {
    console.error(`MemoryMagico manifest missing at ${path.join(resolvedMemoryRoot, memoryManifestFile)}.`);
    console.error(`Config ${configPath} expects workspace ${config.workspaceId}.`);
    process.exit(1);
  }
  if (config.workspaceId && manifest?.workspaceId && config.workspaceId !== manifest.workspaceId) {
    console.error(`MemoryMagico workspace mismatch in ${configPath}.`);
    console.error(`Config expects ${config.workspaceId}, but memory manifest is ${manifest.workspaceId}.`);
    process.exit(1);
  }
  return {
    repoRoot: configDir,
    memoryRoot: resolvedMemoryRoot,
    configPath,
    config,
    manifest,
  };
}

function resolveWorkspaceFromMemoryRoot(memoryRootArg, startDir) {
  const resolvedMemoryRoot = path.resolve(startDir, memoryRootArg);
  if (!isMemoryRoot(resolvedMemoryRoot)) return null;
  const manifest = readJsonFile(path.join(resolvedMemoryRoot, memoryManifestFile));
  return {
    repoRoot: path.dirname(resolvedMemoryRoot),
    memoryRoot: resolvedMemoryRoot,
    configPath: null,
    config: null,
    manifest,
  };
}

export function resolveWorkspace(startDir = process.cwd()) {
  const isInitCommand = process.argv[2] === 'init';
  const cliMemoryRoot = isInitCommand ? null : argvValue('--memory-root');
  if (cliMemoryRoot) {
    const workspace = resolveWorkspaceFromMemoryRoot(cliMemoryRoot, startDir);
    if (workspace) return workspace;
    console.error(`No MemoryMagico workspace found at ${path.resolve(startDir, cliMemoryRoot)}.`);
    process.exit(1);
  }

  const envMemoryRoot = process.env.MEMORYMAGICO_MEMORY_ROOT || process.env.MEMORYMAGICO_ROOT;
  if (envMemoryRoot) {
    const workspace = resolveWorkspaceFromMemoryRoot(envMemoryRoot, startDir);
    if (workspace) return workspace;
    console.error(`No MemoryMagico workspace found at ${path.resolve(startDir, envMemoryRoot)}.`);
    process.exit(1);
  }

  const configured = resolveWorkspaceFromConfig(startDir);
  if (configured) return configured;

  const explicitRepoRoot = process.env.MEMORYMAGICO_REPO_ROOT;
  if (explicitRepoRoot) {
    const root = path.resolve(explicitRepoRoot);
    return { repoRoot: root, memoryRoot: path.join(root, 'memory'), configPath: null, config: null, manifest: null };
  }

  const legacyRoot = findAncestor(startDir, isLegacyWorkspaceRoot);
  if (legacyRoot) {
    return {
      repoRoot: legacyRoot,
      memoryRoot: path.join(legacyRoot, 'memory'),
      configPath: null,
      config: null,
      manifest: readJsonFile(path.join(legacyRoot, 'memory', memoryManifestFile)),
    };
  }

  return null;
}

export function findRepoRoot(startDir = process.cwd()) {
  return resolveWorkspace(startDir)?.repoRoot ?? null;
}

export function requireRepoRoot(startDir = process.cwd()) {
  const workspace = resolveWorkspace(startDir);
  if (!workspace?.repoRoot) {
    console.error('No MemoryMagico workspace found. Run `mm init` to create one.');
    process.exit(1);
  }
  return workspace.repoRoot;
}

// repoRoot may be null when no workspace exists (e.g. during `mm init`)
export const workspace = resolveWorkspace();
export const repoRoot = workspace?.repoRoot ?? process.cwd();
export const memoryRoot = workspace?.memoryRoot ?? path.join(repoRoot, 'memory');
export const schemasRoot = path.join(toolRoot, 'schemas');
// Bundled defaults shipped with the package — source of truth for system agent
// roles, seeded into a project's memory/agents/roles/ and refreshed by `mm
// install --update`. Never read project-specific custom roles from here.
export const systemRolesDir = path.join(toolRoot, 'templates', 'agents', 'roles');

export function join(...parts) {
  return path.join(...parts);
}
