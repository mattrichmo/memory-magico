import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { appendJsonl, readJsonl, writeJsonFile } from './json.mjs';
import { memoryManifestFile, memoryRoot, repoRoot } from './paths.mjs';
import { makeId } from './ids.mjs';

const TRACE_SCHEMA_VERSION = 1;
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const VALID_LEVELS = new Set(['basic', 'verbose', 'debug']);
const VALID_REDACTION = new Set(['default', 'none']);

const SENSITIVE_FLAGS = new Set([
  '--acceptance',
  '--body',
  '--description',
  '--evidence',
  '--goal',
  '--note',
  '--outcome',
  '--prompt',
  '--reason',
  '--risk',
  '--summary',
  '--success-gates',
  '--test',
  '--text',
  '--verification',
  '--why',
]);

const SENSITIVE_POSITIONAL = new Set([
  'capture.add',
  'claim.add',
  'claim.contradict',
  'comment.add',
  'raw.add',
]);

function traceRoot(root = memoryRoot) {
  return path.join(root, '.mm', 'trace');
}

function traceConfigPath(root = memoryRoot) {
  return path.join(traceRoot(root), 'config.json');
}

function traceStatePath(root = memoryRoot) {
  return path.join(traceRoot(root), 'state.json');
}

function traceEventsDir(root = memoryRoot) {
  return path.join(traceRoot(root), 'events');
}

function traceEventPath(root, at) {
  return path.join(traceEventsDir(root), `${String(at).slice(0, 10)}.jsonl`);
}

function normalizeLevel(level) {
  return VALID_LEVELS.has(level) ? level : 'basic';
}

function normalizeRedaction(redaction) {
  return VALID_REDACTION.has(redaction) ? redaction : 'default';
}

function defaultConfig() {
  return {
    schemaVersion: TRACE_SCHEMA_VERSION,
    enabled: false,
    level: 'basic',
    idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
    redaction: 'default',
    context: null,
  };
}

async function readJsonOptional(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readWorkspaceId(root = memoryRoot) {
  const manifest = await readJsonOptional(path.join(root, memoryManifestFile));
  return manifest?.workspaceId || null;
}

function safeUserName() {
  try {
    return os.userInfo().username || null;
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseAt(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function truncate(value, max = 240) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function redactFlagValue(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    const [flag, value] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, null];
    if (SENSITIVE_FLAGS.has(flag)) {
      out.push(value === null ? flag : `${flag}=[redacted]`);
      if (value === null && i + 1 < argv.length && !String(argv[i + 1]).startsWith('--')) {
        out.push('[redacted]');
        i += 1;
      }
      continue;
    }
    out.push(truncate(arg));
  }
  return out;
}

function redactPositionals(argv, commandName, action) {
  const id = `${commandName}.${action || argv[1] || 'run'}`;
  if (!SENSITIVE_POSITIONAL.has(id)) return argv;
  const out = [...argv];
  if (id === 'raw.add' || id === 'capture.add') {
    for (let i = 2; i < out.length; i += 1) {
      if (!String(out[i]).startsWith('--')) out[i] = '[redacted]';
    }
  }
  if (id === 'comment.add') {
    for (let i = 3; i < out.length; i += 1) {
      if (!String(out[i]).startsWith('--')) out[i] = '[redacted]';
    }
  }
  if (id === 'claim.add' || id === 'claim.contradict') {
    for (let i = 3; i < out.length; i += 1) {
      if (!String(out[i]).startsWith('--')) out[i] = '[redacted]';
    }
  }
  return out;
}

export function redactArgv(argv = [], { commandName = argv[0], action = argv[1], redaction = 'default' } = {}) {
  const normalized = argv.map(arg => String(arg));
  if (normalizeRedaction(redaction) === 'none') return normalized.map(arg => truncate(arg));
  return redactPositionals(redactFlagValue(normalized), commandName, action);
}

export async function loadTraceConfig(root = memoryRoot) {
  const loaded = await readJsonOptional(traceConfigPath(root));
  const base = defaultConfig();
  if (!loaded || typeof loaded !== 'object') return base;
  return {
    ...base,
    ...loaded,
    enabled: Boolean(loaded.enabled),
    level: normalizeLevel(loaded.level),
    idleTimeoutMs: Number.isFinite(Number(loaded.idleTimeoutMs)) && Number(loaded.idleTimeoutMs) > 0
      ? Number(loaded.idleTimeoutMs)
      : DEFAULT_IDLE_TIMEOUT_MS,
    redaction: normalizeRedaction(loaded.redaction),
    context: loaded.context && typeof loaded.context === 'object' ? loaded.context : null,
  };
}

export async function saveTraceConfig(update = {}, root = memoryRoot) {
  const current = await loadTraceConfig(root);
  const next = {
    ...current,
    ...update,
    schemaVersion: TRACE_SCHEMA_VERSION,
    level: normalizeLevel(update.level || current.level),
    idleTimeoutMs: Number.isFinite(Number(update.idleTimeoutMs)) && Number(update.idleTimeoutMs) > 0
      ? Number(update.idleTimeoutMs)
      : current.idleTimeoutMs,
    redaction: normalizeRedaction(update.redaction || current.redaction),
    updatedAt: nowIso(),
  };
  await writeJsonFile(traceConfigPath(root), next);
  return next;
}

async function loadTraceState(root = memoryRoot) {
  const state = await readJsonOptional(traceStatePath(root));
  return state && typeof state === 'object' ? state : {};
}

async function saveTraceState(state, root = memoryRoot) {
  await writeJsonFile(traceStatePath(root), {
    schemaVersion: TRACE_SCHEMA_VERSION,
    ...state,
    updatedAt: nowIso(),
  });
}

function envContext() {
  return {
    agent: process.env.MEMORYMAGICO_TRACE_AGENT || process.env.MM_TRACE_AGENT || null,
    upstreamSessionId: process.env.MEMORYMAGICO_UPSTREAM_SESSION_ID || process.env.MM_UPSTREAM_SESSION_ID || null,
    label: process.env.MEMORYMAGICO_TRACE_LABEL || process.env.MM_TRACE_LABEL || null,
  };
}

function mergeContext(config) {
  const env = envContext();
  const configured = config.context || {};
  const context = {
    ...configured,
    ...(env.agent ? { agent: env.agent } : {}),
    ...(env.upstreamSessionId ? { upstreamSessionId: env.upstreamSessionId } : {}),
    ...(env.label ? { label: env.label } : {}),
  };
  return Object.keys(context).length ? context : null;
}

function sameActivityWindow(active, candidate, idleTimeoutMs, at) {
  if (!active?.id || !active.lastEventAt) return false;
  if (active.workspaceId !== candidate.workspaceId) return false;
  if (active.cwd !== candidate.cwd) return false;
  if (active.hostname !== candidate.hostname) return false;
  if (active.user !== candidate.user) return false;
  const idleMs = parseAt(at) - parseAt(active.lastEventAt);
  return idleMs >= 0 && idleMs <= idleTimeoutMs;
}

async function inferSession({ root, config, at, cwd }) {
  const explicit = process.env.MEMORYMAGICO_TRACE_SESSION_ID || process.env.MM_TRACE_SESSION_ID;
  const workspaceId = await readWorkspaceId(root);
  const candidate = {
    workspaceId,
    cwd: path.resolve(cwd || process.cwd()),
    hostname: os.hostname(),
    user: safeUserName(),
  };
  const state = await loadTraceState(root);
  const active = state.activeSession;
  if (explicit) {
    return {
      ...candidate,
      id: explicit,
      createdAt: active?.id === explicit ? active.createdAt || at : at,
      lastEventAt: at,
      explicit: true,
    };
  }
  if (sameActivityWindow(active, candidate, config.idleTimeoutMs, at)) {
    return {
      ...active,
      ...candidate,
      lastEventAt: at,
      explicit: false,
    };
  }
  return {
    ...candidate,
    id: makeId('trace'),
    createdAt: at,
    lastEventAt: at,
    explicit: false,
  };
}

function compactContract(contract) {
  if (!contract) return null;
  return {
    id: contract.id,
    command: contract.command,
    action: contract.action,
    domain: contract.domain,
    readOnly: Boolean(contract.readOnly),
    lockScope: contract.lockScope || null,
    lifecycleEffects: contract.lifecycleEffects || [],
    requiredEvidence: contract.requiredEvidence || [],
  };
}

function compactCommand(command) {
  if (!command) return null;
  return {
    name: command.name,
    category: command.category,
    readOnly: Boolean(command.readOnly),
    destructive: Boolean(command.destructive),
    concurrencySafe: Boolean(command.concurrencySafe),
    requiresFreshIndex: Boolean(command.requiresFreshIndex),
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractRefsFromValue(value, out = []) {
  if (!value) return out;
  if (typeof value === 'string') {
    const matches = value.match(/\b(?:raw|issue|task|sprint|phase|discovery|comment|container|init|result|snapshot)_[a-z0-9]+_[a-z0-9]+\b/g);
    if (matches) out.push(...matches);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach(item => extractRefsFromValue(item, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (['id', 'rawId', 'issueId', 'taskId', 'sprintId', 'phaseId', 'commentId', 'containerId'].includes(key)) {
        extractRefsFromValue(nested, out);
      } else if (key.endsWith('Ids') || key.endsWith('Refs') || key === 'items' || key === 'item') {
        extractRefsFromValue(nested, out);
      }
    }
  }
  return out;
}

function outputPreview(value) {
  if (!value || typeof value !== 'object') return null;
  const refs = unique(extractRefsFromValue(value));
  const keys = Array.isArray(value) ? [] : Object.keys(value).slice(0, 20);
  return {
    type: Array.isArray(value) ? 'array' : 'object',
    keys,
    ...(refs.length ? { entityRefs: refs } : {}),
  };
}

export function buildCommandTraceEvent({
  argv = [],
  command = null,
  contract = null,
  startedAt = null,
  endedAt = nowIso(),
  durationMs = null,
  exitCode = 0,
  error = null,
  result = null,
  config = defaultConfig(),
} = {}) {
  const commandName = command?.name || argv[0] || 'unknown';
  const action = contract?.action || (argv[1] && !String(argv[1]).startsWith('-') ? argv[1] : null);
  const redacted = redactArgv(argv, { commandName, action, redaction: config.redaction });
  const refs = unique([
    ...extractRefsFromValue(redacted),
    ...extractRefsFromValue(result),
  ]);
  const verbose = config.level === 'verbose' || config.level === 'debug';
  return {
    event: 'command.end',
    at: endedAt,
    startedAt,
    endedAt,
    durationMs,
    status: Number(exitCode) === 0 && !error ? 'success' : 'failure',
    exitCode: Number(exitCode) || 0,
    command: `mm ${redacted.join(' ')}`.trim(),
    commandName,
    action,
    argvRedacted: redacted,
    entityRefs: refs,
    ...(verbose ? {
      commandMeta: compactCommand(command),
      contract: compactContract(contract),
      output: outputPreview(result),
    } : {}),
    ...(error ? {
      error: {
        code: error.code || error.name || 'ERROR',
        message: truncate(error.message || String(error), 500),
        exitCode: error.exitCode ?? exitCode ?? 2,
      },
    } : {}),
  };
}

export async function appendTraceEvent(event, { root = memoryRoot, force = false, strict = false } = {}) {
  try {
    const config = await loadTraceConfig(root);
    if (!force && !config.enabled) return { logged: false, reason: 'disabled' };
    const at = event.at || nowIso();
    const session = await inferSession({
      root,
      config,
      at,
      cwd: event.cwd || process.cwd(),
    });
    const context = mergeContext(config);
    const payload = {
      schemaVersion: TRACE_SCHEMA_VERSION,
      ...event,
      at,
      sessionId: session.id,
      workspaceId: session.workspaceId,
      cwd: session.cwd,
      repoRoot,
      memoryRoot: root,
      hostname: session.hostname,
      user: session.user,
      pid: process.pid,
      ppid: process.ppid || null,
      trace: {
        level: config.level,
        redaction: config.redaction,
        inferredSession: !session.explicit,
      },
      ...(context ? { context } : {}),
    };
    await appendJsonl(traceEventPath(root, at), payload);
    await saveTraceState({ activeSession: session }, root);
    return { logged: true, event: payload };
  } catch (err) {
    if (strict) throw err;
    return { logged: false, reason: 'error', error: err.message };
  }
}

export async function appendCommandTrace(input = {}, options = {}) {
  const config = await loadTraceConfig(options.root || memoryRoot);
  if (!config.enabled) return { logged: false, reason: 'disabled' };
  const event = buildCommandTraceEvent({ ...input, config });
  return appendTraceEvent(event, options);
}

export async function setTraceEnabled(enabled, options = {}, root = memoryRoot) {
  const config = await saveTraceConfig({
    enabled,
    ...(options.level ? { level: options.level } : {}),
    ...(options.idleTimeoutMs ? { idleTimeoutMs: options.idleTimeoutMs } : {}),
    ...(options.redaction ? { redaction: options.redaction } : {}),
    ...(options.context !== undefined ? { context: options.context } : {}),
  }, root);
  await appendTraceEvent({
    event: 'trace.control',
    control: enabled ? 'enabled' : 'disabled',
    at: config.updatedAt,
    level: config.level,
    idleTimeoutMs: config.idleTimeoutMs,
    redaction: config.redaction,
  }, { root, force: true });
  return config;
}

export async function setTraceContext(context, root = memoryRoot) {
  const config = await saveTraceConfig({ context }, root);
  await appendTraceEvent({
    event: 'trace.control',
    control: context ? 'context.set' : 'context.clear',
    at: config.updatedAt,
    context,
  }, { root, force: true });
  return config;
}

export async function markTrace(label, root = memoryRoot) {
  const current = await loadTraceConfig(root);
  const context = {
    ...(current.context || {}),
    label,
    markedAt: nowIso(),
  };
  return setTraceContext(context, root);
}

export async function listTraceEvents({ root = memoryRoot, sessionId = null, limit = 1000 } = {}) {
  let files = [];
  try {
    files = await fs.readdir(traceEventsDir(root));
  } catch {
    return [];
  }
  const sorted = files.filter(file => file.endsWith('.jsonl')).sort();
  const events = [];
  for (const file of sorted) {
    const rows = await readJsonl(path.join(traceEventsDir(root), file));
    for (const row of rows) {
      if (sessionId && row.sessionId !== sessionId) continue;
      events.push(row);
    }
  }
  events.sort((a, b) => parseAt(a.at) - parseAt(b.at));
  return limit ? events.slice(Math.max(0, events.length - limit)) : events;
}

export async function listTraceSessions({ root = memoryRoot, limit = 20 } = {}) {
  const events = await listTraceEvents({ root, limit: 0 });
  const sessions = new Map();
  for (const event of events) {
    const id = event.sessionId;
    if (!id) continue;
    const existing = sessions.get(id) || {
      id,
      firstAt: event.at,
      lastAt: event.at,
      workspaceId: event.workspaceId || null,
      cwd: event.cwd || null,
      context: event.context || null,
      eventCount: 0,
      commandCount: 0,
      failureCount: 0,
      commands: [],
      entityRefs: [],
    };
    existing.firstAt = parseAt(event.at) < parseAt(existing.firstAt) ? event.at : existing.firstAt;
    existing.lastAt = parseAt(event.at) > parseAt(existing.lastAt) ? event.at : existing.lastAt;
    existing.context ||= event.context || null;
    existing.eventCount += 1;
    if (event.event === 'command.end') {
      existing.commandCount += 1;
      if (event.status === 'failure') existing.failureCount += 1;
      if (event.commandName && !existing.commands.includes(event.commandName)) existing.commands.push(event.commandName);
    }
    existing.entityRefs.push(...(event.entityRefs || []));
    sessions.set(id, existing);
  }
  return [...sessions.values()]
    .map(session => ({ ...session, entityRefs: unique(session.entityRefs).slice(0, 30) }))
    .sort((a, b) => parseAt(b.lastAt) - parseAt(a.lastAt))
    .slice(0, Math.max(1, Number(limit) || 20));
}

export async function currentTraceStatus(root = memoryRoot) {
  const config = await loadTraceConfig(root);
  const state = await loadTraceState(root);
  return {
    ok: true,
    config,
    activeSession: state.activeSession || null,
    traceRoot: traceRoot(root),
  };
}
