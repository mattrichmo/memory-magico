export function createAbortController() {
  return new AbortController();
}

export async function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason || new Error('Command aborted.');
  }
}

