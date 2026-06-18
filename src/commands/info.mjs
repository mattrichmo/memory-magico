import { memoryRoot, repoRoot, schemasRoot, toolRoot } from '../core/paths.mjs';
import { listCommands } from '../core/command-registry.mjs';

export async function run() {
  console.log('Tool root:', toolRoot);
  console.log('Repo root:', repoRoot);
  console.log('Memory root:', memoryRoot);
  console.log('Schemas root:', schemasRoot);
  console.log('Available top-level commands:', listCommands().map(command => command.name).join(', '));
}
