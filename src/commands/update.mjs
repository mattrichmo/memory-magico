import { run as installRun } from './install.mjs';

export async function run(argv) {
  const args = argv.slice(1);

  if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
    console.log('Usage: mm update [--install-root <path>] [--roles role_a,role_b] [--dry-run]');
    console.log('');
    console.log('Refresh bundled MemoryMagico system roles and regenerate Claude/Codex agent surfaces.');
    console.log('Equivalent to: mm install all --update');
    return;
  }

  return installRun(['install', 'all', '--update', ...args]);
}
