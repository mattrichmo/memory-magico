import { safeParseJson } from './json-safe.mjs';

function isJsonChunk(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return true;
  return safeParseJson(trimmed, undefined) !== undefined;
}

export function installJsonStdoutGuard() {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalErrorWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = function guardedWrite(chunk, encoding, callback) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk);
    if (isJsonChunk(text)) {
      return originalWrite(chunk, encoding, callback);
    }
    return originalErrorWrite(text, encoding, callback);
  };

  return function restore() {
    process.stdout.write = originalWrite;
  };
}

export async function withJsonStdoutGuard(fn) {
  const restore = installJsonStdoutGuard();
  try {
    return await fn();
  } finally {
    restore();
  }
}

