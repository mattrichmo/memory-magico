import { stringifyJsonStable } from './json-safe.mjs';

export function renderCommandTable(commands) {
  return commands.map(cmd => {
    const aliases = cmd.aliases?.length ? ` [${cmd.aliases.join(', ')}]` : '';
    return `${cmd.name}${aliases} - ${cmd.summary}`;
  }).join('\n');
}

export function renderCommandHelp(command) {
  const lines = [];
  lines.push(command.name);
  if (command.summary) lines.push(command.summary);
  if (command.description) {
    lines.push('');
    lines.push(command.description);
  }
  if (command.usage) {
    lines.push('');
    lines.push(`Usage: ${command.usage}`);
  }
  if (command.aliases?.length) {
    lines.push('');
    lines.push(`Aliases: ${command.aliases.join(', ')}`);
  }
  if (command.examples?.length) {
    lines.push('');
    lines.push('Examples:');
    for (const example of command.examples) lines.push(`  ${example}`);
  }
  return lines.join('\n');
}

export function writeJsonOutput(value) {
  process.stdout.write(`${stringifyJsonStable(value)}\n`);
}

