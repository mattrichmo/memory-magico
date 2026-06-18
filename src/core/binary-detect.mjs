const MAGIC = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

export function detectBinaryType(buffer) {
  if (!buffer || !buffer.length) return null;
  for (const magic of MAGIC) {
    if (magic.bytes.every((byte, index) => buffer[index] === byte)) return magic.type;
  }
  if (buffer.includes(0x00)) return 'application/octet-stream';
  return null;
}

export function looksBinary(buffer) {
  return Boolean(detectBinaryType(buffer));
}
