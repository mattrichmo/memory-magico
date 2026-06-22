import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import readline from 'readline/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { projectConfigFile } from '../core/paths.mjs';
import { ensureWorkspaceStructure, writeWorkspaceStarterFiles } from '../core/workspace.mjs';
import { mkdirp } from '../core/fs.mjs';
import { atomicWriteText } from '../core/atomic-write.mjs';
import { withLock } from '../core/lock.mjs';
import { writeProjectConfig } from '../core/project-config.mjs';
import { installRoles } from './install.mjs';

const execFileAsync = promisify(execFile);

const colorEnabled = process.stdout.isTTY || process.env.FORCE_COLOR;
const color = {
  cyan: text => colorEnabled ? `\x1b[36m${text}\x1b[0m` : text,
  green: text => colorEnabled ? `\x1b[32m${text}\x1b[0m` : text,
  yellow: text => colorEnabled ? `\x1b[33m${text}\x1b[0m` : text,
  bold: text => colorEnabled ? `\x1b[1m${text}\x1b[0m` : text,
  dim: text => colorEnabled ? `\x1b[2m${text}\x1b[0m` : text,
};

const legacyScaffold = [
  ['inbox/raw-items.jsonl', ''],
  ['issues/index.jsonl', ''],
  ['issues/relationships.jsonl', ''],
  ['discoveries/index.jsonl', ''],
  ['sprints/index.jsonl', ''],
  ['phases/index.jsonl', ''],
  ['tasks/index.jsonl', ''],
  ['initiatives/index.jsonl', ''],
  ['issues/containers', null],
  ['issues/issues', null],
  ['issues/comments', null],
  ['discoveries/items', null],
  ['sprints/items', null],
  ['phases/items', null],
  ['tasks/items', null],
  ['initiatives/items', null],
  ['build-log/events.jsonl', ''],
];

async function ensureLegacyScaffold(targetMemoryRoot) {
  for (const [rel, content] of legacyScaffold) {
    const full = path.join(targetMemoryRoot, rel);
    if (content === null) {
      await mkdirp(full);
      continue;
    }
    await mkdirp(path.dirname(full));
    try {
      await fs.access(full);
    } catch {
      await atomicWriteText(full, content);
    }
  }
}

function expandPath(input, base = process.cwd()) {
  if (!input) return base;
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return path.resolve(base, input);
}

function isInteractive() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

async function prompt(rl, question, defaultValue) {
  const hint = defaultValue ? color.dim(` [${defaultValue}]`) : '';
  const answer = await rl.question(`${question}${hint}: `);
  return answer.trim() || defaultValue || '';
}

async function promptYesNo(rl, question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await rl.question(`${question} ${color.dim(`[${hint}]`)}: `);
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed) return defaultYes;
  return trimmed === 'y' || trimmed === 'yes';
}

async function promptChoice(rl, question, choices) {
  console.log(`\n${color.bold(question)}`);
  choices.forEach((choice, i) => {
    const marker = i === 0 ? color.green(' recommended') : '';
    console.log(`  ${color.cyan(String(i + 1))}. ${choice.label}${marker}`);
    if (choice.detail) console.log(`     ${color.dim(choice.detail)}`);
  });
  const answer = await rl.question(`  ${color.dim('Enter choice [1]')}: `);
  const n = parseInt(answer.trim(), 10);
  if (!answer.trim() || n === 1) return choices[0].value;
  if (n >= 1 && n <= choices.length) return choices[n - 1].value;
  return choices[0].value;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepo(dirPath) {
  try {
    await execFileAsync('git', ['-C', dirPath, 'rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

async function gitTopLevel(dirPath) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dirPath, 'rev-parse', '--show-toplevel']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function findChildGitRepos(root, maxEntries = 80) {
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const repos = [];
  for (const entry of entries.slice(0, maxEntries)) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const candidate = path.join(root, entry.name);
    if (await isGitRepo(candidate)) repos.push(candidate);
  }
  return repos.sort((a, b) => a.localeCompare(b));
}

async function detectExistingMemory(targetMemoryRoot) {
  return exists(targetMemoryRoot);
}

async function readWorkspaceId(memoryRoot) {
  const manifestPath = path.join(memoryRoot, '.mm', 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf8');
  return JSON.parse(raw).workspaceId;
}

async function ensureGitRepo(root, { init = false } = {}) {
  if (await isGitRepo(root)) return 'exists';
  if (!init) return 'missing';
  await mkdirp(root);
  await execFileAsync('git', ['init', root]);
  return 'created';
}

function workspaceNameFor(memoryRoot) {
  const base = path.basename(path.dirname(memoryRoot)) || path.basename(memoryRoot) || 'memory';
  return base.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

export async function run(argv) {
  const force = argv.includes('--force');
  const yes = argv.includes('--yes') || argv.includes('-y');
  const skipAgentInstall = argv.includes('--skip-agent-install');
  const separateGitFlag = argv.includes('--separate-git') || argv.includes('--standalone');
  const inRepoFlag = argv.includes('--in-repo-memory') || argv.includes('--existing');
  const projectRootArg = argValue(argv, '--project-root');
  const memoryRootArg = argValue(argv, '--memory-root') || argValue(argv, '--root');
  const installRootArg = argValue(argv, '--install-root') || argValue(argv, '--agent-root');

  const interactive = !yes && isInteractive();
  let rl;
  if (interactive) rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const cwd = process.cwd();
    const cwdGitRoot = await gitTopLevel(cwd);
    const childRepos = await findChildGitRepos(cwd);

    let projectRoot = projectRootArg ? expandPath(projectRootArg) : cwdGitRoot || cwd;

    if (interactive) {
      console.log(`\n${color.bold('MemoryMagico setup')}`);
      console.log(color.dim('Create a memory workspace and bind one repo to it with .memorymagico.json.\n'));

      const choices = [];
      if (cwdGitRoot) {
        choices.push({
          value: cwdGitRoot,
          label: `Use current git repo: ${path.basename(cwdGitRoot)}`,
          detail: cwdGitRoot,
        });
      }
      for (const repo of childRepos) {
        choices.push({
          value: repo,
          label: `Use child repo: ${path.basename(repo)}`,
          detail: repo,
        });
      }
      choices.push({ value: cwd, label: `Use current directory: ${path.basename(cwd) || cwd}`, detail: cwd });
      projectRoot = await promptChoice(rl, 'Which repo should receive .memorymagico.json?', choices);
    }

    const projectHasGit = await isGitRepo(projectRoot);
    if (!projectHasGit && childRepos.length && !projectRootArg && !interactive) {
      console.log(`No git repo found at ${projectRoot}. Child repos detected:`);
      for (const repo of childRepos) console.log(`  - ${repo}`);
      console.log('Re-run with --project-root <repo> to bind memory to one of them.');
      process.exitCode = 2;
      return;
    }

    let placement = separateGitFlag ? 'separate' : inRepoFlag ? 'included' : null;
    if (!placement && interactive) {
      const defaultSeparate = childRepos.length > 0 || path.resolve(projectRoot) !== path.resolve(cwd);
      const parent = path.dirname(projectRoot);
      const separateDefault = path.join(parent, 'memory');
      placement = await promptChoice(rl, 'Where should the memory folder live?', [
        ...(defaultSeparate ? [{
          value: 'separate',
          label: `Sibling memory repo/folder: ${separateDefault}`,
          detail: 'Best when a top-level folder contains one or more repos.',
        }] : []),
        {
          value: 'included',
          label: `Inside the selected repo: ${path.join(projectRoot, 'memory')}`,
          detail: 'Memory changes live in the same git history as the repo.',
        },
        ...(!defaultSeparate ? [{
          value: 'separate',
          label: `Sibling memory repo/folder: ${separateDefault}`,
          detail: 'Keeps memory in a separate git history next to the repo.',
        }] : []),
      ]);
    }
    placement ||= 'separate';

    let memoryRoot = memoryRootArg
      ? expandPath(memoryRootArg)
      : placement === 'included'
        ? path.join(projectRoot, 'memory')
        : path.join(path.dirname(projectRoot), 'memory');

    if (interactive && !memoryRootArg) {
      const rawMemoryRoot = await prompt(rl, 'Memory folder path', memoryRoot);
      memoryRoot = expandPath(rawMemoryRoot);
    }

    const separateGit = placement === 'separate';
    if (placement === 'included' && !projectHasGit) {
      console.log(`${color.yellow('Cannot include memory in this project because it is not a git repo.')}`);
      if (childRepos.length) {
        console.log('Detected child repos:');
        for (const repo of childRepos) console.log(`  - ${repo}`);
      }
      console.log('Choose --project-root <repo> or use --separate-git.');
      process.exitCode = 2;
      return;
    }

    const memoryExists = await detectExistingMemory(memoryRoot);
    if (memoryExists && !force) {
      if (interactive) {
        console.log(`\n${color.yellow('Existing memory folder detected:')} ${memoryRoot}`);
        const proceed = await promptYesNo(rl, 'Re-use it without overwriting existing files?', true);
        if (!proceed) {
          console.log('\nAborted.');
          return;
        }
      } else {
        console.log(`Memory folder already exists at ${memoryRoot}. Use --force to re-initialize missing files.`);
        return;
      }
    }

    let agentTarget = null;
    let installRoot = installRootArg ? expandPath(installRootArg) : projectRoot;
    if (!skipAgentInstall) {
      if (interactive) {
        agentTarget = await promptChoice(rl, 'Install agent integration?', [
          { value: 'claude', label: 'Claude Code', detail: '.claude/agents/ and .claude/commands/' },
          { value: 'codex', label: 'Codex', detail: '.agents/skills/' },
          { value: 'all', label: 'Both', detail: 'Install both generated surfaces.' },
          { value: 'none', label: 'Skip', detail: 'Only create memory workspace and pointer.' },
        ]);
        if (agentTarget === 'none') agentTarget = null;
        if (agentTarget && !installRootArg) {
          const parentRoot = path.dirname(memoryRoot);
          installRoot = await promptChoice(rl, 'Where should generated agent files be installed?', [
            { value: projectRoot, label: `Selected project repo: ${path.basename(projectRoot)}`, detail: projectRoot },
            { value: parentRoot, label: `Top-level folder beside memory: ${path.basename(parentRoot)}`, detail: parentRoot },
            { value: cwd, label: `Current directory: ${path.basename(cwd) || cwd}`, detail: cwd },
          ]);
        }
      } else {
        agentTarget = 'claude';
      }
    }

    if (interactive) {
      console.log(`\n${color.bold('Plan')}`);
      console.log(`  ${color.green('project')} ${projectRoot}`);
      console.log(`  ${color.green('memory')}  ${memoryRoot}`);
      console.log(`  ${color.green('config')}  ${path.join(projectRoot, projectConfigFile)}`);
      console.log(`  ${color.green('mode')}    ${separateGit ? 'separate memory git repo/folder' : 'included in selected repo'}`);
      if (agentTarget) console.log(`  ${color.green('agents')}  ${agentTarget} at ${installRoot}`);
      const go = await promptYesNo(rl, '\nProceed?', true);
      if (!go) {
        console.log('\nAborted.');
        return;
      }
    }

    if (rl) { rl.close(); rl = null; }

    await withLock('workspace-write', async () => {
      console.log('');

      if (separateGit) {
        const state = await ensureGitRepo(memoryRoot, { init: true });
        process.stdout.write(`  ${color.green('✓')} memory git repo ${state === 'created' ? 'initialized' : 'already exists'}\n`);
      }

      await ensureWorkspaceStructure(memoryRoot, { name: workspaceNameFor(memoryRoot) });
      await writeWorkspaceStarterFiles(memoryRoot);
      await ensureLegacyScaffold(memoryRoot);
      process.stdout.write(`  ${color.green('✓')} memory workspace ready at ${memoryRoot}\n`);

      const workspaceId = await readWorkspaceId(memoryRoot);
      const configPath = await writeProjectConfig(projectRoot, memoryRoot, workspaceId, { force });
      process.stdout.write(`  ${color.green('✓')} project pointer written at ${configPath}\n`);

      if (agentTarget) {
        if (path.resolve(installRoot) !== path.resolve(projectRoot)) {
          const installConfigPath = await writeProjectConfig(installRoot, memoryRoot, workspaceId, { force });
          process.stdout.write(`  ${color.green('✓')} agent-root pointer written at ${installConfigPath}\n`);
        }
        await installRoles(agentTarget, installRoot, {
          roleFilter: ['memorymagico-orchestrator'],
          sourceMemoryRoot: memoryRoot,
          memoryRoot,
          workspaceId,
          forceConfig: force,
        });
        process.stdout.write(`  ${color.green('✓')} agent integration installed in ${installRoot}\n`);
      }

      console.log(`\n${color.bold('Done')}`);
      console.log(`  cd ${installRoot}`);
      console.log('  mm doctor');
      console.log('  mm info\n');
    }, { command: 'mm init', root: memoryRoot });
  } finally {
    if (rl) rl.close();
  }
}
