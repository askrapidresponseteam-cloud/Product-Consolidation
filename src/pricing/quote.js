import { RULES } from './rules.js';

/**
 * A full quote for one variant at one store: an interval [lo, hi] for ranking
 * and a tier ladder for display. Conditional promotions are priced but never
 * folded into the headline.
 */

function shipRange(r, subtotal){
  const costs = r.freeAbove.map((t) => (subtotal >= t ? 0 : r.flat));
  return [Math.min(...costs), Math.max(...costs)];
}

/* A full quote for one variant at one store, at a given quantity.
   Returns an interval [lo, hi] for ranking and a tier ladder for display. */
function quote(p, v, qty, sellers){
  qty = qty || 1;
  const seller = sellers[p.si];
  const r = RULES[seller];
  const items = v.price * qty;

  if(!r || !r.known){
    return {
      known: false, seller, items, qty,
      lo: items, hi: Infinity,          // unbounded: can never be called cheapest
      regular: null, headline: null, tiers: [],
      lines: [{ label: `Item \u00d7 ${qty}`, amount: items }],
      caveats: [`No verified shipping, fee or coupon data for ${seller}.`],
    };
  }

  const [shipLo, shipHi] = shipRange(r, items);
  const fees = r.handling || 0;
  const regLo = items + shipLo + fees;
  const regHi = items + shipHi + fees;

  const lines = [{ label: `Item \u00d7 ${qty}`, amount: items }];
  if(shipLo === shipHi) lines.push({ label: shipLo ? 'Shipping' : 'Shipping (free at this subtotal)', amount: shipLo });
  else lines.push({ label: `Shipping (\u20b90\u2013\u20b9${shipHi}, thresholds conflict)`, amount: null, range: [shipLo, shipHi] });
  if(fees) lines.push({ label: 'Handling', amount: fees });
  lines.push({ label: r.taxIncluded ? 'Tax (included in listed price)' : 'Tax', amount: 0 });

  /* Unconditional offers are ones any visitor gets: they move the headline.
     Conditional ones are priced and labelled but never folded in. */
  const tiers = [];
  let headLo = regLo, headHi = regHi;

  for(const o of (r.offers || [])){
    const eligible = items >= (o.minSubtotal || 0);
    const cut = eligible ? Math.min(items * o.pct / 100, o.cap || Infinity) : 0;
    tiers.push({
      code: o.code, label: o.label, requires: o.requires,
      conditional: !!o.conditional, eligible, note: o.note, source: o.source,
      minSubtotal: o.minSubtotal,
      lo: eligible ? regLo - cut : null,
      hi: eligible ? regHi - cut : null,
      shortfall: eligible ? 0 : (o.minSubtotal - items),
    });
    if(eligible && !o.conditional){ headLo -= cut; headHi -= cut; }
  }

  return {
    known: true, seller, items, qty, r,
    lo: headLo, hi: headHi,
    regular: [regLo, regHi],
    headline: [headLo, headHi],
    tiers, lines,
    caveats: r.caveats || [],
  };
}

/* Cheapest is only awarded on proof: one store's worst case must beat every
   other store's best case. Anything else is honestly indeterminate, which is
   the correct answer far more often than a naive engine admits. */

export { shipRange, quote };
