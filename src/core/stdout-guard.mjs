import util from 'node:util';
import { safeParseJson } from './json-safe.mjs';
import { InvalidJsonOutputError } from './errors.mjs';

export function installJsonStdoutGuard() {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalConsole = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    dir: console.dir,
    table: console.table,
  };
  const chunks = [];
  let restored = false;

  const pushText = text => {
    chunks.push(String(text));
  };

  const captureConsoleLine = (...args) => {
    pushText(`${util.format(...args)}\n`);
  };

  process.stdout.write = function guardedWrite(chunk, encoding, callback) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk);
    pushText(text);
    if (typeof callback === 'function') callback();
    return true;
  };

  console.log = captureConsoleLine;
  console.info = captureConsoleLine;
  console.debug = captureConsoleLine;
  console.dir = (value, options) => {
    pushText(`${util.inspect(value, options)}\n`);
  };
  console.table = (...args) => {
    pushText(`${util.format(...args)}\n`);
  };

  return function restore() {
    if (restored) return chunks.join('');
    restored = true;
    process.stdout.write = originalWrite;
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    console.dir = originalConsole.dir;
    console.table = originalConsole.table;
    return chunks.join('');
  };
}

export async function withJsonStdoutGuard(fn, { transform = null } = {}) {
  const restore = installJsonStdoutGuard();
  try {
    const result = await fn();
    const captured = restore();
    const trimmed = captured.trim();
    const invalid = Symbol('invalid-json');
    if (!trimmed) {
      throw new InvalidJsonOutputError('JSON mode produced no stdout output.');
    }
    if (safeParseJson(trimmed, invalid) === invalid) {
      throw new InvalidJsonOutputError('JSON mode produced non-JSON stdout.', {
        details: { preview: trimmed.slice(0, 500) },
      });
    }
    if (transform) {
      const parsed = safeParseJson(trimmed);
      process.stdout.write(`${JSON.stringify(transform(parsed), null, 2)}\n`);
    } else {
      process.stdout.write(captured);
    }
    return result;
  } finally {
    restore();
  }
}
