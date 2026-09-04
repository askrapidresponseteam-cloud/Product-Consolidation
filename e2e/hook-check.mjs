import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const load = async (f) => {
  const dom = new JSDOM(fs.readFileSync(f,'utf8'), {runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),
    beforeParse(w){w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};
    if(!w.matchMedia)w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});}});
  await new Promise(r=>setTimeout(r,4500));
  return dom.window;
};
for (const f of process.argv.slice(2)) {
  const w = await load(f);
  console.log(f.padEnd(28),
    '| window.P:', typeof w.P,
    '| window.quote:', typeof w.quote,
    '| window.apply:', typeof w.apply,
    '| cards:', w.document.getElementById('grid').children.length);
}
