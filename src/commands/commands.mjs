import { groupCommands, listCommands } from '../core/command-registry.mjs';
import { renderCommandTable, writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const json = argv.includes('--json');
  const commands = listCommands();
  if (json) {
    writeJsonOutput({
      ok: true,
      commands: commands.map(({ run, ...meta }) => meta),
    });
    return;
  }

  const groups = groupCommands();
  for (const category of [...groups.keys()].sort()) {
    console.log(`\n${category.toUpperCase()}`);
    console.log(renderCommandTable(groups.get(category)));
  }
}

