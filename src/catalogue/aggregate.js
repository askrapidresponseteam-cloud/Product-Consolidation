/**
 * Recomputes each product's price aggregates once implausible variants are
 * known.
 *
 * The flag from matching/implausible.js was originally only consulted by the
 * comparison gate, which meant a garbage price was refused as a *comparison*
 * while still driving everything else. Petsworld lists Smartheart Power Pack
 * 10 Kg at 2,84,700 beside its own 20 Kg at 5,014; that made p.hi 2,84,700, so
 * "price high to low" put a card reading "from 348" between two 250,000-plus
 * cabinet dryers. The number was never displayed anywhere, which is what made
 * it look like the sort was broken rather than the data.
 *
 * A product is not dropped for having one bad row - the other sizes are fine
 * and people search for them - so only the offending variants are excluded,
 * and if that would leave nothing the product keeps its original figures
 * rather than silently reporting a price of zero.
 */

function recomputeAggregates(P) {
  let touched = 0;

  for (const p of P) {
    const usable = p.vars.filter((v) => !v._bad);
    if (!usable.length || usable.length === p.vars.length) {
      /* Nothing flagged, or everything was: leave decode's figures alone. */
      p.lead = leadPrice(p.vars);
      continue;
    }
    touched += 1;

    let lo = Infinity, hi = 0, maxDisc = 0, anyStock = false, bestUnit = null;
    for (const v of usable) {
      if (v.price > 0) {
        if (v.price < lo) lo = v.price;
        if (v.price > hi) hi = v.price;
        if (v.disc > maxDisc) maxDisc = v.disc;
      }
      if (v.stock) anyStock = true;
      if (v.up != null && (bestUnit == null || v.up < bestUnit.v)) bestUnit = { v: v.up, unit: v.unit };
    }
    if (lo === Infinity) lo = 0;

    p.lo = lo;
    p.hi = hi;
    p.disc = maxDisc;
    p.unit = bestUnit;
    p.stock = anyStock;
    p.lead = leadPrice(usable);
  }
  return touched;
}

/**
 * The price a card actually shows: cheapest that is for sale, ties broken on
 * the deeper discount. Stored so the price sorts can order by the figure the
 * reader can see, rather than by a hidden top-of-range.
 */
function leadPrice(vars) {
  const sellable = vars.filter((v) => v.price > 0);
  const pool = sellable.length ? sellable : vars;
  if (!pool.length) return 0;
  return pool.reduce((a, b) =>
    (b.price < a.price || (b.price === a.price && b.disc > a.disc)) ? b : a, pool[0]).price;
}

export { recomputeAggregates, leadPrice };
