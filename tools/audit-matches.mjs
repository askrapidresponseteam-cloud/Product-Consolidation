import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),
  beforeParse(w){w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.scrollTo=()=>{};
  if(!w.matchMedia)w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});}});
const {window}=dom;
await new Promise(r=>setTimeout(r,4000));

const out = window.eval(`(() => {
  const bad=[], stat={pairs:0, ok:0, unparsable:0, unitMismatch:0, qtyMismatch:0};
  for(const key of Object.keys(MATCH)){
    const i=+key, p=P[i]; if(!p) continue;
    for(const [rivalIdx, conf, aligned] of MATCH[key]){
      const rival=P[rivalIdx]; if(!rival) continue;
      for(const [mine, theirs] of aligned){
        const mv=p.vars[mine], tv=rival.vars[theirs];
        if(!mv||!tv||!(mv.price>0)||!(tv.price>0)) continue;
        stat.pairs++;
        const a=packSize(mv.name, mv.size), b=packSize(tv.name, tv.size);
        let why=null;
        if(!a||!b) { stat.unparsable++; why='unverifiable'; }
        else if(a.unit!==b.unit){ stat.unitMismatch++; why='unit '+a.unit+' vs '+b.unit; }
        else if(Math.abs(a.qty-b.qty)>1e-6){ stat.qtyMismatch++; why='qty '+a.qty+a.unit+' vs '+b.qty+b.unit; }
        else stat.ok++;
        if(why){
          const gap=Math.round((1-Math.min(mv.price,tv.price)/Math.max(mv.price,tv.price))*100);
          bad.push({why, gap, mt:p.title.slice(0,52), ms:(mv.size||mv.name||'-'), mp:mv.price,
                    tt:rival.title.slice(0,52), ts:(tv.size||tv.name||'-'), tp:tv.price,
                    a:sellers[p.si], b:sellers[rival.si]});
        }
      }
    }
  }
  bad.sort((x,y)=>y.gap-x.gap);
  return {stat, bad:bad.slice(0,8), total:bad.length};
})()`);

const s=out.stat;
console.log('variant pairs the offline matcher aligned :', s.pairs);
console.log('  pass strict like-for-like              :', s.ok);
console.log('  pack size cannot be verified           :', s.unparsable);
console.log('  unit family differs                    :', s.unitMismatch);
console.log('  same unit, DIFFERENT quantity          :', s.qtyMismatch);
console.log('  -> unsafe total                        :', out.total,
            `(${(out.total/s.pairs*100).toFixed(1)}% of all pairs)`);
console.log('\nworst offenders by the saving they would have claimed:\n');
for(const b of out.bad){
  console.log(`  ${b.gap}% apparent gap  [${b.why}]`);
  console.log(`     ${b.a}: ${b.mt} — ${b.ms} @ ₹${b.mp}`);
  console.log(`     ${b.b}: ${b.tt} — ${b.ts} @ ₹${b.tp}\n`);
}
