import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const dom=new JSDOM(fs.readFileSync(process.argv[2]||'index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),
  beforeParse(w){w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};
  if(!w.matchMedia)w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});}});
const {window}=dom, doc=window.document;
await new Promise(r=>setTimeout(r,4500));
const badges=[...doc.querySelectorAll('#grid .badge')].slice(0,6).map(b=>b.textContent.trim());
console.log('  first badges:', badges.join('  |  '));
const pcts = badges.filter(b=>/^\d+% off$/i.test(b)).length;
console.log('  badges carrying a number:', pcts, 'of', badges.length);
console.log('  any bare "OFF" with no number:', badges.some(b=>/^off$/i.test(b)) ? 'YES <-- BUG' : 'no');
