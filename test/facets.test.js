import { describe, it, expect } from 'vitest';
import { applyFilters, facetOptions } from '../src/facets/filter.js';

const P = [
  { seller: 'A', pet: 'Dog', cat: 'Food', brand: 'X', stock: 1, disc: 0, lo: 100, hi: 100, hay: 'a dog food x', cmp: null },
  { seller: 'A', pet: 'Cat', cat: 'Food', brand: 'Y', stock: 1, disc: 0, lo: 200, hi: 200, hay: 'a cat food y', cmp: null },
  { seller: 'B', pet: 'Dog', cat: 'Toys', brand: 'X', stock: 0, disc: 0, lo: 300, hi: 300, hay: 'b dog toys x', cmp: null },
  { seller: 'C', pet: 'Dog', cat: 'Food', brand: 'Z', stock: 1, disc: 0, lo: 400, hi: 400, hay: 'c dog food z', cmp: null },
];
const state = (o = {}) => ({
  q: '', both: false, stock: false, disc: 0, min: null, max: null,
  stores: new Set(), pets: new Set(), cats: new Set(), brands: new Set(), ...o,
});

describe('OR within a filter', () => {
  it('widens as options are added', () => {
    const one = applyFilters(P, state({ stores: new Set(['A']) }), []);
    const two = applyFilters(P, state({ stores: new Set(['A', 'B']) }), []);
    expect(one.view.length).toBe(2);
    expect(two.view.length).toBe(3);
  });
});

describe('AND across filters', () => {
  it('narrows when a second facet is used', () => {
    const r = applyFilters(P, state({ stores: new Set(['A']), pets: new Set(['Dog']) }), []);
    expect(r.view.length).toBe(1);
  });
});

describe('a facet does not narrow its own option list', () => {
  it('leaves store counts untouched by a store selection', () => {
    const none = applyFilters(P, state(), []);
    const one = applyFilters(P, state({ stores: new Set(['A']) }), []);
    expect([...one.counts.store.entries()].sort())
      .toEqual([...none.counts.store.entries()].sort());
  });

  it('does narrow a different facet, which is the point of AND', () => {
    const r = applyFilters(P, state({ stores: new Set(['A']) }), []);
    expect(r.counts.pet.get('Dog')).toBe(1);   // only A's dog product
  });
});

describe('facetOptions', () => {
  it('keeps zero-count options instead of deleting them', () => {
    const r = applyFilters(P, state({ pets: new Set(['Cat']) }), []);
    const opts = facetOptions(['A', 'B', 'C'], r.counts.store);
    expect(opts.map(([k]) => k).sort()).toEqual(['A', 'B', 'C']);
    expect(opts.find(([k]) => k === 'B')[1]).toBe(0);
  });

  it('orders by count then alphabetically, so zeros form a stable block', () => {
    const r = applyFilters(P, state(), []);
    const opts = facetOptions(['A', 'B', 'C', 'D'], r.counts.store);
    expect(opts).toEqual([['A', 2], ['B', 1], ['C', 1], ['D', 0]]);
  });
});

describe('non-facet filters', () => {
  it('applies stock, price and search as AND conditions', () => {
    expect(applyFilters(P, state({ stock: true }), []).view.length).toBe(3);
    expect(applyFilters(P, state({ min: 250 }), []).view.length).toBe(2);
    expect(applyFilters(P, state(), ['toys']).view.length).toBe(1);
  });
});
