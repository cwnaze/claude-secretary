// Local web dashboard: serves the prebuilt static UI and a read-only JSON API.
// Binds to 127.0.0.1 only and rejects requests whose Host is not localhost,
// so other machines (and DNS-rebinding pages) can't read the vault through it.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { homeData } from './dashboard.mjs';

export const DEFAULT_PORT = 7410;
export const UI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../ui');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), TYPES['.json']);

export function isLocalHost(host) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(host || ''));
}

// Next's static export writes /inbox as inbox.html (or inbox/index.html).
export function resolveStatic(uiDir, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  const base = path.resolve(uiDir);
  const candidates = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html', p + '/index.html'];
  for (const c of candidates) {
    const f = path.resolve(base, '.' + c);
    if (f !== base && !f.startsWith(base + path.sep)) return null;
    try { if (fs.statSync(f).isFile()) return f; } catch { /* next candidate */ }
  }
  return null;
}

export function createServer({ uiDir = UI_DIR, getConfig = () => loadConfig() } = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (!isLocalHost(req.headers.host)) return send(res, 403, 'Forbidden');
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', undefined, { Allow: 'GET, HEAD' });
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/home') {
          let cfg;
          try { cfg = getConfig(); } catch (e) { return json(res, 503, { error: 'not_set_up', message: e.message }); }
          const date = url.searchParams.get('date');
          if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'bad_date', message: 'date must be YYYY-MM-DD' });
          return json(res, 200, await homeData(cfg, { date }));
        }
        return json(res, 404, { error: 'not_found' });
      }

      const file = resolveStatic(uiDir, url.pathname) || resolveStatic(uiDir, '/404');
      if (!file) return send(res, 404, 'Not found. The dashboard has not been built: run `npm run build:ui`.');
      const status = file.endsWith(`${path.sep}404.html`) && url.pathname !== '/404' ? 404 : 200;
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      const immutable = url.pathname.startsWith('/_next/static/');
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', ...SECURITY_HEADERS });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: 'internal', message: e.message });
      else res.end();
    }
  });
}

export function listen(server, port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}
