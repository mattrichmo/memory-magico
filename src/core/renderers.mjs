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

export function renderSubcommandTable(contracts) {
  return contracts.map(contract => {
    const mode = contract.readOnly ? 'read' : 'write';
    return `${contract.command} ${contract.action} [${contract.domain}/${mode}] - ${contract.summary}`;
  }).join('\n');
}

export function renderSubcommandHelp(command, contract) {
  const lines = [];
  lines.push(`${command.name} ${contract.action}`);
  lines.push(contract.summary);
  if (command.description) {
    lines.push('');
    lines.push(command.description);
  }
  lines.push('');
  lines.push(`Domain: ${contract.domain}`);
  lines.push(`Mode: ${contract.readOnly ? 'read-only' : 'write'}`);
  if (contract.lockScope) lines.push(`Lock: ${contract.lockScope}`);
  if (contract.roleTags?.length) lines.push(`Role tags: ${contract.roleTags.join(', ')}`);
  if (contract.lifecycleEffects?.length) lines.push(`Lifecycle effects: ${contract.lifecycleEffects.join(', ')}`);
  if (contract.requiredEvidence?.length) lines.push(`Required evidence: ${contract.requiredEvidence.join(', ')}`);
  if (contract.usage) {
    lines.push('');
    lines.push(`Usage: ${contract.usage}`);
  }
  if (contract.examples?.length) {
    lines.push('');
    lines.push('Examples:');
    for (const example of contract.examples) lines.push(`  ${example}`);
  }
  return lines.join('\n');
}

export function writeJsonOutput(value) {
  process.stdout.write(`${stringifyJsonStable(value)}\n`);
}
