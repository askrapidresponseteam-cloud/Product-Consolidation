/**
 * Render layer: DOM wiring, templates and event handling.
 *
 * All decision-making logic lives in the modules imported below and is unit
 * tested there. This file is deliberately the only place that touches the DOM.
 * It remains one module rather than several; splitting the render code is the
 * next refactor, and is not attempted here because it cannot be verified as
 * cheaply as the pure layer can.
 */
import { packSize, fmtPack } from '../matching/pack-size.js';
import { sizeKey } from '../matching/size-key.js';
import { comparable } from '../matching/gate.js';
import { flagImplausible } from '../matching/implausible.js';
import { buildComparisons } from '../matching/comparisons.js';
import { recomputeAggregates } from '../catalogue/aggregate.js';
import { RULES } from '../pricing/rules.js';
import { quote as quoteFor } from '../pricing/quote.js';
import { rankQuotes } from '../pricing/rank.js';
import { applyFilters, facetOptions } from '../facets/filter.js';
import { inr, inrp, esc, tokens, money, band } from '../format.js';

/* Injected by build/compose.mjs as a top-level const in the same script tag,
   ahead of this bundle. Declared here so the module type-checks and lints. */
/* global DATA */

/* ---- adapters between the pure modules and the render layer ---- */
const quote = (p, v, qty) => quoteFor(p, v, qty, sellers);
const facet = (list, key) => facetOptions(list, facetCounts[key]);

/* ---------------- decode ---------------- */
const {sellers, base, brands, cats, pets, vlab, slab, imgPrefixes} = DATA;
const MATCH = DATA.match || {};
const SELLER_COLOR = sellers.map((unused, i) => `var(--s${i})`);

/* Pack size, including multipacks.

   The CSVs carry a `size` column that drops the multiplier: "2x30pcs" is
   recorded as "30 pieces" and "2x30mL + 2x100mL" as "60 ml", so their
   unit_price is wrong by the multiplier - sometimes badly (a 4x60pcs box
   reads 19.6/piece when it is 4.9). A pack is worth what the whole pack
   contains, so parse the label and add the parts up. */

function slugify(s){
  return s.toLowerCase().replace(/[&+]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

const P = DATA.products.map((p, idx) => {
  const [si, title, bi, ci, pi, handle, rawVars, imgP, imgF, gift] = p;
  let lo = Infinity, hi = 0, maxDisc = 0, bestUnit = null, anyStock = false;
  const vars = rawVars.map(v => {
    const [vi, szi, price, mrp, stock] = v;
    const vname = vlab[vi];
    let size = slab[szi];
    const parsed = packSize(vname, size);
    if(parsed && parsed.fixed) size = fmtPack(parsed);
    else if(!size && parsed) size = vname;
    const disc = mrp ? Math.round((mrp - price) / mrp * 100) : 0;
    // "₹500/piece" on a single-piece item repeats the price, so only keep
    // a unit price when it lets you compare across pack sizes
    const useful = parsed && (parsed.unit === 'kg' || parsed.unit === 'L' || parsed.qty > 1);
    const up = useful ? price / parsed.qty : null;
    if(price > 0){
      if(price < lo) lo = price;
      if(price > hi) hi = price;
      if(disc > maxDisc) maxDisc = disc;
    }
    if(stock) anyStock = true;
    if(up != null && (bestUnit == null || up < bestUnit.v)) bestUnit = {v:up, unit:parsed.unit};
    return {name:vname, size, price, mrp, disc, stock, up, unit:parsed ? parsed.unit : null};
  });
  /* A Rs0 line means the store is not quoting a price, not that the thing is
     free. Left alone it read as 100% off and led the whole page. */
  const priced = vars.some((v) => v.price > 0);
  if(!priced){ lo = 0; hi = 0; maxDisc = 0; }

  // Featured ranking: in-stock, genuinely discounted, multi-size products first.
  // Near-100%-off rows are freebies and samples, so they earn nothing here.
  const realDisc = (lo >= 25 && maxDisc < 95) ? Math.min(maxDisc, 70) : 0;
  const score = (anyStock ? 1000 : 0) + realDisc * 4 + Math.min(vars.length, 6) * 12
                + (bestUnit ? 20 : 0);
  return {
    i:idx, si, title, brand:brands[bi], cat:cats[ci], pet:pets[pi], score,
    img: imgP >= 0 ? imgPrefixes[imgP] + imgF : '',
    gift,   /* 0 normal, 1 gift or token offer, 2 not a product */
    noPrice: !priced,
    seller: sellers[si],
    url: base[si] + (handle || slugify(vars.length===1 && vars[0].name ? title+' '+vars[0].name : title)),
    vars, lo, hi, disc:maxDisc, unit:bestUnit, stock:anyStock,
    hay: (title + ' ' + brands[bi] + ' ' + cats[ci]).toLowerCase()
  };
});

/* ---------------- the same product at the other shop ----------------

   Matched offline on brand, pet, category, life stage, breed size and an exact
   pack size, then scored on how much distinctive wording the two titles share.
   Only mass, volume and garment sizes are compared: "4 pieces" means four
   retail packs on one site and four tubes inside one pack on the other. */
/* ---------------- like-for-like gate ----------------

   MATCH arrives precomputed and this file used to take its aligned pairs on
   faith. Faith is the wrong posture for a claim like "₹340 less at Zigly":
   if a regenerated MATCH ever lines a 3-pack up against a single unit, the
   saving is fabricated and looks identical to a real one on screen. So every
   pair is re-proved here, from the variant text, before it can price anything.

   The rule is that a comparison must be refused unless it can be shown sound.
   Anything unverifiable is dropped, which costs a few honest comparisons and
   is the correct trade: a missing badge is a small loss, an invented 75% is a
   lie the reader has no way to catch. */

/* ---------------- category palette ---------------- */
/* Flag prices that contradict the same store's larger pack, then build the
   verified cross-store comparisons. Both mutate P, which is what the render
   layer below expects to find. */
flagImplausible(P);
/* Must run between the two: the flag has to exist before aggregates are
   recomputed, and comparisons read the corrected figures. */
recomputeAggregates(P);
buildComparisons(P, MATCH, sellers);

const CAT_STYLE = {
  'Dry Food':['#C8956A','bowl'], 'Wet Food':['#8AA5C4','can'], 'Fresh Food':['#8FAE7B','bowl'],
  'Treats & Chews':['#C9A25C','bone'], 'Health & Wellness':['#7FB3A4','drop'],
  'Pharmacy':['#93A9C9','drop'], 'Toys':['#D08C7E','ball'], 'Clothing':['#A995C4','shirt'],
  'Collars & Leashes':['#B08B6E','collar'], 'Beds, Mats & Travel':['#9BAF95','bed'],
  'Bowls & Feeders':['#A2A8B4','bowl'], 'Grooming':['#C79BAF','drop'],
  'Litter & Cleanup':['#A8AC9A','paw'], 'Training':['#8FA8B8','paw'],
  'Vet Services':['#8CA6A0','cross'], 'Gifting & Merch':['#C49B84','paw'],
  'Small Pet Supplies':['#A3B58C','paw'], 'Other':['#A6ABA2','paw']
};
const MOTIF = {
  paw:'M12 15.4c-2 0-3.6 1.3-3.6 2.9 0 1.4 1.1 2 3.6 2s3.6-.6 3.6-2c0-1.6-1.6-2.9-3.6-2.9M7 10.6c-1 0-1.8.9-1.8 2s.8 2 1.8 2 1.8-.9 1.8-2-.8-2-1.8-2m10 0c-1 0-1.8.9-1.8 2s.8 2 1.8 2 1.8-.9 1.8-2-.8-2-1.8-2M10 6.4c-1 0-1.8 1-1.8 2.2s.8 2.2 1.8 2.2 1.8-1 1.8-2.2S11 6.4 10 6.4m4 0c-1 0-1.8 1-1.8 2.2s.8 2.2 1.8 2.2 1.8-1 1.8-2.2-.8-2.2-1.8-2.2',
  bone:'M6.6 8.2c-1.3 0-2.3.9-2.3 2 0 .5.2 1 .5 1.3-.3.4-.5.8-.5 1.3 0 1.1 1 2 2.3 2 1 0 1.9-.6 2.2-1.4h6.4c.3.8 1.2 1.4 2.2 1.4 1.3 0 2.3-.9 2.3-2 0-.5-.2-.9-.5-1.3.3-.3.5-.8.5-1.3 0-1.1-1-2-2.3-2-1 0-1.9.6-2.2 1.4H8.8c-.3-.8-1.2-1.4-2.2-1.4',
  bowl:'M3.8 10.5h16.4c0 4.2-2.7 7.3-6 7.9V20h-4.4v-1.6c-3.3-.6-6-3.7-6-7.9M7 8c0-2 2.2-3.3 5-3.3S17 6 17 8',
  can:'M7 5.5h10a1 1 0 0 1 1 1v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 17.5v-11a1 1 0 0 1 1-1m-.6 3.6h11.2M6.4 15h11.2',
  ball:'M12 4.4a7.6 7.6 0 1 0 0 15.2 7.6 7.6 0 0 0 0-15.2m-7 6.3c3.6.5 6.4-1.4 7.6-5.9M19 10.7c-3.6.5-6.4-1.4-7.6-5.9M5.4 15.3c3.4-1.6 6.8-.6 8.8 3.6',
  shirt:'M9 4.6 5 6.4l1.2 3.8 1.6-.5v9.7h8.4V9.7l1.6.5L19 6.4l-4-1.8a3 3 0 0 1-6 0',
  collar:'M4.6 11c0 3.6 3.3 6.5 7.4 6.5s7.4-2.9 7.4-6.5M12 17.5v2.1m-1.6 0h3.2M4.6 9.4h14.8v2.2H4.6z',
  bed:'M3.5 16.4v-4.2c0-1.2 1-2.2 2.2-2.2h12.6c1.2 0 2.2 1 2.2 2.2v4.2m-17 0v2m17-2v2m-17-2h17M6.4 9.9V8.2c0-1 .8-1.8 1.8-1.8h7.6c1 0 1.8.8 1.8 1.8v1.7',
  drop:'M12 4.2c3.2 3.7 5 6.4 5 8.8a5 5 0 0 1-10 0c0-2.4 1.8-5.1 5-8.8',
  cross:'M10 4.6h4v5.4h5.4v4H14v5.4h-4V14H4.6v-4H10z'
};

/* deterministic hash so a product always draws the same tile */
function hash(s){
  let h = 2166136261;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}
function rng(seed){
  let s = seed || 1;
  return () => { s ^= s<<13; s ^= s>>>17; s ^= s<<5; s >>>= 0; return s / 4294967296; };
}

/* Shopify's CDN resizes on request, so ask for roughly the size the slot is
   rather than pulling a 2000px original into a 220px card. */
function photo(url, width){
  return url + (url.includes('?') ? '&' : '?') + 'width=' + width;
}

/* hex -> hsl parts, so each product can hold its category's colour family
   while still getting a shade of its own */
function hsl(hex){
  const n = parseInt(hex.slice(1), 16);
  const R = (n >> 16) / 255, G = ((n >> 8) & 255) / 255, B = (n & 255) / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if(d){
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === R ? ((G - B) / d + (G < B ? 6 : 0)) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
const HSL_CACHE = {};

function tile(p, wide){
  const [col, motif] = CAT_STYLE[p.cat] || CAT_STYLE.Other;
  const seed = hash(p.title + p.brand + p.si);
  const r = rng(seed);
  const base = HSL_CACHE[col] || (HSL_CACHE[col] = hsl(col));
  /* muted to near-tonal so a missing photo reads as paper, not a colour block */
  const shade = (dl, a) => `hsl(${(base[0] + (r0 - .5) * 26 + 360) % 360} ${Math.max(5, (base[1] + (r1 - .5) * 16) * 0.36)}% ${Math.min(90, Math.max(38, base[2] + dl + 6))}% / ${a})`;
  const r0 = r(), r1 = r();
  const W = wide ? 320 : 160, H = wide ? 140 : 120;
  const d = MOTIF[motif] || MOTIF.paw;
  let bits = '';
  const n = wide ? 11 : 7;
  for(let i=0;i<n;i++){
    const x = r()*W, y = r()*H, s = (0.4 + r()*0.5) * (wide?1.05:0.95), rot = Math.floor(r()*360);
    bits += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot}) scale(${s.toFixed(2)}) translate(-12 -12)" opacity="${(0.1 + r()*0.13).toFixed(2)}"><path d="${d}" fill="none" stroke="#18211C" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  const bigS = wide ? 3.1 : 2.6;
  const bigX = wide ? W*0.5 : W*0.5, bigY = H*0.5;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${motif} pattern">
    <rect width="${W}" height="${H}" fill="${shade((r0 - .5) * 10, .5)}"/>${bits}
    <g transform="translate(${bigX} ${bigY}) scale(${bigS}) translate(-12 -12)" opacity=".82">
      <path d="${d}" fill="none" stroke="${shade(-26, .8)}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </g></svg>`;
}

/* ---------------- state ---------------- */
const S = {q:'', both:false, stores:new Set(), pets:new Set(), cats:new Set(), brands:new Set(),
           min:null, max:null, disc:0, stock:false, sort:'disc'};

/* Selection is held apart from S because it is not a filter: it survives
   resetAll, a new search and a change of store, so you can gather things to
   compare from corners of the catalogue that no single filter shows at once.
   Keyed by p.i, the stable index into P, so a re-render restores the ticks. */
const picked = new Set();
let view = [], shown = 0;
const PAGE = 48;

/* Counts per facet, each computed with that facet's own selection ignored.
   Held here so drawFilters can read them without refiltering. */
let facetCounts = {store:new Map(), pet:new Map(), cat:new Map(), brand:new Map()};

function apply(){
  const tk = tokens(S.q);
  const { view: v, counts } = applyFilters(P, S, tk);
  view = v;
  facetCounts = counts;

  // ₹30/piece and ₹71/kg aren't comparable, so rank whole unit groups first
  // (commonest unit in the current view leads) and sort by price within each
  const urank = new Map();
  if(S.sort === 'unit'){
    const freq = new Map();
    for(const p of view) if(p.unit) freq.set(p.unit.unit, (freq.get(p.unit.unit) || 0) + 1);
    [...freq.entries()].sort((a,b) => b[1] - a[1]).forEach(([u], i) => urank.set(u, i));
  }
  const ur = p => p.unit ? urank.get(p.unit.unit) : 1e6;

  const c = {
    pop:(a,b) => (b.score - a.score) || (a.i - b.i),
    /* Order by the price on the card, not by a hidden end of the range. A
       tile reading "from 348" sitting above one reading "2,56,500" in a
       high-to-low list is indefensible however the number was derived. */
    plo:(a,b) => a.lead - b.lead,
    phi:(a,b) => b.lead - a.lead,
    /* "100% off" on a gift-with-purchase or a Rs1 cart add-on is not an
       offer you can take, so those sit under the real markdowns. */
    disc:(a,b) => ((a.gift || a.noPrice ? 1 : 0) - (b.gift || b.noPrice ? 1 : 0))
                  || (b.disc - a.disc) || (b.stock - a.stock) || (a.i - b.i),
    save:(a,b) => (b.cmp ? Math.abs(b.cmp.diff) : -1) - (a.cmp ? Math.abs(a.cmp.diff) : -1),
    unit:(a,b) => (ur(a) - ur(b)) || ((a.unit ? a.unit.v : Infinity) - (b.unit ? b.unit.v : Infinity)),
    az:(a,b) => a.title.localeCompare(b.title)
  }[S.sort];
  view.sort(c);
  if(S.sort === 'pop') view = spread(view);

  shown = 0;
  grid.innerHTML = '';
  count.innerHTML = `<b>${view.length.toLocaleString('en-IN')}</b> ${view.length === 1 ? 'product' : 'products'}`;
  renderChips();
  more();
  drawFilters();
}

/* Round-robin the ranked list by brand so the first screens read like a shop
   floor rather than forty items from whichever label discounts hardest. */
function spread(list){
  if(list.length < 24) return list;
  const buckets = new Map();
  for(const p of list){
    let b = buckets.get(p.brand);
    if(!b){ b = []; buckets.set(p.brand, b); }
    b.push(p);
  }
  const queues = [...buckets.values()], out = [];
  let live = true;
  while(live){
    live = false;
    for(const qd of queues){ if(qd.length){ out.push(qd.shift()); live = true; } }
  }
  return out;
}

/* The variant a card quotes: cheapest that is actually for sale, breaking ties
   on the deeper discount. Shared with the comparison sheet so the two never
   disagree about what a product costs. */
function leadVar(p){
  const sellable = p.vars.filter((v) => v.price > 0);
  const pool = sellable.length ? sellable : p.vars;
  return pool.reduce((a,b) =>
    (b.price < a.price || (b.price === a.price && b.disc > a.disc)) ? b : a, pool[0]);
}

function card(p){
  const v = p.vars.length;
  // everything on the card describes the variant whose price is shown
  const lead = leadVar(p);
  const on = picked.has(p.i);
  return `<div class="cardwrap${on ? ' picked' : ''}" data-i="${p.i}">
    <button class="pick" onclick="togglePick(${p.i})" aria-pressed="${on}"
      title="${on ? 'Remove from comparison' : 'Add to comparison'}"
      aria-label="${on ? 'Remove' : 'Add'} ${esc(p.title)} ${on ? 'from' : 'to'} comparison">✓</button>
    <button class="card" onclick="openP(${p.i})" aria-label="${esc(p.title)}">
    <span class="tile">${tile(p)}${p.img
      ? `<img class="shot" src="${photo(p.img, 400)}" alt="" loading="lazy" decoding="async" onload="this.classList.add('in')" onerror="this.remove()">`
      : ''}
      ${p.gift === 2 ? '<span class="badge gift">Not for sale</span>'
        : p.noPrice ? '<span class="badge gift">Price on request</span>'
        : p.gift === 1 ? '<span class="badge gift">Free gift</span>'
        : lead.disc >= 10 ? `<span class="badge">${lead.disc}% off</span>` : ''}
      <span class="sellerdot" style="background:${SELLER_COLOR[p.si]}" title="${sellers[p.si]}"></span>
      ${p.stock ? '' : '<span class="oosveil"><em>Sold out</em></span>'}
    </span>
    <span class="body">
      <span class="brandline">${esc(p.brand)}</span>
      <span class="pname">${esc(p.title)}</span>
      ${v > 1 ? `<span class="vcount">${v} sizes · from</span>` : ''}
      <span class="priceline">
        ${p.noPrice
          ? '<span class="price nop">Ask the store</span>'
          : `<span class="price">${inr(lead.price)}</span>
             ${lead.mrp ? `<span class="mrp">${inr(lead.mrp)}</span>` : ''}`}
        ${p.unit ? `<span class="unitp">${inrp(p.unit.v)}/${p.unit.unit}</span>` : ''}
      </span>
      ${p.cmp ? `<span class="vs ${p.cmp.diff === 0 ? 'level' : p.cmp.weCheapest ? 'win' : 'lose'}">
        ${p.cmp.weCheapest
          ? `Cheapest of ${p.cmp.lead.stores} stores`
          : p.cmp.diff === 0
            ? `Matched across ${p.cmp.lead.stores} stores`
            : `${inr(p.cmp.diff)} less at ${esc(p.cmp.bestSeller)}`}
      </span>` : ''}
    </span>
  </button></div>`;
}

function more(){
  const next = view.slice(shown, shown + PAGE);
  if(next.length) grid.insertAdjacentHTML('beforeend', next.map(card).join(''));
  shown += next.length;
  if(!view.length){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h2>Nothing matches these filters</h2>
      <p>Widen the search by removing a filter, or start over.</p>
      <button class="btn" onclick="resetAll()">Clear all filters</button></div>`;
    loadmsg.textContent = '';
  } else {
    loadmsg.textContent = shown >= view.length
      ? (view.length > PAGE ? `All ${view.length.toLocaleString('en-IN')} shown` : '')
      : 'Loading more…';
  }
}

/* ---------------- filter panel ---------------- */
/* Every option is returned, including the ones currently at zero. A zero is
   information - it says this combination has nothing in it - and removing the
   row is what made options vanish. Ordered by count, then alphabetically so
   the zeros settle in a stable, scannable block rather than shuffling. */

let brandQuery = '', catsOpen = false;
function drawFilters(){
  /* This function replaces the whole panel, so any input being typed into is
     destroyed mid-keystroke: the brand box kept only the first letter, and the
     price boxes dropped focus as soon as the debounce fired. Note where the
     caret was, then put it back. Applies to every input in here, including any
     added later. */
  const live = document.activeElement;
  const held = (live && facets.contains(live) && live.dataset.k)
    ? {k: live.dataset.k, start: live.selectionStart, end: live.selectionEnd}
    : null;
  const scrolls = [...facets.querySelectorAll('.scrolllist')].map((el) => el.scrollTop);

  const petF = facet(pets, 'pet');
  const catF = facet(cats, 'cat');
  const brandF = facet(brands, 'brand');

  /* The Category and Brand lists are capped for length, so a selection made
     before a search or sitting past the cap could scroll out of existence.
     Selected options are lifted to the top of their own list instead, which
     keeps "always visible" true no matter how long the list is, and keeps the
     tick reachable to undo. The brand search filters only the unselected
     remainder for the same reason. */
  const split = (arr, set) => [arr.filter(([k]) => set.has(k)), arr.filter(([k]) => !set.has(k))];
  const [catOn, catOff] = split(catF, S.cats);
  const [brandOn, brandOffAll] = split(brandF, S.brands);
  const needle = brandQuery.trim().toLowerCase();
  const brandOff = needle ? brandOffAll.filter(([b]) => b.toLowerCase().includes(needle)) : brandOffAll;

  const box = (title, open, inner, id) => `
    <div class="fgroup" data-open="${open}" id="g-${id}">
      <button class="fhead" onclick="togg('${id}')" aria-expanded="${open}">
        <h3>${title}</h3>
        <svg class="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="fbody">${inner}</div>
    </div>`;

  /* The value rides in a data attribute rather than inside a generated JS
     string. Building handlers as text is what broke the search chip: an action
     containing a quote silently truncates the attribute. */
  const opts = (arr, set, key) => arr.map(([k, n]) =>
    `<label class="opt${set.has(k) ? ' on' : ''}${n ? '' : ' zero'}"><input type="checkbox" ${set.has(k) ? 'checked' : ''} data-f="${key}" data-v="${esc(k)}">
      <span class="lbl">${esc(k)}</span><span class="n">${n.toLocaleString('en-IN')}</span></label>`).join('');

  const storeF = facet(sellers, 'store');
  facets.innerHTML =
    box('Store', open.store, storeF.map(([k, n], idx) => {
      const si = sellers.indexOf(k);
      return `<label class="opt${S.stores.has(k) ? ' on' : ''}${n ? '' : ' zero'}"><input type="checkbox" ${S.stores.has(k) ? 'checked' : ''} data-f="store" data-v="${esc(k)}">
        <span class="swatch" style="background:${SELLER_COLOR[si]}"></span>
        <span class="lbl">${esc(k)}</span><span class="n">${n.toLocaleString('en-IN')}</span></label>`;
    }).join(''), 'store') +
    box('Pet', open.pet, opts(petF, S.pets, 'pet'), 'pet') +
    box('Category', open.cat,
      opts(catOn, S.cats, 'cat') +
      opts(catsOpen ? catOff : catOff.slice(0, Math.max(0, 8 - catOn.length)), S.cats, 'cat') +
      (catOff.length > 8 - catOn.length ? `<button class="morelink" onclick="catsOpen=!catsOpen;drawFilters()">${catsOpen ? 'Show fewer' : `Show all ${catF.length}`}</button>` : ''), 'cat') +
    box('Brand', open.brand,
      `<input class="brandsearch" data-k="brand" placeholder="Find a brand" value="${esc(brandQuery)}" oninput="brandQuery=this.value;drawFilters()">
       <div class="scrolllist">${opts(brandOn, S.brands, 'brand')}${
         brandOff.length ? opts(brandOff.slice(0, 300), S.brands, 'brand')
           : (brandOn.length ? '' : '<div class="n" style="padding:6px 0;color:var(--muted)">No brand by that name</div>')
       }</div>`, 'brand') +
    box('Price', open.price, `<div class="range">
        <input type="number" data-k="min" placeholder="Min" value="${S.min ?? ''}" oninput="S.min=this.value===''?null:+this.value;debApply()">
        <span>to</span>
        <input type="number" data-k="max" placeholder="Max" value="${S.max ?? ''}" oninput="S.max=this.value===''?null:+this.value;debApply()">
      </div>`, 'price') +
    box('Discount', open.disc, `<div class="pillrow">
        ${[0, 20, 40, 60].map(d => `<button class="pill" aria-pressed="${S.disc === d}" onclick="S.disc=${d};apply()">${d ? d + '%+' : 'Any'}</button>`).join('')}
      </div>`, 'disc') +
    box('Availability', open.stock,
      `<label class="opt"><input type="checkbox" ${S.stock ? 'checked' : ''} onchange="S.stock=this.checked;apply()">
        <span class="lbl">In stock only</span></label>`, 'stock') +
    box('Price check', open.cmp,
      `<label class="opt"><input type="checkbox" ${S.both ? 'checked' : ''} onchange="S.both=this.checked;apply()">
        <span class="lbl">Sold at 2+ stores</span><span class="n">${nMatched}</span></label>`, 'cmp');

  if(held){
    const back = facets.querySelector(`[data-k="${held.k}"]`);
    if(back){
      back.focus();
      /* number inputs report a null selection and throw on setSelectionRange */
      if(held.start != null){ try { back.setSelectionRange(held.start, held.end); } catch {} }
    }
  }
  [...facets.querySelectorAll('.scrolllist')].forEach((el, i) => { el.scrollTop = scrolls[i] || 0; });

  const n = S.stores.size + S.pets.size + S.cats.size + S.brands.size +
            (S.disc ? 1 : 0) + (S.stock ? 1 : 0) + (S.both ? 1 : 0) +
            (S.min != null ? 1 : 0) + (S.max != null ? 1 : 0);
  fcount.hidden = !n; fcount.textContent = n;
}

const open = {store:true, pet:true, cat:true, brand:true, price:true, disc:true, stock:true, cmp:true};
const nMatched = P.filter(p => p.cmp).length.toLocaleString('en-IN');
function togg(id){ open[id] = !open[id]; drawFilters(); }
function tStore(k){ S.stores.has(k) ? S.stores.delete(k) : S.stores.add(k); apply(); }
function tPet(k){ S.pets.has(k) ? S.pets.delete(k) : S.pets.add(k); apply(); }
function tCat(k){ S.cats.has(k) ? S.cats.delete(k) : S.cats.add(k); apply(); }
function tBrand(k){ S.brands.has(k) ? S.brands.delete(k) : S.brands.add(k); apply(); }

let chipFns = [];
function renderChips(){
  const c = [];
  S.stores.forEach(k => c.push([k, () => tStore(k)]));
  S.pets.forEach(k => c.push([k, () => tPet(k)]));
  S.cats.forEach(k => c.push([k, () => tCat(k)]));
  S.brands.forEach(k => c.push([k, () => tBrand(k)]));
  if(S.disc) c.push([S.disc + '% off or more', () => { S.disc = 0; apply(); }]);
  if(S.stock) c.push(['In stock', () => { S.stock = false; apply(); }]);
  if(S.both) c.push(['Sold at 2+ stores', () => { S.both = false; apply(); }]);
  if(S.min != null) c.push(['Over ' + inr(S.min), () => { S.min = null; apply(); }]);
  if(S.max != null) c.push(['Under ' + inr(S.max), () => { S.max = null; apply(); }]);
  if(S.q) c.push(['“' + S.q + '”', clearSearch]);

  chipFns = c.map((x) => x[1]);
  chips.innerHTML = c.length
    ? c.map(([t], i) => `<span class="chip">${esc(t)}<button data-i="${i}" aria-label="Remove ${esc(t)}">✕</button></span>`).join('') +
      (c.length > 1 ? '<button class="chip clearall" data-all="1">Clear all</button>' : '')
    : '';
}

/* ---------------- drawer ---------------- */
/* ---------------- effective price engine ----------------

   Ranking on the displayed price is wrong, because nobody pays the displayed
   price. What is payable is the item, minus whatever promotions actually
   apply, plus shipping, fees and tax. This computes that, and refuses to
   compute it when the inputs are not there.

   The rule that makes it trustworthy is that a promotion is never assumed.
   Anything requiring a code, a card, a first order or a membership is priced
   as a separate labelled tier and kept out of the headline and out of the
   ranking. The CTA quotes only what any visitor can pay today.

   Where the fee model is unknown the answer is a range, not a number, and a
   store is only called cheapest when its worst case still beats every rival's
   best case. That is a claim that cannot be gamed by hiding fees: a seller
   who publishes nothing gets an open-ended upper bound and can never win. */

function ladder(p, v){
  const q = quote(p, v, 1);
  if(!q.known){
    return `<div class="ladder">
      <p class="lrow vary"><span>Price may vary at checkout</span><b>${money(q.items)} + fees</b></p>
      <p class="lnote">${esc(q.caveats[0])} The item price is real; shipping, fees and any coupons are not published in a form this has verified, so no final total is claimed.</p>
    </div>`;
  }

  const rows = [`<p class="lrow"><span>Regular checkout</span><b>${band(q.regular[0], q.regular[1])}</b></p>`];
  for(const t of q.tiers){
    if(!t.eligible){
      rows.push(`<p class="lrow off"><span>${esc(t.label)} \u00b7 code ${esc(t.code)}</span><b>needs ${money(t.minSubtotal)}+</b></p>
        <p class="lnote">Not applied: this cart is ${money(t.shortfall)} short of the ${money(t.minSubtotal)} minimum.</p>`);
      continue;
    }
    rows.push(`<p class="lrow ${t.conditional ? 'cond' : 'good'}">
      <span>${t.conditional ? 'With ' : ''}${esc(t.label)} \u00b7 code ${esc(t.code)}${t.conditional ? '<sup>*</sup>' : ''}</span>
      <b>${band(t.lo, t.hi)}</b></p>`);
    if(t.conditional) rows.push(`<p class="lnote">*Requires ${esc(t.requires)}. Not included in the price above or in any ranking.</p>`);
    if(t.note) rows.push(`<p class="lnote">${esc(t.note)}</p>`);
  }

  const breakdown = q.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${
    l.range ? band(l.range[0], l.range[1]) : (l.amount ? money(l.amount) : '\u2014')
  }</td></tr>`).join('');

  return `<div class="ladder">
    ${rows.join('')}
    <details class="lbreak"><summary>How this was calculated</summary>
      <table>${breakdown}</table>
      ${q.caveats.map((c) => `<p class="lnote">${esc(c)}</p>`).join('')}
      <p class="lnote">Fee model from ${esc(q.r.source)}, as of ${esc(q.r.asOf)}.</p>
    </details>
  </div>`;
}

/* Comparison on final payable, not on headline price. Every offer in here has
   already passed the like-for-like gate, so the pack size, unit and colourway
   are identical by construction; this only adds what each store would charge
   to get it to the door. */
function cmpBlock(p){
  const c = p.cmp;
  const blocks = c.rows.slice(0, 3).map((r) => {
    const qs = r.all.map((o) => {
      const t = P[o.pi];
      const tv = o.mine ? r.mine : t.vars[o.vi];
      const q = quote(t, tv, 1);
      q.pi = o.pi; q.mine = !!o.mine;
      return q;
    });
    const { sorted, winner, likely, margin } = rankQuotes(qs);

    const lines = sorted.map((q) => `<tr class="${winner === q ? 'best' : ''}">
      <td><span class="dot" style="background:${SELLER_COLOR[P[q.pi].si]}"></span>${esc(q.seller)}${q.mine ? ' <em class="here">this listing</em>' : ''}</td>
      <td class="r">${money(q.items)}</td>
      <td class="r">${q.known ? band(q.lo, q.hi) : '<span class="vary">may vary</span>'}</td>
      <td class="r"><a class="golink" href="${P[q.pi].url}" target="_blank" rel="noopener noreferrer">Open</a></td>
    </tr>`).join('');

    return `<p class="csize">${esc(r.size)} \u00b7 ${r.stores} ${r.stores === 1 ? 'store' : 'stores'}</p>
      <table class="cmpt2">
        <tr><th>Store</th><th class="r">Item</th><th class="r">Payable</th><th></th></tr>
        ${lines}
      </table>
      <p class="caveat">${winner
        ? `${esc(winner.seller)} is cheapest on final payable \u2014 its worst case beats every other store's best case.`
        : likely
        ? `${esc(likely.seller)} is cheaper unless its shipping and fees come to more than ${money(margin)}. It publishes no fee data, so that cannot be confirmed from here.`
        : 'No store can be called cheapest here: the ones without published fees have no upper bound, so a lower item price may still lose at checkout.'}</p>`;
  }).join('');

  return `<div class="cmp">
    <h3>Also sold elsewhere</h3>
    ${blocks}
    <p class="caveat">Only listings proved identical in pack size, unit and colourway are priced against each other.
      Ranking is on final payable, not headline discount. Catalogue prices, not live.</p>
  </div>`;
}

/* One button, and it only ever quotes a price a visitor can actually pay
   today: no code they have to hunt for, no card they may not hold. */
function ctaFor(p){
  const lead = p.cmp ? p.cmp.lead : null;
  const own = quote(p, lead ? lead.mine : leadVar(p), 1);

  const go = (url, label, price) => `<a class="cta" href="${url}" target="_blank" rel="noopener noreferrer">
      <span>${label}</span>${price ? `<b>${price}</b>` : ''}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
    </a>`;

  if(!lead){
    return go(p.url, `Buy at ${sellers[p.si]}`, own.known ? band(own.lo, own.hi) : null) +
      `<p class="ctanote">${own.known
        ? 'All in, including shipping at this subtotal. No verified match at another store to compare against.'
        : 'Item price only. No verified fee data for this store, so the checkout total may differ.'}</p>`;
  }

  const qs = lead.all.map((o) => {
    const t = P[o.pi];
    const q = quote(t, o.mine ? lead.mine : t.vars[o.vi], 1);
    q.pi = o.pi; q.mine = !!o.mine;
    return q;
  });
  const { winner, likely, margin, sorted } = rankQuotes(qs);

  if(winner){
    const t = P[winner.pi];
    return go(t.url, `Buy at ${winner.seller}`, band(winner.lo, winner.hi)) +
      `<p class="ctanote">Lowest final payable for ${esc(lead.size)}, including shipping and fees. Beats every other store even at its own worst case.</p>` +
      (winner.mine ? '' : `<a class="ctaalt" href="${p.url}" target="_blank" rel="noopener noreferrer">Or buy at ${sellers[p.si]} \u00b7 ${own.known ? band(own.lo, own.hi) : money(own.items) + ' + fees'}</a>`);
  }

  if(likely){
    const t = P[likely.pi];
    return go(t.url, `Buy at ${likely.seller}`, `${money(likely.items)}+`) +
      `<p class="ctanote">Item price. ${esc(likely.seller)} publishes no fee data, so the total is unconfirmed \u2014 but it stays cheaper
        for ${esc(lead.size)} unless its shipping and fees exceed ${money(margin)}.</p>` +
      (likely.mine ? '' : `<a class="ctaalt" href="${p.url}" target="_blank" rel="noopener noreferrer">Or buy at ${sellers[p.si]} \u00b7 ${own.known ? band(own.lo, own.hi) : money(own.items) + ' + fees'}</a>`);
  }
  const cheapestItem = [...sorted].sort((a, b) => a.items - b.items)[0];
  return go(p.url, `Buy at ${sellers[p.si]}`, own.known ? band(own.lo, own.hi) : null) +
    `<p class="ctanote vary">Price may vary at checkout. ${esc(cheapestItem.seller)} lists the lowest item price at ${money(cheapestItem.items)},
      but ${sorted.filter((q) => !q.known).length} of ${sorted.length} stores here publish no shipping or fee data, so no cheapest can be proved.</p>`;
}

/* ---------------- multi-select and comparison ----------------

   Picks are toggled in place rather than by re-running apply(): a full
   re-render on every tick would rebuild the whole grid and throw away scroll
   position, which is unusable when you are gathering items from deep in a
   long list. */
function togglePick(i){
  picked.has(i) ? picked.delete(i) : picked.add(i);
  const wrap = grid.querySelector(`.cardwrap[data-i="${i}"]`);
  if(wrap){
    const on = picked.has(i);
    wrap.classList.toggle('picked', on);
    const b = wrap.querySelector('.pick');
    b.setAttribute('aria-pressed', on);
    b.title = on ? 'Remove from comparison' : 'Add to comparison';
  }
  renderTray();
}
function unpick(i){ picked.delete(i); syncTicks(); renderTray(); }
function clearPicks(){ picked.clear(); syncTicks(); renderTray(); closeCompare(); }

/* Cards outside the current page or filter may not be in the DOM; the ones
   that are get their tick put back in step with the set. */
function syncTicks(){
  grid.querySelectorAll('.cardwrap').forEach(w => {
    const on = picked.has(+w.dataset.i);
    w.classList.toggle('picked', on);
    const b = w.querySelector('.pick');
    if(b){ b.setAttribute('aria-pressed', on); }
  });
}

function renderTray(){
  const list = [...picked];
  tray.classList.toggle('on', list.length > 0);
  if(!list.length){ tray.innerHTML = ''; return; }
  const thumbs = list.map(i => {
    const p = P[i];
    return `<span class="tth" title="${esc(p.title)}">
      ${p.img ? `<img src="${photo(p.img, 90)}" alt="" decoding="async" onerror="this.remove()">` : ''}
      <button class="rm" onclick="unpick(${i})" aria-label="Remove ${esc(p.title)}">✕</button>
    </span>`;
  }).join('');
  tray.innerHTML = `<div class="tray-in">
    <span class="traycount">${list.length} selected</span>
    <span class="traythumbs">${thumbs}</span>
    <button class="tbtn ghost" onclick="clearPicks()">Clear</button>
    <button class="tbtn" onclick="openCompare()">Compare ${list.length}</button>
  </div>`;
}

function openCompare(){
  const list = [...picked].map(i => P[i]);
  if(!list.length) return;

  const lead = list.map(leadVar);
  /* Cheapest and best value are marked, but only where the comparison is
     honest: a price of 0 means the store would not quote one, and unit prices
     are only comparable between products measured the same way. */
  const prices = lead.map(l => l.price).filter(v => v > 0);
  const bestPrice = prices.length ? Math.min(...prices) : null;
  const units = list.map(p => p.unit).filter(Boolean);
  const sameUnit = units.length > 1 && units.every(u => u.unit === units[0].unit);
  const bestUnit = sameUnit ? Math.min(...units.map(u => u.v)) : null;
  /* "Cheapest" claims a single winner, so it is only earned outright. Ties keep
     the green — they really are the joint lowest — but drop the badge, which
     otherwise labels four of five columns cheapest and says nothing. */
  const soloPrice = prices.filter(v => v === bestPrice).length === 1;
  const soloUnit = bestUnit != null && units.filter(u => u.v === bestUnit).length === 1;

  const head = list.map(p => `<th class="cmphead">
      <span class="ctile">${p.img ? `<img src="${photo(p.img, 300)}" alt="" decoding="async" onerror="this.remove()">` : tile(p)}</span>
      <span class="brandline">${esc(p.brand)}</span>
      <span class="cttl">${esc(p.title)}</span>
    </th>`).join('');

  const row = (label, cells) =>
    `<tr><th>${label}</th>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;

  const body = [
    row('Store', list.map(p =>
      `<span class="tag seller" style="background:${SELLER_COLOR[p.si]}">${sellers[p.si]}</span>`)),
    row('Best price', list.map((p, n) => p.noPrice ? '<span style="color:var(--muted)">Ask the store</span>'
      : `<span class="${lead[n].price === bestPrice ? 'cmpbest' : ''}">${inr(lead[n].price)}</span>` +
        (soloPrice && lead[n].price === bestPrice && list.length > 1 ? ' <span class="cmpbadge">Cheapest</span>' : ''))),
    row('MRP', list.map((p, n) => lead[n].mrp ? inr(lead[n].mrp) : '·')),
    row('Discount', list.map((p, n) => lead[n].disc ? `−${lead[n].disc}%` : '·')),
    row('Unit price', list.map(p => p.unit
      ? `<span class="${bestUnit != null && p.unit.v === bestUnit ? 'cmpbest' : ''}">${inrp(p.unit.v)}/${p.unit.unit}</span>` +
        (soloUnit && p.unit.v === bestUnit ? ' <span class="cmpbadge">Best value</span>' : '')
      : '·')),
    row('Sizes', list.map(p => `${p.vars.length} ${p.vars.length === 1 ? 'option' : 'options'}`)),
    row('Price range', list.map(p => p.noPrice ? '·' : p.lo === p.hi ? inr(p.lo) : `${inr(p.lo)} – ${inr(p.hi)}`)),
    row('Availability', list.map(p => p.stock ? 'In stock' : '<span style="color:var(--oos)">Sold out</span>')),
    row('Pet', list.map(p => esc(p.pet))),
    row('Category', list.map(p => esc(p.cat))),
    row('Across stores', list.map(p => p.cmp
      ? (p.cmp.weCheapest ? `Cheapest of ${p.cmp.lead.stores}`
         : p.cmp.diff === 0 ? `Matched across ${p.cmp.lead.stores}`
         : `${inr(p.cmp.diff)} less at ${esc(p.cmp.bestSeller)}`)
      : '<span style="color:var(--muted)">No match</span>')),
    row('', list.map((p, n) =>
      `<a href="${p.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;text-underline-offset:3px">View on ${sellers[p.si]}</a>
       <button class="chip" style="margin-top:9px;display:block;cursor:pointer" onclick="unpick(${p.i});openCompare()">Remove</button>`)),
  ].join('');

  cmpsheet.innerHTML = `
    <div class="dhead">
      <div style="flex:1;min-width:0">
        <h2 class="dtitle">Comparing ${list.length} products</h2>
        <div style="color:var(--muted);font-size:12.5px">Figures describe the cheapest available option of each.</div>
      </div>
      <button class="x" onclick="closeCompare()" aria-label="Close">✕</button>
    </div>
    <div class="cmpscroll">
      <table class="cmpt">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="dfoot">
      <p class="dnote">Prices as recorded in the catalogue export, not live.</p>
    </div>`;
  cmpsheet.classList.add('on'); scrim.classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeCompare(){
  cmpsheet.classList.remove('on');
  if(!drawer.classList.contains('on')){
    scrim.classList.remove('on');
    document.body.style.overflow = '';
  }
}

function openP(i){
  const p = P[i];
  const rows = [...p.vars].sort((a, b) => a.price - b.price).map(v => `
    <tr class="${v.stock ? '' : 'out'}">
      <td><span class="vname">${esc(v.name || v.size || 'One size')}</span>
        ${v.size && v.size !== v.name ? `<span class="vsize">${esc(v.size)}</span>` : ''}
        ${v.stock ? '' : '<span class="vsize">Sold out</span>'}</td>
      <td class="r"><span class="vprice">${v.price > 0 ? inr(v.price) : '\u2014'.replace('\u2014','Ask')}</span>
        ${v.mrp ? `<span class="vmrp">${inr(v.mrp)}</span>` : ''}
        ${v.up ? `<span class="vunit">${inrp(v.up)}/${v.unit}</span>` : ''}</td>
      <td class="r">${v.disc ? `<span class="vdisc">−${v.disc}%</span>` : '<span style="color:var(--muted)">·</span>'}</td>
    </tr>`).join('');

  const html = `
    <div class="dhead">
      <div style="flex:1;min-width:0">
        <h2 class="dtitle">${esc(p.title)}</h2>
        <div style="color:var(--muted);font-size:12.5px">${esc(p.brand)}</div>
      </div>
      <button class="x" onclick="closeAll()" aria-label="Close">✕</button>
    </div>
    <div class="dbody">
      <div class="dtile">${tile(p, true)}${p.img
        ? `<img class="shot" src="${photo(p.img, 900)}" alt="" decoding="async" onload="this.classList.add('in')" onerror="this.remove()">`
        : ''}</div>
      <div class="meta">
        <span class="tag seller" style="background:${SELLER_COLOR[p.si]}">${sellers[p.si]}</span>
        <span class="tag">${esc(p.pet)}</span>
        <span class="tag">${esc(p.cat)}</span>
        <span class="tag">${p.stock ? 'In stock' : 'Sold out'}</span>
      </div>
      ${p.noPrice ? '' : ladder(p, p.cmp ? p.cmp.lead.mine : leadVar(p))}
      ${p.cmp ? cmpBlock(p) : ''}
      <p class="dsub">${p.vars.length} ${p.vars.length === 1 ? 'option' : 'options'}</p>
      <table class="vt">
        <thead><tr><th>Variant</th><th class="r">Price</th><th class="r">Off</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="dfoot">
      ${ctaFor(p)}
      <p class="dnote">Prices as recorded in the catalogue export, not live.</p>
    </div>`;
  drawer.innerHTML = html;
  drawer.classList.add('on'); scrim.classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeAll(){
  drawer.classList.remove('on'); scrim.classList.remove('on');
  cmpsheet.classList.remove('on');
  sidebar.classList.remove('on');
  document.body.style.overflow = '';
}
function toggleSidebar(on){
  sidebar.classList.toggle('on', on);
  scrim.classList.toggle('on', on);
}

/* ---------------- wiring ---------------- */
const grid = document.getElementById('grid'), count = document.getElementById('count'),
      chips = document.getElementById('chips'), sidebar = document.getElementById('sidebar'),
      drawer = document.getElementById('drawer'), scrim = document.getElementById('scrim'),
      tray = document.getElementById('tray'), cmpsheet = document.getElementById('cmpsheet'),
      facets = document.getElementById('facets'),
      loadmsg = document.getElementById('loadmsg'), q = document.getElementById('q'),
      qclear = document.getElementById('qclear'), fcount = document.getElementById('fcount');

const FACETS = {store: S.stores, pet: S.pets, cat: S.cats, brand: S.brands};
facets.addEventListener('change', (e) => {
  const el = e.target.closest('input[data-f]');
  if(!el) return;
  const set = FACETS[el.dataset.f], v = el.dataset.v;
  set.has(v) ? set.delete(v) : set.add(v);
  apply();
});

chips.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if(!btn) return;
  if(btn.dataset.all) return resetAll();
  if(btn.dataset.i != null) chipFns[+btn.dataset.i]();
});

/* One place clears the search, so the box's own button and the chip can never
   drift apart. */
function clearSearch(){
  q.value = ''; S.q = ''; showClear(false); apply();
}
function showClear(on){ qclear.style.display = on ? 'flex' : 'none'; }

let t;
function debApply(){ clearTimeout(t); t = setTimeout(apply, 180); }
q.addEventListener('input', () => { S.q = q.value.trim(); showClear(!!S.q); debApply(); });
qclear.onclick = () => { clearSearch(); q.focus(); };
document.getElementById('sort').onchange = e => { S.sort = e.target.value; apply(); };

function resetAll(){
  S.q = ''; q.value = ''; showClear(false);
  S.stores.clear(); S.pets.clear(); S.cats.clear(); S.brands.clear();
  S.min = S.max = null; S.disc = 0; S.stock = false; S.both = false; S.sort = 'disc';
  brandQuery = ''; document.getElementById('sort').value = 'disc';
  closeAll(); apply();
  window.scrollTo({top:0, behavior:'smooth'});
}

document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && document.activeElement === q && q.value){ clearSearch(); return; }
  if(e.key === 'Escape') closeAll();
  if(e.key === '/' && document.activeElement !== q){ e.preventDefault(); q.focus(); }
});

new IntersectionObserver(es => {
  if(es[0].isIntersecting && shown < view.length) more();
}, {rootMargin:'700px'}).observe(document.getElementById('sentinel'));

const nProducts = P.length.toLocaleString('en-IN');
const narrow = window.matchMedia('(max-width:640px)');
const setPlaceholder = () => q.placeholder = narrow.matches
  ? `Search ${nProducts} products`
  : `Search ${nProducts} products. Try “kitten wet food” or “Farmina”`;
setPlaceholder();
narrow.addEventListener('change', setPlaceholder);
apply();
renderTray();

/* ---------------- input guards ----------------

   Right-click, image dragging and the usual view-source shortcuts are
   suppressed. Worth being plain about what this achieves: it is a speed bump,
   not protection. Devtools still open from the browser's own menu, which no
   page can intercept, and the catalogue is plain JSON sitting in this file
   either way. It deters casual copying and nothing more.

   The cost is real though. On a page whose whole purpose is sending people to
   store listings, blocking the menu also blocks "open link in new tab", which
   is how anyone actually compares two shops. Flip this to true to keep the
   menu on links and lose nothing that matters. */
const ALLOW_MENU_ON_LINKS = false;

document.addEventListener('contextmenu', (e) => {
  if (ALLOW_MENU_ON_LINKS && e.target.closest && e.target.closest('a[href]')) return;
  e.preventDefault();
});

/* Dragging an image off the page is the other one-gesture copy. */
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});

/* F12, Ctrl/Cmd+Shift+I/J/C, Ctrl/Cmd+U. Deliberately not Ctrl+C: breaking
   copy would stop people lifting a product name into a search box, which is a
   normal thing to do here and nothing to do with protecting anything. */
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = (e.key || '').toUpperCase();
  if (e.key === 'F12') { e.preventDefault(); return; }
  if (mod && e.shiftKey && (k === 'I' || k === 'J' || k === 'C')) { e.preventDefault(); return; }
  if (mod && k === 'U') e.preventDefault();
});

/* The static markup calls these by name from on*= attributes. Exposing them
   explicitly is what lets the bundler mangle everything else: an implicit
   top-level binding would have to keep its name forever. */
Object.assign(window, {
  apply, debApply, resetAll, clearSearch, togg, toggleSidebar, drawFilters,
  openP, closeAll, openCompare, closeCompare, togglePick, unpick, clearPicks,
  S, get catsOpen(){ return catsOpen; }, set catsOpen(v){ catsOpen = v; },
  get brandQuery(){ return brandQuery; }, set brandQuery(v){ brandQuery = v; },
});

/* Test surface, present only in the debug build. esbuild replaces __DEBUG__
   with a literal and drops this whole block from the shipped artifact, so the
   e2e harness can introspect the catalogue without the distributed file
   exposing its internals. */
if (__DEBUG__) {
  Object.assign(window, {
    P, MATCH, sellers, brands, cats, pets, RULES,
    packSize, sizeKey, comparable, quote, rankQuotes, facet, leadVar,
  });
}
