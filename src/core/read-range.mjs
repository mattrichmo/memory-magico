import fs from 'fs/promises';

export async function readTextRange(filePath, { offsetLine = 0, maxLines = 200, maxBytes = 64 * 1024, stripBom = true, normalizeCrlf = true, includeMetadata = true } = {}) {
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(Math.max(bytesToRead, 0));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    let text = buffer.slice(0, bytesRead).toString('utf8');
    if (stripBom) text = text.replace(/^\uFEFF/, '');
    if (normalizeCrlf) text = text.replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const sliced = lines.slice(offsetLine, offsetLine + maxLines);
    const content = sliced.join('\n');
    const truncatedByLines = offsetLine + maxLines < lines.length;
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
      startsAtLine: offsetLine + 1,
      endsAtLine: offsetLine + sliced.length,
      content,
      mtimeMs: stat.mtimeMs,
      ...(includeMetadata ? {} : {}),
    };
  } finally {
    await handle.close();
  }
}

