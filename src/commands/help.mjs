import { getCommand, groupCommands, listCommands } from '../core/command-registry.mjs';
import { renderCommandHelp, renderCommandTable } from '../core/renderers.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const target = argv[1];
  if (argv.includes('--json')) {
    writeJsonOutput({ ok: true, commands: listCommands().map(({ run, ...meta }) => meta) });
    return;
  }

  if (target) {
    const command = getCommand(target);
    if (!command) {
      console.log(`Unknown command: ${target}`);
      return;
    }
    console.log(renderCommandHelp(command));
    return;
  }

  console.log('MemoryMagico CLI');
  console.log('');
  console.log('Usage:');
  console.log('  mm <command> [subcommand] [...args]');
  console.log('');
  const groups = groupCommands();
  for (const category of [...groups.keys()].sort()) {
    console.log(category.toUpperCase());
    console.log(renderCommandTable(groups.get(category)));
    console.log('');
  }
}
