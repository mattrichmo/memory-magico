import { listMigrations, runMigration } from '../core/migrations.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { withLock } from '../core/lock.mjs';

export async function run(argv = []) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'list') {
    const migrations = await listMigrations();
    if (json) {
      writeJsonOutput({ ok: true, migrations });
      return;
    }
    migrations.forEach(migration => console.log(`${migration.version}${migration.applied ? ' [applied]' : ''} - ${migration.description}`));
    return;
  }

  if (sub === 'run') {
    const version = argv[2];
    if (!version) {
      console.log('Usage: mm migrate run <version>');
      return;
    }
    const result = await withLock('migration-write', () => runMigration(version), {
      command: 'mm migrate run',
    });
    if (json) {
      writeJsonOutput(result);
      return;
    }
    if (!result.ok) {
      console.log(result.error.message);
      process.exitCode = 2;
      return;
    }
    console.log(result.applied ? `Migration already applied: ${version}` : `Migrated: ${version}`);
    return;
  }

  console.log('Usage: mm migrate <list|run>');
}
