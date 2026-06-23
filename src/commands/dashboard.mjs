import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { parseArgs } from '../core/cli.mjs';
import { memoryRoot, repoRoot, toolRoot } from '../core/paths.mjs';
import { buildDashboardData } from '../core/dashboard-data.mjs';
import { writeJsonFile } from '../core/json.mjs';
import { listRecords, readLatestIndex } from '../core/records.mjs';
import { pageIndexRows, scanMarkdownPages } from '../core/pages.mjs';
import { findEntityRecord } from '../core/entities.mjs';
import { resolveEntity, search } from '../core/retrieval.mjs';
import { readGitDiff, readGitLog, readGitStatus as readGitStatusCore } from '../core/git.mjs';
import { withLock } from '../core/lock.mjs';
import { readClaims } from '../core/claims.mjs';
import { listDashboardRoutes } from '../core/dashboard-contracts.mjs';
import { getCommand } from '../core/command-registry.mjs';
import { resolveSubcommandContract } from '../core/subcommand-registry.mjs';

// Two dashboard UIs ship with the tool. v2 is the default; `mm dashboard 1`
// (or --v1) serves the original. Both are served by this same API server.
const DASHBOARD_ROOTS = {
  1: path.join(toolRoot, 'dashboard'),
  2: path.join(toolRoot, 'dashboard-v2'),
};
const DEFAULT_DASHBOARD_VERSION = 2;
// Active root for static serving. run() sets this from the parsed version before
// the server starts; serveStatic falls back to it when no root is passed.
let activeDashboardRoot = DASHBOARD_ROOTS[DEFAULT_DASHBOARD_VERSION];
const defaultPort = 4317;
const gitStatusTtlMs = 5000;
let gitStatusCache = null;
let gitStatusCacheAt = 0;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const roots = {
  issues: path.join(memoryRoot, 'work', 'issues'),
  sprints: path.join(memoryRoot, 'work', 'sprints'),
  phases: path.join(memoryRoot, 'work', 'phases'),
  tasks: path.join(memoryRoot, 'work', 'tasks'),
  containers: path.join(memoryRoot, 'work', 'containers'),
  initiatives: path.join(memoryRoot, 'work', 'initiatives'),
  comments: path.join(memoryRoot, 'work', 'comments'),
  raw: path.join(memoryRoot, 'inbox', 'raw-items.jsonl'),
  discoveries: path.join(memoryRoot, 'work', 'discoveries'),
  wiki: path.join(memoryRoot, 'wiki'),
  graph: path.join(memoryRoot, 'issues', 'relationships.jsonl'),
};

function contentType(filePath) {
  return mimeTypes[path.extname(filePath)] || 'application/octet-stream';
}

function maybeOpenBrowser(url) {
  const platform = process.platform;
  let command = null;
  let args = [];
  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // Ignore browser-open failures. The command still prints the URL.
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readRequestJson(req) {
  if (!req) return {};
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding?.('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(Object.assign(new Error('Invalid JSON request body.'), { code: 'INVALID_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

function normalizeCommandArgs(payload) {
  const args = Array.isArray(payload?.args) ? payload.args : Array.isArray(payload?.argv) ? payload.argv : [];
  return args.map(value => String(value));
}

function commandPreview(args) {
  return `mm ${args.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')}`;
}

function validateCommandPayload(payload) {
  const args = normalizeCommandArgs(payload);
  const commandName = args[0] || '';
  const command = getCommand(commandName);
  if (!args.length || !command) {
    return {
      ok: false,
      statusCode: 400,
      payload: {
        ok: false,
        error: { code: 'UNKNOWN_COMMAND', message: `Unknown command: ${commandName || '(missing)'}`, hint: 'Pass args as ["issue","create",...].' },
      },
    };
  }
  const contract = resolveSubcommandContract(command.name, args);
  return {
    ok: true,
    args,
    command,
    contract,
    preview: commandPreview(args),
  };
}

function runCliCommand(args) {
  return new Promise(resolve => {
    // Pin executed commands to the workspace the dashboard is serving, not the
    // tool's own repo. Otherwise the child re-resolves a different workspace
    // from toolRoot and mutations land in the wrong memory/ store.
    const child = spawn(process.execPath, [path.join(toolRoot, 'bin', 'mm.mjs'), ...args], {
      cwd: repoRoot,
      env: { ...process.env, MEMORYMAGICO_MEMORY_ROOT: memoryRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', status => {
      let parsedJson = null;
      try {
        parsedJson = JSON.parse(stdout);
      } catch {
        parsedJson = null;
      }
      resolve({ status, stdout, stderr, parsedJson });
    });
  });
}

function normalizePathname(urlPath) {
  try {
    return decodeURIComponent(urlPath || '/');
  } catch {
    return null;
  }
}

export async function serveStatic(reqPath, res, root = activeDashboardRoot) {
  const decoded = normalizePathname(reqPath);
  if (!decoded) {
    sendText(res, 400, 'Bad request');
    return;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = path.join(root, relative);
  const resolved = path.resolve(filePath);
  const outside = path.relative(root, resolved);
  if (outside.startsWith('..') || path.isAbsolute(outside)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const body = await fs.readFile(resolved);
    res.writeHead(200, { 'Content-Type': contentType(resolved), 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

async function readGitStatus() {
  const now = Date.now();
  if (gitStatusCache && now - gitStatusCacheAt < gitStatusTtlMs) {
    return gitStatusCache;
  }
  const status = await readGitStatusCore();
  gitStatusCache = status;
  gitStatusCacheAt = now;
  return status;
}

async function loadWikiPage(id) {
  const pages = await scanMarkdownPages([roots.wiki]);
  return pages.find(page => page.id === id || page.path === id || page.slug === id) || null;
}

export async function handleApi(pathname, searchParams, res, req = null) {
  if (pathname === '/api/dashboard/routes') {
    sendJson(res, 200, { ok: true, routes: listDashboardRoutes() });
    return;
  }

  if (pathname === '/api/dashboard') {
    const payload = await buildDashboardData();
    sendJson(res, 200, payload);
    return;
  }

  if (pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      roots,
    });
    return;
  }

  if (pathname === '/api/issues') {
    sendJson(res, 200, { ok: true, items: await listRecords(roots.issues) });
    return;
  }

  if (pathname === '/api/work/issues') {
    const issueType = searchParams.get('issueType');
    const items = await listRecords(roots.issues);
    sendJson(res, 200, { ok: true, items: issueType ? items.filter(item => item.issueType === issueType || item.type === issueType) : items });
    return;
  }

  if (pathname === '/api/work/sprints') {
    sendJson(res, 200, { ok: true, items: await listRecords(roots.sprints) });
    return;
  }

  if (pathname === '/api/work/phases') {
    sendJson(res, 200, { ok: true, items: await listRecords(roots.phases) });
    return;
  }

  if (pathname === '/api/work/tasks') {
    sendJson(res, 200, { ok: true, items: await listRecords(roots.tasks) });
    return;
  }

  if (pathname === '/api/work/discoveries') {
    sendJson(res, 200, { ok: true, items: await listRecords(roots.discoveries) });
    return;
  }

  if (pathname === '/api/work/containers') {
    sendJson(res, 200, { ok: true, items: await listRecords(roots.containers) });
    return;
  }

  if (pathname === '/api/work/initiatives') {
    sendJson(res, 200, { ok: true, items: await listRecords(roots.initiatives) });
    return;
  }

  if (pathname === '/api/work/comments' || pathname === '/api/knowledge/comments') {
    sendJson(res, 200, { ok: true, items: await listRecords(roots.comments) });
    return;
  }

  if (pathname === '/api/raw') {
    sendJson(res, 200, { ok: true, items: await readLatestIndex(roots.raw) });
    return;
  }

  if (pathname === '/api/intake/raw') {
    sendJson(res, 200, { ok: true, items: await readLatestIndex(roots.raw) });
    return;
  }

  if (pathname === '/api/discoveries') {
    sendJson(res, 200, { ok: true, items: await listRecords(roots.discoveries) });
    return;
  }

  if (pathname === '/api/wiki') {
    const pages = await scanMarkdownPages([roots.wiki]);
    sendJson(res, 200, { ok: true, pages: pageIndexRows(pages) });
    return;
  }

  if (pathname === '/api/knowledge/wiki') {
    const pages = await scanMarkdownPages([roots.wiki]);
    sendJson(res, 200, { ok: true, pages: pageIndexRows(pages) });
    return;
  }

  if (pathname === '/api/knowledge/claims') {
    sendJson(res, 200, { ok: true, items: await readClaims() });
    return;
  }

  if (pathname === '/api/graph') {
    const edges = await readLatestIndex(roots.graph);
    const node = searchParams.get('node');
    const filtered = node ? edges.filter(edge => edge.from?.id === node || edge.to?.id === node) : edges;
    sendJson(res, 200, { ok: true, edges: filtered });
    return;
  }

  if (pathname === '/api/git/status') {
    const status = await readGitStatus();
    sendJson(res, 200, { ok: true, ...status });
    return;
  }

  if (pathname === '/api/system/status') {
    const [dashboard, git] = await Promise.all([buildDashboardData(), readGitStatus()]);
    sendJson(res, 200, { ok: true, generatedAt: dashboard.generatedAt, summary: dashboard.summary, indices: dashboard.indices, git });
    return;
  }

  if (pathname === '/api/command/dry-run' || pathname === '/api/command/execute') {
    const method = req?.method || 'POST';
    if (method !== 'POST') {
      sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Command endpoints require POST.' } });
      return;
    }
    const payload = await readRequestJson(req);
    const validation = validateCommandPayload(payload);
    if (!validation.ok) {
      sendJson(res, validation.statusCode, validation.payload);
      return;
    }
    const commandContract = validation.contract ? {
      id: validation.contract.id,
      domain: validation.contract.domain,
      readOnly: validation.contract.readOnly,
      lockScope: validation.contract.lockScope,
      roleTags: validation.contract.roleTags,
      lifecycleEffects: validation.contract.lifecycleEffects,
      requiredEvidence: validation.contract.requiredEvidence,
    } : null;
    if (pathname === '/api/command/dry-run') {
      sendJson(res, 200, {
        ok: true,
        mode: 'dry-run',
        command: validation.preview,
        args: validation.args,
        contract: commandContract,
        wouldExecute: false,
      });
      return;
    }
    const result = await runCliCommand(validation.args);
    sendJson(res, result.status === 0 ? 200 : 400, {
      ok: result.status === 0,
      mode: 'execute',
      command: validation.preview,
      args: validation.args,
      contract: commandContract,
      result: {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        parsedJson: result.parsedJson,
      },
    });
    return;
  }

  if (pathname === '/api/search') {
    const q = (searchParams.get('q') || '').trim();
    if (!q) {
      sendJson(res, 400, { ok: false, error: { code: 'MISSING_QUERY', message: 'Missing q parameter.' } });
      return;
    }
    const limit = Number(searchParams.get('limit') || 10) || 10;
    const mode = searchParams.get('mode') || 'hybrid';
    const kind = searchParams.get('kind') || null;
    const results = await search(q, { kind, limit, mode, includeBody: true });
    sendJson(res, 200, { ok: true, query: q, results });
    return;
  }

  if (pathname === '/api/resolve') {
    const q = (searchParams.get('q') || '').trim();
    if (!q) {
      sendJson(res, 400, { ok: false, error: { code: 'MISSING_QUERY', message: 'Missing q parameter.' } });
      return;
    }
    const kind = searchParams.get('kind') || null;
    const limit = Number(searchParams.get('limit') || 5) || 5;
    const results = await resolveEntity(q, { kind, limit });
    sendJson(res, 200, { ok: true, query: q, results });
    return;
  }

  if (pathname.startsWith('/api/entity/')) {
    const [, , , kindRaw, ...idParts] = pathname.split('/');
    const kind = kindRaw || '';
    const id = idParts.join('/');
    if (!kind || !id) {
      sendJson(res, 400, { ok: false, error: { code: 'MISSING_ENTITY', message: 'Missing entity kind or id.' } });
      return;
    }
    if (kind === 'wiki' || kind === 'wiki_page') {
      const page = await loadWikiPage(id);
      if (!page) {
        sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `No wiki page found for ${id}.` } });
        return;
      }
      sendJson(res, 200, { ok: true, entity: page });
      return;
    }
    const lookupKind = kind === 'raw' ? 'raw_item' : kind;
    const entity = await findEntityRecord(id, lookupKind);
    if (!entity) {
      sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `No entity found for ${kind}/${id}.` } });
      return;
    }
    sendJson(res, 200, { ok: true, entity });
    return;
  }

  if (pathname === '/api/git/log') {
    const target = searchParams.get('path') || null;
    const limit = Number(searchParams.get('limit') || 20) || 20;
    const log = await readGitLog(target, limit);
    sendJson(res, 200, { ok: true, path: target, log });
    return;
  }

  if (pathname === '/api/git/diff') {
    const target = searchParams.get('path') || null;
    const memoryOnly = searchParams.get('memory') === '1' || searchParams.get('memory') === 'true';
    const diff = await readGitDiff({ path: target, memoryOnly });
    sendJson(res, 200, { ok: true, path: target, diff });
    return;
  }

  sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown dashboard API route.' } });
}

function resolveDashboardVersion(opts) {
  const positionals = opts._ || [];
  if (positionals.includes('1') || opts.v1 || String(opts.version) === '1') return 1;
  if (positionals.includes('2') || opts.v2 || String(opts.version) === '2') return 2;
  return DEFAULT_DASHBOARD_VERSION;
}

export async function run(argv) {
  const opts = parseArgs(argv, 1);
  const positionals = opts._ || [];
  const sub = positionals.includes('build') ? 'build' : 'serve';

  if (sub === 'build') {
    const outFile = path.join(memoryRoot, 'generated', 'dashboard.json');
    const payload = await withLock('repo-write', async () => {
      const next = await buildDashboardData();
      await writeJsonFile(outFile, next);
      return next;
    }, { command: 'mm dashboard build' });
    console.log(`Built dashboard snapshot: ${path.relative(toolRoot, outFile)}`);
    return;
  }

  const version = resolveDashboardVersion(opts);
  const dashboardRoot = DASHBOARD_ROOTS[version];
  try {
    await fs.access(path.join(dashboardRoot, 'index.html'));
  } catch {
    console.error(`Dashboard v${version} is not available (missing ${path.relative(toolRoot, dashboardRoot)}/index.html).`);
    process.exitCode = 1;
    return;
  }
  activeDashboardRoot = dashboardRoot;

  const port = Number(opts.port || defaultPort);
  const host = String(opts.host || '127.0.0.1');
  const noOpen = Boolean(opts['no-open']);
  const url = `http://${host}:${port}`;

  if (host !== '127.0.0.1') {
    console.warn(`Warning: dashboard is binding to ${host}. This may expose local memory data on your network.`);
  }

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${host}:${port}`);
    const pathname = normalizePathname(requestUrl.pathname);
    if (!pathname) {
      sendText(res, 400, 'Bad request');
      return;
    }
    if (pathname.startsWith('/api/')) {
      try {
        await handleApi(pathname, requestUrl.searchParams, res, req);
      } catch (error) {
        const statusCode = error?.code === 'PATH_OUTSIDE_MEMORY_ROOT' || error?.code === 'INVALID_ARGUMENT' ? 400 : 500;
        sendJson(res, statusCode, {
          ok: false,
          error: {
            code: error?.code || 'INTERNAL_ERROR',
            message: error?.message || 'Dashboard API request failed.',
          },
        });
      }
      return;
    }
    await serveStatic(pathname, res);
  });

  server.on('error', error => {
    console.error(`Dashboard server failed: ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const actualUrl = `http://${host}:${actualPort}`;
    console.log(`MemoryMagico dashboard (v${version}) running at ${actualUrl}`);
    if (version === 2) {
      console.log('Note: v2 currently renders bundled fixture data (dashboard-v2/data.js), not the live workspace.');
    }
    console.log(version === 1 ? 'Tip: this is the original UI; omit "1" (or pass 2) for the new dashboard.' : 'Tip: pass `1` (e.g. `mm dashboard 1`) to launch the original UI.');
    console.log('Press Ctrl+C to stop.');
    if (!noOpen) maybeOpenBrowser(actualUrl);
  });
}
