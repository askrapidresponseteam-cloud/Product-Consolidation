import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const errs=[]; const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push(e.detail?.message||e.message));
const dom=new JSDOM(fs.readFileSync(process.argv[2]||'dist/index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};
  if(!w.matchMedia)w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});}});
const {window}=dom, doc=window.document;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await wait(4500);

// type character by character, exactly as a person does
const box = () => doc.querySelector('.brandsearch');
let typed='';
for (const ch of 'virbac') {
  const b = box(); b.focus();
  typed += ch; b.value = typed;
  b.dispatchEvent(new window.Event('input',{bubbles:true}));
  await wait(120);
}
await wait(300);
console.log('typed "virbac" one key at a time');
console.log('  box value now      :', JSON.stringify(box().value));
console.log('  focus retained     :', doc.activeElement === box());
const opts=[...doc.querySelectorAll('input[data-f="brand"]')].map(i=>i.dataset.v);
console.log('  brand options shown:', opts.length);
console.log('  matches            :', opts.join(', ') || '(none)');

// and that selecting one actually filters
const v=[...doc.querySelectorAll('input[data-f="brand"]')].find(i=>i.dataset.v==='Virbac');
v.checked=true; v.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
await wait(800);
console.log('\nafter ticking Virbac :', doc.getElementById('count').textContent.replace(/\s+/g,' ').trim());

// the other broken live binding: SHOW ALL 18
const more=doc.querySelector('.morelink');
const before=doc.querySelectorAll('input[data-f="cat"]').length;
more.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
await wait(600);
console.log('categories shown     :', before, '->', doc.querySelectorAll('input[data-f="cat"]').length);
console.log('\nerrors:', errs.length?errs.slice(0,2).join('; '):'none');
