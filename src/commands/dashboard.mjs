import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { parseArgs } from '../core/cli.mjs';
import { memoryRoot, toolRoot } from '../core/paths.mjs';
import { buildDashboardData } from '../core/dashboard-data.mjs';
import { writeJsonFile } from '../core/json.mjs';

const dashboardRoot = path.join(toolRoot, 'dashboard');
const defaultPort = 4317;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
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
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // Ignore browser-open failures. The command still prints the URL.
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload, null, 2));
}

async function serveStatic(reqPath, res) {
  const relative = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  const filePath = path.join(dashboardRoot, relative);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(dashboardRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const body = await fs.readFile(normalized);
    res.writeHead(200, { 'Content-Type': contentType(normalized), 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

export async function run(argv) {
  const opts = parseArgs(argv, 1);
  const sub = argv[1] || 'serve';

  if (sub === 'build') {
    const outFile = path.join(memoryRoot, 'generated', 'dashboard.json');
    const payload = await buildDashboardData();
    await writeJsonFile(outFile, payload);
    console.log(`Built dashboard snapshot: ${path.relative(toolRoot, outFile)}`);
    return;
  }

  const port = Number(opts.port || defaultPort);
  const host = String(opts.host || '127.0.0.1');
  const noOpen = Boolean(opts['no-open']);
  const url = `http://${host}:${port}`;

  const server = http.createServer(async (req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    if (reqPath === '/api/dashboard') {
      try {
        const payload = await buildDashboardData();
        sendJson(res, 200, payload);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    await serveStatic(reqPath, res);
  });

  server.on('error', error => {
    console.error(`Dashboard server failed: ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`MemoryMagico dashboard running at ${url}`);
    console.log('Press Ctrl+C to stop.');
    if (!noOpen) maybeOpenBrowser(url);
  });
}
