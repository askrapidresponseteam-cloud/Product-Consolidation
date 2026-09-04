import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const errs=[]; const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push(e.detail?.message||e.message));
const dom=new JSDOM(fs.readFileSync(process.argv[2],'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};
  if(!w.matchMedia)w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});}});
const {window}=dom, doc=window.document;
await new Promise(r=>setTimeout(r,4500));
const dr=doc.getElementById('drawer');

const pick = window.eval(`(() => ({
  rivalCheaper: P.find(p=>p.cmp && !p.cmp.weCheapest && p.cmp.diff>200).i,
  weCheapest:   P.find(p=>p.cmp && p.cmp.weCheapest && p.cmp.lead.stores>2).i,
  noMatch:      P.find(p=>!p.cmp && p.lo>0).i,
}))()`);

for(const [label, idx] of Object.entries(pick)){
  window.openP(idx); await new Promise(r=>setTimeout(r,300));
  const cta=dr.querySelector('.cta'), note=dr.querySelector('.ctanote'), alt=dr.querySelector('.ctaalt');
  const rows=[...dr.querySelectorAll('.cmp table tr')].map(tr=>{
    const td=[...tr.querySelectorAll('td')].map(x=>x.textContent.replace(/\s+/g,' ').trim());
    const a=tr.querySelector('a.golink');
    return td.join(' ')+(a?' -> '+a.href.replace('https://','').slice(0,42):'');
  });
  console.log(`\n===== ${label} =====`);
  console.log('  title      :', dr.querySelector('.dtitle').textContent.trim().slice(0,60));
  console.log('  PRIMARY CTA:', cta.textContent.replace(/\s+/g,' ').trim(), '->', cta.href.replace('https://','').slice(0,50));
  console.log('  note       :', note?.textContent.replace(/\s+/g,' ').trim());
  if(alt) console.log('  secondary  :', alt.textContent.replace(/\s+/g,' ').trim(), '->', alt.href.replace('https://','').slice(0,45));
  if(rows.length){ console.log('  every store listed with its own link:'); rows.forEach(r=>console.log('     ', r)); }
  else console.log('  (no comparison block)');
}
console.log('\nerrors:', errs.length?errs.slice(0,3).join('; '):'none');
