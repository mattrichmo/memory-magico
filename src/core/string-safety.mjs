const SUSPICIOUS_RE = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufdd0-\ufdef]/u;

export function sanitizeCliString(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufdd0-\ufdef]/gu, '')
    .trim();
}

export function sanitizeFrontmatterKey(key) {
  return sanitizeCliString(key)
    .replace(/[-\s]+([a-zA-Z0-9])/g, (_, ch) => ch.toUpperCase())
    .replace(/_([a-zA-Z0-9])/g, (_, ch) => ch.toUpperCase());
}

export function sanitizeSearchQuery(query) {
  return sanitizeCliString(query);
}

export function sanitizeRecordForMachineIo(record) {
  if (!record || typeof record !== 'object') return record;
  if (Array.isArray(record)) return record.map(sanitizeRecordForMachineIo);
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    out[sanitizeFrontmatterKey(key)] = typeof value === 'string' ? sanitizeCliString(value) : sanitizeRecordForMachineIo(value);
  }
  return out;
}

export function detectSuspiciousUnicode(value) {
  const text = String(value ?? '');
  return {
    hasSuspiciousUnicode: SUSPICIOUS_RE.test(text) || text.normalize('NFKC') !== text,
    text,
  };
}

