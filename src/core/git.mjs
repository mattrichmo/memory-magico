import path from 'node:path';
import { spawn } from 'node:child_process';
import { repoRoot } from './paths.mjs';
import { resolveRepoPath } from './safe-path.mjs';

const GENERATED_PATH_PREFIXES = [
  'memory/generated/',
  'memory/.mm/search/',
  'memory/.mm/results/',
];

function runGit(args, { cwd = repoRoot } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `git ${args.join(' ')} exited with code ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function parseShortStatus(stdout) {
  return String(stdout || '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => line.replace(/\s+$/, ''));
}

function relativeRepoPath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function isGeneratedRepoPath(filePath) {
  return GENERATED_PATH_PREFIXES.some(prefix => String(filePath || '').startsWith(prefix));
}

export async function readGitStatus() {
  const stdout = await runGit(['status', '--short', '--branch']);
  const lines = parseShortStatus(stdout);
  const changedFiles = lines
    .filter(line => !line.startsWith('##'))
    .map(line => ({
      status: line.slice(0, 2).trim() || '??',
      path: line.slice(3).trim(),
    }));
  const generatedDirtyFiles = changedFiles.filter(file => isGeneratedRepoPath(file.path));
  const authoredDirtyFiles = changedFiles.filter(file => !isGeneratedRepoPath(file.path));
  return {
    cwd: repoRoot,
    branchLine: lines[0] || '',
    lines,
    dirtyFiles: changedFiles.length,
    changedFiles,
    generatedDirtyFiles,
    generatedDirtyCount: generatedDirtyFiles.length,
    authoredDirtyFiles,
    authoredDirtyCount: authoredDirtyFiles.length,
  };
}

export async function readGitLog(targetPath = null, limit = 20) {
  const args = ['log', `--max-count=${Math.max(1, Number(limit) || 20)}`, '--date=iso', '--format=%H%x09%ad%x09%s'];
  if (targetPath) {
    const resolved = await resolveRepoPath(repoRoot, targetPath, 'repo-read');
    args.push('--', relativeRepoPath(resolved));
  }
  const stdout = await runGit(args);
  return parseShortStatus(stdout).map(line => {
    const [sha = '', date = '', subject = ''] = line.split('\t');
    return { sha, date, subject };
  });
}

export async function readGitDiff({ path: targetPath = null, memoryOnly = false, stat = false } = {}) {
  const args = ['diff'];
  if (stat) args.push('--stat');
  if (memoryOnly) {
    args.push('--', 'memory');
  } else if (targetPath) {
    const resolved = await resolveRepoPath(repoRoot, targetPath, 'repo-read');
    args.push('--', relativeRepoPath(resolved));
  }
  return runGit(args);
}

export async function readGitAffected() {
  const status = await readGitStatus();
  return status.changedFiles;
}

export function buildCommitMessage({ title = 'Update MemoryMagico memory', affectedFiles = [], branchLine = '' } = {}) {
  const changed = affectedFiles.slice(0, 8).map(file => `${file.status} ${file.path}`).join(', ');
  const bodyLines = [
    title,
    '',
    changed ? `- ${changed}` : '- workspace changes',
  ];
  if (branchLine) {
    bodyLines.push(`- ${branchLine}`);
  }
  return bodyLines.join('\n');
}
