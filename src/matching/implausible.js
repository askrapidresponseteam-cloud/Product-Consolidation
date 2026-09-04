import { packSize } from './pack-size.js';

/** Flags variants whose price contradicts the same store's larger pack. */

function flagImplausible(P){
  let flagged = 0;
  for(const p of P){
    const sized = p.vars
      .map((v) => ({ v, k: packSize(v.name, v.size) }))
      .filter((o) => o.k && o.k.qty > 0 && (o.k.unit === 'kg' || o.k.unit === 'L') && o.v.price > 0);
    if(sized.length < 2) continue;
    for(const a of sized){
      for(const b of sized){
        if(b.k.qty > a.k.qty && a.v.price > b.v.price * 2){ a.v._bad = true; break; }
      }
      if(a.v._bad) flagged++;
    }
  }
  return flagged;
}

/* Every reason a pair can be refused, in one place, so the audit and the UI
   agree on what "comparable" means. */

export { flagImplausible };
