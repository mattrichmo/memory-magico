import fs from 'fs/promises';
import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { detectBinaryType } from '../core/binary-detect.mjs';
import { resolveExternalSourcePath } from '../core/safe-path.mjs';
import { makeId } from '../core/ids.mjs';
import { appendJsonl } from '../core/json.mjs';
import { maybeSpoolJsonResult, spoolResult } from '../core/result-spool.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { withLock } from '../core/lock.mjs';

const rawFile = path.join(memoryRoot, 'inbox', 'raw-items.jsonl');
const assetRoot = path.join(memoryRoot, 'inbox', 'raw', 'assets');

function parseFlagNumber(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function storeImage(filepath, { title = null, source = 'file', maxBytes = 262144, allowLarge = false } = {}) {
  const absSource = resolveExternalSourcePath(filepath);
  const stat = await fs.stat(absSource);
  if (stat.size > maxBytes && !allowLarge) {
    throw new Error(`Refusing ${filepath}: ${stat.size} bytes exceeds --max-bytes ${maxBytes}. Pass --allow-large to override.`);
  }
  const handle = await fs.open(absSource, 'r');
  let mediaType = null;
  try {
    const buffer = Buffer.alloc(Math.min(stat.size, 4096));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    mediaType = detectBinaryType(buffer.slice(0, bytesRead));
  } finally {
    await handle.close();
  }
  if (!mediaType || !mediaType.startsWith('image/')) {
    throw new Error(`Unsupported image file: ${filepath}`);
  }
  const id = makeId('raw_img');
  const ext = mediaType.split('/')[1].replace('jpeg', 'jpg');
  const filename = `${id}.${ext}`;
  const absDest = path.join(assetRoot, filename);
  await fs.mkdir(assetRoot, { recursive: true });
  await fs.copyFile(absSource, absDest);
  const item = {
    id,
    kind: 'raw_item',
    title: title || path.basename(filepath),
    summary: `Image import from: ${filepath}`,
    sourceType: 'screenshot',
    status: 'unreconciled',
    path: `memory/inbox/raw/assets/${filename}`,
    sourceRef: filepath,
    mediaType,
    byteSize: stat.size,
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await appendJsonl(rawFile, item);
  return item;
}

export async function run(argv = []) {
  const sub = argv[1] || 'inspect';
  const target = argv[2];
  if (sub === 'inspect') {
    if (!target || target === '--help' || target === '-h') return console.log('Usage: mm image inspect <path>');
    const abs = await resolveExternalSourcePath(target);
    const maxBytes = parseFlagNumber(argv, '--max-bytes', 64 * 1024);
    const handle = await fs.open(abs, 'r');
    let mediaType = null;
    let bytesRead = 0;
    let totalBytes = 0;
    try {
      const stat = await handle.stat();
      totalBytes = stat.size;
      const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
      const read = await handle.read(buffer, 0, buffer.length, 0);
      bytesRead = read.bytesRead;
      mediaType = detectBinaryType(buffer.slice(0, bytesRead));
    } finally {
      await handle.close();
    }
    const payload = {
      ok: true,
      path: target,
      mediaType,
      bytes: totalBytes,
      bytesRead,
      truncated: totalBytes > bytesRead,
    };
    if (argv.includes('--json')) {
      const result = await maybeSpoolJsonResult('image inspect', payload, 12000);
      writeJsonOutput(result.value);
      return;
    }
    console.log(`${target}: ${mediaType || 'unknown'} (${totalBytes} bytes)`);
    if (totalBytes > bytesRead) {
      console.log(`Preview limited to ${bytesRead} bytes. Use --max-bytes to inspect more.`);
    }
    return;
  }
  if (sub === 'encode') {
    if (!target || target === '--help' || target === '-h') return console.log('Usage: mm image encode <path> [--json]');
    const abs = await resolveExternalSourcePath(target);
    const maxChars = parseFlagNumber(argv, '--max-bytes', 256 * 1024);
    const allowLarge = argv.includes('--allow-large');
    const stat = await fs.stat(abs);
    if (stat.size > maxChars && !allowLarge) {
      console.log(`Refusing ${target}: ${stat.size} bytes exceeds --max-bytes ${maxChars}. Pass --allow-large to override.`);
      process.exitCode = 2;
      return;
    }
    const handle = await fs.open(abs, 'r');
    let mediaType = null;
    try {
      const buffer = Buffer.alloc(Math.min(stat.size, 4096));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      mediaType = detectBinaryType(buffer.slice(0, bytesRead));
    } finally {
      await handle.close();
    }
    if (!mediaType || !mediaType.startsWith('image/')) {
      console.log(`Unsupported image file: ${target}`);
      process.exitCode = 2;
      return;
    }
    const buffer = await fs.readFile(abs);
    const payload = {
      ok: true,
      path: target,
      base64: buffer.toString('base64'),
    };
    if (argv.includes('--json')) {
      const result = await maybeSpoolJsonResult('image encode', payload, maxChars);
      writeJsonOutput(result.value);
      return;
    }
    if (payload.base64.length > maxChars) {
      const spooled = await spoolResult('image encode', 'md', payload.base64);
      console.log(`Base64 output spooled to ${spooled.path}`);
      return;
    }
    console.log(payload.base64);
    return;
  }
  if (sub === 'add') {
    if (!target || target === '--help' || target === '-h') return console.log('Usage: mm image add <path>');
    const maxBytes = parseFlagNumber(argv, '--max-bytes', 256 * 1024);
    const allowLarge = argv.includes('--allow-large');
    const item = await withLock('repo-write', () => storeImage(target, { maxBytes, allowLarge }), { command: 'mm image add' });
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, item });
      return;
    }
    console.log(`Stored image: ${item.id}`);
    return;
  }
  console.log(`Unknown image subcommand: ${sub}`);
}

export async function addRawImage(filepath, options = {}) {
  return storeImage(filepath, options);
}
