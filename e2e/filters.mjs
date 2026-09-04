import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const errs=[]; const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push(e.detail?.message||e.message));
const dom=new JSDOM(fs.readFileSync(process.argv[2],'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};
  if(!w.matchMedia)w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});}});
const {window}=dom, doc=window.document;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await wait(4500);
const cnt=()=>doc.getElementById('count').textContent.replace(/\s+/g,' ').trim();
const click=el=>el?.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
const boxes=f=>[...doc.querySelectorAll(`input[data-f="${f}"]`)];
const tick=(f,v)=>{const el=boxes(f).find(i=>i.dataset.v===v); if(!el) throw new Error('missing option '+v); el.checked=true; click(el);};
const show=f=>boxes(f).map(i=>{const l=i.closest('.opt');
  return `${i.checked?'[x]':'[ ]'}${l.classList.contains('on')?'*':' '}${i.dataset.v}:${l.querySelector('.n')?.textContent||''}`;});

console.log('STORE options at start   :', show('store').join('  '));
console.log('count                    :', cnt(), '\n');

tick('store','Supertails'); await wait(700);
console.log('after +Supertails');
console.log('  store options visible  :', boxes('store').length, '(must stay 6)');
console.log('  ', show('store').join('  '));
console.log('  count                  :', cnt());

tick('store','Petsworld'); await wait(700);
console.log('\nafter +Petsworld (OR should WIDEN)');
console.log('  ', show('store').join('  '));
console.log('  count                  :', cnt());

tick('store','Zigly'); await wait(700);
console.log('\nafter +Zigly');
console.log('  count                  :', cnt());

// cross-filter AND
tick('pet','Dog'); await wait(700);
const c1=cnt();
console.log('\nAND across filters: +pet Dog ->', c1);
console.log('  pet options visible    :', boxes('pet').length, '(must stay 6)');
console.log('  ', show('pet').join('  '));
tick('pet','Cat'); await wait(700);
console.log('  +pet Cat (OR widens)   :', cnt());
tick('pet','Small Pets'); await wait(700);
console.log('  +pet Small Pets        :', cnt());

console.log('\ncategory options visible :', boxes('cat').length);
console.log('brand options visible    :', boxes('brand').length);

// arithmetic proof of OR + AND
const proof = window.eval(`(() => {
  const inSet=(s,v)=>s.has(v);
  const stores=['Supertails','Petsworld','Zigly'], petsSel=['Dog','Cat','Small Pets'];
  const n=P.filter(p=>stores.includes(p.seller)&&petsSel.includes(p.pet)).length;
  const each=stores.map(s=>s+'='+P.filter(p=>p.seller===s&&petsSel.includes(p.pet)).length);
  return {n, each};
})()`);
console.log('\nindependent check: union of the three stores x three pets =', proof.n.toLocaleString('en-IN'));
console.log('  per store:', proof.each.join(', '), '(sum must equal the union)');
console.log('  portal shows:', cnt());
console.log('\nerrors:', errs.length?errs.slice(0,3).join('; '):'none');
