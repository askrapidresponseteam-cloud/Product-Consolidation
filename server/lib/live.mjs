/**
 * On-screen re-checking. Server-side only.
 *
 * Each open browser tab tells the server which products it is showing. One
 * worker per store walks the union of everything anyone is looking at, re-reads
 * each product from the store (no more than once per LIVE_DETAIL_TTL_SEC), and
 * pushes a fresh card to every tab watching it when a price or stock changes.
 * Products nobody is looking at are never re-checked this way.
 */
import { CONFIG } from '../config.mjs';
import { catalog, refreshProduct, cardDTO } from './catalog.mjs';

const clients = new Map();          // res -> { ids:Set }
let workers = new Map();            // si -> running promise
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const snapshot = (p) => JSON.stringify(p.vars.map((v) => [v.price, v.mrp, v.stock]));

export function subscribe(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  clients.set(res, { ids: new Set() });
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => { clearInterval(ping); clients.delete(res); });
}

export function watch(res, ids) {
  const c = clients.get(res);
  if (c) { c.ids = new Set(ids); kick(); }
}
export function watchByToken(token, ids) {
  for (const [res, c] of clients) if (c.token === token) { c.ids = new Set(ids); kick(); return true; }
  return false;
}
export function tagClient(res, token) { const c = clients.get(res); if (c) c.token = token; }

function send(res, event, data) { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* gone */ } }

export function broadcast(event, data) { for (const res of clients.keys()) send(res, event, data); }

function wanted(si) {
  const out = new Set();
  for (const c of clients.values()) for (const id of c.ids) if (id.startsWith(si + '-')) out.add(id);
  return out;
}

function kick() { for (const s of catalog.stores) if (s.base && !workers.has(s.si)) workers.set(s.si, run(s.si).finally(() => workers.delete(s.si))); }

async function run(si) {
  while (true) {
    const ids = [...wanted(si)];
    if (!ids.length) return;
    let did = 0;
    for (const id of ids) {
      const p = catalog.byId.get(id);
      if (!p) continue;
      const before = snapshot(p);
      const r = await refreshProduct(p);
      if (!r.live) continue;
      did++;
      if (snapshot(r.p) !== before || r.p !== p) {
        const card = cardDTO(r.p);
        for (const [res, c] of clients) if (c.ids.has(id)) send(res, 'update', { card, checkedAt: r.checkedAt, changed: snapshot(r.p) !== before });
      }
      await sleep(CONFIG.pauseMs);
    }
    /* everything watched is inside its TTL; wait before the next pass */
    if (!did) await sleep(Math.min(CONFIG.liveDetailTtlSec, 15) * 1000);
  }
}

export const liveStats = () => ({ tabs: clients.size, watching: [...clients.values()].reduce((n, c) => n + c.ids.size, 0) });
