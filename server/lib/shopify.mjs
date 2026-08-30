/**
 * Live Shopify catalogue reader. Server-side only.
 *
 * Every Shopify storefront publishes its catalogue as JSON, paginated, with no
 * key. We read three sources and union them so nothing is missed:
 *   1. /products.json (or /collections/all/products.json) - the flat feed
 *   2. every collection's products.json - catches items the flat feed skips
 *   3. the product sitemap - the definitive list; any handle still missing is
 *      fetched individually
 *
 * Nothing here is guessed: a store that does not answer is reported as such.
 */
import { CONFIG } from '../config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PATHS = ['/products.json', '/collections/all/products.json'];

function scheme(host) { return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https'; }
function hostsFor(domain) {
  if (/^(localhost|127\.0\.0\.1)/.test(domain)) return [domain];
  return domain.startsWith('www.') ? [domain, domain.slice(4)] : [domain, 'www.' + domain];
}

async function getJSON(url, signal) {
  const res = await fetch(url, {
    headers: { 'user-agent': CONFIG.userAgent, accept: 'application/json' },
    redirect: 'follow', signal,
  });
  if (!res.ok) return { ok: false, status: res.status };
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) return { ok: false, status: res.status, notJson: true };
  try { return { ok: true, body: await res.json() }; }
  catch { return { ok: false, status: res.status, notJson: true }; }
}
async function getText(url, signal) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': CONFIG.userAgent }, redirect: 'follow', signal });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

async function withRetry(fn, tries = 3, log) {
  let last;
  for (let a = 1; a <= tries; a++) {
    try { const r = await fn(); if (r.ok) return r; last = r; }
    catch (e) { last = { ok: false, error: e.message }; }
    if (a < tries) { log?.(`retry ${a} (${last.status || last.error || 'error'})`); await sleep(1200 * a); }
  }
  return last;
}

/** Work out which host + path serves the catalogue. */
export async function probe(store, signal) {
  const tried = [];
  for (const host of hostsFor(store.domain)) {
    for (const p of PATHS) {
      const url = `${scheme(host)}://${host}${p}?limit=1`;
      tried.push(url);
      let r;
      try { r = await getJSON(url, signal); } catch { continue; }
      if (r.ok && Array.isArray(r.body?.products)) return { ok: true, host, path: p, base: `${scheme(host)}://${host}` };
      await sleep(150);
    }
  }
  return { ok: false, why: 'no Shopify catalogue found', tried };
}

async function walkFeed(found, log, signal) {
  const out = new Map();
  for (let page = 1; page <= CONFIG.maxPages; page++) {
    const url = `${found.base}${found.path}?limit=250&page=${page}`;
    const r = await withRetry(() => getJSON(url, signal), 3, log);
    if (!r.ok) throw new Error(`feed page ${page}: ${r.status || r.error || 'failed'}`);
    const products = r.body.products || [];
    if (!products.length) break;
    for (const p of products) out.set(p.handle, p);
    log?.(`feed page ${page}, ${out.size} products`);
    await sleep(CONFIG.pauseMs);
  }
  return out;
}

async function walkCollections(found, log, signal, into) {
  const cols = [];
  for (let page = 1; page <= 20; page++) {
    const r = await getJSON(`${found.base}/collections.json?limit=250&page=${page}`, signal).catch(() => ({ ok: false }));
    if (!r.ok || !Array.isArray(r.body?.collections) || !r.body.collections.length) break;
    cols.push(...r.body.collections);
    await sleep(CONFIG.pauseMs);
  }
  if (!cols.length) { log?.('no collections.json'); return 0; }
  let added = 0;
  for (const [n, c] of cols.entries()) {
    for (let page = 1; page <= 40; page++) {
      const r = await getJSON(`${found.base}/collections/${c.handle}/products.json?limit=250&page=${page}`, signal).catch(() => ({ ok: false }));
      if (!r.ok) break;
      const list = r.body?.products || [];
      if (!list.length) break;
      for (const p of list) if (!into.has(p.handle)) { into.set(p.handle, p); added++; }
      await sleep(CONFIG.pauseMs);
    }
    if (n % 10 === 0) log?.(`collection ${n + 1}/${cols.length}, +${added}`);
  }
  return added;
}

async function sitemapHandles(found, signal) {
  const root = await getText(`${found.base}/sitemap.xml`, signal);
  if (!root) return null;
  const maps = [...root.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).filter((u) => /sitemap_products/.test(u));
  if (!maps.length) return null;
  const handles = new Set();
  for (const url of maps) {
    const xml = await getText(url, signal);
    if (!xml) continue;
    for (const m of xml.matchAll(/<loc>\s*[^<\s]*?\/products\/([^<\s?]+)\s*<\/loc>/g)) handles.add(decodeURIComponent(m[1]));
    await sleep(CONFIG.pauseMs);
  }
  return handles;
}

/** One product, live, by handle. Used for the per-detail refresh too. */
export async function fetchProduct(base, handle, signal) {
  const r = await getJSON(`${base}/products/${encodeURIComponent(handle)}.json`, signal).catch(() => ({ ok: false }));
  return r.ok && r.body?.product ? r.body.product : null;
}

/**
 * Crawl one store completely. Returns { ok, base, products: Map<handle, raw>, stats }
 * or { ok:false, why }.
 */
export async function crawlStore(store, { log, signal } = {}) {
  const found = await probe(store, signal);
  if (!found.ok) return { ok: false, why: found.why, tried: found.tried };
  const stats = { feed: 0, collections: 0, sitemap: 0, backfilled: 0, missing: 0 };

  const products = await walkFeed(found, log, signal);
  stats.feed = products.size;

  /* The sitemap is the definitive list. When a store has one, anything the
     feed skipped is fetched directly and there is no need to walk hundreds
     of collections. Collections are the fallback for stores without one. */
  let sm = null;
  if (CONFIG.sitemapBackfill) sm = await sitemapHandles(found, signal);
  if (sm) {
    stats.sitemap = sm.size;
    const missing = [...sm].filter((h) => !products.has(h));
    stats.missing = missing.length;
    log?.(`sitemap lists ${sm.size}, feed had ${products.size}, fetching ${missing.length} missing`);
    for (const [n, h] of missing.entries()) {
      const p = await fetchProduct(found.base, h, signal);
      if (p) { products.set(p.handle, p); stats.backfilled++; }
      if (n % 25 === 0 && missing.length) log?.(`backfill ${n + 1}/${missing.length}`);
      await sleep(CONFIG.pauseMs);
    }
  } else if (CONFIG.deep) {
    log?.('no product sitemap, walking collections instead');
    stats.collections = await walkCollections(found, log, signal, products);
  }
  return { ok: true, base: found.base, products, stats };
}
