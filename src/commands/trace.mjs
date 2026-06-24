import {
  currentTraceStatus,
  listTraceEvents,
  listTraceSessions,
  loadTraceConfig,
  markTrace,
  saveTraceConfig,
  setTraceContext,
  setTraceEnabled,
} from '../core/trace.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

function usage() {
  console.log('Usage: mm trace <on|off|status|mark|context|sessions|show> ...');
  console.log('Aliases: mm logging yes | mm logging no | mm logging status');
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function parseIdleTimeoutMs(argv) {
  const raw = valueAfter(argv, '--idle-timeout-minutes') || valueAfter(argv, '--idle-minutes');
  if (!raw) return null;
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60 * 1000) : null;
}

function parseLimit(argv, fallback = 20) {
  const raw = valueAfter(argv, '--limit');
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function labelFromArgs(argv, start = 2) {
  const flagIndex = argv.slice(start).findIndex(arg => String(arg).startsWith('--'));
  const end = flagIndex === -1 ? argv.length : start + flagIndex;
  return argv.slice(start, end).join(' ').trim();
}

function normalizeLoggingAlias(argv) {
  if (argv[0] !== 'logging') return argv;
  const sub = argv[1] || 'status';
  if (sub === 'yes' || sub === 'on' || sub === 'enable') return ['trace', 'on', ...argv.slice(2)];
  if (sub === 'no' || sub === 'off' || sub === 'disable') return ['trace', 'off', ...argv.slice(2)];
  return ['trace', sub, ...argv.slice(2)];
}

function contextFromArgs(argv) {
  const current = {};
  const agent = valueAfter(argv, '--agent');
  const label = valueAfter(argv, '--label') || labelFromArgs(argv, 3);
  const upstreamSessionId = valueAfter(argv, '--upstream-session') || valueAfter(argv, '--session') || valueAfter(argv, '--upstream-session-id');
  if (agent) current.agent = agent;
  if (label) current.label = label;
  if (upstreamSessionId) current.upstreamSessionId = upstreamSessionId;
  return Object.keys(current).length ? { ...current, setAt: new Date().toISOString() } : null;
}

function printStatus(status) {
  const { config, activeSession, traceRoot } = status;
  console.log(`Trace: ${config.enabled ? 'on' : 'off'}`);
  console.log(`Level: ${config.level}`);
  console.log(`Redaction: ${config.redaction}`);
  console.log(`Idle timeout: ${Math.round(config.idleTimeoutMs / 60000)} minute(s)`);
  console.log(`Trace root: ${traceRoot}`);
  if (config.context) {
    const parts = [];
    if (config.context.agent) parts.push(`agent=${config.context.agent}`);
    if (config.context.upstreamSessionId) parts.push(`upstream=${config.context.upstreamSessionId}`);
    if (config.context.label) parts.push(`label=${config.context.label}`);
    if (parts.length) console.log(`Context: ${parts.join(' ')}`);
  }
  if (activeSession?.id) console.log(`Active session: ${activeSession.id} (${activeSession.lastEventAt})`);
}

export async function run(inputArgv = []) {
  const argv = normalizeLoggingAlias(inputArgv);
  const sub = argv[1] || 'status';
  const json = argv.includes('--json');

  if (sub === '--help' || sub === '-h' || sub === 'help') {
    usage();
    return;
  }

  if (sub === 'on' || sub === 'enable') {
    const level = valueAfter(argv, '--level') || (argv.includes('--debug') ? 'debug' : argv.includes('--verbose') ? 'verbose' : null);
    const redaction = argv.includes('--include-sensitive') ? 'none' : valueAfter(argv, '--redaction');
    const idleTimeoutMs = parseIdleTimeoutMs(argv);
    const label = valueAfter(argv, '--label');
    const existing = await loadTraceConfig();
    const config = await setTraceEnabled(true, {
      ...(level ? { level } : {}),
      ...(redaction ? { redaction } : {}),
      ...(idleTimeoutMs ? { idleTimeoutMs } : {}),
      ...(label ? { context: { ...(existing.context || {}), label, markedAt: new Date().toISOString() } } : {}),
    });
    if (json) {
      writeJsonOutput({ ok: true, config });
      return;
    }
    console.log(`Trace enabled (${config.level}, redaction=${config.redaction}).`);
    return;
  }

  if (sub === 'off' || sub === 'disable') {
    const config = await setTraceEnabled(false);
    if (json) {
      writeJsonOutput({ ok: true, config });
      return;
    }
    console.log('Trace disabled.');
    return;
  }

  if (sub === 'status') {
    const status = await currentTraceStatus();
    if (json) {
      writeJsonOutput(status);
      return;
    }
    printStatus(status);
    return;
  }

  if (sub === 'mark') {
    const label = valueAfter(argv, '--label') || labelFromArgs(argv, 2);
    if (!label) {
      console.log('Usage: mm trace mark <label>');
      return;
    }
    const config = await markTrace(label);
    if (json) {
      writeJsonOutput({ ok: true, config });
      return;
    }
    console.log(`Trace label: ${label}`);
    return;
  }

  if (sub === 'context') {
    const action = argv[2] || 'show';
    if (action === 'clear') {
      const config = await setTraceContext(null);
      if (json) {
        writeJsonOutput({ ok: true, config });
        return;
      }
      console.log('Trace context cleared.');
      return;
    }
    if (action === 'set') {
      const context = contextFromArgs(argv);
      if (!context) {
        console.log('Usage: mm trace context set [--agent codex|claude] [--upstream-session <id>] [--label "..."]');
        return;
      }
      const config = await setTraceContext(context);
      if (json) {
        writeJsonOutput({ ok: true, config });
        return;
      }
      console.log('Trace context updated.');
      return;
    }
    const status = await currentTraceStatus();
    if (json) {
      writeJsonOutput({ ok: true, context: status.config.context || null });
      return;
    }
    console.log(JSON.stringify(status.config.context || {}, null, 2));
    return;
  }

  if (sub === 'sessions') {
    const sessions = await listTraceSessions({ limit: parseLimit(argv, 20) });
    if (json) {
      writeJsonOutput({ ok: true, sessions });
      return;
    }
    if (!sessions.length) {
      console.log('No trace sessions found.');
      return;
    }
    for (const session of sessions) {
      const label = session.context?.label ? ` ${session.context.label}` : '';
      console.log(`${session.id} ${session.lastAt} commands=${session.commandCount} failures=${session.failureCount}${label}`);
    }
    return;
  }

  if (sub === 'show') {
    const sessionId = argv[2];
    if (!sessionId) {
      console.log('Usage: mm trace show <session-id> [--json]');
      return;
    }
    const events = await listTraceEvents({ sessionId, limit: parseLimit(argv, 1000) });
    if (json) {
      writeJsonOutput({ ok: true, sessionId, events });
      return;
    }
    if (!events.length) {
      console.log('No trace events found for session:', sessionId);
      return;
    }
    for (const event of events) {
      if (event.event === 'command.end') {
        console.log(`${event.at} ${event.status} ${event.command}`);
      } else {
        console.log(`${event.at} ${event.event} ${event.control || ''}`.trim());
      }
    }
    return;
  }

  if (sub === 'config') {
    const update = {};
    const level = valueAfter(argv, '--level');
    const idleTimeoutMs = parseIdleTimeoutMs(argv);
    const redaction = valueAfter(argv, '--redaction') || (argv.includes('--include-sensitive') ? 'none' : null);
    if (level) update.level = level;
    if (idleTimeoutMs) update.idleTimeoutMs = idleTimeoutMs;
    if (redaction) update.redaction = redaction;
    const config = await saveTraceConfig(update);
    if (json) {
      writeJsonOutput({ ok: true, config });
      return;
    }
    console.log('Trace config updated.');
    return;
  }

  usage();
}
