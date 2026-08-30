#!/usr/bin/env node
/**
 * The Shelf - server. Serves the static UI from /public and a small JSON API.
 * All catalogue logic lives in ./lib and is never sent to the browser.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';
import { catalog, start, query, refreshAll, refreshProduct, detailDTO, metaDTO, onRebuild } from './lib/catalog.mjs';
import { subscribe, tagClient, watchByToken, broadcast, liveStats } from './lib/live.mjs';
import crypto from 'node:crypto';

onRebuild.push(() => broadcast('rebuilt', { builtAt: catalog.builtAt }));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

/* ---------------- guards ---------------- */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), w = 60_000;
  let h = hits.get(ip); if (!h || now - h.t > w) { h = { t: now, n: 0 }; hits.set(ip, h); }
  h.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > w) hits.delete(k);
  return h.n > CONFIG.rateLimitPerMinute;
}
function clientIp(req) {
  if (CONFIG.trustProxy) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
  return req.socket.remoteAddress || '';
}
function sameOrigin(req) {
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
  if (!origin) return true;              /* plain navigation; browsers send Origin/Referer for fetch() */
  const host = req.headers.host;
  try { if (new URL(origin).host === host) return true; } catch { /* fallthrough */ }
  return CONFIG.allowedOrigins.includes(origin);
}
const secHeaders = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https://cdn.shopify.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...secHeaders, ...headers });
  res.end(body);
}
function json(res, status, obj, extra = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
}

function readJSON(req, limit) {
  return new Promise((resolve) => {
    let buf = ''; req.on('data', (c) => { buf += c; if (buf.length > limit) { resolve(null); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

/* ---------------- api ---------------- */
const list = (sp, k) => sp.getAll(k).flatMap((v) => v.split('|')).filter(Boolean).slice(0, 50);
const numOr = (v, d = null) => (v === null || v === '' ? d : (Number.isFinite(+v) ? +v : d));

async function api(req, res, url) {
  if (!sameOrigin(req)) return json(res, 403, { error: 'forbidden' });
  if (rateLimited(clientIp(req))) return json(res, 429, { error: 'slow down' }, { 'Retry-After': '60' });
  const sp = url.searchParams;

  if (url.pathname === '/api/meta' && req.method === 'GET') return json(res, 200, metaDTO());

  /* live channel: browser opens this once, then posts the ids it is showing */
  if (url.pathname === '/api/live' && req.method === 'GET') {
    const token = crypto.randomBytes(12).toString('base64url');
    subscribe(res); tagClient(res, token);
    res.write(`event: hello\ndata: ${JSON.stringify({ token })}\n\n`);
    return;
  }
  if (url.pathname === '/api/watch' && req.method === 'POST') {
    const body = await readJSON(req, 8192);
    if (!body || typeof body.token !== 'string' || !Array.isArray(body.ids)) return json(res, 400, { error: 'bad request' });
    const ids = body.ids.filter((x) => typeof x === 'string' && catalog.byId.has(x)).slice(0, 96);
    return json(res, watchByToken(body.token, ids) ? 200 : 410, { watching: ids.length });
  }

  if (url.pathname === '/api/products' && req.method === 'GET') {
    const out = query({
      q: String(sp.get('q') || '').slice(0, 120),
      store: list(sp, 'store'), pet: list(sp, 'pet'), cat: list(sp, 'cat'), brand: list(sp, 'brand'),
      min: numOr(sp.get('min')), max: numOr(sp.get('max')), disc: numOr(sp.get('disc'), 0),
      stock: sp.get('stock') === '1', both: sp.get('both') === '1',
      sort: sp.get('sort') || 'disc', page: numOr(sp.get('page'), 1),
    });
    out.builtAt = catalog.builtAt;
    return json(res, 200, out);
  }

  const m = /^\/api\/products\/([^/]+)$/.exec(url.pathname);
  if (m && req.method === 'GET') {
    const p = catalog.byId.get(decodeURIComponent(m[1]));
    if (!p) return json(res, 404, { error: 'not found' });
    const live = await refreshProduct(p);          /* re-read from the store now */
    return json(res, 200, detailDTO(live.p, live));
  }

  if (url.pathname.startsWith('/api/admin/')) {
    const tok = req.headers['x-admin-token'] || sp.get('token');
    if (!CONFIG.adminToken || tok !== CONFIG.adminToken) return json(res, 401, { error: 'unauthorised' });
    if (url.pathname === '/api/admin/status') return json(res, 200, { ...metaDTO(), live: liveStats(), stores: catalog.stores.map((s) => ({ key: s.key, status: s.status, updatedAt: s.updatedAt, stats: s.stats, error: s.error })) });
    if (url.pathname === '/api/admin/refresh' && req.method === 'POST') {
      if (catalog.crawling) return json(res, 409, { error: 'a crawl is already running' });
      refreshAll();                                   /* runs in the background */
      return json(res, 202, { started: true });
    }
  }
  return json(res, 404, { error: 'not found' });
}

/* ---------------- static ---------------- */
const root = path.resolve(CONFIG.publicDir);
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(root, '.' + rel);
  if (!file.startsWith(root + path.sep) && file !== root) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { ...secHeaders, 'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'server error' });
  }
});

server.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`The Shelf listening on http://${CONFIG.host}:${CONFIG.port}  (refresh every ${CONFIG.refreshMinutes} min)`);
  start();
});
