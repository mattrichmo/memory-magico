const callbacks = new Set();

export function registerCleanup(fn) {
  callbacks.add(fn);
  return () => callbacks.delete(fn);
}

export async function runCleanup() {
  for (const fn of [...callbacks]) {
    try {
      await fn();
    } catch {
      // best effort
    }
  }
}

