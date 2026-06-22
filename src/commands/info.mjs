import { memoryRoot, repoRoot, schemasRoot, toolRoot, workspace } from '../core/paths.mjs';
import { listCommands } from '../core/command-registry.mjs';

export async function run() {
  console.log('Tool root:', toolRoot);
  console.log('Repo root:', repoRoot);
  console.log('Memory root:', memoryRoot);
  if (workspace?.configPath) console.log('Project config:', workspace.configPath);
  if (workspace?.manifest?.workspaceId) console.log('Workspace id:', workspace.manifest.workspaceId);
  console.log('Schemas root:', schemasRoot);
  console.log('Available top-level commands:', listCommands().map(command => command.name).join(', '));
}
