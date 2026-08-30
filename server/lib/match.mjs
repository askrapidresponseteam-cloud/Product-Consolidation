/**
 * Cross-store product matching. Server-side only.
 *
 * Two listings are "the same product" when they share a normalised brand and
 * pet, agree on life stage and breed size where either states one, have at
 * least one variant with an identical pack size (mass or volume only), and
 * their titles share enough distinctive wording.
 */
const STOP = new Set(['for', 'and', 'with', 'the', 'of', 'in', 'a', 'an', '&', 'dog', 'dogs', 'cat', 'cats', 'pet', 'pets',
  'food', 'dry', 'wet', 'adult', 'puppy', 'kitten', 'senior', 'all', 'breeds', 'breed', 'ages', 'to', 'by', 'from',
  'pack', 'of', 'x', 'kg', 'g', 'gm', 'gms', 'ml', 'l', 'ltr', 'pcs', 'pc', 'piece', 'pieces', 'small', 'medium', 'large',
  'mini', 'maxi', 'medium', 'giant', 'formula', 'flavour', 'flavor', 'new', 'combo', 'free']);

const STAGE = /\b(puppy|kitten|junior|adult|senior|mature|starter|mother|weaning)\b/g;
const BREED = /\b(mini|small|medium|maxi|large|giant|toy)\b/g;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function tokens(title, brand) {
  const b = new Set(String(brand || '').toLowerCase().split(/\W+/));
  return new Set(title.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9.]+/)
    .filter((t) => t && t.length > 1 && !STOP.has(t) && !b.has(t) && !/^\d/.test(t)));
}
const setOf = (title, re) => new Set((title.toLowerCase().match(re) || []));
function agree(a, b) { if (!a.size || !b.size) return true; for (const x of a) if (b.has(x)) return true; return false; }
function sim(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** (Re)derive the comparison summary from p.cmp.rows against p's current variants.
 *  Used at build time and again after a live re-read of the product. */
export function finishCmp(p) {
  if (!p.cmp?.rows?.length) { p.cmp = null; return; }
  const rows = [];
  for (const r of p.cmp.rows) {
    let mv = p.vars[r.mineIdx];
    if (!mv || mv.sizeKey !== r.sizeKey) mv = p.vars.find((v) => v.sizeKey === r.sizeKey);
    if (!mv || !(mv.price > 0)) continue;
    const all = [{ si: p.si, price: mv.price, mine: true }, ...r.offers].sort((a, b) => a.price - b.price);
    rows.push({ mineIdx: p.vars.indexOf(mv), sizeKey: r.sizeKey, offers: r.offers,
      size: mv.sizeLabel || mv.name || 'One size', mine: mv, all, stores: all.length });
  }
  if (!rows.length) { p.cmp = null; return; }
  rows.sort((a, b) => a.mine.price - b.mine.price);
  const lead = rows[0], best = lead.all[0], next = lead.all[1];
  /* a tie is "matched on price", not a win */
  const weCheapest = !!best.mine && !(next && next.price === best.price);
  p.cmp = { rows, lead, stores: Math.max(...rows.map((r) => r.stores)), weCheapest,
    diff: lead.mine.price - best.price, bestSi: best.mine ? (next?.si ?? null) : best.si };
}

/**
 * Attaches p.cmp to each matched product:
 * { rows:[{size, mine:{price}, all:[{si, price, mine}]}], lead, stores, weCheapest, diff, bestSi }
 */
export function buildMatches(products, { minSim = 0.45 } = {}) {
  const groups = new Map();
  for (const p of products) {
    if (p.noPrice || p.gift) continue;
    if (!p.vars.some((v) => v.sizeKey)) continue;
    const key = `${norm(p.brand)}|${p.pet}`;
    let g = groups.get(key); if (!g) groups.set(key, (g = []));
    g.push(p);
  }
  const meta = new Map();
  const info = (p) => {
    let m = meta.get(p.id);
    if (!m) meta.set(p.id, (m = { tk: tokens(p.title, p.brand), stage: setOf(p.title, STAGE), breed: setOf(p.title, BREED),
      keys: new Map(p.vars.filter((v) => v.sizeKey && v.price > 0).map((v, i) => [v.sizeKey, p.vars.indexOf(v)])) }));
    return m;
  };

  let matched = 0;
  for (const g of groups.values()) {
    if (g.length < 2 || new Set(g.map((p) => p.si)).size < 2) continue;
    for (const p of g) {
      const mi = info(p);
      const bySize = new Map();
      const bestByStore = new Map();
      for (const r of g) {
        if (r.si === p.si) continue;
        const ri = info(r);
        if (!agree(mi.stage, ri.stage) || !agree(mi.breed, ri.breed)) continue;
        const shared = [...mi.keys.keys()].filter((k) => ri.keys.has(k));
        if (!shared.length) continue;
        const s = sim(mi.tk, ri.tk);
        if (s < minSim) continue;
        const cur = bestByStore.get(r.si);
        if (!cur || s > cur.s) bestByStore.set(r.si, { r, s, shared });
      }
      for (const { r, shared } of bestByStore.values()) {
        const ri = info(r);
        for (const k of shared) {
          const mine = mi.keys.get(k), theirs = ri.keys.get(k);
          const mv = p.vars[mine], tv = r.vars[theirs];
          if (!bySize.has(mine)) bySize.set(mine, { mv, offers: [] });
          bySize.get(mine).offers.push({ si: r.si, price: tv.price, id: r.id });
        }
      }
      if (!bySize.size) { p.cmp = null; continue; }
      p.cmp = { rows: [...bySize.entries()].map(([mineIdx, row]) => ({ mineIdx, sizeKey: row.mv.sizeKey, offers: row.offers })) };
      finishCmp(p);
      matched++;
    }
  }
  return matched;
}
