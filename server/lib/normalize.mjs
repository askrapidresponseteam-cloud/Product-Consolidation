/**
 * Raw Shopify product -> internal product record. Server-side only.
 * Everything derived (pack size, unit price, category, pet, gift flag,
 * ranking score) is computed here, never in the browser.
 */
import { sizeFor, parsePack, hasMultiplier, fmtPack, unitPrice, sizeKey } from './pack.mjs';
import { classifyCategory, classifyPet } from './classify.mjs';

const GIFT_RE = /\b(free gift|gift with|freebie|free sample|sample pack|trial pack|not for sale|complimentary)\b/i;
const NOT_PRODUCT_RE = /\b(shipping|delivery charge|gift card|e-?gift|donation|membership|subscription fee)\b/i;

export function normalize(store, si, raw) {
  const title = String(raw.title || '').trim();
  const tags = Array.isArray(raw.tags) ? raw.tags.join(', ') : String(raw.tags || '');
  const type = String(raw.product_type || '');
  const brand = String(raw.vendor || '').trim() || store.label;
  const img = raw.images?.[0]?.src || raw.image?.src || '';

  const vars = (raw.variants || []).map((v) => {
    const name = v.title && v.title !== 'Default Title' ? String(v.title) : '';
    const price = Math.round(Number(v.price) || 0);
    const compare = Math.round(Number(v.compare_at_price) || 0);
    const mrp = compare > price ? compare : 0;
    let size = sizeFor(name, title);
    if (size && hasMultiplier(name)) {
      const p = parsePack(name);
      if (p && p.unit === size.unit && p.qty > size.qty) size = p;
    }
    const disc = mrp ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const up = unitPrice(size, price);
    return {
      id: String(v.id || ''), name, price, mrp, disc,
      stock: !!v.available,
      size, sizeLabel: size ? fmtPack(size) : '', sizeKey: sizeKey(size),
      up,
    };
  });

  const priced = vars.filter((v) => v.price > 0);
  const lo = priced.length ? Math.min(...priced.map((v) => v.price)) : 0;
  const hi = priced.length ? Math.max(...priced.map((v) => v.price)) : 0;
  const disc = priced.length ? Math.max(...priced.map((v) => v.disc)) : 0;
  const stock = vars.some((v) => v.stock);
  let bestUnit = null;
  for (const v of vars) if (v.up && (!bestUnit || v.up.v < bestUnit.v)) bestUnit = v.up;

  const gift = NOT_PRODUCT_RE.test(title) ? 2 : (GIFT_RE.test(title) || (priced.length && lo <= 1)) ? 1 : 0;
  const realDisc = (lo >= 25 && disc < 95) ? Math.min(disc, 70) : 0;
  const score = (stock ? 1000 : 0) + realDisc * 4 + Math.min(vars.length, 6) * 12 + (bestUnit ? 20 : 0);

  const cat = classifyCategory({ title, type, tags });
  const pet = classifyPet({ title, type, tags });

  return {
    id: `${si}-${raw.handle}`,
    si, handle: raw.handle, title, brand, cat, pet, type, img,
    url: `/products/${raw.handle}`,
    updatedAt: raw.updated_at || null,
    vars, lo, hi, disc, stock, gift, noPrice: !priced.length, unit: bestUnit, score,
    hay: `${title} ${brand} ${cat} ${type} ${tags}`.toLowerCase(),
  };
}
