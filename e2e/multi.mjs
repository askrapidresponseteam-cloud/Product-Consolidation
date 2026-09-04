import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const file = process.argv[2];
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('ERR ' + (e.detail?.message || e.message)));
const dom = new JSDOM(fs.readFileSync(file,'utf8'), {
  runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
  beforeParse(w){ w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}}; w.scrollTo=()=>{};
    if(!w.matchMedia) w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); },
});
const {window}=dom, doc=window.document;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await wait(4000);
const grid=doc.getElementById('grid'), tray=doc.getElementById('tray'), sheet=doc.getElementById('cmpsheet');
const click=el=>el?.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));

console.log('tray visible at start :', tray.classList.contains('on'), '(want false)');

// pick three cards via the real buttons
const picks=[...grid.querySelectorAll('.cardwrap .pick')].slice(0,3);
picks.forEach(click); await wait(400);
console.log('after 3 picks        :', tray.querySelector('.traycount')?.textContent,
            '| tray on:', tray.classList.contains('on'),
            '| thumbs:', tray.querySelectorAll('.tth').length,
            '| cards ticked:', grid.querySelectorAll('.cardwrap.picked').length);

// does the drawer still work? (pick must not trigger openP)
console.log('drawer opened by pick:', doc.getElementById('drawer').classList.contains('on'), '(want false)');

// unpick one
click(grid.querySelectorAll('.cardwrap .pick')[0]); await wait(300);
console.log('after 1 unpick       :', tray.querySelector('.traycount')?.textContent);

// add more, then compare
[...grid.querySelectorAll('.cardwrap .pick')].slice(3,6).forEach(click); await wait(400);
click(tray.querySelector('.tbtn:not(.ghost)')); await wait(700);
console.log('\ncompare sheet open   :', sheet.classList.contains('on'));
const rows=[...sheet.querySelectorAll('tbody tr')].map(r=>r.querySelector('th')?.textContent.trim()).filter(Boolean);
console.log('compare columns      :', sheet.querySelectorAll('thead th').length-1);
console.log('compare rows         :', rows.join(', '));
console.log('cheapest marked      :', sheet.querySelectorAll('.cmpbadge').length, 'badge(s)');
console.log('scrim on             :', doc.getElementById('scrim').classList.contains('on'));

// close, then verify selection survives a filter change
window.closeCompare(); await wait(300);
console.log('sheet closed         :', !sheet.classList.contains('on'), '| tray still on:', tray.classList.contains('on'));

const st=[...doc.querySelectorAll('input[data-f="store"]')].find(i=>i.dataset.v==='Supertails');
st.checked=true; click(st); await wait(900);
console.log('\nafter store filter   :', tray.querySelector('.traycount')?.textContent, '(selection should persist)');
window.resetAll(); await wait(800);
console.log('after resetAll       :', tray.querySelector('.traycount')?.textContent, '| tray on:', tray.classList.contains('on'));

window.clearPicks(); await wait(300);
console.log('after clearPicks     : tray on:', tray.classList.contains('on'), '(want false)');
console.log('\nerrors:', errors.length?errors.slice(0,3).join('; '):'none');
