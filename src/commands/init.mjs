import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import readline from 'readline/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { toolRoot } from '../core/paths.mjs';
import { ensureWorkspaceStructure, writeWorkspaceStarterFiles } from '../core/workspace.mjs';
import { mkdirp } from '../core/fs.mjs';
import { atomicWriteText } from '../core/atomic-write.mjs';
import { withLock } from '../core/lock.mjs';
import { installRoles } from './install.mjs';

const execFileAsync = promisify(execFile);

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

function expandPath(p) {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
}

function isInteractive() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

async function prompt(rl, question, defaultValue) {
  const hint = defaultValue ? ` [${defaultValue}]` : '';
  const answer = await rl.question(`${question}${hint}: `);
  return answer.trim() || defaultValue || '';
}

async function promptYesNo(rl, question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await rl.question(`${question} [${hint}]: `);
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed) return defaultYes;
  return trimmed === 'y' || trimmed === 'yes';
}

async function promptChoice(rl, question, choices) {
  console.log(`\n${question}`);
  choices.forEach(([, label], i) => {
    const marker = i === 0 ? ' (recommended)' : '';
    console.log(`  ${i + 1}) ${label}${marker}`);
  });
  const answer = await rl.question(`  Enter choice [1]: `);
  const n = parseInt(answer.trim(), 10);
  if (!answer.trim() || n === 1) return choices[0][0];
  if (n >= 1 && n <= choices.length) return choices[n - 1][0];
  return choices[0][0];
}

async function detectExistingMemory(targetMemoryRoot) {
  try {
    await fs.access(targetMemoryRoot);
    return true;
  } catch {
    return false;
  }
}

async function getToolRef() {
  // Check if published on npm; if not, use a file: reference so npm install works locally
  try {
    await execFileAsync('npm', ['view', 'memorymagico', 'version']);
    const pkgPath = path.join(toolRoot, 'package.json');
    const raw = await fs.readFile(pkgPath, 'utf8');
    const { version } = JSON.parse(raw);
    return `^${version ?? '0.1.0'}`;
  } catch {
    return `file:${toolRoot}`;
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

async function scaffoldStandaloneRepo(selectedRoot, workspaceName, skipNpmInstall) {
  await mkdirp(selectedRoot);

  // git init (idempotent)
  const alreadyGit = await isGitRepo(selectedRoot);
  if (!alreadyGit) {
    await execFileAsync('git', ['init', selectedRoot]);
    process.stdout.write('  ✓ git init\n');
  } else {
    process.stdout.write('  ✓ git repo already exists\n');
  }

  // package.json
  const pkgPath = path.join(selectedRoot, 'package.json');
  try {
    await fs.access(pkgPath);
    process.stdout.write('  ✓ package.json already exists\n');
  } catch {
    const toolRef = await getToolRef();
    const pkg = {
      name: workspaceName,
      version: '1.0.0',
      private: true,
      description: 'Memory workspace',
      scripts: { mm: 'mm' },
      devDependencies: { memorymagico: toolRef },
    };
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    process.stdout.write('  ✓ package.json written\n');
  }

  // .gitignore
  const gitignorePath = path.join(selectedRoot, '.gitignore');
  try {
    await fs.access(gitignorePath);
  } catch {
    await fs.writeFile(gitignorePath, 'node_modules/\n.mm/\n', 'utf8');
    process.stdout.write('  ✓ .gitignore written\n');
  }

  // npm install
  if (!skipNpmInstall) {
    process.stdout.write('  → npm install...\n');
    try {
      await execFileAsync('npm', ['install'], { cwd: selectedRoot });
      process.stdout.write('  ✓ npm install complete\n');
    } catch (err) {
      process.stdout.write(`  ⚠ npm install failed: ${err.message?.split('\n')[0]}\n`);
      process.stdout.write('    Run `npm install` manually inside the workspace.\n');
    }
  }
}

export async function run(argv) {
  const force = argv.includes('--force');
  const yes = argv.includes('--yes') || argv.includes('-y');
  const skipAgentInstall = argv.includes('--skip-agent-install');
  const skipNpmInstall = argv.includes('--skip-npm-install');
  const standaloneFlag = argv.includes('--standalone');
  const existingFlag = argv.includes('--existing');

  // Parse --root <path>
  const rootIdx = argv.indexOf('--root');
  const rootArg = rootIdx !== -1 ? argv[rootIdx + 1] : null;

  const interactive = !yes && isInteractive();

  let rl;
  if (interactive) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }

  try {
    // ── Step 1: Where ─────────────────────────────────────────────────────────
    let selectedRoot;

    if (rootArg) {
      selectedRoot = expandPath(rootArg);
    } else if (interactive) {
      console.log('\nWelcome to MemoryMagico!\n');
      const raw = await prompt(rl, 'Where should the workspace be created?', process.cwd());
      selectedRoot = expandPath(raw);
    } else {
      selectedRoot = process.cwd();
    }

    const targetMemoryRoot = path.join(selectedRoot, 'memory');
    const workspaceName = path.basename(selectedRoot).replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'memory';

    // ── Step 2: Standalone repo or existing project ───────────────────────────
    let mode; // 'standalone' | 'existing'

    if (standaloneFlag) {
      mode = 'standalone';
    } else if (existingFlag) {
      mode = 'existing';
    } else if (interactive) {
      mode = await promptChoice(rl, 'What kind of setup is this?', [
        ['standalone', 'Standalone memory repo  (git init + package.json)'],
        ['existing',   'Add memory/ to an existing project'],
      ]);
    } else {
      mode = 'standalone';
    }

    // ── Step 3: Check for existing memory ────────────────────────────────────
    const memoryExists = await detectExistingMemory(targetMemoryRoot);
    if (memoryExists && !force) {
      if (interactive) {
        console.log(`\n  A workspace already exists at ${targetMemoryRoot}`);
        const overwrite = await promptYesNo(rl, '  Re-initialize (existing files will not be overwritten)?', false);
        if (!overwrite) {
          console.log('\nAborted.');
          return;
        }
      } else {
        console.log(`Workspace already exists at ${targetMemoryRoot}. Use --force to re-initialize.`);
        return;
      }
    }

    // ── Step 4: What to install ───────────────────────────────────────────────
    let agentTarget = null;
    if (!skipAgentInstall) {
      if (interactive) {
        agentTarget = await promptChoice(rl, 'Install agent integration for:', [
          ['claude', 'Claude Code  (.claude/agents/ + .claude/commands/)'],
          ['codex',  'Codex        (.agents/skills/)'],
          ['all',    'Both'],
          ['none',   'Skip'],
        ]);
        if (agentTarget === 'none') agentTarget = null;
      } else {
        agentTarget = 'claude';
      }
    }

    // ── Step 5: Confirm ───────────────────────────────────────────────────────
    if (interactive) {
      console.log('\nPlan:');
      if (mode === 'standalone') {
        console.log(`  • git init + package.json in ${selectedRoot}`);
      }
      console.log(`  • memory/ at ${targetMemoryRoot}`);
      if (agentTarget) console.log(`  • Agent integration: ${agentTarget}`);

      const go = await promptYesNo(rl, '\nProceed?', true);
      if (!go) {
        console.log('\nAborted.');
        return;
      }
    }

    if (rl) { rl.close(); rl = null; }

    // ── Step 6: Execute ───────────────────────────────────────────────────────
    await withLock('workspace-write', async () => {
      console.log('');

      if (mode === 'standalone') {
        await scaffoldStandaloneRepo(selectedRoot, workspaceName, skipNpmInstall);
      }

      await ensureWorkspaceStructure(targetMemoryRoot);
      await writeWorkspaceStarterFiles(targetMemoryRoot);
      await ensureLegacyScaffold(targetMemoryRoot);
      process.stdout.write(`  ✓ memory/ created at ${targetMemoryRoot}\n`);

      if (agentTarget) {
        await installRoles(agentTarget, selectedRoot, { roleFilter: ['memorymagico-orchestrator'] });
        process.stdout.write(`  ✓ Agent integration installed (${agentTarget})\n`);
      }

      console.log('\nDone!\n');
      if (mode === 'standalone') {
        console.log(`  cd ${selectedRoot}`);
        console.log('  npx mm doctor\n');
      } else {
        console.log(`  Run \`mm doctor\` from ${selectedRoot}`);
        if (selectedRoot !== process.cwd()) {
          console.log(`  Tip: set MEMORYMAGICO_REPO_ROOT=${selectedRoot} if mm is installed globally.\n`);
        }
      }
    }, { command: 'mm init' });

  } finally {
    if (rl) rl.close();
  }
}
