import { packSize } from './pack-size.js';

/**
 * A canonical key for what is actually in the pack. Two variants may only be
 * priced against each other when their keys are identical.
 */

const GARMENT = {
  xxs:'xxs', xs:'xs', 'x-small':'xs', 'extra small':'xs',
  s:'s', small:'s', m:'m', medium:'m', l:'l', large:'l',
  xl:'xl', 'x-large':'xl', 'extra large':'xl',
  xxl:'xxl', '2xl':'xxl', 'xx-large':'xxl', xxxl:'xxxl', '3xl':'xxxl',
};
function garment(text){
  const t = String(text || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.]/g, '');
  return GARMENT[t] || null;
}

/* A canonical key for what is actually in the pack. Two variants may only be
   priced against each other when their keys are identical. */
function sizeKey(v, p){
  if(v._sk !== undefined) return v._sk;
  let k = null;
  const pk = packSize(v.name, v.size);
  if(pk && pk.unit && pk.qty > 0) k = pk.unit + ':' + (+pk.qty.toFixed(4));
  else {
    const g = garment(v.name) || garment(v.size);
    if(g) k = 'garment:' + g;
    /* One unlabelled variant is the whole product - a toy, a bowl - so there
       is nothing to mismatch. Anything that does carry a label but will not
       parse stays null and is refused. */
    else if(!String(v.name || '').trim() && !String(v.size || '').trim() && p.vars.length === 1) k = 'single';
  }
  return (v._sk = k);
}

/* Same model, different colourway is a different SKU and often a different
   price, so "40% less at X" across two colours is not a saving anyone can
   act on. Only unambiguous colour words are listed: no salmon, cream, olive
   or mint, which are all flavours here far more often than they are colours.
   A mismatch is only called when both titles actually declare a colour. */

export { GARMENT, garment, sizeKey };
