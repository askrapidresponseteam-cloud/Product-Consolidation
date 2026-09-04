import { sizeKey } from './size-key.js';
import { colourOf } from './colour.js';

/**
 * The like-for-like gate. Returns null when a pair may be compared, or a
 * human-readable reason why it may not. Every refusal reason lives here so the
 * audit tool and the UI cannot disagree about what "comparable" means.
 */

function comparable(p, mv, rival, tv){
  if(!mv || !tv) return 'missing variant';
  if(!(mv.price > 0) || !(tv.price > 0)) return 'no quoted price';
  if(mv._bad || tv._bad) return 'price contradicts the same store\u2019s larger pack';
  const a = sizeKey(mv, p), b = sizeKey(tv, rival);
  if(!a || !b) return 'pack size not verifiable';
  if(a !== b) return 'different pack size';
  const ca = colourOf(p.title), cb = colourOf(rival.title);
  if(ca && cb && ca !== cb) return 'different colourway';
  return null;
}

export { comparable };
