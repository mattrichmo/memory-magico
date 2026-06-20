import fs from 'fs/promises';
import path from 'path';
import { memoryRoot, repoRoot } from './paths.mjs';
import { exists, mkdirp } from './fs.mjs';

export const canonicalDirs = [
  'README.md',
  'AGENTS.md',
  'raw',
  path.join('raw', 'sources'),
  path.join('raw', 'assets'),
  path.join('raw', 'processed'),
  path.join('raw', 'rejected'),
  path.join('wiki'),
  path.join('wiki', 'concepts'),
  path.join('wiki', 'decisions'),
  path.join('wiki', 'glossary'),
  path.join('wiki', 'people'),
  path.join('wiki', 'products'),
  path.join('wiki', 'projects'),
  path.join('wiki', 'systems'),
  path.join('wiki', 'processes'),
  path.join('wiki', 'sources'),
  path.join('wiki', 'synthesis'),
  path.join('work'),
  path.join('work', 'initiatives'),
  path.join('work', 'sprints'),
  path.join('work', 'phases'),
  path.join('work', 'tasks'),
  path.join('work', 'issues'),
  path.join('work', 'discoveries'),
  path.join('work', 'comments'),
  path.join('work', 'containers'),
  'graph',
  'build-log',
  'generated',
  path.join('.mm', 'search'),
];

export async function ensureWorkspaceStructure(targetRoot) {
  const root = targetRoot ?? memoryRoot;
  await mkdirp(root);
  // Write workspace marker so `findRepoRoot` detects this as a valid workspace
  const markerDir = path.join(root, '.mm');
  await mkdirp(markerDir);
  const markerPath = path.join(markerDir, 'workspace.json');
  try { await fs.access(markerPath); } catch {
    await fs.writeFile(markerPath, JSON.stringify({ version: 1, created: new Date().toISOString() }, null, 2) + '\n', 'utf8');
  }
  for (const rel of canonicalDirs) {
    const full = path.join(root, rel);
    if (path.extname(rel) === '.md') continue;
    await mkdirp(full);
  }
  await mkdirp(path.join(root, 'raw'));
  await mkdirp(path.join(root, 'inbox'));
  await mkdirp(path.join(root, 'inbox', 'raw'));
  await mkdirp(path.join(root, 'inbox', 'processed'));
  await mkdirp(path.join(root, 'inbox', 'rejected'));
  await mkdirp(path.join(root, 'issues'));
  await mkdirp(path.join(root, 'issues', 'containers'));
  await mkdirp(path.join(root, 'issues', 'comments'));
  await mkdirp(path.join(root, 'issues', 'issues'));
  await mkdirp(path.join(root, 'issues', 'relationships'));
}

export async function workspaceExists() {
  return exists(memoryRoot);
}

export function workspacePaths() {
  return {
    repoRoot,
    memoryRoot,
    wikiRoot: path.join(memoryRoot, 'wiki'),
    workRoot: path.join(memoryRoot, 'work'),
    generatedRoot: path.join(memoryRoot, 'generated'),
    searchRoot: path.join(memoryRoot, '.mm', 'search'),
    rawRoot: path.join(memoryRoot, 'inbox', 'raw'),
  };
}

export async function writeWorkspaceStarterFiles(targetRoot) {
  const root = targetRoot ?? memoryRoot;
  const files = {
    'README.md': `# Memory\n\nCanonical memory lives in Markdown pages with YAML frontmatter.\n`,
    'AGENTS.md': `# Agent Rules\n\n- Raw sources are immutable.\n- Wiki pages are canonical.\n- Use the CLI to resolve, search, and update memory.\n`,
    'wiki/index.md': `# Memory Index\n\n## Overview\n\n## Concepts\n\n## Decisions\n\n## Systems\n\n## Projects\n\n## Processes\n\n## Sources\n\n## Synthesis\n\n## Open Questions\n\n## Work\n`,
    'wiki/log.md': `# Memory Log\n\n## [${new Date().toISOString()}] init | Memory initialized\n\n- Tool: MemoryMagico\n`,
    'wiki/overview.md': `# Overview\n\nThis workspace stores living memory.\n`,
    'wiki/open-questions.md': `# Open Questions\n\n- What remains unresolved?\n`,
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdirp(path.dirname(full));
    try {
      await fs.access(full);
    } catch {
      await fs.writeFile(full, content, 'utf8');
    }
  }
}
