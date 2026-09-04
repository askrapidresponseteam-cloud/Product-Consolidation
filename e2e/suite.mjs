import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const file = process.argv[2];
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('ERR ' + (e.detail?.message || e.message)));

const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    w.scrollTo = () => {};
    if (!w.matchMedia) w.matchMedia = q => ({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  },
});
const { window } = dom, doc = window.document;
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(4000);

const grid = doc.getElementById('grid');
const cnt  = () => (doc.querySelector('#count')||doc.querySelector('.count'))?.textContent.replace(/\s+/g,' ').trim() || '';
const q    = doc.getElementById('q');
const log  = [];
const rec  = (label) => log.push(`${label.padEnd(26)} ${cnt().padEnd(20)} cards=${grid.children.length}`);
const click = el => el?.dispatchEvent(new window.MouseEvent('click', {bubbles:true}));

rec('baseline');

// search
q.value = 'kitten wet food';
q.dispatchEvent(new window.Event('input', {bubbles:true}));
await wait(900); rec('search:kitten wet food');

q.value = 'Farmina';
q.dispatchEvent(new window.Event('input', {bubbles:true}));
await wait(900); rec('search:Farmina');

// sort
const sort = doc.getElementById('sort');
for (const v of [...sort.options].map(o=>o.value)) {
  sort.value = v; sort.dispatchEvent(new window.Event('change', {bubbles:true}));
  await wait(400);
  rec('sort:'+v+' | '+(grid.children[0]?.querySelector('.ttl,.title,h3')?.textContent||'').trim().slice(0,22));
}

// reset then facet stack
window.resetAll(); await wait(700); rec('resetAll');

const cb = s => [...doc.querySelectorAll(`input[data-f="${s}"]`)];
const pick = (s,v) => { const el = cb(s).find(i=>i.dataset.v===v); if(el){ el.checked=true; click(el);} return !!el; };
pick('store','Supertails'); await wait(700); rec('store:Supertails');
pick('pet','Cat');          await wait(700); rec('+pet:Cat');
pick('cat','Wet Food');     await wait(700); rec('+cat:Wet Food');
pick('brand','Sheba');      await wait(700); rec('+brand:Sheba');

// stock + discount + compare toggles
const stock = doc.querySelector('input[onchange*="S.stock"]');
if (stock) { stock.checked = true; stock.dispatchEvent(new window.Event('change',{bubbles:true})); await wait(600); rec('+in stock'); }
const both = doc.querySelector('input[onchange*="S.both"]');
if (both) { both.checked = true; both.dispatchEvent(new window.Event('change',{bubbles:true})); await wait(600); rec('+compare only'); }

// product drawer
window.resetAll(); await wait(700);
window.openP(0); await wait(600);
const dr = doc.getElementById('drawer');
log.push('drawer chars=' + (dr?.textContent.replace(/\s+/g,' ').trim().length||0));
log.push('drawer head =' + (dr?.textContent.replace(/\s+/g,' ').trim().slice(0,70)||''));
window.closeAll(); await wait(300);
log.push('drawer closed=' + ((dr?.textContent.trim().length||0) === 0 || !dr.classList.contains('open')));

// price range
window.resetAll(); await wait(600);
const mn = doc.querySelector('input[oninput*="S.min"]');
mn.value = '5000'; mn.dispatchEvent(new window.Event('input',{bubbles:true}));
await wait(1200); rec('price>=5000');

log.push('errors=' + (errors.length ? errors.join('; ') : 'none'));
console.log(log.join('\n'));
