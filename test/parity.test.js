import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { packSize, fmtPack } from '../src/matching/pack-size.js';
import { sizeKey } from '../src/matching/size-key.js';
import { comparable } from '../src/matching/gate.js';
import { flagImplausible } from '../src/matching/implausible.js';

/**
 * The modules were sliced out of a working single-file portal. A refactor that
 * quietly changes behaviour is worse than no refactor, so this replays the
 * extracted logic over the whole catalogue and pins the numbers that the
 * shipped build was verified against.
 */
const DATA = JSON.parse(fs.readFileSync(new URL('../data/data.json', import.meta.url)));
const { sellers, brands, cats, pets, vlab, slab } = DATA;

/* Minimal decode: enough of a product for the matching layer to work on. */
const P = DATA.products.map((row, idx) => {
  const [si, title, bi, ci, pi, handle, rawVars, , , gift] = row;
  const vars = rawVars.map(([vi, szi, price, mrp, stock]) => {
    const name = vlab[vi];
    let size = slab[szi];
    const parsed = packSize(name, size);
    if (parsed && parsed.fixed) size = fmtPack(parsed);
    else if (!size && parsed) size = name;
    return { name, size, price, mrp, stock, disc: mrp ? Math.round((mrp - price) / mrp * 100) : 0 };
  });
  return { i: idx, si, title, brand: brands[bi], cat: cats[ci], pet: pets[pi],
           seller: sellers[si], handle, vars, gift };
});
const MATCH = DATA.match || {};

describe('catalogue shape', () => {
  it('decodes the expected size', () => {
    expect(P.length).toBe(26562);
    expect(sellers.length).toBe(6);
    expect(Object.keys(MATCH).length).toBe(2084);
  });
});

describe('implausible price detection', () => {
  it('flags the same count the shipped build flagged', () => {
    expect(flagImplausible(P)).toBe(23);
  });
});

describe('the gate, replayed over every aligned pair', () => {
  const reasons = {};
  let accepted = 0;
  flagImplausible(P);
  for (const key of Object.keys(MATCH)) {
    const p = P[+key];
    if (!p) continue;
    for (const [ri, , aligned] of MATCH[key]) {
      const rival = P[ri];
      if (!rival) continue;
      for (const [mine, theirs] of aligned) {
        const why = comparable(p, p.vars[mine], rival, rival.vars[theirs]);
        if (why) reasons[why] = (reasons[why] || 0) + 1;
        else accepted += 1;
      }
    }
  }

  it('accepts the same number of pairs', () => {
    expect(accepted).toBe(5917);
  });

  it('refuses for the same reasons, in the same volumes', () => {
    expect(reasons).toEqual({
      'different colourway': 119,
      'pack size not verifiable': 60,
      'price contradicts the same store\u2019s larger pack': 12,
    });
  });

  it('lets no unsound pair through: every accepted pair agrees on size key', () => {
    let unsound = 0;
    for (const key of Object.keys(MATCH)) {
      const p = P[+key];
      if (!p) continue;
      for (const [ri, , aligned] of MATCH[key]) {
        const rival = P[ri];
        if (!rival) continue;
        for (const [mine, theirs] of aligned) {
          const mv = p.vars[mine], tv = rival.vars[theirs];
          if (comparable(p, mv, rival, tv)) continue;
          if (sizeKey(mv, p) !== sizeKey(tv, rival)) unsound += 1;
        }
      }
    }
    expect(unsound).toBe(0);
  });
});
