export function parseArgs(argv, start = 2) {
  const out = { _: [] };
  let literal = false;
  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (!literal && a === '--') {
      literal = true;
      continue;
    }
    if (literal) {
      out._.push(a);
      continue;
    }
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.replace(/^--/, '');
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[key] = val;
  }
  return out;
}

export function splitList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(v => splitList(v));
  return value.toString().split(',').map(s => s.trim()).filter(Boolean);
}

export function requiredArg(opts, key, message) {
  if (!opts[key]) {
    throw new Error(message || `Missing required option --${key}`);
  }
  return opts[key];
}
