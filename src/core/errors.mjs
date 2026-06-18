export class MemoryMagicoError extends Error {
  constructor(code, message, { details = null, hint = '', exitCode = 2, cause = undefined } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.hint = hint;
    this.exitCode = exitCode;
    if (cause !== undefined) this.cause = cause;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      hint: this.hint,
      exitCode: this.exitCode,
    };
  }
}

function defineError(name, code, defaultMessage, exitCode = 2) {
  return class extends MemoryMagicoError {
    constructor(message = defaultMessage, options = {}) {
      super(code, message, { ...options, exitCode });
      this.name = name;
    }
  };
}

export const UnknownCommandError = defineError('UnknownCommandError', 'UNKNOWN_COMMAND', 'Unknown command.');
export const InvalidArgumentError = defineError('InvalidArgumentError', 'INVALID_ARGUMENT', 'Invalid argument.');
export const AmbiguousReferenceError = defineError('AmbiguousReferenceError', 'AMBIGUOUS_REFERENCE', 'Could not resolve reference uniquely.');
export const MissingReferenceError = defineError('MissingReferenceError', 'MISSING_REFERENCE', 'Missing reference.');
export const PathSafetyError = defineError('PathSafetyError', 'PATH_OUTSIDE_MEMORY_ROOT', 'Path is not allowed for this command.');
export const InvalidFrontmatterError = defineError('InvalidFrontmatterError', 'INVALID_FRONTMATTER', 'Invalid frontmatter.');
export const UnsafeUnicodeError = defineError('UnsafeUnicodeError', 'UNSAFE_UNICODE', 'Unsafe Unicode detected.');
export const MalformedJsonError = defineError('MalformedJsonError', 'MALFORMED_JSON', 'Malformed JSON.');
export const MalformedJsonlError = defineError('MalformedJsonlError', 'MALFORMED_JSONL', 'Malformed JSONL.');
export const StaleIndexError = defineError('StaleIndexError', 'STALE_INDEX', 'Search index is stale.');
export const ResultTooLargeError = defineError('ResultTooLargeError', 'RESULT_TOO_LARGE', 'Result is too large.', 0);
export const LockError = defineError('LockError', 'LOCK_HELD', 'Lock is held by another process.');
export const AbortCommandError = defineError('AbortCommandError', 'COMMAND_ABORTED', 'Command aborted.', 130);
export const UnsupportedMediaError = defineError('UnsupportedMediaError', 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type.');

export function isMemoryMagicoError(err) {
  return err instanceof MemoryMagicoError || Boolean(err && typeof err === 'object' && err.code && err.exitCode !== undefined);
}

export function toMemoryMagicoError(err, fallbackCode = 'INTERNAL_ERROR') {
  if (err instanceof MemoryMagicoError) return err;
  if (err && typeof err === 'object' && err.code && err.message) {
    return new MemoryMagicoError(err.code, err.message, {
      details: err.details ?? null,
      hint: err.hint ?? '',
      exitCode: err.exitCode ?? 2,
      cause: err.cause,
    });
  }
  const message = err instanceof Error ? err.message : String(err || 'Unknown error');
  return new MemoryMagicoError(fallbackCode, message, {
    details: err instanceof Error ? { stack: err.stack } : null,
    exitCode: 2,
    cause: err,
  });
}

