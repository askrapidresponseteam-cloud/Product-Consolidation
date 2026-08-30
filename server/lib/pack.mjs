/**
 * Pack-size parsing. Server-side only.
 *
 * Turns a variant label ("2 x 30 pcs", "Pack Of 2", "150gx15", "S-25g / Pack
 * Of 4") plus the product title into one total quantity in a canonical unit,
 * so a unit price can be computed and pack sizes compared across stores.
 *
 * Canonical units: kg, L, piece, tablet, wipe, sachet, capsule, chew, stick,
 * tube, vial. Mass and volume are always held in kg / L.
 */

const UNITS = {
  g: [1e-3, 'kg'], gm: [1e-3, 'kg'], gms: [1e-3, 'kg'], gram: [1e-3, 'kg'], grams: [1e-3, 'kg'],
  kg: [1, 'kg'], kgs: [1, 'kg'],
  ml: [1e-3, 'L'], mls: [1e-3, 'L'], l: [1, 'L'], ltr: [1, 'L'], litre: [1, 'L'], liter: [1, 'L'],
  pc: [1, 'piece'], pcs: [1, 'piece'], piece: [1, 'piece'], pieces: [1, 'piece'],
  tab: [1, 'tablet'], tabs: [1, 'tablet'], tablet: [1, 'tablet'], tablets: [1, 'tablet'],
  wipe: [1, 'wipe'], wipes: [1, 'wipe'], sachet: [1, 'sachet'], sachets: [1, 'sachet'],
  capsule: [1, 'capsule'], capsules: [1, 'capsule'], chew: [1, 'chew'], chews: [1, 'chew'],
  stick: [1, 'stick'], sticks: [1, 'stick'], tube: [1, 'tube'], tubes: [1, 'tube'],
  vial: [1, 'vial'], vials: [1, 'vial'],
};

const PACK_OF = /\b(?:pack|set|box)\s*of\s*(\d+)/i;
const SIZE_PREFIX = /^(?:xxs|xs|s|m|l|xl|xxl|\d?xl)\s*[-:]\s*/;
const QTY = new RegExp(
  `(\\d+(?:\\.\\d+)?\\s*[x×]\\s*)?\\d+(?:\\.\\d+)?\\s*(?:${Object.keys(UNITS).join('|')})\\b(?:\\s*[x×]\\s*\\d+)?`,
  'gi',
);
const HAS_MULT = /\d+\s*[x×]\s*[\d.]|[\d.]+\s*[a-z]+\s*[x×]\s*\d|\b(?:pack|set|box)\s*of\s*\d/i;

function tidy(s) {
  return String(s || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ').replace(/[·•]/g, '+').replace(/\s+/g, ' ').trim();
}

/** Parse a label into { qty, unit } or null. */
export function parsePack(label) {
  const pre = PACK_OF.exec(String(label || '').toLowerCase());
  let text = tidy(label).replace(SIZE_PREFIX, '');
  if (!text) return null;

  let mult = 1;
  const mo = PACK_OF.exec(text) || pre;
  if (mo) {
    mult = Number(mo[1]);
    text = text.replace(PACK_OF, ' ').replace(/\//g, ' ').trim().replace(/^[+/]+|[+/]+$/g, '');
    if (!text) return null;
  }

  const items = [];
  let pending = 0;
  for (const raw of text.split('+')) {
    const part = raw.trim();
    if (!part) continue;
    let m = /^(\d+)\s*[x×]\s*([\d.]+)\s*([a-z]+)/.exec(part);
    if (m) { const u = UNITS[m[3]]; if (!u) return null; items.push({ n: +m[1], qty: +m[2] * u[0], unit: u[1] }); continue; }
    m = /^([\d.]+)\s*([a-z]+)\s*[x×]\s*(\d+)\b/.exec(part);
    if (m) { const u = UNITS[m[2]]; if (!u) return null; items.push({ n: +m[3], qty: +m[1] * u[0], unit: u[1] }); continue; }
    m = /^([\d.]+)\s*([a-z]+)/.exec(part);
    if (m) { const u = UNITS[m[2]]; if (!u) return null; items.push({ n: 1, qty: +m[1] * u[0], unit: u[1] }); continue; }
    if (/^\d+$/.test(part)) { pending += +part; continue; }
    return null;
  }
  if (!items.length) return null;
  if (pending) items[0].n += pending;
  const unit = items[0].unit;
  if (items.some((i) => i.unit !== unit)) return null;
  const qty = items.reduce((s, i) => s + i.n * i.qty, 0) * mult;
  return qty > 0 ? { qty: round(qty), unit } : null;
}

const round = (n) => Math.round(n * 1e6) / 1e6;

function findSize(text) {
  const clean = String(text || '').replace(/\([^)]*\)/g, ' ');
  const hits = clean.match(QTY);
  if (!hits) return null;
  for (let i = hits.length - 1; i >= 0; i--) {
    const p = parsePack(hits[i]);
    if (p) return p;
  }
  return null;
}

function scale(size, mult) {
  return mult === 1 ? size : { qty: round(size.qty * mult), unit: size.unit };
}

/** Best-effort pack size for a variant: label first, title as a fallback. */
export function sizeFor(variantLabel, title) {
  const direct = parsePack(variantLabel) || findSize(variantLabel);
  if (direct) return direct;
  const mo = PACK_OF.exec(String(variantLabel || ''));
  const fromTitle = findSize(title);
  if (mo && fromTitle) return scale(fromTitle, Number(mo[1]));
  if (mo) return { qty: Number(mo[1]), unit: 'piece' };
  return fromTitle;
}

export function hasMultiplier(label) { return HAS_MULT.test(String(label || '')); }

/** Human label: 1.5 kg, 400 g, 12 pieces. */
export function fmtPack(p) {
  if (!p) return '';
  if (p.unit === 'kg') return p.qty >= 1 ? `${+p.qty.toFixed(2)} kg` : `${Math.round(p.qty * 1000)} g`;
  if (p.unit === 'L') return p.qty >= 1 ? `${+p.qty.toFixed(2)} L` : `${Math.round(p.qty * 1000)} ml`;
  const n = +p.qty.toFixed(0);
  return `${n} ${p.unit}${n === 1 ? '' : 's'}`;
}

/** Unit price only when it helps compare pack sizes. */
export function unitPrice(size, price) {
  if (!size || !(price > 0)) return null;
  const useful = size.unit === 'kg' || size.unit === 'L' || size.qty > 1;
  return useful ? { v: price / size.qty, unit: size.unit } : null;
}

/** Key used to say "same pack size" across stores. Only mass/volume compare. */
export function sizeKey(size) {
  if (!size) return null;
  if (size.unit !== 'kg' && size.unit !== 'L') return null;
  return `${size.unit}:${Math.round(size.qty * 1000)}`;
}
