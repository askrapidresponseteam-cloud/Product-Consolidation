/**
 * Filtering and facet counting in one pass.
 *
 * Within a filter the options are OR, across filters they are AND. The part
 * that matters is that each facet is counted with its own selection ignored:
 * counting against the finished result set left every unpicked option at zero,
 * and a zero-count option used to be dropped, so the filter you had just used
 * erased its own alternatives with no way back except clearing everything.
 *
 * One pass with five booleans per product rather than a filter sweep per
 * facet, because this runs on every keystroke over the whole catalogue.
 */

const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

function applyFilters(P, S, tk) {
  const counts = { store: new Map(), pet: new Map(), cat: new Map(), brand: new Map() };
  const view = [];

  for (const p of P) {
    let okRest = true;
    if (S.stock && !p.stock) okRest = false;
    else if (S.both && !p.cmp) okRest = false;
    else if (S.disc && p.disc < S.disc) okRest = false;
    else if (S.min != null && p.hi < S.min) okRest = false;
    else if (S.max != null && p.lo > S.max) okRest = false;
    else { for (const t of tk) if (!p.hay.includes(t)) { okRest = false; break; } }
    if (!okRest) continue;

    const okStore = !S.stores.size || S.stores.has(p.seller);
    const okPet   = !S.pets.size   || S.pets.has(p.pet);
    const okCat   = !S.cats.size   || S.cats.has(p.cat);
    const okBrand = !S.brands.size || S.brands.has(p.brand);

    if (okPet && okCat && okBrand)   bump(counts.store, p.seller);
    if (okStore && okCat && okBrand) bump(counts.pet, p.pet);
    if (okStore && okPet && okBrand) bump(counts.cat, p.cat);
    if (okStore && okPet && okCat)   bump(counts.brand, p.brand);
    if (okStore && okPet && okCat && okBrand) view.push(p);
  }
  return { view, counts };
}

/**
 * Every option is returned, including the ones at zero. A zero is information
 * - it says this combination has nothing in it - and removing the row is what
 * made options vanish. Ordered by count then alphabetically so the zeros
 * settle into a stable block instead of shuffling.
 */
function facetOptions(list, counts) {
  const m = counts || new Map();
  return list.map((k) => [k, m.get(k) || 0])
             .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
}

export { applyFilters, facetOptions, bump };
