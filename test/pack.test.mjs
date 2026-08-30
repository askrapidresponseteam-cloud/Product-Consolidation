import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePack, sizeFor, fmtPack, unitPrice, sizeKey } from '../server/lib/pack.mjs';

test('multipacks add up', () => {
  assert.deepEqual(parsePack('2 x 30 pcs'), { qty: 60, unit: 'piece' });
  assert.deepEqual(parsePack('150gx15'), { qty: 2.25, unit: 'kg' });
  assert.deepEqual(parsePack('2.5 kg + 5 x 70 gm'), { qty: 2.85, unit: 'kg' });
  assert.deepEqual(parsePack('S-25g / Pack Of 4'), { qty: 0.1, unit: 'kg' });
  assert.deepEqual(parsePack('70 g (Pack of 12)'), { qty: 0.84, unit: 'kg' });
});
test('pack of N takes the size from the title', () => {
  assert.deepEqual(sizeFor('Pack Of 2', 'Chicken in Gravy Wet Food - 80 gm'), { qty: 0.16, unit: 'kg' });
  assert.equal(fmtPack(sizeFor('Pack Of 2', 'Chicken in Gravy Wet Food - 80 gm')), '160 g');
});
test('mixed units and non-sizes give nothing', () => {
  assert.equal(parsePack('3x150mL + 50pcs'), null);
  assert.equal(parsePack('Red / XL'), null);
});
test('breed weight ranges are not pack sizes', () => {
  assert.equal(sizeFor('', 'Tick solution for Dogs (20-40kg)'), null);
});
test('unit price only when comparable', () => {
  assert.equal(unitPrice({ qty: 1, unit: 'piece' }, 500), null);
  assert.deepEqual(unitPrice({ qty: 2, unit: 'kg' }, 1000), { v: 500, unit: 'kg' });
  assert.equal(sizeKey({ qty: 1.5, unit: 'kg' }), 'kg:1500');
  assert.equal(sizeKey({ qty: 4, unit: 'piece' }), null);
});
