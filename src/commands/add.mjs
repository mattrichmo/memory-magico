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
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { appendJsonl } from '../core/json.mjs';
import { resolveExternalSourcePath } from '../core/safe-path.mjs';
import { withLock } from '../core/lock.mjs';

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

export async function run(argv) {
  return withLock('raw-ingest', async () => {
    // argv[0] = 'add', argv[1] = filepath, rest = flags
    const filepath = argv[1];
    if (!filepath) {
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
    for (let i = 2; i < argv.length; i++) {
      if (argv[i] === '--title' && argv[i + 1]) { title = argv[++i]; }
      else if (argv[i] === '--source-type' && argv[i + 1]) { sourceTypeOverride = argv[++i]; }
      else if (argv[i] === '--tags' && argv[i + 1]) { tags = argv[++i].split(',').map(t => t.trim()).filter(Boolean); }
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

    const ext = path.extname(filepath);
    const basename = path.basename(filepath);
    const id = makeId('raw');
    const now = new Date().toISOString();
    const destFilename = `${id}${ext}`;
    const relPath = `memory/inbox/raw/${destFilename}`;
    const absDest = path.join(rawDir, destFilename);

    // Copy file to inbox/raw/
    await fs.mkdir(rawDir, { recursive: true });
    await fs.copyFile(absSource, absDest);

    const sourceType = sourceTypeOverride || detectSourceType(ext);
    const itemTitle = title || basename;

    const item = {
      id,
      kind: 'raw_item',
      title: itemTitle.slice(0, 200),
      summary: `Imported from: ${filepath}`,
      sourceType,
      status: 'unreconciled',
      path: relPath,
      sourceRef: filepath,
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
