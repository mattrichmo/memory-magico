import fs from 'fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export async function readTextRange(filePath, { offsetLine = 0, maxLines = 200, maxBytes = 64 * 1024, stripBom = true, normalizeCrlf = true, includeMetadata = true } = {}) {
  const stat = await fs.stat(filePath);
  if (offsetLine > 0) {
    const stream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    const lines = [];
    let totalLines = 0;
    let sawFirstLine = false;
    try {
      for await (let line of rl) {
        totalLines += 1;
        if (!sawFirstLine && stripBom) {
          line = line.replace(/^\uFEFF/, '');
          sawFirstLine = true;
        }
        if (totalLines <= offsetLine) continue;
        if (lines.length < maxLines) lines.push(line);
      }
    } finally {
      rl.close();
      stream.destroy();
    }
    const content = lines.join('\n');
    return {
      path: filePath,
      offsetLine,
      maxLines,
      maxBytes,
      bytesRead: stat.size,
      totalBytes: stat.size,
      totalLinesKnown: true,
      truncatedByLines: totalLines > offsetLine + maxLines,
      truncatedByBytes: false,
      byteBoundedPreview: false,
      offsetAppliedAfterByteLimit: false,
      startsAtLine: offsetLine + 1,
      endsAtLine: offsetLine + lines.length,
      content,
      mtimeMs: stat.mtimeMs,
      ...(includeMetadata ? {} : {}),
    };
  }

  const handle = await fs.open(filePath, 'r');
  try {
    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(Math.max(bytesToRead, 0));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    let text = buffer.slice(0, bytesRead).toString('utf8');
    if (stripBom) text = text.replace(/^\uFEFF/, '');
    if (normalizeCrlf) text = text.replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const sliced = lines.slice(0, maxLines);
    const content = sliced.join('\n');
    const truncatedByLines = maxLines < lines.length;
    const truncatedByBytes = stat.size > bytesToRead;
    return {
      path: filePath,
      offsetLine,
      maxLines,
      maxBytes,
      bytesRead,
      totalBytes: stat.size,
      totalLinesKnown: !truncatedByBytes,
      truncatedByLines,
      truncatedByBytes,
      byteBoundedPreview: true,
      offsetAppliedAfterByteLimit: false,
      startsAtLine: 1,
      endsAtLine: sliced.length,
      content,
      mtimeMs: stat.mtimeMs,
      ...(includeMetadata ? {} : {}),
    };
  } finally {
    await handle.close();
  }
}
