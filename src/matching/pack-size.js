/**
 * Pack-size parsing. The single source of truth for "how much is in this".
 *
 * Extracted verbatim from the working portal so behaviour is preserved; the
 * parity harness in test/parity.test.js asserts the extraction changed nothing
 * against all 26,562 catalogue rows.
 */

const UNITS = {
  g:[1e-3,'kg'], gm:[1e-3,'kg'], gms:[1e-3,'kg'], kg:[1,'kg'], kgs:[1,'kg'],
  ml:[1e-3,'L'], mls:[1e-3,'L'], l:[1,'L'], ltr:[1,'L'], litre:[1,'L'],
  pc:[1,'piece'], pcs:[1,'piece'], piece:[1,'piece'], pieces:[1,'piece'],
  tab:[1,'tablet'], tabs:[1,'tablet'], tablet:[1,'tablet'], tablets:[1,'tablet'],
  wipe:[1,'wipe'], wipes:[1,'wipe'], sachet:[1,'sachet'], sachets:[1,'sachet'],
  capsule:[1,'capsule'], capsules:[1,'capsule'], chew:[1,'chew'], chews:[1,'chew'],
  stick:[1,'stick'], sticks:[1,'stick'], tube:[1,'tube'], tubes:[1,'tube'],
  vial:[1,'vial'], vials:[1,'vial']
};

/* Brackets restate or decorate, they never add: "5 kg (2 x 2.5kg)" is five
   kilos and "(Free Container)" is nothing. Both are dropped. */
const PACK_OF = /\b(?:pack|set|box)\s*of\s*(\d+)/;
const SIZE_PREFIX = /^(?:xxs|xs|s|m|l|xl|xxl|\d?xl)\s*[-:]\s*/;

function tidy(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[·•]/g, '+')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePack(label) {
  /* "S-25g / Pack Of 4" is a hundred grams. The size column records 25 g, and
     the leading garment prefix blocks the number parse, so both the prefix and
     the multiplier have to be handled or four packs price as one. */
  /* Find the multiplier before brackets are stripped: Pets Lifestyle writes
     "70 g (Pack of 12)", so dropping brackets first loses the x12 and prices
     840 g as 70 g. */
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

  const parts = text.split('+');
  const items = [];
  let pendingCount = 0;

  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;

    /* "12 x 70g" - a multipack component */
    let m = /^(\d+)\s*[x×]\s*([\d.]+)\s*([a-z]+)/.exec(part);
    if (m) {
      const u = UNITS[m[3]];
      if (!u) return null;
      items.push({ n: Number(m[1]), qty: Number(m[2]) * u[0], unit: u[1] });
      continue;
    }

    /* Zigly writes the multiplier the other way round: "150gx15" is fifteen
       150 g pouches. Read count-first only and all four of that store's pack
       sizes collapse onto 150 g at four different prices. */
    m = /^([\d.]+)\s*([a-z]+)\s*[x×]\s*(\d+)\b/.exec(part);
    if (m) {
      const u = UNITS[m[2]];
      if (!u) return null;
      items.push({ n: Number(m[3]), qty: Number(m[1]) * u[0], unit: u[1] });
      continue;
    }

    /* "70g" - a plain component */
    m = /^([\d.]+)\s*([a-z]+)/.exec(part);
    if (m) {
      const u = UNITS[m[2]];
      if (!u) return null;
      items.push({ n: 1, qty: Number(m[1]) * u[0], unit: u[1] });
      continue;
    }

    /* "30+6x150g" - a bare number is a count of whatever unit follows, so
       thirty sachets plus six free is thirty-six sachets of 150 g. */
    m = /^(\d+)$/.exec(part);
    if (m) { pendingCount += Number(m[1]); continue; }

    return null;   /* "small", "red / xl" - not a size at all */
  }

  if (!items.length) return null;

  if (pendingCount) {
    /* attach the loose count to the component it was counting */
    items[0].n += pendingCount;
  }

  /* Mixed families - "3x150mL + 50pcs" - have no single unit price. Better to
     show none than to invent one. */
  const unit = items[0].unit;
  if (items.some((it) => it.unit !== unit)) return null;

  const qty = items.reduce((sum, it) => sum + it.n * it.qty, 0) * mult;
  return qty > 0 ? { qty, unit } : null;
}

const HAS_MULT = /\d+\s*[x\u00d7]\s*[\d.]|[\d.]+\s*[a-z]+\s*[x\u00d7]\s*\d|\b(?:pack|set|box)\s*of\s*\d/i;

function parseSize(s){
  if(!s) return null;
  const m = /^([\d.]+)\s*([A-Za-z]+)/.exec(String(s).trim());
  if(!m) return null;
  const u = UNITS[m[2].toLowerCase()];
  if(!u) return null;
  const q = parseFloat(m[1]) * u[0];
  return q > 0 ? {qty:q, unit:u[1]} : null;
}

/* The size column is right almost always, so it leads. It is overridden only
   where the variant label carries a multiplier the column dropped - same
   unit, and strictly more in the pack. That is 500 rows across both sellers,
   and they are the ones that were badly wrong: "2.5 kg + 5 x 70 gm" was
   priced as 350 g, reading 11,648/kg instead of 1,431/kg. */
function packSize(variant, size){
  const base = parseSize(size);
  if(HAS_MULT.test(String(variant || ''))){
    const p = parsePack(variant);
    if(p && (!base || (p.unit === base.unit && p.qty > base.qty + 1e-9))) return Object.assign({fixed:true}, p);
  }
  return base || parsePack(variant);
}

/* When the pack size has been corrected, the size column's own wording is
   stale ("30 pieces" for a 2x30 box), so relabel it from the corrected total. */
function fmtPack(p){
  if(p.unit === 'kg') return p.qty >= 1 ? `${+p.qty.toFixed(2)} kg` : `${Math.round(p.qty * 1000)} g`;
  if(p.unit === 'L')  return p.qty >= 1 ? `${+p.qty.toFixed(2)} L`  : `${Math.round(p.qty * 1000)} ml`;
  return `${+p.qty.toFixed(0)} ${p.unit}${p.qty === 1 ? '' : 's'}`;
}

export { UNITS, PACK_OF, SIZE_PREFIX, HAS_MULT, tidy, parsePack, parseSize, packSize, fmtPack };
