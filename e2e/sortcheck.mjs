import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),
  beforeParse(w){w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};
  if(!w.matchMedia)w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});}});
const {window}=dom, doc=window.document;
await new Promise(r=>setTimeout(r,4500));
console.log('Smartheart (Petsworld) after the fix:');
console.log(window.eval(`(()=>{const p=P.find(x=>/Smartheart Power Pack Adult Dog$/.test(x.title)&&x.seller==='Petsworld');
  return '  lo '+p.lo+'  hi '+p.hi+'  lead '+p.lead+'  (was hi 284700)';})()`));
const stock=[...doc.querySelectorAll('input[data-f]')].find(i=>i.getAttribute('onchange')?.includes('S.stock'))
  || doc.querySelector('input[onchange*="S.stock"]');
stock.checked=true; stock.dispatchEvent(new window.Event('change',{bubbles:true}));
await new Promise(r=>setTimeout(r,700));
const sort=doc.getElementById('sort'); sort.value='phi'; sort.dispatchEvent(new window.Event('change',{bubbles:true}));
await new Promise(r=>setTimeout(r,900));
console.log('\nPrice: high to low, in stock only — first 8 cards:');
[...doc.getElementById('grid').children].slice(0,8).forEach((c,i)=>{
  const t=c.textContent.replace(/\s+/g,' ');
  const price=(t.match(/₹[\d,]+/)||[''])[0];
  console.log('  '+String(i+1).padStart(2)+'. '+price.padEnd(12)+t.slice(0,58).replace(/^\d+% off /,''));
});
const prices=[...doc.getElementById('grid').children].slice(0,40).map(c=>{
  const m=c.textContent.replace(/\s+/g,' ').match(/₹([\d,]+)/); return m?+m[1].replace(/,/g,''):null;}).filter(Boolean);
let mono=true; for(let i=1;i<prices.length;i++) if(prices[i]>prices[i-1]) mono=false;
console.log('\nfirst 40 cards descend monotonically:', mono);
