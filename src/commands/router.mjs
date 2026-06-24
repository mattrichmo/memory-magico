import { getCommand } from '../core/command-registry.mjs';
import { COMMAND_HANDLERS } from '../core/command-handlers.mjs';
import { withJsonStdoutGuard } from '../core/stdout-guard.mjs';
import { toMemoryMagicoError, UnknownCommandError, UnsupportedJsonOutputError, WorkspaceNotFoundError } from '../core/errors.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { withLock } from '../core/lock.mjs';
import { indexStatus, rebuildIndex } from '../core/retrieval.mjs';
import { workspace } from '../core/paths.mjs';
import { actionSuggestionHint, resolveSubcommandContract } from '../core/subcommand-registry.mjs';
import { appendCommandTrace } from '../core/trace.mjs';

const WORKSPACE_WRITE_COMMANDS = new Set([
  'add',
  'capture',
  'claim',
  'comment',
  'container',
  'discovery',
  'doctor',
  'frontmatter',
  'graph',
  'index',
  'initiative',
  'issue',
  'ledger',
  'migrate',
  'phase',
  'raw',
  'repair',
  'results',
  'snapshot',
  'sprint',
  'task',
  'wiki',
  'ingest',
]);

const WORKSPACE_OPTIONAL_COMMANDS = new Set([
  'help',
  'commands',
  'info',
  'init',
  'schema',
]);

function normalizeContractArgv(command, argv) {
  if (command?.name !== 'trace' || argv[0] !== 'logging') return argv;
  const sub = argv[1] || 'status';
  if (sub === 'yes' || sub === 'on' || sub === 'enable') return ['trace', 'on', ...argv.slice(2)];
  if (sub === 'no' || sub === 'off' || sub === 'disable') return ['trace', 'off', ...argv.slice(2)];
  return ['trace', sub, ...argv.slice(2)];
}

export async function run(argv) {
  const cmd = argv[0] || 'help';
  const wantsJson = argv.includes('--json');
  const command = getCommand(cmd);
  const contractArgv = normalizeContractArgv(command, argv);
  const jsonSubcommandContract = command ? resolveSubcommandContract(command.name, contractArgv) : null;
  const handler = command ? COMMAND_HANDLERS[command.name] : null;
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  let traceLogged = false;
  const logTrace = async ({ result = null, error = null } = {}) => {
    if (traceLogged) return;
    traceLogged = true;
    await appendCommandTrace({
      argv,
      command,
      contract: jsonSubcommandContract,
      startedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      exitCode: error?.exitCode ?? process.exitCode ?? 0,
      error,
      result,
    });
  };
  const exec = async () => {
    if (!command || !handler) {
      const suggestion = actionSuggestionHint(cmd);
      throw new UnknownCommandError(`Unknown command: ${cmd}`, {
        details: { command: cmd, ...(suggestion ? { suggestions: suggestion } : {}) },
        hint: suggestion || 'Run `mm commands` to list available commands.',
      });
    }
    if (!workspace && !WORKSPACE_OPTIONAL_COMMANDS.has(command.name)) {
      throw new WorkspaceNotFoundError('No MemoryMagico workspace found for this directory.', {
        hint: 'Run `mm init` here, cd into a repo with .memorymagico.json, or pass --memory-root <path>.',
      });
    }
    if (command.requiresFreshIndex) {
      const status = await indexStatus();
      if (!status.ready) {
        await rebuildIndex();
      }
    }
    const subcommandContract = jsonSubcommandContract;
    const lockScope = subcommandContract
      ? subcommandContract.lockScope
      : WORKSPACE_WRITE_COMMANDS.has(command.name) ? 'repo-write' : null;
    let result;
    if (lockScope) {
      result = await withLock(lockScope, () => handler(argv), {
        command: `mm ${argv.join(' ')}`,
      });
    } else {
      result = await handler(argv);
    }
    await logTrace({ result });
    return result;
  };

  try {
    if (wantsJson && command && !command.supportsJson) {
      throw new UnsupportedJsonOutputError(`Command ${command.name} does not support --json.`);
    }
    return wantsJson ? await withJsonStdoutGuard(exec, {
      transform: payload => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
        if (payload.ok === false) return payload;
        return {
          ...payload,
          command: payload.command || jsonSubcommandContract?.id || command?.name || cmd,
          warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
        };
      },
    }) : await exec();
  } catch (err) {
    const mmErr = toMemoryMagicoError(err);
    if (wantsJson) {
      writeJsonOutput({ ok: false, error: mmErr.toJSON(), warnings: [] });
    } else {
      console.error(mmErr.message);
      if (mmErr.hint) console.error(mmErr.hint);
    }
    await logTrace({ error: mmErr });
    process.exitCode = mmErr.exitCode ?? 2;
    return null;
  }
}
