import { withLock } from '../core/lock.mjs';
import { createSnapshot, listSnapshots, restoreSnapshot } from '../core/snapshots.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'create') {
    const noteIndex = argv.indexOf('--note');
    const labelIndex = argv.indexOf('--label');
    const note = noteIndex !== -1 ? argv[noteIndex + 1] || '' : '';
    const label = labelIndex !== -1 ? argv[labelIndex + 1] || '' : '';
    const snapshot = await withLock('snapshot-write', () => createSnapshot({ note, label }), {
      command: 'mm snapshot create',
    });
    if (json) {
      writeJsonOutput({ ok: true, snapshot });
      return;
    }
    console.log(`Created snapshot: ${snapshot.id}`);
    return;
  }

  if (sub === 'list') {
    const snapshots = await listSnapshots();
    if (json) {
      writeJsonOutput({ ok: true, snapshots });
      return;
    }
    if (!snapshots.length) {
      console.log('No snapshots found.');
      return;
    }
    snapshots.forEach(snapshot => console.log(`${snapshot.id} ${snapshot.createdAt || ''} ${snapshot.note || ''}`.trim()));
    return;
  }

  if (sub === 'restore') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm snapshot restore <id>');
      return;
    }
    const snapshot = await withLock('repo-write', () => restoreSnapshot(id), {
      command: 'mm snapshot restore',
    });
    if (json) {
      writeJsonOutput({ ok: true, snapshot });
      return;
    }
    console.log(`Restored snapshot: ${id}`);
    return;
  }

  console.log('Usage: mm snapshot <create|list|restore>');
}
