/* The Shelf - browser side. Draws what the API returns; holds no catalogue
   data and no pricing, matching, or ranking logic. */
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const grid = $('grid'), count = $('count'), chips = $('chips'), sidebar = $('sidebar'),
      drawer = $('drawer'), scrim = $('scrim'), facets = $('facets'), loadmsg = $('loadmsg'),
      q = $('q'), qclear = $('qclear'), fcount = $('fcount'), sortEl = $('sort'),
      statusEl = $('status'), statusText = $('statustext');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const SELLER_COLOR = (si) => `var(--s${si})`;

/* ---------------- state ---------------- */
const S = { q: '', both: false, stores: new Set(), pets: new Set(), cats: new Set(), brands: new Set(),
            min: null, max: null, disc: 0, stock: false, sort: 'disc' };
let sellers = [], matchedTotal = 0, page = 0, total = 0, loading = false, facetData = null, reqSeq = 0;
let brandQuery = '', catsOpen = false;
const open = { store: true, pet: true, cat: true, brand: true, price: true, disc: true, stock: true, cmp: true };

/* ---------------- api ---------------- */
async function getJSON(url, signal) {
  const r = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function params(p) {
  const sp = new URLSearchParams();
  if (S.q) sp.set('q', S.q);
  for (const [k, set] of [['store', S.stores], ['pet', S.pets], ['cat', S.cats], ['brand', S.brands]]) if (set.size) sp.set(k, [...set].join('|'));
  if (S.min != null) sp.set('min', S.min);
  if (S.max != null) sp.set('max', S.max);
  if (S.disc) sp.set('disc', S.disc);
  if (S.both) sp.set('both', '1');
  sp.set('sort', S.sort); sp.set('page', p);
  return sp.toString();
}

let ctrl = null;
async function apply() {
  page = 0; total = 0; grid.innerHTML = ''; loadmsg.textContent = 'Loading…';
  renderChips();
  await more(true);
}
async function more(first) {
  if (loading) return;
  if (!first && page * 48 >= total) return;
  loading = true;
  ctrl?.abort(); ctrl = new AbortController();
  const seq = ++reqSeq;
  try {
    const d = await getJSON('/api/products?' + params(page + 1), ctrl.signal);
    if (seq !== reqSeq) return;
    page = d.page; total = d.total; facetData = d.facets;
    if (first) grid.innerHTML = '';
    if (d.items.length) { grid.insertAdjacentHTML('beforeend', d.items.map(card).join('')); observeCards(); }
    count.innerHTML = `<b>${total.toLocaleString('en-IN')}</b> ${total === 1 ? 'product' : 'products'}`;
    if (!total) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h2>Nothing matches these filters</h2>
        <p>Widen the search by removing a filter, or start over.</p><button class="btn" data-act="reset">Clear all filters</button></div>`;
      loadmsg.textContent = '';
    } else {
      const shown = Math.min(page * d.pageSize, total);
      loadmsg.textContent = shown >= total ? (total > d.pageSize ? `All ${total.toLocaleString('en-IN')} shown` : '') : 'Loading more…';
    }
    if (first) drawFilters();
  } catch (e) {
    if (e.name !== 'AbortError') loadmsg.textContent = 'Could not reach the catalogue. Retrying…';
  } finally { loading = false; }
}

/* ---------------- placeholder tile (decorative only) ---------------- */
const CAT_STYLE = {
  'Dry Food': ['#C8956A', 'bowl'], 'Wet Food': ['#8AA5C4', 'can'], 'Fresh Food': ['#8FAE7B', 'bowl'],
  'Treats & Chews': ['#C9A25C', 'bone'], 'Health & Wellness': ['#7FB3A4', 'drop'], 'Pharmacy': ['#93A9C9', 'drop'],
  'Toys': ['#D08C7E', 'ball'], 'Clothing': ['#A995C4', 'shirt'], 'Collars & Leashes': ['#B08B6E', 'collar'],
  'Beds, Mats & Travel': ['#9BAF95', 'bed'], 'Bowls & Feeders': ['#A2A8B4', 'bowl'], 'Grooming': ['#C79BAF', 'drop'],
  'Litter & Cleanup': ['#A8AC9A', 'paw'], 'Training': ['#8FA8B8', 'paw'], 'Vet Services': ['#8CA6A0', 'cross'],
  'Gifting & Merch': ['#C49B84', 'paw'], 'Small Pet Supplies': ['#A3B58C', 'paw'], 'Other': ['#A6ABA2', 'paw'],
};
const MOTIF = {
  paw: 'M12 15.4c-2 0-3.6 1.3-3.6 2.9 0 1.4 1.1 2 3.6 2s3.6-.6 3.6-2c0-1.6-1.6-2.9-3.6-2.9M7 10.6c-1 0-1.8.9-1.8 2s.8 2 1.8 2 1.8-.9 1.8-2-.8-2-1.8-2m10 0c-1 0-1.8.9-1.8 2s.8 2 1.8 2 1.8-.9 1.8-2-.8-2-1.8-2M10 6.4c-1 0-1.8 1-1.8 2.2s.8 2.2 1.8 2.2 1.8-1 1.8-2.2S11 6.4 10 6.4m4 0c-1 0-1.8 1-1.8 2.2s.8 2.2 1.8 2.2 1.8-1 1.8-2.2-.8-2.2-1.8-2.2',
  bone: 'M6.6 8.2c-1.3 0-2.3.9-2.3 2 0 .5.2 1 .5 1.3-.3.4-.5.8-.5 1.3 0 1.1 1 2 2.3 2 1 0 1.9-.6 2.2-1.4h6.4c.3.8 1.2 1.4 2.2 1.4 1.3 0 2.3-.9 2.3-2 0-.5-.2-.9-.5-1.3.3-.3.5-.8.5-1.3 0-1.1-1-2-2.3-2-1 0-1.9.6-2.2 1.4H8.8c-.3-.8-1.2-1.4-2.2-1.4',
  bowl: 'M3.8 10.5h16.4c0 4.2-2.7 7.3-6 7.9V20h-4.4v-1.6c-3.3-.6-6-3.7-6-7.9M7 8c0-2 2.2-3.3 5-3.3S17 6 17 8',
  can: 'M7 5.5h10a1 1 0 0 1 1 1v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 17.5v-11a1 1 0 0 1 1-1m-.6 3.6h11.2M6.4 15h11.2',
  ball: 'M12 4.4a7.6 7.6 0 1 0 0 15.2 7.6 7.6 0 0 0 0-15.2m-7 6.3c3.6.5 6.4-1.4 7.6-5.9M19 10.7c-3.6.5-6.4-1.4-7.6-5.9M5.4 15.3c3.4-1.6 6.8-.6 8.8 3.6',
  shirt: 'M9 4.6 5 6.4l1.2 3.8 1.6-.5v9.7h8.4V9.7l1.6.5L19 6.4l-4-1.8a3 3 0 0 1-6 0',
  collar: 'M4.6 11c0 3.6 3.3 6.5 7.4 6.5s7.4-2.9 7.4-6.5M12 17.5v2.1m-1.6 0h3.2M4.6 9.4h14.8v2.2H4.6z',
  bed: 'M3.5 16.4v-4.2c0-1.2 1-2.2 2.2-2.2h12.6c1.2 0 2.2 1 2.2 2.2v4.2m-17 0v2m17-2v2m-17-2h17M6.4 9.9V8.2c0-1 .8-1.8 1.8-1.8h7.6c1 0 1.8.8 1.8 1.8v1.7',
  drop: 'M12 4.2c3.2 3.7 5 6.4 5 8.8a5 5 0 0 1-10 0c0-2.4 1.8-5.1 5-8.8',
  cross: 'M10 4.6h4v5.4h5.4v4H14v5.4h-4V14H4.6v-4H10z',
};
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), R = (n >> 16) / 255, G = ((n >> 8) & 255) / 255, B = (n & 255) / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn, l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === R ? ((G - B) / d + (G < B ? 6 : 0)) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; h *= 60; }
  return [h, s * 100, l * 100];
}
const HSL_CACHE = {};
function tile(p, wide) {
  const [col, motif] = CAT_STYLE[p.cat] || CAT_STYLE.Other;
  const r = rng(hash(p.title + p.brand + p.si));
  const base = HSL_CACHE[col] || (HSL_CACHE[col] = hsl(col));
  const r0 = r(), r1 = r();
  const shade = (dl, a) => `hsl(${(base[0] + (r0 - .5) * 26 + 360) % 360} ${Math.max(5, (base[1] + (r1 - .5) * 16) * 0.36)}% ${Math.min(90, Math.max(38, base[2] + dl + 6))}% / ${a})`;
  const W = wide ? 320 : 160, H = wide ? 140 : 120, d = MOTIF[motif] || MOTIF.paw;
  let bits = '';
  for (let i = 0, n = wide ? 11 : 7; i < n; i++) {
    const x = r() * W, y = r() * H, s = (0.4 + r() * 0.5) * (wide ? 1.05 : 0.95), rot = Math.floor(r() * 360);
    bits += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot}) scale(${s.toFixed(2)}) translate(-12 -12)" opacity="${(0.1 + r() * 0.13).toFixed(2)}"><path d="${d}" fill="none" stroke="#18211C" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${motif} pattern">
    <rect width="${W}" height="${H}" fill="${shade((r0 - .5) * 10, .5)}"/>${bits}
    <g transform="translate(${W / 2} ${H / 2}) scale(${wide ? 3.1 : 2.6}) translate(-12 -12)" opacity=".82">
      <path d="${d}" fill="none" stroke="${shade(-26, .8)}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
}
const photo = (url, w) => url + (url.includes('?') ? '&' : '?') + 'width=' + w;

/* ---------------- cards ---------------- */
function card(p) {
  return `<button class="card" data-open="${esc(p.id)}" aria-label="${esc(p.title)}">
    <span class="tile">${tile(p)}${p.img ? `<img class="shot" src="${esc(photo(p.img, 400))}" alt="" loading="lazy" decoding="async">` : ''}
      ${p.badge ? `<span class="badge${p.badge[0] === 'gift' ? ' gift' : ''}">${esc(p.badge[1])}</span>` : ''}
      <span class="sellerdot" style="background:${SELLER_COLOR(p.si)}" title="${esc(sellers[p.si])}"></span>
      ${p.stock ? '' : '<span class="oosveil"><em>Sold out</em></span>'}
    </span>
    <span class="body">
      <span class="brandline">${esc(p.brand)}</span>
      <span class="pname">${esc(p.title)}</span>
      ${p.sizes > 1 ? `<span class="vcount">${p.sizes} sizes · from</span>` : ''}
      <span class="priceline">
        ${p.noPrice ? '<span class="price nop">Ask the store</span>'
          : `<span class="price">${inr(p.price)}</span>${p.mrp ? `<span class="mrp">${inr(p.mrp)}</span>` : ''}`}
        ${p.unit ? `<span class="unitp">${esc(p.unit)}</span>` : ''}
      </span>
      ${p.cmp ? `<span class="vs ${p.cmp.cls}">${esc(p.cmp.text)}</span>` : ''}
    </span>
  </button>`;
}
grid.addEventListener('load', (e) => { if (e.target.classList?.contains('shot')) e.target.classList.add('in'); }, true);
grid.addEventListener('error', (e) => { if (e.target.classList?.contains('shot')) e.target.remove(); }, true);

/* ---------------- filters ---------------- */
function drawFilters() {
  if (!facetData) return;
  const live = document.activeElement;
  const held = (live && facets.contains(live) && live.dataset.k) ? { k: live.dataset.k, start: live.selectionStart, end: live.selectionEnd } : null;
  const scrolls = [...facets.querySelectorAll('.scrolllist')].map((el) => el.scrollTop);

  let brandF = facetData.brand;
  if (brandQuery) { const n = brandQuery.toLowerCase(); brandF = brandF.filter(([b]) => b.toLowerCase().includes(n)); }
  const catF = facetData.cat;

  const box = (title, id, inner) => `<div class="fgroup" data-open="${open[id]}" id="g-${id}">
      <button class="fhead" data-togg="${id}" aria-expanded="${open[id]}"><h3>${title}</h3>
        <svg class="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg></button>
      <div class="fbody">${inner}</div></div>`;
  const opts = (arr, set, key, swatch) => arr.map(([k, n]) =>
    `<label class="opt"><input type="checkbox" ${set.has(k) ? 'checked' : ''} data-f="${key}" data-v="${esc(k)}">
      ${swatch ? `<span class="swatch" style="background:${SELLER_COLOR(sellers.indexOf(k))}"></span>` : ''}
      <span class="lbl">${esc(k)}</span><span class="n">${n.toLocaleString('en-IN')}</span></label>`).join('');

  facets.innerHTML =
    box('Store', 'store', opts(facetData.store, S.stores, 'store', true)) +
    box('Pet', 'pet', opts(facetData.pet, S.pets, 'pet')) +
    box('Category', 'cat', opts(catsOpen ? catF : catF.slice(0, 8), S.cats, 'cat') +
      (catF.length > 8 ? `<button class="morelink" data-act="cats-toggle">${catsOpen ? 'Show fewer' : `Show all ${catF.length}`}</button>` : '')) +
    box('Brand', 'brand', `<input class="brandsearch" data-k="brand" placeholder="Find a brand" value="${esc(brandQuery)}">
       <div class="scrolllist">${brandF.length ? opts(brandF.slice(0, 300), S.brands, 'brand') : '<div class="n" style="padding:6px 0;color:var(--muted)">No brand by that name</div>'}</div>`) +
    box('Price', 'price', `<div class="range">
        <input type="number" data-k="min" placeholder="Min" value="${S.min ?? ''}"><span>to</span>
        <input type="number" data-k="max" placeholder="Max" value="${S.max ?? ''}"></div>`) +
    box('Discount', 'disc', `<div class="pillrow">${[0, 20, 40, 60].map((d) => `<button class="pill" aria-pressed="${S.disc === d}" data-disc="${d}">${d ? d + '%+' : 'Any'}</button>`).join('')}</div>`) +
    box('Price check', 'cmp', `<label class="opt"><input type="checkbox" ${S.both ? 'checked' : ''} data-flag="both"><span class="lbl">Sold at 2+ stores</span><span class="n">${matchedTotal.toLocaleString('en-IN')}</span></label>`);

  if (held) { const back = facets.querySelector(`[data-k="${held.k}"]`); if (back) { back.focus(); if (held.start != null) { try { back.setSelectionRange(held.start, held.end); } catch (_) {} } } }
  [...facets.querySelectorAll('.scrolllist')].forEach((el, i) => { el.scrollTop = scrolls[i] || 0; });
  const n = S.pets.size + S.cats.size + S.brands.size + (S.disc ? 1 : 0) + (S.min != null ? 1 : 0) + (S.max != null ? 1 : 0);
  fcount.hidden = !n; fcount.textContent = n;
}

const FACETS = { store: S.stores, pet: S.pets, cat: S.cats, brand: S.brands };
facets.addEventListener('change', (e) => {
  const f = e.target.closest('input[data-f]');
  if (f) { const set = FACETS[f.dataset.f], v = f.dataset.v; set.has(v) ? set.delete(v) : set.add(v); return apply(); }
  const fl = e.target.closest('input[data-flag]');
  if (fl) { S[fl.dataset.flag] = fl.checked; return apply(); }
});
let t;
const debApply = () => { clearTimeout(t); t = setTimeout(apply, 220); };
facets.addEventListener('input', (e) => {
  const k = e.target.dataset.k;
  if (k === 'brand') { brandQuery = e.target.value; drawFilters(); }
  else if (k === 'min' || k === 'max') { S[k] = e.target.value === '' ? null : +e.target.value; debApply(); }
});
facets.addEventListener('click', (e) => {
  const tg = e.target.closest('[data-togg]'); if (tg) { open[tg.dataset.togg] = !open[tg.dataset.togg]; return drawFilters(); }
  const d = e.target.closest('[data-disc]'); if (d) { S.disc = +d.dataset.disc; return apply(); }
  if (e.target.closest('[data-act="cats-toggle"]')) { catsOpen = !catsOpen; return drawFilters(); }
});

/* ---------------- chips ---------------- */
let chipFns = [];
function renderChips() {
  const c = [];
  const tog = (set, k) => () => { set.delete(k); apply(); };
  S.stores.forEach((k) => c.push([k, tog(S.stores, k)]));
  S.pets.forEach((k) => c.push([k, tog(S.pets, k)]));
  S.cats.forEach((k) => c.push([k, tog(S.cats, k)]));
  S.brands.forEach((k) => c.push([k, tog(S.brands, k)]));
  if (S.disc) c.push([S.disc + '% off or more', () => { S.disc = 0; apply(); }]);
  if (S.both) c.push(['Sold at 2+ stores', () => { S.both = false; apply(); }]);
  if (S.min != null) c.push(['Over ' + inr(S.min), () => { S.min = null; apply(); }]);
  if (S.max != null) c.push(['Under ' + inr(S.max), () => { S.max = null; apply(); }]);
  if (S.q) c.push(['“' + S.q + '”', clearSearch]);
  chipFns = c.map((x) => x[1]);
  chips.innerHTML = c.length
    ? c.map(([t], i) => `<span class="chip">${esc(t)}<button data-i="${i}" aria-label="Remove ${esc(t)}">✕</button></span>`).join('') +
      (c.length > 1 ? '<button class="chip clearall" data-act="reset">Clear all</button>' : '') : '';
}
chips.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.i != null) chipFns[+b.dataset.i]();
});

/* ---------------- drawer ---------------- */
const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
async function openP(id) {
  drawer.innerHTML = `<div class="dhead"><div style="flex:1"><h2 class="dtitle">Checking the store…</h2></div><button class="x" data-act="close" aria-label="Close">✕</button></div>`;
  drawer.classList.add('on'); scrim.classList.add('on'); document.body.style.overflow = 'hidden';
  let p;
  try { p = await getJSON('/api/products/' + encodeURIComponent(id)); }
  catch (e) {
    drawer.querySelector('.dtitle').textContent = /410/.test(e.message) ? 'This just sold out on the store.' : 'Could not load this product.';
    const el = grid.querySelector(`[data-open="${CSS.escape(id)}"]`); if (el && /410/.test(e.message)) el.remove();
    return;
  }
  const rows = p.variants.map((v) => `<tr class="${v.stock ? '' : 'out'}">
      <td><span class="vname">${esc(v.name)}</span>${v.size ? `<span class="vsize">${esc(v.size)}</span>` : ''}${v.stock ? '' : '<span class="vsize">Sold out</span>'}</td>
      <td class="r"><span class="vprice">${v.price > 0 ? inr(v.price) : 'Ask'}</span>${v.mrp ? `<span class="vmrp">${inr(v.mrp)}</span>` : ''}${v.unit ? `<span class="vunit">${esc(v.unit)}</span>` : ''}</td>
      <td class="r">${v.disc ? `<span class="vdisc">−${v.disc}%</span>` : '<span style="color:var(--muted)">·</span>'}</td></tr>`).join('');
  const cmp = p.cmp ? `<div class="cmp"><h3>Also sold elsewhere</h3><p class="verdict ${p.cmp.cls}">${esc(p.cmp.verdict)}</p>
    ${p.cmp.rows.map((r) => `<p class="csize">${esc(r.size)} &middot; ${r.stores} stores</p><table>${r.offers.map((o, n) =>
      `<tr class="${n === 0 ? 'best' : ''}"><td><span class="dot" style="background:${SELLER_COLOR(o.si)}"></span>${esc(o.seller)}</td><td class="r">${inr(o.price)}</td></tr>`).join('')}</table>`).join('')}
    <p class="caveat">Matched automatically on brand and exact pack size. Other stores' prices are from their last catalogue read.</p></div>` : '';
  drawer.innerHTML = `
    <div class="dhead"><div style="flex:1;min-width:0"><h2 class="dtitle">${esc(p.title)}</h2>
      <div style="color:var(--muted);font-size:12.5px">${esc(p.brand)}</div></div>
      <button class="x" data-act="close" aria-label="Close">✕</button></div>
    <div class="dbody">
      <div class="dtile">${tile(p, true)}${p.img ? `<img class="shot" src="${esc(photo(p.img, 900))}" alt="" decoding="async">` : ''}</div>
      <div class="meta"><span class="tag seller" style="background:${SELLER_COLOR(p.si)}">${esc(p.seller)}</span>
        <span class="tag">${esc(p.pet)}</span><span class="tag">${esc(p.cat)}</span><span class="tag">In stock</span></div>
      ${cmp}
      <p class="dsub">${p.variants.length} ${p.variants.length === 1 ? 'option' : 'options'}</p>
      <table class="vt"><thead><tr><th>Variant</th><th class="r">Price</th><th class="r">Off</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="dfoot"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">View on ${esc(p.seller)}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>
      <p class="dnote${p.live ? ' live' : ''}">${p.live ? `Prices checked live on ${esc(p.seller)} ${ago(p.checkedAt)}` : `Store did not answer just now; showing prices from ${ago(p.checkedAt) || 'the last read'}`}</p></div>`;
  const img = drawer.querySelector('.shot');
  if (img) { img.onload = () => img.classList.add('in'); img.onerror = () => img.remove(); }
}
function closeAll() { drawer.classList.remove('on'); scrim.classList.remove('on'); sidebar.classList.remove('on'); document.body.style.overflow = ''; }
function toggleSidebar(on) { sidebar.classList.toggle('on', on); scrim.classList.toggle('on', on); }

/* ---------------- global actions ---------------- */
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]'); if (o) return openP(o.dataset.open);
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'reset') { e.preventDefault(); resetAll(); }
  else if (act === 'close') closeAll();
  else if (act === 'sidebar-open') toggleSidebar(true);
  else if (act === 'sidebar-close') toggleSidebar(false);
});
function clearSearch() { q.value = ''; S.q = ''; showClear(false); apply(); }
function showClear(on) { qclear.style.display = on ? 'flex' : 'none'; }
q.addEventListener('input', () => { S.q = q.value.trim(); showClear(!!S.q); debApply(); });
qclear.onclick = () => { clearSearch(); q.focus(); };
sortEl.onchange = (e) => { S.sort = e.target.value; apply(); };
function resetAll() {
  S.q = ''; q.value = ''; showClear(false);
  S.stores.clear(); S.pets.clear(); S.cats.clear(); S.brands.clear();
  S.min = S.max = null; S.disc = 0; S.stock = false; S.both = false; S.sort = 'disc';
  brandQuery = ''; sortEl.value = 'disc';
  closeAll(); apply(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.activeElement === q && q.value) return clearSearch();
  if (e.key === 'Escape') closeAll();
  if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); }
});
new IntersectionObserver((es) => { if (es[0].isIntersecting && total && page * 48 < total) more(false); }, { rootMargin: '700px' }).observe($('sentinel'));

/* ---------------- on-screen live re-check ----------------
   Tell the server which cards are visible; it re-reads them from the stores
   and pushes a fresh card whenever a price or stock changes. */
let liveToken = null, watchTimer = null;
const visible = new Set();
const cardWatcher = new IntersectionObserver((es) => {
  for (const e of es) { const id = e.target.dataset.open; if (e.isIntersecting) visible.add(id); else visible.delete(id); }
  clearTimeout(watchTimer); watchTimer = setTimeout(sendWatch, 400);
}, { rootMargin: '200px' });
function observeCards() { grid.querySelectorAll('.card:not([data-w])').forEach((el) => { el.dataset.w = 1; cardWatcher.observe(el); }); }
async function sendWatch() {
  if (!liveToken) return;
  const ids = [...visible].filter((id) => grid.querySelector(`[data-open="${CSS.escape(id)}"]`)).slice(0, 96);
  try { await fetch('/api/watch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: liveToken, ids }) }); } catch {}
}
function connectLive() {
  const es = new EventSource('/api/live');
  es.addEventListener('hello', (e) => { liveToken = JSON.parse(e.data).token; sendWatch(); });
  es.addEventListener('update', (e) => {
    const { card: c, changed } = JSON.parse(e.data);
    const old = grid.querySelector(`[data-open="${CSS.escape(c.id)}"]`);
    if (!old) return;
    old.outerHTML = card(c);
    const fresh = grid.querySelector(`[data-open="${CSS.escape(c.id)}"]`);
    fresh.dataset.w = 1; cardWatcher.observe(fresh);
    if (changed) { fresh.classList.add('flash'); setTimeout(() => fresh.classList.remove('flash'), 1600); }
  });
  es.addEventListener('remove', (e) => {
    const { id } = JSON.parse(e.data);
    const el = grid.querySelector(`[data-open="${CSS.escape(id)}"]`);
    if (el) { el.classList.add('gone'); setTimeout(() => el.remove(), 600); }
  });
  es.addEventListener('rebuilt', () => { if (!drawer.classList.contains('on')) apply(); pollMeta(); });
  es.onerror = () => { liveToken = null; };   /* EventSource reconnects on its own */
}

/* ---------------- live status ---------------- */
let lastVersion = null;
async function pollMeta() {
  try {
    const m = await getJSON('/api/meta');
    sellers = m.sellers.map((s) => s.name); matchedTotal = m.matched || 0;
    const liveN = m.sellers.filter((s) => s.status === 'live').length;
    statusEl.className = 'status' + (m.crawling ? ' busy' : liveN ? '' : ' off');
    statusText.textContent = m.crawling ? `Reading stores… ${m.products.toLocaleString('en-IN')} products`
      : m.products ? `${m.products.toLocaleString('en-IN')} live products · ${liveN}/${m.sellers.length} stores · updated ${ago(m.builtAt)}`
      : 'No catalogue yet';
    statusEl.title = m.sellers.map((s) => `${s.name}: ${s.status}${s.updatedAt ? ' (' + ago(s.updatedAt) + ')' : ''}`).join('\n');
    const narrow = window.matchMedia('(max-width:640px)').matches;
    q.placeholder = narrow ? `Search ${m.products.toLocaleString('en-IN')} products` : `Search ${m.products.toLocaleString('en-IN')} products. Try “kitten wet food” or “Farmina”`;
    lastVersion = m.builtAt;
  } catch { statusEl.className = 'status off'; statusText.textContent = 'Offline'; }
}
(async () => { await pollMeta(); apply(); connectLive(); setInterval(pollMeta, 60000); })();
})();
