import { getCommand } from '../core/command-registry.mjs';
import { COMMAND_HANDLERS } from '../core/command-handlers.mjs';
import { withJsonStdoutGuard } from '../core/stdout-guard.mjs';
import { toMemoryMagicoError, UnknownCommandError, UnsupportedJsonOutputError, WorkspaceNotFoundError } from '../core/errors.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { withLock } from '../core/lock.mjs';
import { indexStatus, rebuildIndex } from '../core/retrieval.mjs';
import { workspace } from '../core/paths.mjs';
import { actionSuggestionHint, resolveSubcommandContract } from '../core/subcommand-registry.mjs';

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

export async function run(argv) {
  const cmd = argv[0] || 'help';
  const wantsJson = argv.includes('--json');
  const command = getCommand(cmd);
  const jsonSubcommandContract = command ? resolveSubcommandContract(command.name, argv) : null;
  const handler = command ? COMMAND_HANDLERS[command.name] : null;
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
    if (lockScope) {
      return withLock(lockScope, () => handler(argv), {
        command: `mm ${argv.join(' ')}`,
      });
    }
    return handler(argv);
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
    process.exitCode = mmErr.exitCode ?? 2;
    return null;
  }
}
