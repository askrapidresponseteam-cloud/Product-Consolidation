import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const errs=[]; const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push(e.detail?.message||e.message));
const dom=new JSDOM(fs.readFileSync(process.argv[2]||'index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};
  if(!w.matchMedia)w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});}});
const {window}=dom, doc=window.document;
await new Promise(r=>setTimeout(r,4500));
console.log('runtime errors:', errs.length?errs.slice(0,3).join('; '):'none');

console.log('\n=== quote arithmetic at the threshold boundaries ===');
console.log(window.eval(`(() => {
  const mk=price=>({name:'',size:'1 kg',price,mrp:0,disc:0,stock:1,up:null,unit:null});
  const st={si:1,title:'T',vars:[]}, other={si:0,title:'T',vars:[]};
  const out=[];
  for(const px of [400,599,650,699,700,1800,2000]){
    const q=quote(st,mk(px),1);
    out.push('  Supertails item '+String(px).padStart(5)+' -> payable '+
      (Math.round(q.lo)===Math.round(q.hi)?('₹'+q.lo):('₹'+q.lo+'–₹'+q.hi)).padEnd(15)+
      ' regular ₹'+q.regular[0]+(q.regular[0]!==q.regular[1]?'–₹'+q.regular[1]:'')+
      '  | tiers: '+(q.tiers.map(t=>t.code+(t.eligible?' eligible@₹'+Math.round(t.lo):' short ₹'+t.shortfall)).join(', ')||'none'));
  }
  const u=quote(other,mk(500),1);
  out.push('\\n  Unknown store item 500 -> lo ₹'+u.lo+'  hi '+(u.hi===Infinity?'Infinity (unbounded)':u.hi)+'  known='+u.known);
  return out.join('\\n');
})()`));

console.log('\n=== ranking: can a store with no published fees ever win? ===');
console.log(window.eval(`(() => {
  const mk=price=>({name:'',size:'1 kg',price,mrp:0,disc:0,stock:1,up:null,unit:null});
  const st={si:1,title:'T'}, huft={si:0,title:'T'};
  const cases=[
    ['unknown cheaper on item (₹500 vs ₹900)', quote(st,mk(900),1), quote(huft,mk(500),1)],
    ['known store far cheaper (₹400 vs ₹900)',  quote(st,mk(400),1), quote(huft,mk(900),1)],
    ['known beats unknown item price outright (₹600+49=649 vs ₹900)', quote(st,mk(600),1), quote(huft,mk(900),1)],
  ];
  return cases.map(([label,a,b])=>{
    const r=rankQuotes([a,b]);
    return '  '+label+'\\n     -> '+(r.winner?('WINNER '+r.winner.seller+' at ₹'+Math.round(r.winner.hi)):'INDETERMINATE (no cheapest claimed)');
  }).join('\\n');
})()`));

console.log('\n=== the ladder, rendered for a real Supertails product ===');
const idx = window.eval(`P.find(p=>p.si===1 && p.lo>1800 && p.cmp).i`);
window.openP(idx); await new Promise(r=>setTimeout(r,400));
const dr=doc.getElementById('drawer');
console.log('  ', dr.querySelector('.dtitle').textContent.trim().slice(0,60));
[...dr.querySelectorAll('.ladder .lrow, .ladder .lnote')].forEach(el=>
  console.log('   ', (el.classList.contains('lnote')?'      ':'')+el.textContent.replace(/\s+/g,' ').trim().slice(0,120)));
console.log('\n  breakdown:');
[...dr.querySelectorAll('.lbreak tr')].forEach(tr=>
  console.log('     ', [...tr.querySelectorAll('td')].map(t=>t.textContent.trim()).join('  ->  ')));
console.log('\n  CTA :', dr.querySelector('.cta').textContent.replace(/\s+/g,' ').trim());
console.log('  note:', dr.querySelector('.ctanote').textContent.replace(/\s+/g,' ').trim().slice(0,180));
console.log('\n  cross-store payable table:');
[...dr.querySelectorAll('.cmpt2 tr')].forEach(tr=>
  console.log('     ', [...tr.querySelectorAll('th,td')].map(t=>t.textContent.replace(/\s+/g,' ').trim()).join(' | ')));
console.log('  verdict:', dr.querySelector('.cmp .caveat')?.textContent.replace(/\s+/g,' ').trim().slice(0,150));
