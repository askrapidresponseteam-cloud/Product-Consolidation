import { describe, it, expect } from 'vitest';
import { quote, shipRange } from '../src/pricing/quote.js';
import { rankQuotes } from '../src/pricing/rank.js';
import { RULES } from '../src/pricing/rules.js';

const SELLERS = ['Heads Up For Tails', 'Supertails'];
const st = { si: 1, title: 'T' };
const unknown = { si: 0, title: 'T' };
const v = (price) => ({ name: '', size: '1 kg', price, mrp: 0, disc: 0, stock: 1 });
const q = (p, price) => quote(p, v(price), 1, SELLERS);

describe('the ruleset', () => {
  it('carries provenance on every known seller', () => {
    for (const [name, r] of Object.entries(RULES)) {
      if (!r) continue;
      expect(r.source, `${name} needs a source`).toBeTruthy();
      expect(r.asOf, `${name} needs an asOf`).toBeTruthy();
    }
  });

  it('leaves unresearched sellers null rather than guessing', () => {
    expect(RULES['Petsworld']).toBeNull();
  });
});

describe('shipping as an interval', () => {
  it('collapses to a number outside the conflicting band', () => {
    const r = RULES['Supertails'];
    expect(shipRange(r, 400)).toEqual([49, 49]);
    expect(shipRange(r, 700)).toEqual([0, 0]);
  });

  it('widens to a range between two published thresholds', () => {
    // the policy page says free above 699, three other pages say 599
    expect(shipRange(RULES['Supertails'], 650)).toEqual([0, 49]);
  });
});

describe('quote', () => {
  it('adds shipping below the threshold', () => {
    expect(q(st, 400).lo).toBe(449);
  });

  it('returns a range where the thresholds disagree', () => {
    const r = q(st, 650);
    expect([r.lo, r.hi]).toEqual([650, 699]);
  });

  it('gives an unknown seller an unbounded upper bound', () => {
    const r = q(unknown, 500);
    expect(r.known).toBe(false);
    expect(r.lo).toBe(500);
    expect(r.hi).toBe(Infinity);
  });

  it('never folds a conditional promotion into the headline', () => {
    const r = q(st, 2000);
    const tier = r.tiers.find((t) => t.code === 'SWAG13');
    expect(tier.eligible).toBe(true);
    expect(tier.conditional).toBe(true);
    expect(r.lo).toBe(2000);          // headline unchanged
    expect(tier.lo).toBe(1740);       // priced, but only as a labelled tier
  });

  it('reports the shortfall instead of applying an ineligible promotion', () => {
    const tier = q(st, 400).tiers.find((t) => t.code === 'SWAG13');
    expect(tier.eligible).toBe(false);
    expect(tier.shortfall).toBe(1400);
  });

  it('scales with quantity', () => {
    expect(quote(st, v(400), 2, SELLERS).lo).toBe(800);  // 800 clears free shipping
  });
});

describe('rankQuotes', () => {
  it('declares a winner only when its worst case beats every best case', () => {
    const r = rankQuotes([q(st, 600), q(unknown, 900)]);
    expect(r.proven).toBe(true);
    expect(r.winner.hi).toBe(649);
  });

  it('never lets a seller with unpublished fees win outright', () => {
    const r = rankQuotes([q(st, 900), q(unknown, 500)]);
    expect(r.winner).toBeNull();
  });

  it('reports headroom instead of an unhelpful shrug', () => {
    const r = rankQuotes([q(unknown, 500), q(st, 900)]);
    expect(r.likely.seller).toBe('Heads Up For Tails');
    expect(r.margin).toBe(400);       // 900 - 500
  });

  it('counts the known seller shipping when computing headroom', () => {
    // Same 400 item price both sides, but Supertails adds 49 shipping, so the
    // unknown seller really is cheaper unless its own fees exceed 49.
    const r = rankQuotes([q(st, 400), q(unknown, 400)]);
    expect(r.likely.seller).toBe('Heads Up For Tails');
    expect(r.margin).toBe(49);
  });

  it('reports no headroom once a winner is proven', () => {
    const r = rankQuotes([q(st, 600), q(unknown, 900)]);
    expect(r.proven).toBe(true);
    expect(r.margin).toBeNull();
    expect(r.likely).toBeNull();
  });
});
