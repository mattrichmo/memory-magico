import { getCommand, groupCommands, listCommands } from '../core/command-registry.mjs';
import { getSubcommandContract, listSubcommandsForCommand, listSubcommandContracts } from '../core/subcommand-registry.mjs';
import { renderCommandHelp, renderCommandTable, renderSubcommandHelp, renderSubcommandTable } from '../core/renderers.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const target = argv[1];
  const action = argv[2];
  if (argv.includes('--json')) {
    writeJsonOutput({
      ok: true,
      commands: listCommands().map(({ run, ...meta }) => ({
        ...meta,
        subcommands: listSubcommandsForCommand(meta.name),
      })),
      subcommands: listSubcommandContracts(),
    });
    return;
  }

  if (target) {
    const command = getCommand(target);
    if (!command) {
      console.log(`Unknown command: ${target}`);
      return;
    }
    if (action) {
      const contract = getSubcommandContract(command.name, action);
      if (!contract) {
        console.log(`Unknown ${command.name} subcommand: ${action}`);
        const contracts = listSubcommandsForCommand(command.name);
        if (contracts.length) {
          console.log('');
          console.log('Available subcommands:');
          console.log(renderSubcommandTable(contracts));
        }
        return;
      }
      console.log(renderSubcommandHelp(command, contract));
      return;
    }
    console.log(renderCommandHelp(command));
    const contracts = listSubcommandsForCommand(command.name);
    if (contracts.length) {
      console.log('');
      console.log('Subcommands:');
      console.log(renderSubcommandTable(contracts));
    }
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
