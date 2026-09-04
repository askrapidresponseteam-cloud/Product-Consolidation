import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/**
 * The markup drives two module variables directly from on*= attributes:
 *   oninput="brandQuery=this.value; drawFilters()"
 *   onclick="catsOpen=!catsOpen; drawFilters()"
 * Those need live bindings on window. This pins the mistake that broke them.
 */
describe('exposing a module variable to inline markup', () => {
  it('Object.assign silently discards the accessor', () => {
    let real = '';
    const w = {};
    Object.assign(w, { get v() { return real; }, set v(x) { real = x; } });
    w.v = 'virbac';
    expect(w.v).toBe('virbac');        // looks like it worked
    expect(real).toBe('');             // but the variable never changed
    expect(Object.getOwnPropertyDescriptor(w, 'v').get).toBeUndefined();
  });

  it('defineProperty keeps the write connected to the variable', () => {
    let real = '';
    const w = {};
    Object.defineProperty(w, 'v', {
      get: () => real, set: (x) => { real = x; }, configurable: true,
    });
    w.v = 'virbac';
    expect(real).toBe('virbac');
    expect(w.v).toBe('virbac');
  });

  it('the built artifact uses defineProperties for both', () => {
    const src = new URL('../src/app/portal.js', import.meta.url);
    const text = fs.readFileSync(src, 'utf8');
    const block = text.slice(text.indexOf('Object.defineProperties(window'));
    expect(block).toContain('catsOpen');
    expect(block).toContain('brandQuery');
    // and neither may appear as an accessor inside an Object.assign call
    const assign = text.slice(text.indexOf('Object.assign(window'), text.indexOf('Object.defineProperties'));
    expect(assign).not.toContain('get catsOpen');
    expect(assign).not.toContain('get brandQuery');
  });
});
