import { describe, it, expect } from 'vitest';
import { comparable } from '../src/matching/gate.js';
import { sizeKey, garment } from '../src/matching/size-key.js';

const v = (name, size, price, extra = {}) =>
  ({ name, size, price, mrp: 0, disc: 0, stock: 1, ...extra });
const prod = (title, vars) => ({ title, vars });

describe('the like-for-like gate', () => {
  it('refuses a 3-pack against a single unit', () => {
    const a = prod('Acme Chew', [v('Pack Of 3', '', 900)]);
    const b = prod('Acme Chew', [v('Pack Of 1', '', 300)]);
    expect(comparable(a, a.vars[0], b, b.vars[0])).toBeTruthy();
  });

  it('refuses different quantities of the same unit', () => {
    const a = prod('Acme Chew', [v('', '1 kg', 900)]);
    const b = prod('Acme Chew', [v('', '500 g', 500)]);
    expect(comparable(a, a.vars[0], b, b.vars[0])).toBe('different pack size');
  });

  it('refuses a different colourway of the same model', () => {
    const a = prod('Acme Collar (Blue)', [v('', '1 kg', 900)]);
    const b = prod('Acme Collar (Red)', [v('', '1 kg', 500)]);
    expect(comparable(a, a.vars[0], b, b.vars[0])).toBe('different colourway');
  });

  it('refuses a price that contradicts the same store larger pack', () => {
    const a = prod('Acme Food', [v('', '1 kg', 900, { _bad: true })]);
    const b = prod('Acme Food', [v('', '1 kg', 500)]);
    expect(comparable(a, a.vars[0], b, b.vars[0])).toMatch(/contradicts/);
  });

  it('refuses when either side quotes no price', () => {
    const a = prod('Acme Food', [v('', '1 kg', 0)]);
    const b = prod('Acme Food', [v('', '1 kg', 500)]);
    expect(comparable(a, a.vars[0], b, b.vars[0])).toBe('no quoted price');
  });

  it('accepts equal totals expressed differently', () => {
    const a = prod('Acme Food', [v('', '1 kg', 900)]);
    const b = prod('Acme Food', [v('', '1000 g', 500)]);
    expect(comparable(a, a.vars[0], b, b.vars[0])).toBeNull();
  });

  it('accepts a garment size spelled two ways', () => {
    const a = prod('Acme Coat', [v('M', '', 900)]);
    const b = prod('Acme Coat', [v('Medium', '', 500)]);
    expect(comparable(a, a.vars[0], b, b.vars[0])).toBeNull();
  });

  it('accepts a multipack against a single of the same total mass', () => {
    // Sheba Soup 160g vs Sheba Soup 160g (4 x 40g): same food, different box
    const a = prod('Sheba Soup', [v('', '160 g', 211)]);
    const b = prod('Sheba Soup 4 x 40g', [v('4 x 40g', '', 240)]);
    expect(comparable(a, a.vars[0], b, b.vars[0])).toBeNull();
  });

  it('treats one unlabelled variant as the whole product', () => {
    const a = prod('Acme Bowl', [v('', '', 500)]);
    expect(sizeKey(a.vars[0], a)).toBe('single');
  });

  it('refuses a labelled variant it cannot parse, rather than guessing', () => {
    const a = prod('Acme Thing', [v('Jumbo', '', 500), v('Regular', '', 300)]);
    expect(sizeKey(a.vars[0], a)).toBeNull();
  });

  it('normalises garment aliases and rejects non-sizes', () => {
    expect(garment('Medium')).toBe('m');
    expect(garment('X-Large')).toBe('xl');
    expect(garment('2XL')).toBe('xxl');
    expect(garment('Jumbo')).toBeNull();
  });
});
