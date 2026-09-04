import { describe, it, expect } from 'vitest';
import { recomputeAggregates, leadPrice } from '../src/catalogue/aggregate.js';

const v = (price, o = {}) => ({ price, mrp: 0, disc: 0, stock: 1, up: null, unit: null, ...o });

describe('recomputeAggregates', () => {
  it('keeps a garbage price out of the range that drives sorting', () => {
    // Petsworld: Smartheart Power Pack, 10 Kg at 284700 beside a 20 Kg at 5014
    const p = { lo: 348, hi: 284700, disc: 0, stock: true,
      vars: [v(348), v(981), v(284700, { _bad: true }), v(5014)] };
    recomputeAggregates([p]);
    expect(p.hi).toBe(5014);
    expect(p.lo).toBe(348);
  });

  it('sets lead to the price the card displays', () => {
    const p = { vars: [v(348), v(981), v(284700, { _bad: true }), v(5014)] };
    recomputeAggregates([p]);
    expect(p.lead).toBe(348);
  });

  it('leaves a clean product untouched', () => {
    const p = { lo: 100, hi: 900, disc: 5, stock: true, vars: [v(100), v(900)] };
    recomputeAggregates([p]);
    expect([p.lo, p.hi, p.disc]).toEqual([100, 900, 5]);
  });

  it('does not blank a product whose every variant is flagged', () => {
    const p = { lo: 10, hi: 20, disc: 0, stock: true,
      vars: [v(10, { _bad: true }), v(20, { _bad: true })] };
    recomputeAggregates([p]);
    expect(p.hi).toBe(20);          // original figures kept rather than zeroed
    expect(p.lead).toBe(10);
  });

  it('recomputes stock and discount from the surviving variants only', () => {
    const p = { lo: 0, hi: 0, disc: 0, stock: true,
      vars: [v(500, { disc: 90, stock: 0, _bad: true }), v(700, { disc: 10, stock: 1 })] };
    recomputeAggregates([p]);
    expect(p.disc).toBe(10);
    expect(p.stock).toBe(true);
  });
});

describe('leadPrice', () => {
  it('prefers the cheapest sellable variant', () => {
    expect(leadPrice([v(0), v(300), v(100)])).toBe(100);
  });
  it('breaks ties on the deeper discount', () => {
    expect(leadPrice([v(100, { disc: 5 }), v(100, { disc: 40 })])).toBe(100);
  });
  it('falls back when nothing is priced', () => {
    expect(leadPrice([v(0), v(0)])).toBe(0);
  });
});
