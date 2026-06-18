import { readGitAffected, readGitDiff, readGitLog, readGitStatus, buildCommitMessage } from '../core/git.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const sub = argv[1] || 'status';
  const json = argv.includes('--json');

  if (sub === 'status') {
    const status = await readGitStatus();
    if (json) {
      writeJsonOutput({ ok: true, ...status });
      return;
    }
    console.log(status.branchLine || '## unknown');
    for (const line of status.lines.slice(1)) console.log(line);
    console.log(`Dirty files: ${status.dirtyFiles}`);
    return;
  }

  if (sub === 'diff') {
    const memoryOnly = argv.includes('--memory');
    const pathIndex = argv.indexOf('--path');
    const targetPath = pathIndex !== -1 ? argv[pathIndex + 1] : null;
    const diff = await readGitDiff({ path: targetPath, memoryOnly });
    if (json) {
      writeJsonOutput({ ok: true, diff });
      return;
    }
    process.stdout.write(diff);
    return;
  }

  if (sub === 'affected') {
    const affected = await readGitAffected();
    if (json) {
      writeJsonOutput({ ok: true, files: affected });
      return;
    }
    if (!affected.length) {
      console.log('No affected files.');
      return;
    }
    affected.forEach(file => console.log(`${file.status} ${file.path}`));
    return;
  }

  if (sub === 'log') {
    const targetPath = argv[2] && !argv[2].startsWith('--') ? argv[2] : null;
    const limitIndex = argv.indexOf('--limit');
    const limit = limitIndex !== -1 ? Number(argv[limitIndex + 1]) || 20 : 20;
    const log = await readGitLog(targetPath, limit);
    if (json) {
      writeJsonOutput({ ok: true, log });
      return;
    }
    if (!log.length) {
      console.log('No git history found.');
      return;
    }
    log.forEach(entry => console.log(`${entry.sha.slice(0, 12)} ${entry.date} ${entry.subject}`));
    return;
  }

  if (sub === 'commit-message') {
    const status = await readGitStatus();
    const message = buildCommitMessage({ affectedFiles: status.changedFiles, branchLine: status.branchLine });
    if (json) {
      writeJsonOutput({ ok: true, message });
      return;
    }
    console.log(message);
    return;
  }

  console.log('Usage: mm git <status|diff|affected|log|commit-message>');
}
