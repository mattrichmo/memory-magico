import { getCommand } from '../core/command-registry.mjs';
import { COMMAND_HANDLERS } from '../core/command-handlers.mjs';
import { withJsonStdoutGuard } from '../core/stdout-guard.mjs';
import { toMemoryMagicoError, UnknownCommandError } from '../core/errors.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { indexStatus, rebuildIndex } from '../core/retrieval.mjs';

export async function run(argv) {
  const cmd = argv[0] || 'help';
  const wantsJson = argv.includes('--json');
  const command = getCommand(cmd);
  const handler = command ? COMMAND_HANDLERS[command.name] : null;
  const exec = async () => {
    if (!command || !handler) {
      throw new UnknownCommandError(`Unknown command: ${cmd}`, {
        details: { command: cmd },
        hint: 'Run `mm commands` to list available commands.',
      });
    }
    if (command.requiresFreshIndex) {
      const status = await indexStatus();
      if (!status.ready) {
        await rebuildIndex();
      }
    }
    return handler(argv);
  };

  try {
    return wantsJson ? await withJsonStdoutGuard(exec) : await exec();
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
