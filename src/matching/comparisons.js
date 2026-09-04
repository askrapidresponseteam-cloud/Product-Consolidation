import { comparable } from './gate.js';

/**
 * Builds p.cmp for every product: one row per verified pack size, each holding
 * every store that carries it, cheapest first. Mutates P in place, which is
 * what the render layer expects.
 */

function buildComparisons(P, MATCH, sellers){
  P.forEach((p, i) => {
  const entries = MATCH[i];
  if (!entries || !entries.length) return;

  /* One row per comparable pack size, holding every store that carries it. */
  const bySize = new Map();
  for (const [rivalIdx, _conf, aligned] of entries) {
    const rival = P[rivalIdx];
    if (!rival) continue;
    for (const [mine, theirs] of aligned) {
      const mv = p.vars[mine], tv = rival.vars[theirs];
      if (comparable(p, mv, rival, tv)) continue;          // refuse unless proven
      if (!bySize.has(mine)) bySize.set(mine, { mv, offers: [] });
      const row = bySize.get(mine);
      // one offer per store: keep whichever listing is cheaper
      const prev = row.offers.find((o) => o.si === rival.si);
      if (prev) { if (tv.price < prev.price) { prev.price = tv.price; prev.pi = rivalIdx; prev.vi = theirs; } }
      else row.offers.push({ si: rival.si, price: tv.price, pi: rivalIdx, vi: theirs });
    }
  }
  if (!bySize.size) return;

  const rows = [...bySize.values()].map((r) => {
    const all = [{ si: p.si, price: r.mv.price, pi: i, mine: true }, ...r.offers]
      .sort((a, b) => a.price - b.price);
    return { size: r.mv.size || r.mv.name || 'One size', mine: r.mv, all, stores: all.length };
  }).sort((a, b) => a.mine.price - b.mine.price);

  const lead = rows[0], best = lead.all[0];
  p.cmp = {
    rows, lead, best,
    stores: Math.max(...rows.map((r) => r.stores)),
    weCheapest: !!best.mine,
    diff: lead.mine.price - best.price,
    bestSeller: best.mine ? null : sellers[best.si],
  };
  });
}

export { buildComparisons };
