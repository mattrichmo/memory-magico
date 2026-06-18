import path from 'path';
import fs from 'fs/promises';
import { memoryRoot, repoRoot } from '../core/paths.mjs';
import { makeId, slugify } from '../core/ids.mjs';
import { appendJsonl, readJsonl } from '../core/json.mjs';
import { entityRefExists } from '../core/entities.mjs';
import { atomicWriteText } from '../core/atomic-write.mjs';
import { resolveRepoPath } from '../core/safe-path.mjs';
import { withLock } from '../core/lock.mjs';
import { readTextRange } from '../core/read-range.mjs';
import { detectBinaryType } from '../core/binary-detect.mjs';
import { maybeSpoolJsonResult } from '../core/result-spool.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { addRawImage } from './image.mjs';
import { detectPromptMarkers } from '../core/prompt-markers.mjs';

const rawFile = path.join(memoryRoot, 'inbox', 'raw-items.jsonl');
const rawDir = path.join(memoryRoot, 'inbox', 'raw');

async function readStdinText() {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { text += chunk; });
    process.stdin.on('end', () => resolve(text));
    process.stdin.on('error', reject);
  });
}

function latestById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

async function loadRawItems() {
  return latestById(await readJsonl(rawFile));
}

function parseFlagNumber(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function loadRawPayloadPreview(item, { maxBytes = 64 * 1024, maxLines = 200 } = {}) {
  if (!item.path) return null;
  const absPath = await resolveRepoPath(repoRoot, item.path, 'repo-read');
  const probe = await fs.open(absPath, 'r');
  try {
    const stat = await probe.stat();
    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await probe.read(buffer, 0, buffer.length, 0);
    const sample = buffer.slice(0, bytesRead);
    const mediaType = detectBinaryType(sample);
    if (mediaType) {
      return {
        path: absPath,
        binary: true,
        mediaType,
        bytes: stat.size,
        bytesRead,
        truncated: stat.size > bytesToRead,
      };
    }
  } finally {
    await probe.close();
  }
  const range = await readTextRange(absPath, { maxBytes, maxLines });
  return {
    path: absPath,
    binary: false,
    ...range,
  };
}

function makeTargetRef(kind, id, targetPath) {
  const ref = { kind, id };
  if (targetPath) ref.path = targetPath;
  return ref;
}

async function reconcileRawItem(id, status, targetRefs = [], note, { json = false } = {}) {
  return withLock('raw-ingest', async () => {
    const items = await loadRawItems();
    const item = items.find(entry => entry.id === id);
    if (!item) {
      console.log('Raw item not found:', id);
      return;
    }

    const folder = status === 'rejected' ? 'rejected' : 'processed';
    const sourceRel = String(item.path || '').replace(/^memory\/inbox\/raw\//, '');
    const targetPath = path.posix.join('memory/inbox', folder, sourceRel || `${slugify(id)}.md`);
    const from = await resolveRepoPath(repoRoot, item.path, 'repo-read');
    const to = await resolveRepoPath(repoRoot, targetPath, 'repo-write');

    for (const ref of targetRefs) {
      if (!(await entityRefExists(ref))) throw new Error(`raw process target not found: ${ref.kind} ${ref.id || ref.path}`);
    }

    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await fs.rename(from, to);
    } catch {
      // Source may have been moved manually. Keep the index update.
    }

    const updated = {
      ...item,
      status,
      path: targetPath,
      updatedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      reconciledTo: targetRefs.length ? targetRefs : (item.reconciledTo || [])
    };

    if (note) {
      updated.summary = item.summary ? `${item.summary} ${note}` : note;
    }

    await appendJsonl(rawFile, updated);
    if (!json) {
      console.log(`${status === 'rejected' ? 'Rejected' : 'Processed'} raw item:`, id);
    }
    return updated;
  }, { command: `mm raw ${status}` });
}

export async function run(argv) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'add') {
    return withLock('raw-ingest', async () => {
      const opts = argv.slice(2);
      const textFlagIndex = opts.indexOf('--text');
      const stdinRequested = opts.includes('--stdin');
      const explicitText = textFlagIndex !== -1 ? opts[textFlagIndex + 1] : null;
      const positionalStart = opts[0] === '--' ? 1 : 0;
      const positionalText = opts.slice(positionalStart).filter(arg => arg !== '--' && arg !== '--stdin' && arg !== '--text').join(' ').trim();
      const stdinText = stdinRequested || (!explicitText && !positionalText && !process.stdin.isTTY) ? await readStdinText() : '';
      const text = String(explicitText || stdinText || positionalText || '').trim();
      if (!text) {
        console.log('Usage: mm raw add <text> | mm raw add --text <text> | mm raw add --stdin');
        console.log('Tip: use --text or --stdin for pasted content with shell metacharacters.');
        return;
      }

      const id = makeId('raw');
      const now = new Date().toISOString();
      const filename = `${id}.md`;
      const relPath = `memory/inbox/raw/${filename}`;
      const absPath = path.join(rawDir, filename);

      // Write payload file
      await fs.mkdir(rawDir, { recursive: true });
      await atomicWriteText(absPath, `# Raw Item\n\n${text}\n`);

      const item = {
        id,
        kind: 'raw_item',
        title: text.slice(0, 120),
        summary: text,
        sourceType: 'agent_note',
        status: 'unreconciled',
        path: relPath,
        tags: [],
        containerIds: [],
        reconciledTo: [],
        createdAt: now,
        updatedAt: now
      };

      await appendJsonl(rawFile, item);
      if (json) {
        writeJsonOutput({ ok: true, item });
        return;
      }
      console.log('Added raw item:', id);
      console.log('Path:', relPath);
      return;
    }, { command: 'mm raw add' });
  }

  if (sub === 'add-image') {
    return withLock('raw-ingest', async () => {
      const filepath = argv[2];
      if (!filepath) {
        console.log('Usage: mm raw add-image <filepath> [--json]');
        return;
      }
      const maxBytes = parseFlagNumber(argv, '--max-bytes', 256 * 1024);
      const allowLarge = argv.includes('--allow-large');
      const item = await addRawImage(filepath, { source: 'file', maxBytes, allowLarge });
      if (json) {
        writeJsonOutput({ ok: true, item });
        return;
      }
      console.log(`Added image raw item: ${item.id}`);
    }, { command: 'mm raw add-image' });
  }

  if (sub === 'list') {
    const items = await loadRawItems();
    const active = items.filter(i => !['processed', 'rejected', 'archived'].includes(i.status));
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, items: active });
      return;
    }
    if (!active.length) {
      console.log('No unreconciled raw items.');
      return;
    }
    for (const item of active) {
      const label = item.title || item.summary || item.text || '';
      console.log(`${item.id} [${item.status}] ${label.slice(0, 80)}`);
    }
    return;
  }

  if (sub === 'list-all') {
    const items = await loadRawItems();
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, items });
      return;
    }
    if (!items.length) {
      console.log('No raw items found.');
      return;
    }
    for (const item of items) {
      const label = item.title || item.summary || item.text || '';
      console.log(`${item.id} [${item.status}] ${label.slice(0, 80)}`);
    }
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm raw show <id>');
      return;
    }
    const items = await loadRawItems();
    const item = items.find(entry => entry.id === id);
    if (!item) {
      console.log('Raw item not found:', id);
      return;
    }
    const maxBytes = parseFlagNumber(argv, '--max-bytes', 64 * 1024);
    const maxLines = parseFlagNumber(argv, '--lines', 200);
    const binaryInfo = argv.includes('--binary-info');
    const preview = await loadRawPayloadPreview(item, { maxBytes, maxLines }).catch(() => null);
    const warnings = detectPromptMarkers([
      item.title,
      item.summary,
      preview?.binary ? '' : preview?.content,
    ]);

    if (argv.includes('--json')) {
      const payload = { ok: true, item, warnings };
      if (preview) payload.payload = preview;
      const result = await maybeSpoolJsonResult('raw show', payload, 20000);
      writeJsonOutput(result.value);
      return;
    }
    console.log(JSON.stringify(item, null, 2));
    warnings.forEach(warning => console.log(`WARN ${warning}`));

    if (!preview) return;
    console.log('\n--- Payload ---');
    if (preview.binary) {
      console.log(`${item.path}: ${preview.mediaType} (${preview.bytes} bytes)`);
      if (binaryInfo) {
        console.log('(binary payload omitted)');
      }
      return;
    }
    console.log(preview.content || '');
    if (preview.truncatedByBytes || preview.truncatedByLines) {
      console.log('');
      console.log(`[truncated bytes=${preview.truncatedByBytes ? 'yes' : 'no'} lines=${preview.truncatedByLines ? 'yes' : 'no'}]`);
    }
    return;
  }

  if (sub === 'process' || sub === 'reject') {
    const id = argv[2];
    if (!id) {
      console.log(`Usage: mm raw ${sub} <id> [target-kind target-id [target-path]]`);
      return;
    }
    const targetKind = argv[3];
    const targetId = argv[4];
    const targetPath = argv[5];
    const note = argv.slice(6).join(' ').trim();
    let normalizedTargetPath = null;
    if (targetPath) {
      const resolvedTargetPath = await resolveRepoPath(repoRoot, targetPath, 'repo-read');
      normalizedTargetPath = path.relative(repoRoot, resolvedTargetPath).split(path.sep).join('/');
    }
    const targetRefs = targetKind && targetId ? [makeTargetRef(targetKind, targetId, normalizedTargetPath)] : [];
    const updated = await reconcileRawItem(id, sub === 'reject' ? 'rejected' : 'processed', targetRefs, note, { json });
    if (json) {
      writeJsonOutput({ ok: true, item: updated });
      return;
    }
    console.log('');
    console.log('Reminder: if a source file was added via `mm add <file>`, move or delete');
    console.log('the original from memory/inbox/raw/ so it cannot be re-ingested.');
    console.log('Use `mm raw cleanup` to find any orphan source files.');
    return;
  }

  if (sub === 'archive') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm raw archive <id>');
      return;
    }
    const items = await loadRawItems();
    const item = items.find(entry => entry.id === id);
    if (!item) {
      console.log('Raw item not found:', id);
      return;
    }
    const updated = { ...item, status: 'archived', updatedAt: new Date().toISOString() };
    await appendJsonl(rawFile, updated);
    if (json) {
      writeJsonOutput({ ok: true, item: updated });
      return;
    }
    console.log('Archived raw item:', id);
    return;
  }

  // Scan inbox/raw/ for files that are not registered raw items (orphan source files)
  if (sub === 'cleanup') {
    const processedDir = path.join(memoryRoot, 'inbox', 'processed');
    await fs.mkdir(processedDir, { recursive: true });

    const items = await loadRawItems();
    // IDs of registered raw items — these are the canonical copies, leave them alone
    const registeredFiles = new Set(
      items.map(i => i.path && path.basename(String(i.path))).filter(Boolean)
    );

    let entries;
    try {
      entries = await fs.readdir(rawDir);
    } catch {
      console.log('Raw directory not found.');
      return;
    }

    const orphans = entries.filter(f => {
      if (f === 'README.md' || f === '.gitkeep') return false;
      if (registeredFiles.has(f)) return false; // it IS a registered raw item copy
      return true; // unregistered — it is an original source file or stray file
    });

    if (!orphans.length) {
      if (json) {
        writeJsonOutput({ ok: true, orphanCount: 0, moved: [] });
        return;
      }
      console.log('No orphan source files found in memory/inbox/raw/. Inbox is clean.');
      return;
    }

    if (json) {
      const dryRun = argv.includes('--dry-run');
      const moved = [];
      for (const f of orphans) {
        const from = path.join(rawDir, f);
        const to = path.join(processedDir, f);
        if (!dryRun) {
          await fs.rename(from, to);
          moved.push(`memory/inbox/processed/${f}`);
        }
      }
      writeJsonOutput({ ok: true, orphanCount: orphans.length, moved, dryRun });
      return;
    }
    const dryRun = argv.includes('--dry-run');
    const moved = [];
    console.log(`Found ${orphans.length} orphan source file(s)${dryRun ? ' (dry run — not moving)' : ''}:`);
    for (const f of orphans) {
      const from = path.join(rawDir, f);
      const to = path.join(processedDir, f);
      console.log(`  ${f}`);
      if (!dryRun) {
        await fs.rename(from, to);
        moved.push(`memory/inbox/processed/${f}`);
      }
    }
    if (!dryRun) {
      console.log(`Moved ${orphans.length} file(s) to memory/inbox/processed/.`);
      console.log('These files were source copies already captured as registered raw items.');
    } else {
      console.log('Re-run without --dry-run to move them.');
    }
    return;
  }

  console.log('Unknown raw subcommand:', sub);
  console.log('Available: add, list, list-all, show, process, reject, archive, cleanup');
}
