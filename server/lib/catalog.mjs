/**
 * The in-memory catalogue: live crawl scheduling, indexing, querying, and the
 * render-only DTOs the browser receives. Server-side only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, STORES } from '../config.mjs';
import { crawlStore, fetchProduct } from './shopify.mjs';
import { normalize } from './normalize.mjs';
import { buildMatches, finishCmp } from './match.mjs';
import { CATEGORIES, PETS } from './classify.mjs';

const log = (...a) => console.log(new Date().toISOString(), ...a);

export const onRebuild = [];
export const catalog = {
  stores: STORES.map((s, i) => ({ ...s, si: i, base: null, products: new Map(), status: 'pending', updatedAt: null, stats: null, error: null })),
  list: [],            // flat array of normalised products
  byId: new Map(),
  brands: [],
  matched: 0,
  builtAt: null,
  crawling: false,
  version: 0,
};

/* ---------------- persistence (cache of the last live crawl) ---------------- */
const cacheFile = () => path.join(CONFIG.dataDir, 'catalog-cache.json');

function saveCache() {
  if (!CONFIG.diskCache) return;
  try {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    const out = { savedAt: new Date().toISOString(), stores: catalog.stores.map((s) => ({
      key: s.key, base: s.base, updatedAt: s.updatedAt, stats: s.stats, raw: [...s.products.values()] })) };
    fs.writeFileSync(cacheFile(), JSON.stringify(out));
  } catch (e) { log('cache write failed:', e.message); }
}
function loadCache() {
  if (!CONFIG.diskCache || !fs.existsSync(cacheFile())) return false;
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
    let n = 0;
    for (const cs of c.stores) {
      const s = catalog.stores.find((x) => x.key === cs.key);
      if (!s || !cs.raw?.length) continue;
      s.base = cs.base; s.updatedAt = cs.updatedAt; s.stats = cs.stats; s.status = 'cached';
      s.products = new Map(cs.raw.map((p) => [p.handle, p]));
      n += cs.raw.length;
    }
    log(`loaded ${n} products from cache saved ${c.savedAt}; live crawl starts now`);
    return n > 0;
  } catch (e) { log('cache read failed:', e.message); return false; }
}

/* ---------------- build index from raw store products ---------------- */
let rebuildTimer = null;
export function rebuild() {
  const t0 = Date.now();
  const list = [];
  for (const s of catalog.stores) {
    if (!s.base) continue;
    for (const raw of s.products.values()) {
      if (!raw?.handle || !raw.title) continue;
      const p = normalize(s, s.si, raw);
      if (!p.stock) continue;                 /* out of stock: not listed at all */
      p.url = s.base + p.url;
      list.push(p);
    }
  }
  /* Stores spell vendors inconsistently ("pawsindia" / "Pawsindia"): merge by
     lowercase and keep the most common spelling. */
  const spellings = new Map();
  for (const p of list) { const k = p.brand.toLowerCase(); let m = spellings.get(k); if (!m) spellings.set(k, (m = new Map())); m.set(p.brand, (m.get(p.brand) || 0) + 1); }
  const canon = new Map([...spellings].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1] || (/^[A-Z]/.test(b[0]) - /^[A-Z]/.test(a[0])))[0][0]]));
  for (const p of list) p.brand = canon.get(p.brand.toLowerCase());
  const matched = buildMatches(list);
  const brands = [...new Set(list.map((p) => p.brand))].sort((a, b) => a.localeCompare(b));
  catalog.list = list;
  catalog.byId = new Map(list.map((p) => [p.id, p]));
  catalog.brands = brands;
  catalog.matched = matched;
  catalog.builtAt = new Date().toISOString();
  catalog.version++;
  onRebuild.forEach((f) => f());
  log(`index rebuilt: ${list.length} products, ${matched} matched across stores, ${Date.now() - t0} ms`);
}
function scheduleRebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 500); }

/* ---------------- live crawl ---------------- */
async function crawlOne(s) {
  s.status = s.products.size ? 'refreshing' : 'crawling';
  s.error = null;
  const r = await crawlStore(s, { log: (m) => log(`[${s.key}] ${m}`) });
  if (!r.ok) {
    s.status = s.products.size ? 'stale' : 'unavailable';
    s.error = r.why;
    log(`[${s.key}] ${r.why}`);
    return;
  }
  s.base = r.base; s.products = r.products; s.stats = r.stats;
  s.updatedAt = new Date().toISOString(); s.status = 'live';
  log(`[${s.key}] live: ${r.products.size} products (feed ${r.stats.feed}, +collections ${r.stats.collections}, sitemap ${r.stats.sitemap}, backfilled ${r.stats.backfilled}/${r.stats.missing})`);
  scheduleRebuild();
  saveCache();                                   /* a restart mid-crawl keeps what's done */
}

export async function refreshAll() {
  if (catalog.crawling) return false;
  catalog.crawling = true;
  const queue = [...catalog.stores];
  const workers = Array.from({ length: Math.max(1, CONFIG.concurrency) }, async () => {
    while (queue.length) { const s = queue.shift(); try { await crawlOne(s); } catch (e) { s.status = 'stale'; s.error = e.message; log(`[${s.key}] failed: ${e.message}`); } }
  });
  await Promise.all(workers);
  catalog.crawling = false;
  rebuild();
  saveCache();
  return true;
}

export function start() {
  loadCache();
  rebuild();
  refreshAll();
  setInterval(refreshAll, CONFIG.refreshMinutes * 60 * 1000).unref();
}

/* ---------------- live detail refresh ---------------- */
const detailChecked = new Map(); // id -> ts
export async function refreshProduct(p) {
  const s = catalog.stores[p.si];
  const last = detailChecked.get(p.id) || 0;
  if (Date.now() - last < CONFIG.liveDetailTtlSec * 1000) return { p, live: false, fresh: true, checkedAt: new Date(last).toISOString() };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const raw = await fetchProduct(s.base, p.handle, ctrl.signal);
    if (!raw) return { p, live: false, checkedAt: null };
    detailChecked.set(p.id, Date.now());
    s.products.set(raw.handle, raw);
    const fresh = normalize(s, s.si, raw);
    fresh.url = s.base + fresh.url;
    if (!fresh.stock) {                       /* just went out of stock: delist it now */
      const at = catalog.list.indexOf(p);
      if (at >= 0) catalog.list.splice(at, 1);
      catalog.byId.delete(p.id);
      return { p: fresh, live: true, gone: true, checkedAt: new Date().toISOString() };
    }
    /* rivals are re-matched on the next index build; this listing's own side
       of the comparison is recomputed from the prices just read */
    fresh.cmp = p.cmp ? { rows: p.cmp.rows } : null;
    finishCmp(fresh);
    const idx = catalog.list.indexOf(p);
    if (idx >= 0) catalog.list[idx] = fresh;
    catalog.byId.set(fresh.id, fresh);
    return { p: fresh, live: true, checkedAt: new Date().toISOString() };
  } catch { return { p, live: false, checkedAt: null }; }
  finally { clearTimeout(timer); }
}

/* ---------------- query ---------------- */
const SORTS = {
  pop: (a, b) => (b.score - a.score) || a.title.localeCompare(b.title),
  plo: (a, b) => a.lo - b.lo,
  phi: (a, b) => (b.lo - a.lo) || (b.hi - a.hi),   /* by the price the card shows */
  disc: (a, b) => ((a.gift || a.noPrice ? 1 : 0) - (b.gift || b.noPrice ? 1 : 0)) || (b.disc - a.disc) || (b.stock - a.stock) || a.title.localeCompare(b.title),
  save: (a, b) => (b.cmp ? Math.abs(b.cmp.diff) : -1) - (a.cmp ? Math.abs(a.cmp.diff) : -1),
  az: (a, b) => a.title.localeCompare(b.title),
};

function spread(list) {
  if (list.length < 24) return list;
  const buckets = new Map();
  for (const p of list) { let b = buckets.get(p.brand); if (!b) buckets.set(p.brand, (b = [])); b.push(p); }
  const queues = [...buckets.values()], out = [];
  let live = true;
  while (live) { live = false; for (const q of queues) if (q.length) { out.push(q.shift()); live = true; } }
  return out;
}

const facet = (list, key, keys, selected) => {
  const m = new Map(keys.map((k) => [k, 0]));
  for (const p of list) if (m.has(p[key])) m.set(p[key], m.get(p[key]) + 1);
  return [...m].filter(([k, n]) => n > 0 || selected.has(k)).sort((a, b) => b[1] - a[1]);
};

export function query(q) {
  const tk = String(q.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const sellers = catalog.stores.map((s) => s.label);
  const stores = new Set(q.store), pets = new Set(q.pet), cats = new Set(q.cat), brands = new Set(q.brand);
  const min = q.min, max = q.max, disc = q.disc || 0;

  let view = catalog.list.filter((p) => {
    if (stores.size && !stores.has(sellers[p.si])) return false;
    if (pets.size && !pets.has(p.pet)) return false;
    if (cats.size && !cats.has(p.cat)) return false;
    if (brands.size && !brands.has(p.brand)) return false;
    if (q.both && !p.cmp) return false;
    if (disc && p.disc < disc) return false;
    if (min != null && p.hi < min) return false;
    if (max != null && p.lo > max) return false;
    for (const t of tk) if (!p.hay.includes(t)) return false;
    return true;
  });

  const sort = SORTS[q.sort] ? q.sort : 'disc';
  if (q.sort === 'unit') {
    const freq = new Map();
    for (const p of view) if (p.unit) freq.set(p.unit.unit, (freq.get(p.unit.unit) || 0) + 1);
    const rank = new Map([...freq.entries()].sort((a, b) => b[1] - a[1]).map(([u], i) => [u, i]));
    const ur = (p) => (p.unit ? rank.get(p.unit.unit) : 1e6);
    view.sort((a, b) => (ur(a) - ur(b)) || ((a.unit ? a.unit.v : Infinity) - (b.unit ? b.unit.v : Infinity)));
  } else {
    view.sort(SORTS[sort]);
    if (sort === 'pop') view = spread(view);
  }

  const pageSize = 48, page = Math.max(1, q.page | 0 || 1);
  const items = view.slice((page - 1) * pageSize, page * pageSize).map(cardDTO);
  const facets = {
    store: facet(view, 'si', catalog.stores.map((s) => s.si), new Set([...stores].map((n) => sellers.indexOf(n)))).map(([si, n]) => [sellers[si], n]),
    pet: facet(view, 'pet', PETS, pets),
    cat: facet(view, 'cat', CATEGORIES, cats),
    brand: facet(view, 'brand', catalog.brands, brands),
  };
  return { total: view.length, page, pageSize, items, facets };
}

/* ---------------- DTOs: only what the UI needs to draw ---------------- */
const sellerName = (si) => catalog.stores[si]?.label || '';

function leadVariant(p) {
  const pool = p.vars.filter((v) => v.price > 0);
  const c = pool.length ? pool : p.vars;
  return c.reduce((a, b) => (b.price < a.price || (b.price === a.price && b.disc > a.disc)) ? b : a, c[0]);
}

export function cardDTO(p) {
  const lead = leadVariant(p) || { price: 0, mrp: 0, disc: 0 };
  let badge = null;
  if (p.gift === 2) badge = ['gift', 'Not for sale'];
  else if (p.noPrice) badge = ['gift', 'Price on request'];
  else if (p.gift === 1) badge = ['gift', 'Free gift'];
  else if (lead.disc >= 10) badge = ['disc', `${lead.disc}% off`];
  let cmp = null;
  if (p.cmp) {
    cmp = p.cmp.weCheapest ? { cls: 'win', text: `Cheapest of ${p.cmp.lead.stores} stores` }
      : p.cmp.diff === 0 ? { cls: 'level', text: `Matched across ${p.cmp.lead.stores} stores` }
      : { cls: 'lose', text: `₹${inr(p.cmp.diff)} less at ${sellerName(p.cmp.bestSi)}` };
  }
  return {
    id: p.id, title: p.title, brand: p.brand, cat: p.cat, si: p.si, img: p.img || '',
    sizes: p.vars.length, stock: p.stock, noPrice: p.noPrice,
    price: lead.price, mrp: lead.mrp || 0, badge,
    unit: p.unit ? `${inrp(p.unit.v)}/${p.unit.unit}` : '',
    cmp,
  };
}

export function detailDTO(p, live) {
  const rows = [...p.vars].sort((a, b) => a.price - b.price).map((v) => ({
    name: v.name || v.sizeLabel || 'One size',
    size: v.sizeLabel && v.sizeLabel !== v.name ? v.sizeLabel : '',
    price: v.price, mrp: v.mrp || 0, disc: v.disc, stock: v.stock,
    unit: v.up ? `${inrp(v.up.v)}/${v.up.unit}` : '',
  }));
  let cmp = null;
  if (p.cmp) {
    const c = p.cmp;
    cmp = {
      cls: c.weCheapest ? 'win' : c.diff === 0 ? 'level' : 'lose',
      verdict: c.weCheapest ? `Cheapest of ${c.lead.stores} stores` : c.diff === 0 ? 'Matched on price' : `₹${inr(c.diff)} less at ${sellerName(c.bestSi)}`,
      rows: c.rows.slice(0, 3).map((r) => ({ size: r.size, stores: r.stores,
        offers: r.all.map((o) => ({ seller: sellerName(o.si), si: o.si, price: o.price, mine: !!o.mine })) })),
    };
  }
  return {
    id: p.id, title: p.title, brand: p.brand, cat: p.cat, pet: p.pet, si: p.si, seller: sellerName(p.si),
    img: p.img || '', stock: p.stock, url: p.url, variants: rows, cmp,
    live: !!(live?.live || live?.fresh), checkedAt: live?.checkedAt || catalog.stores[p.si]?.updatedAt || null,
  };
}

export function metaDTO() {
  return {
    sellers: catalog.stores.map((s) => ({ name: s.label, status: s.status, updatedAt: s.updatedAt, products: s.products.size })),
    products: catalog.list.length, matched: catalog.matched, builtAt: catalog.builtAt, crawling: catalog.crawling,
  };
}

const inr = (n) => Math.round(n).toLocaleString('en-IN');
const inrp = (n) => (n < 10 ? '₹' + n.toFixed(n < 1 ? 2 : 1) : '₹' + inr(n));
