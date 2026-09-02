import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const file = process.env.TARGET || 'index.html';   // default: the built file
const html = fs.readFileSync(file, 'utf8');

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://portal.local/',
  beforeParse(w) {
    // jsdom ships neither; the page uses both, so stub them rather than let the
    // script die at the observer and never reach its first render.
    w.IntersectionObserver = class { constructor(cb){ this.cb = cb; } observe(){} unobserve(){} disconnect(){} };
    w.scrollTo = () => {};
    w.matchMedia = (qs) => ({ matches: false, media: qs, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
    w.HTMLElement.prototype.scrollIntoView = () => {};
  },
  virtualConsole: new (await import('jsdom')).VirtualConsole().on('jsdomError', (e) => {
    errors.push(e.message + (e.detail ? '\n    ' + String(e.detail).split('\n')[0] : ''));
  }).on('error', (m) => errors.push('console.error: ' + m)),
});

const { window } = dom;
const doc = window.document;
await new Promise((r) => setTimeout(r, 400));

const T = [];
const ok = (name, cond, note = '') => T.push([cond ? 'PASS' : 'FAIL', name, note]);
const g = (expr) => window.eval(expr);   // const/let at script top level are not window props
const q = (s) => doc.querySelector(s);
const qa = (s) => [...doc.querySelectorAll(s)];

ok('page script ran without throwing', errors.length === 0, errors.slice(0, 3).join(' | '));
ok('cards rendered', qa('.card').length > 0, `${qa('.card').length} cards`);
ok('facet panel rendered', qa('.fgroup').length > 0, `${qa('.fgroup').length} groups`);
ok('count line rendered', /\d/.test(q('#count')?.textContent || ''), q('#count')?.textContent);

/* --- multi-select faceting: pick one brand, can a second still be picked? --- */
const brandBoxes = () => qa('#facets [data-f="brand"]');
const before = brandBoxes().length;
const firstBrand = brandBoxes()[0];
const firstName = firstBrand?.dataset.v;
if (firstBrand) {
  firstBrand.checked = true;
  firstBrand.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
}
const after = brandBoxes().length;
ok('a second brand is still selectable after picking one', after > 1,
   `${before} brands before, ${after} after selecting "${firstName}"`);

/* reset for the next checks */
g('resetAll()');
await new Promise((r) => setTimeout(r, 60));

/* --- store facet, same question --- */
const storeBoxes = () => qa('#facets [data-f="store"]');
const sBefore = storeBoxes().length;
const s0 = storeBoxes()[0];
if (s0) { s0.checked = true; s0.dispatchEvent(new window.Event('change', { bubbles: true })); }
await new Promise((r) => setTimeout(r, 60));
ok('a second store is still selectable after picking one', storeBoxes().length > 1,
   `${sBefore} stores before, ${storeBoxes().length} after`);
g('resetAll()');
await new Promise((r) => setTimeout(r, 60));

/* --- mobile filter badge --- */
g('S').stores.add(g('DATA').sellers[0]);
g('S').both = true;
g('apply()');
await new Promise((r) => setTimeout(r, 60));
ok('filter badge counts store + price-check filters', q('#fcount').textContent === '2',
   `badge reads "${q('#fcount').textContent}", 2 filters active`);
g('resetAll()');
await new Promise((r) => setTimeout(r, 60));

/* --- "/" shortcut must not steal focus from other inputs --- */
const brandInput = q('.brandsearch');
if (brandInput) {
  brandInput.focus();
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
}
ok('"/" typed in the brand box does not jump to search',
   doc.activeElement !== q('#q'), `focus went to #${doc.activeElement?.id || doc.activeElement?.className}`);

/* --- half-typed values in the price boxes, via the real input --- */
const minBox = q('[data-k="min"]');
for (const bad of ['-', '+', '1e', 'e']) {
  minBox.value = bad;
  minBox.dispatchEvent(new window.Event('input', { bubbles: true }));
}
await new Promise((r) => setTimeout(r, 260));
ok('a half-typed price does not produce a NaN chip',
   !/NaN/.test(q('#chips').textContent) && g('S').min === null,
   `S.min is ${g('S').min}, chips read "${q('#chips').textContent.trim().slice(0, 30)}"`);
g('resetAll()');
await new Promise((r) => setTimeout(r, 60));

/* --- a real number still filters --- */
const maxBox = q('[data-k="max"]');
maxBox.value = '250';
maxBox.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 260));
const under = g('view').length, all = g('P').length;
ok('a real number in the price box still filters', under > 0 && under < all,
   `${under.toLocaleString()} of ${all.toLocaleString()} at or under 250`);
g('resetAll()');
await new Promise((r) => setTimeout(r, 60));

/* --- facet counts must be real, not just present --- */
const petTotal = [...doc.querySelectorAll('#facets [data-f="pet"]')]
  .map((el) => +el.parentElement.querySelector('.n').textContent.replace(/[^0-9]/g, ''))
  .reduce((a, b) => a + b, 0);
ok('pet facet counts sum to roughly the catalogue', petTotal >= g('P').length,
   `${petTotal.toLocaleString()} across pets vs ${g('P').length.toLocaleString()} products`);

/* --- mobile sidebar locks the page behind it --- */
g('toggleSidebar(true)');
const locked = doc.body.style.overflow === 'hidden';
g('toggleSidebar(false)');
ok('the filter panel locks background scroll', locked && doc.body.style.overflow === '',
   `locked=${locked}, released=${doc.body.style.overflow === ''}`);

/* --- "/" in a price box --- */
q('[data-k="min"]').focus();
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
ok('"/" typed in a price box does not jump to search', doc.activeElement !== q('#q'),
   `focus on ${doc.activeElement?.tagName}[data-k=${doc.activeElement?.dataset?.k}]`);

/* --- "/" from the page body still focuses search --- */
doc.activeElement.blur();   // body is not focusable; blurring is what actually clears focus
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
ok('"/" from the page still focuses search', doc.activeElement === q('#q'));

/* --- closing the drawer returns focus --- */
const card0 = q('.card');
card0.focus();
g('openP(0)');
await new Promise((r) => setTimeout(r, 40));
g('closeAll()');
ok('closing the drawer returns focus to the card', doc.activeElement === card0,
   `focus on ${doc.activeElement?.className || doc.activeElement?.tagName}`);
ok('closed drawer is inert again', q('#drawer').hasAttribute('inert'));
g('resetAll()');
await new Promise((r) => setTimeout(r, 60));

/* --- drawer accessibility --- */
ok('closed drawer is hidden from assistive tech',
   q('#drawer').hasAttribute('inert') || q('#drawer').getAttribute('aria-hidden') === 'true',
   'no inert/aria-hidden while closed');
g('openP(0)');
await new Promise((r) => setTimeout(r, 60));
ok('opening the drawer moves focus into it',
   q('#drawer').contains(doc.activeElement),
   `focus is on ${doc.activeElement?.tagName}.${doc.activeElement?.className}`);
g('closeAll()');

/* --- escaping in generated markup --- */
const risky = g('P').find((p) => /"/.test(p.url) || /"/.test(p.img || ''));
ok('no unescaped quote reaches a url/img attribute', !risky, risky ? risky.url : 'none in this dataset');

/* --- context menu --- */
const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
q('.card')?.dispatchEvent(ev);
ok('right click on a card is suppressed', ev.defaultPrevented);
const iev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
q('#q')?.dispatchEvent(iev);
ok('right click still works inside the search box', !iev.defaultPrevented);

/* --- infinite-scroll top-up. jsdom has no layout, so the sentinel's position
       is stubbed to drive both branches of the guard. --- */
{
  const sen = q('#sentinel');
  g('resetAll()');
  await new Promise((r) => setTimeout(r, 60));
  const shownNow = () => g('shown');
  sen.getBoundingClientRect = () => ({ top: 50 });          // still on screen
  g('apply()');
  await new Promise((r) => setTimeout(r, 120));
  const topped = shownNow();
  sen.getBoundingClientRect = () => ({ top: 99999 });       // far below the fold
  g('apply()');
  await new Promise((r) => setTimeout(r, 120));
  const notTopped = shownNow();
  ok('grid tops up when the sentinel is still on screen', topped > 48, `${topped} cards`);
  ok('grid stops at one page when the sentinel is below the fold',
     notTopped === 48, `${notTopped} cards`);
  delete sen.getBoundingClientRect;
}

/* --- inline handlers: the thing minification silently breaks --- */
q('.card').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 40));
ok('onclick="openP(n)" on a card opens the drawer', q('#drawer').classList.contains('on'));
q('#drawer .x')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('onclick="closeAll()" in the drawer closes it', !q('#drawer').classList.contains('on'));

const pill = [...doc.querySelectorAll('.pill')].find((b) => b.textContent.includes('20%'));
pill?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 40));
ok('onclick="S.disc=20;apply()" on a pill filters', g('S').disc === 20 && g('view').length < g('P').length,
   `${g('view').length.toLocaleString()} products at 20%+ off`);
g('resetAll()');
await new Promise((r) => setTimeout(r, 40));

const head = q('.fhead');
head.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('onclick="togg(id)" collapses a filter group', q('.fgroup').dataset.open === 'false');
head.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

const more = [...doc.querySelectorAll('.morelink')][0];
const catsBefore = doc.querySelectorAll('#facets [data-f="cat"]').length;
more?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('onclick="catsOpen=!catsOpen" expands the category list',
   doc.querySelectorAll('#facets [data-f="cat"]').length > catsBefore,
   `${catsBefore} -> ${doc.querySelectorAll('#facets [data-f="cat"]').length}`);
g('resetAll()');
await new Promise((r) => setTimeout(r, 40));

q('.filterbtn')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('onclick="toggleSidebar(true)" opens the mobile panel', q('#sidebar').classList.contains('on'));
g('closeAll()');

/* --- sanity: empty result state --- */
g('S').q = 'zzzzzznothing';
g('apply()');
await new Promise((r) => setTimeout(r, 60));
ok('empty state renders', !!q('.empty'), q('#count')?.textContent);
g('resetAll()');

const pad = Math.max(...T.map((t) => t[1].length));
console.log('');
for (const [s, n, note] of T) console.log(`  ${s}  ${n.padEnd(pad)}  ${note}`);
const fails = T.filter((t) => t[0] === 'FAIL').length;
console.log(`\n  ${T.length - fails}/${T.length} passing\n`);
if (errors.length) { console.log('  runtime errors:'); errors.slice(0, 6).forEach((e) => console.log('   ', e)); }
