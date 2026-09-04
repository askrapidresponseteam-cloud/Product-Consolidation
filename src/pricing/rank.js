/**
 * Cheapest is only awarded on proof: one store's worst case must beat every
 * other store's best case. Where the leader's fees are unknown, the headroom
 * is reported instead, which is a fact derived only from published numbers.
 */

function rankQuotes(qs){
  const sorted = [...qs].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const win = sorted[0];
  const rest = sorted.slice(1);
  const proven = rest.length > 0 && win.hi !== Infinity && rest.every((o) => win.hi <= o.lo);
  if(proven) return { sorted, winner: win, proven: true, margin: null, likely: null };

  /* An unbounded upper bound is honest but on its own it is useless: a store
     listing an item at half the price of a rival gets called indeterminate
     forever. So where the leader's fees are unknown, report the headroom
     instead - the amount of shipping and fees it would take to lose. That is
     a fact derived only from published numbers, it stays true whatever the
     fees turn out to be, and the reader can check it against one delivery
     page in a few seconds. */
  const bestKnownRival = Math.min(...rest.map((o) => o.hi).filter((h) => h !== Infinity));
  const margin = Number.isFinite(bestKnownRival) ? bestKnownRival - win.lo : null;
  return {
    sorted, winner: null, proven: false,
    likely: (margin != null && margin > 0) ? win : null,
    margin: (margin != null && margin > 0) ? margin : null,
  };
}

export { rankQuotes };
