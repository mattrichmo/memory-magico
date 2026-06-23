import { groupCommands, listCommands } from '../core/command-registry.mjs';
import { listSubcommandsForCommand, listSubcommandContracts } from '../core/subcommand-registry.mjs';
import { renderCommandTable, renderSubcommandTable, writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const json = argv.includes('--json');
  const includeSubcommands = argv.includes('--subcommands');
  const commands = listCommands();
  if (json) {
    writeJsonOutput({
      ok: true,
      commands: commands.map(({ run, ...meta }) => ({
        ...meta,
        ...(includeSubcommands ? { subcommands: listSubcommandsForCommand(meta.name) } : {}),
      })),
      ...(includeSubcommands ? { subcommands: listSubcommandContracts() } : {}),
    });
    return;
  }

  if (includeSubcommands) {
    const byDomain = new Map();
    for (const contract of listSubcommandContracts()) {
      const group = byDomain.get(contract.domain) || [];
      group.push(contract);
      byDomain.set(contract.domain, group);
    }
    for (const domain of [...byDomain.keys()].sort()) {
      console.log(`\n${domain.toUpperCase()}`);
      console.log(renderSubcommandTable(byDomain.get(domain)));
    }
    return;
  }

  const groups = groupCommands();
  for (const category of [...groups.keys()].sort()) {
    console.log(`\n${category.toUpperCase()}`);
    console.log(renderCommandTable(groups.get(category)));
  }
}
