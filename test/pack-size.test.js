import { describe, it, expect } from 'vitest';
import { packSize, parseSize, parsePack, fmtPack } from '../src/matching/pack-size.js';

describe('parseSize', () => {
  it('normalises mass to kg and volume to litres', () => {
    expect(parseSize('500 g')).toEqual({ qty: 0.5, unit: 'kg' });
    expect(parseSize('1.5kg')).toEqual({ qty: 1.5, unit: 'kg' });
    expect(parseSize('750 ml')).toEqual({ qty: 0.75, unit: 'L' });
  });

  it('is case and whitespace insensitive, because the six stores are not consistent', () => {
    expect(parseSize('20 Kg')).toEqual(parseSize('20kg'));
    expect(parseSize('12 KG')).toEqual(parseSize('12kg'));
  });

  it('returns null rather than guessing at unparseable text', () => {
    expect(parseSize('')).toBeNull();
    expect(parseSize('One size')).toBeNull();
  });
});

describe('packSize multipliers', () => {
  it('takes a multipack at its total, not its unit size', () => {
    // "4 x 40g" is 160g of food, which is the only comparable figure
    const p = packSize('4 x 40g', '');
    expect(p.unit).toBe('kg');
    expect(p.qty).toBeCloseTo(0.16, 6);
  });

  it('prefers the corrected total when the size column understates it', () => {
    const p = packSize('2 x 30 pieces', '30 pieces');
    expect(p.fixed).toBe(true);
    expect(p.qty).toBe(60);
  });

  it('relabels a corrected pack from its total', () => {
    expect(fmtPack({ qty: 1.96, unit: 'kg' })).toBe('1.96 kg');
    expect(fmtPack({ qty: 0.16, unit: 'kg' })).toBe('160 g');
    expect(fmtPack({ qty: 0.75, unit: 'L' })).toBe('750 ml');
  });
});

describe('parsePack', () => {
  it('reads a bare pack count with no unit as unverifiable', () => {
    // "Pack Of 3" alone says nothing about how much is in each one
    expect(parsePack('Pack Of 3')).toBeNull();
  });
});
