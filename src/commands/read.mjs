import fs from 'fs/promises';
import path from 'path';
import { memoryRoot, repoRoot } from '../core/paths.mjs';
import { resolveMemoryPath, resolveRepoPath } from '../core/safe-path.mjs';
import { readTextRange } from '../core/read-range.mjs';
import { detectBinaryType } from '../core/binary-detect.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

function pickPath(target) {
  if (!target) return null;
  if (target.startsWith('memory/')) return resolveRepoPath(repoRoot, target, 'repo-read');
  if (target.startsWith('./memory/') || target.startsWith('../memory/')) return resolveRepoPath(repoRoot, target, 'repo-read');
  return resolveMemoryPath(memoryRoot, target, 'memory-read');
}

async function readProbeBytes(filePath, maxBytes = 4096) {
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.slice(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function run(argv = []) {
  const target = argv[1];
  if (!target) {
    console.log('Usage: mm read <path> [--offset N] [--lines N] [--max-bytes N] [--json] [--binary-info]');
    return;
  }

  const offsetFlag = argv.indexOf('--offset');
  const linesFlag = argv.indexOf('--lines');
  const bytesFlag = argv.indexOf('--max-bytes');
  const offsetLine = offsetFlag !== -1 ? Number(argv[offsetFlag + 1]) || 0 : 0;
  const maxLines = linesFlag !== -1 ? Number(argv[linesFlag + 1]) || 200 : 200;
  const maxBytes = bytesFlag !== -1 ? Number(argv[bytesFlag + 1]) || 64 * 1024 : 64 * 1024;
  const json = argv.includes('--json');
  const binaryInfo = argv.includes('--binary-info');

  const fullPath = await pickPath(target);
  const buffer = await readProbeBytes(fullPath);
  const mediaType = detectBinaryType(buffer);

  if (mediaType && !argv.includes('--force-text')) {
    const payload = {
      ok: true,
      path: path.relative(repoRoot, fullPath),
      binary: true,
      mediaType,
      bytes: buffer.length,
    };
    if (json) return writeJsonOutput(payload);
    console.log(`${payload.path} is binary (${mediaType}, ${payload.bytes} bytes)`);
    if (binaryInfo) return;
    return;
  }

  const range = await readTextRange(fullPath, { offsetLine, maxLines, maxBytes });
  if (json) {
    writeJsonOutput({ ok: true, ...range });
    return;
  }

  console.log(range.content || '');
  if (range.truncatedByBytes || range.truncatedByLines) {
    console.log('');
    console.log(`[truncated bytes=${range.truncatedByBytes ? 'yes' : 'no'} lines=${range.truncatedByLines ? 'yes' : 'no'}]`);
  }
}
