import { getCommand } from './command-registry.mjs';

function parseMmTool(tool) {
  const text = String(tool || '').trim();
  if (!text.startsWith('mm ')) return null;
  const parts = text.split(/\s+/);
  return parts[1] || null;
}

export function validateRoleContract(role) {
  const findings = [];

  if (!role || typeof role !== 'object') {
    return ['role contract is missing'];
  }

  if (!role.slug) findings.push('role slug is missing');
  if (!Array.isArray(role.allowedTools)) findings.push('allowed_tools must be an array');
  if (!Array.isArray(role.forbiddenTools)) findings.push('forbidden_tools must be an array');
  if (!Array.isArray(role.skillGroups)) findings.push('skill_groups must be an array');

  for (const tool of role.allowedTools || []) {
    const text = String(tool || '').trim();
    if (!text) {
      findings.push(`allowed_tools contains an empty entry for ${role.slug || 'unknown role'}`);
      continue;
    }
    const commandName = parseMmTool(text);
    if (commandName && !getCommand(commandName)) {
      findings.push(`unknown mm command in allowed_tools: ${text}`);
    }
  }

  return findings;
}
