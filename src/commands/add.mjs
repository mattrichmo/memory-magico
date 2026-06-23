/**
 * mm add <filepath> [--title "..."] [--source-type <type>] [--tags tag1,tag2] [--move] [--delete-source-i-know-this-is-destructive]
 *
 * Copies any file into memory/inbox/raw/ and registers it as a schema-compliant
 * raw item in raw-items.jsonl. Accepts images, PDFs, markdown, JSON, CSV,
 * videos, CVs, data exports — anything.
 *
 * --move: After successfully registering the copy, remove or relocate the original
 *   source file so no orphan remains in the inbox. If the source is already inside
 *   memory/inbox/raw/, it is moved to memory/inbox/processed/. If outside the
 *   memory tree, the original is left in place unless the explicit destructive
 *   flag --delete-source-i-know-this-is-destructive is also passed.
 *
 * source-type auto-detection:
 *   .md .txt .rst         → agent_note
 *   .json .jsonl .csv     → github_export (data/export)
 *   .png .jpg .jpeg .gif .webp .svg → screenshot
 *   .pdf .docx .doc       → document
 *   .mp4 .mov .webm .mkv  → document
 *   everything else       → other
 */

import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { appendJsonl } from '../core/json.mjs';
import { resolveExternalSourcePath } from '../core/safe-path.mjs';
import { withLock } from '../core/lock.mjs';
import { detectBinaryType } from '../core/binary-detect.mjs';
import { ENUMS, assertEnum } from '../core/guards.mjs';

const rawFile = path.join(memoryRoot, 'inbox', 'raw-items.jsonl');
const rawDir = path.join(memoryRoot, 'inbox', 'raw');

const EXT_TO_SOURCE_TYPE = {
  '.md': 'agent_note',
  '.txt': 'agent_note',
  '.rst': 'agent_note',
  '.json': 'github_export',
  '.jsonl': 'github_export',
  '.csv': 'github_export',
  '.tsv': 'github_export',
  '.png': 'screenshot',
  '.jpg': 'screenshot',
  '.jpeg': 'screenshot',
  '.gif': 'screenshot',
  '.webp': 'screenshot',
  '.svg': 'screenshot',
  '.pdf': 'document',
  '.docx': 'document',
  '.doc': 'document',
  '.mp4': 'document',
  '.mov': 'document',
  '.webm': 'document',
  '.mkv': 'document',
};

function detectSourceType(ext) {
  return EXT_TO_SOURCE_TYPE[ext.toLowerCase()] || 'other';
}

function parseFlagNumber(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export async function run(argv) {
  return withLock('raw-ingest', async () => {
    // argv[0] = 'add', argv[1] = filepath, rest = flags
    const filepath = argv[1];
    if (!filepath || filepath === '--help' || filepath === '-h') {
      console.log('Usage: mm add <filepath> [--title "..."] [--source-type <type>] [--tags tag1,tag2]');
      console.log('');
      console.log('Copies any file into memory/inbox/raw/ and registers it as a raw item.');
      console.log('');
      console.log('Source types: user_note agent_note github_export github_comment');
      console.log('              terminal_output code_audit research document screenshot other');
      return;
    }

    // Parse flags
    let title = null;
    let sourceTypeOverride = null;
    let tags = [];
    let moveSource = false;
    let destructiveDelete = false;
    const maxBytes = parseFlagNumber(argv, '--max-bytes', 25_000_000);
    let allowLarge = argv.includes('--allow-large');
    for (let i = 2; i < argv.length; i++) {
      if (argv[i] === '--title' && argv[i + 1]) { title = argv[++i]; }
      else if (argv[i] === '--source-type' && argv[i + 1]) { sourceTypeOverride = argv[++i]; }
      else if (argv[i] === '--tags' && argv[i + 1]) { tags = argv[++i].split(',').map(t => t.trim()).filter(Boolean); }
      else if (argv[i] === '--max-bytes' && argv[i + 1]) { i += 1; }
      else if (argv[i] === '--allow-large') { allowLarge = true; }
      else if (argv[i] === '--move') { moveSource = true; }
      else if (argv[i] === '--delete-source-i-know-this-is-destructive') { destructiveDelete = true; }
    }

    // Resolve source file
    const absSource = resolveExternalSourcePath(filepath);
    try {
      await fs.access(absSource);
    } catch {
      console.log('File not found:', filepath);
      process.exit(1);
    }

    const stat = await fs.stat(absSource);
    if (stat.size > maxBytes && !allowLarge) {
      console.log(`Refusing ${filepath}: ${stat.size} bytes exceeds --max-bytes ${maxBytes}. Pass --allow-large to override.`);
      process.exit(1);
    }

    const ext = path.extname(filepath);
    const basename = path.basename(filepath);
    const sourceType = sourceTypeOverride || detectSourceType(ext);
    assertEnum(sourceType, ENUMS.rawSourceType, 'source type');
    const id = makeId('raw');
    const now = new Date().toISOString();
    const destFilename = `${id}${ext}`;
    const relPath = `memory/inbox/raw/${destFilename}`;
    const absDest = path.join(rawDir, destFilename);

    // Copy file to inbox/raw/
    await fs.mkdir(rawDir, { recursive: true });
    await fs.copyFile(absSource, absDest);

    const handle = await fs.open(absSource, 'r');
    let mediaType = null;
    try {
      const buffer = Buffer.alloc(Math.min(stat.size, 4096));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      mediaType = detectBinaryType(buffer.slice(0, bytesRead));
    } finally {
      await handle.close();
    }
    const itemTitle = title || basename;
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
      const stream = createReadStream(absSource);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    const contentHash = hash.digest('hex');

    const item = {
      id,
      kind: 'raw_item',
      title: itemTitle.slice(0, 200),
      summary: `Imported from: ${filepath}`,
      sourceType,
      status: 'unreconciled',
      path: relPath,
      sourceRef: filepath,
      originalFilename: basename,
      byteSize: stat.size,
      contentHash,
      ...(mediaType ? { mediaType } : {}),
      tags,
      containerIds: [],
      reconciledTo: [],
      createdAt: now,
      updatedAt: now
    };

    await appendJsonl(rawFile, item);

    console.log('Added raw item:', id);
    console.log('Source:', filepath);
    console.log('Destination:', relPath);
    console.log('Source type:', sourceType);
    if (tags.length) console.log('Tags:', tags.join(', '));

    // --move: clean up the source so no orphan remains in inbox
    if (moveSource && absSource !== absDest) {
      const processedDir = path.join(memoryRoot, 'inbox', 'processed');
      const isInsideRaw = absSource.startsWith(rawDir + path.sep) || absSource === absDest;
      if (isInsideRaw) {
        // Source was already inside raw/; relocate to processed/
        const destProcessed = path.join(processedDir, basename);
        await fs.mkdir(processedDir, { recursive: true });
        await fs.rename(absSource, destProcessed);
        console.log('Moved source to processed:', `memory/inbox/processed/${basename}`);
      } else {
        if (destructiveDelete) {
          await fs.unlink(absSource);
          console.log('Deleted source file (copy registered as raw item):', filepath);
        } else {
          console.log('Source left in place outside memory tree. Pass --delete-source-i-know-this-is-destructive to remove it.');
        }
      }
    }

    console.log('');
    console.log('Next: mm raw show', id);
    console.log('Then: triage → mm discovery add / mm raw process', id);
  }, { command: 'mm add' });
}
