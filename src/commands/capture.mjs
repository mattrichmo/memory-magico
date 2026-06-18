import fs from 'node:fs/promises';
import path from 'node:path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId } from '../core/ids.mjs';
import { appendJsonl } from '../core/json.mjs';
import { atomicWriteText } from '../core/atomic-write.mjs';
import { detectBinaryType } from '../core/binary-detect.mjs';
import { resolveExternalSourcePath } from '../core/safe-path.mjs';
import { assertEnum, ENUMS } from '../core/guards.mjs';
import { withLock } from '../core/lock.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

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

async function readSource(source) {
  const absPath = resolveExternalSourcePath(source);
  const stat = await fs.stat(absPath);
  const size = stat.size;
  const sample = await fs.readFile(absPath);
  const mediaType = detectBinaryType(sample.slice(0, Math.min(sample.length, 4096))) || 'text/plain';
  if (mediaType.startsWith('image/')) {
    return {
      kind: 'file',
      absPath,
      size,
      mediaType,
      binary: true,
      text: '',
      title: path.basename(absPath),
      summary: `Captured image file ${path.basename(absPath)}`,
    };
  }
  const text = sample.toString('utf8');
  return {
    kind: 'file',
    absPath,
    size,
    mediaType,
    binary: false,
    text,
    title: path.basename(absPath),
    summary: text.trim().slice(0, 240) || `Captured file ${path.basename(absPath)}`,
  };
}

async function captureItem({ text, sourceType, sourceRef = '', title = '', mediaType = 'text/plain', byteSize = 0, binary = false }) {
  return withLock('raw-ingest', async () => {
    const id = makeId('raw');
    const now = new Date().toISOString();
    const filename = `${id}.md`;
    const relPath = `memory/inbox/raw/${filename}`;
    const absPath = path.join(rawDir, filename);
    await fs.mkdir(rawDir, { recursive: true });

    const body = binary
      ? `# Raw Capture\n\nBinary payload captured from ${sourceRef || 'source'}.\n`
      : `# Raw Capture\n\n${text.trimEnd()}\n`;
    await atomicWriteText(absPath, body);

    const item = {
      id,
      kind: 'raw_item',
      title: title || (binary ? `Binary capture ${id}` : text.slice(0, 120)),
      summary: binary ? `Captured binary payload from ${sourceRef || 'source'}` : text.trim().slice(0, 240),
      sourceType,
      status: 'unreconciled',
      path: relPath,
      sourceRef: sourceRef || undefined,
      mediaType,
      byteSize,
      tags: [],
      containerIds: [],
      reconciledTo: [],
      createdAt: now,
      updatedAt: now,
    };
    await appendJsonl(rawFile, item);
    return item;
  }, { command: 'mm capture' });
}

export async function run(argv = []) {
  const json = argv.includes('--json');
  const stdinRequested = argv.includes('--stdin');
  const sourceTypeIndex = argv.indexOf('--source-type');
  const sourceType = sourceTypeIndex !== -1 ? argv[sourceTypeIndex + 1] : 'agent_note';
  assertEnum(sourceType, ENUMS.rawSourceType, 'raw source type');

  let item = null;
  const args = argv.slice(1).filter(arg => !arg.startsWith('--'));
  const positional = args.join(' ').trim();

  if (stdinRequested || (!positional && !process.stdin.isTTY)) {
    const text = (await readStdinText()).trim();
    if (!text) {
      console.log('Usage: mm capture "note text" | mm capture --stdin | mm capture ./file.md');
      return;
    }
    item = await captureItem({ text, sourceType, title: text.slice(0, 120), binary: false, mediaType: 'text/plain', byteSize: Buffer.byteLength(text, 'utf8') });
  } else if (positional) {
    try {
      const source = await readSource(positional);
      item = await captureItem({
        text: source.binary ? source.summary : source.text,
        sourceType: sourceTypeIndex !== -1 ? sourceType : (source.kind === 'file' ? 'document' : 'agent_note'),
        sourceRef: source.absPath,
        title: source.title,
        mediaType: source.mediaType,
        byteSize: source.size,
        binary: source.binary,
      });
    } catch {
      const text = positional;
      item = await captureItem({
        text,
        sourceType,
        title: text.slice(0, 120),
        mediaType: 'text/plain',
        byteSize: Buffer.byteLength(text, 'utf8'),
        binary: false,
      });
    }
  }

  if (!item) {
    console.log('Usage: mm capture "note text" | mm capture --stdin | mm capture ./file.md');
    return;
  }

  if (json) {
    writeJsonOutput({ ok: true, item });
    return;
  }
  console.log(`Captured raw item: ${item.id}`);
  console.log(`Path: ${item.path}`);
}
