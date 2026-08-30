import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../server/lib/normalize.mjs';
import { buildMatches } from '../server/lib/match.mjs';

const raw = (handle, title, vendor, variants) => ({ handle, title, vendor, tags: [], variants: variants.map(([t, p], i) => ({ id: i, title: t, price: String(p), available: true })) });
test('same brand, same pack, similar title across stores matches; price verdict is right', () => {
  const a = normalize({ label: 'A' }, 0, raw('x', 'Farmina N&D Chicken Adult Dog Dry Food', 'Farmina', [['2.5 kg', 2500], ['12 kg', 9000]]));
  const b = normalize({ label: 'B' }, 1, raw('y', 'Farmina N&D Chicken & Pomegranate Adult Dog Food', 'Farmina', [['2.5kg', 2300]]));
  const c = normalize({ label: 'B' }, 1, raw('z', 'Farmina N&D Chicken Puppy Dry Food', 'Farmina', [['2.5kg', 2000]]));
  const n = buildMatches([a, b, c]);
  assert.equal(n, 2);
  assert.equal(a.cmp.weCheapest, false);
  assert.equal(a.cmp.diff, 200);
  assert.equal(a.cmp.bestSi, 1);
  assert.equal(c.cmp, null, 'puppy does not match adult');
  assert.equal(b.cmp.weCheapest, true);
});
