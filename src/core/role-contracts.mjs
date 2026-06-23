import { getCommand } from './command-registry.mjs';
import { getSubcommandContract, listSubcommandsForCommand, toolsForRoleTags } from './subcommand-registry.mjs';

function parseMmTool(tool) {
  const text = String(tool || '').trim();
  if (!text.startsWith('mm ')) return null;
  const parts = text.split(/\s+/);
  return {
    command: parts[1] || null,
    action: parts[2] && !parts[2].startsWith('-') ? parts[2] : null,
  };
}

export function validateRoleContract(role) {
  const findings = [];

  if (!role || typeof role !== 'object') {
    return ['role contract is missing'];
  }

  if (!role.slug) findings.push('role slug is missing');
  if (!Array.isArray(role.allowedTools)) findings.push('allowed_tools must be an array');
  if (role.allowedCapabilities !== undefined && !Array.isArray(role.allowedCapabilities)) findings.push('allowed_capabilities must be an array');
  if (!Array.isArray(role.forbiddenTools)) findings.push('forbidden_tools must be an array');
  if (!Array.isArray(role.skillGroups)) findings.push('skill_groups must be an array');
  for (const tag of role.allowedCapabilities || []) {
    if (!toolsForRoleTags([tag]).length) findings.push(`unknown allowed capability: ${tag}`);
  }

  for (const tool of role.allowedTools || []) {
    const text = String(tool || '').trim();
    if (!text) {
      findings.push(`allowed_tools contains an empty entry for ${role.slug || 'unknown role'}`);
      continue;
    }
    const parsed = parseMmTool(text);
    if (parsed?.command && !getCommand(parsed.command)) {
      findings.push(`unknown mm command in allowed_tools: ${text}`);
      continue;
    }
    if (parsed?.command && parsed.action && listSubcommandsForCommand(parsed.command).length && !getSubcommandContract(parsed.command, parsed.action)) {
      findings.push(`unknown mm subcommand in allowed_tools: ${text}`);
    }
  }

  return findings;
}
