import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const errs=[]; const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push(e.detail?.message||e.message));
const dom=new JSDOM(fs.readFileSync(process.argv[2]||'dist/index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};
  if(!w.matchMedia)w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});}});
const {window}=dom, doc=window.document;
await new Promise(r=>setTimeout(r,4500));

const fire = (el, type, init={}) => {
  const E = type==='keydown' ? window.KeyboardEvent : type==='contextmenu' ? window.MouseEvent : window.Event;
  const ev = new E(type, {bubbles:true, cancelable:true, ...init});
  el.dispatchEvent(ev);
  return ev.defaultPrevented;
};

const card = doc.querySelector('#grid .card');
const link = doc.querySelector('a[href]') || doc.body;
const q = doc.getElementById('q');

console.log('BLOCKED (want true):');
console.log('  right-click on a card :', fire(card, 'contextmenu'));
console.log('  right-click on body   :', fire(doc.body, 'contextmenu'));
console.log('  right-click on a link :', fire(link, 'contextmenu'));
console.log('  F12                   :', fire(doc.body, 'keydown', {key:'F12'}));
console.log('  Ctrl+Shift+I          :', fire(doc.body, 'keydown', {key:'I', ctrlKey:true, shiftKey:true}));
console.log('  Cmd+Shift+C           :', fire(doc.body, 'keydown', {key:'c', metaKey:true, shiftKey:true}));
console.log('  Ctrl+U                :', fire(doc.body, 'keydown', {key:'u', ctrlKey:true}));

console.log('\nSTILL WORKS (want false / normal):');
console.log('  Ctrl+C copy blocked   :', fire(doc.body, 'keydown', {key:'c', ctrlKey:true}));
console.log('  Ctrl+A blocked        :', fire(doc.body, 'keydown', {key:'a', ctrlKey:true}));
console.log('  Escape blocked        :', fire(doc.body, 'keydown', {key:'Escape'}));
console.log('  plain typing blocked  :', fire(q, 'keydown', {key:'k'}));

q.value='farmina'; q.dispatchEvent(new window.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,900));
console.log('  search still filters  :', doc.getElementById('count').textContent.replace(/\s+/g,' ').trim());
window.openP(0); await new Promise(r=>setTimeout(r,300));
console.log('  drawer still opens    :', doc.getElementById('drawer').classList.contains('on'));
console.log('\nerrors:', errs.length?errs.slice(0,2).join('; '):'none');
