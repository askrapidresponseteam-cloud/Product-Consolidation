/* jsdom has no layout engine, so verify the corner furniture arithmetically
   from the declared CSS instead of trusting it by eye. */
import fs from 'node:fs';
const css = fs.readFileSync('dist/index.html','utf8').slice(0, 60000);

const rule = (sel) => {
  const i = css.indexOf('\n' + sel + '{');
  return css.slice(i, css.indexOf('}', i));
};
const num = (block, prop) => {
  const m = new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*(-?[\\d.]+)px').exec(block);
  return m ? parseFloat(m[1]) : null;
};

const _card = rule('.card'), badge = rule('.badge'), dot = rule('.sellerdot'), pick = rule('.pick');
const PAD = 14, BORDER = 1;                 // .card padding:14px, border:1px
const TILE0 = PAD + BORDER;                 // tile origin inside .cardwrap

// generous estimate: "96% OFF" at 9px display font + letter-spacing + 8px side padding
const BADGE_W = 8 + 8 + 56, BADGE_H = 5 + 5 + 11;

const rects = (cardW) => {
  const tileSide = cardW - 2 * (PAD + BORDER);
  return {
    badge: { x0: TILE0 + (num(badge,'left') ?? 0), y0: TILE0 + (num(badge,'top') ?? 0),
             x1: TILE0 + (num(badge,'left') ?? 0) + BADGE_W, y1: TILE0 + (num(badge,'top') ?? 0) + BADGE_H },
    dot:   (() => {
      const w = num(dot,'width'), h = num(dot,'height');
      const r = num(dot,'right'), t = num(dot,'top'), b = num(dot,'bottom');
      const x0 = TILE0 + tileSide - r - w;
      const y0 = t != null ? TILE0 + t : TILE0 + tileSide - b - h;
      return { x0, y0, x1: x0 + w, y1: y0 + h };
    })(),
    pick: (() => {
      const w = num(pick,'width'), h = num(pick,'height');
      const t = num(pick,'top'), l = /(?:^|[;{\s])left\s*:/.test(pick) ? num(pick,'left') : null;
      const r = /(?:^|[;{\s])right\s*:/.test(pick) ? num(pick,'right') : null;
      const x0 = l != null ? l : cardW - r - w;
      return { x0, y0: t, x1: x0 + w, y1: t + h };
    })(),
  };
};

const hits = (a,b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
let bad = 0;
console.log('pick declared as:', pick.replace(/\s+/g,' ').match(/top:[^;]+;|left:[^;]+;|right:[^;]+;|width:[^;]+;/g)?.join(' '));
console.log('');
for(const cardW of [158, 180, 248, 300, 380, 520]){       // 158 = mobile min, 248 = desktop min
  const r = rects(cardW);
  const c1 = hits(r.pick, r.badge), c2 = hits(r.pick, r.dot);
  if(c1 || c2) bad++;
  console.log(`  card ${String(cardW).padStart(3)}px  pick x${r.pick.x0}-${r.pick.x1} y${r.pick.y0}-${r.pick.y1}` +
    `  | badge x${r.badge.x0}-${r.badge.x1} y${r.badge.y0}-${r.badge.y1} -> ${c1?'OVERLAP':'clear'}` +
    `  | dot x${r.dot.x0}-${r.dot.x1} -> ${c2?'OVERLAP':'clear'}`);
}
console.log('\n' + (bad ? `FAIL: ${bad} widths collide` : 'PASS: badge and pick never intersect at any grid width'));
