/** Colourway detection, used to refuse cross-SKU price claims. */

const COLOURS = ['black','white','grey','gray','blue','navy','red','maroon','green',
  'yellow','orange','pink','purple','lilac','lavender','brown','tan','beige',
  'teal','turquoise','burgundy','rust','khaki','charcoal','seafoam','mustard','violet'];
const COLOUR_RE = new RegExp('\\b(' + COLOURS.join('|') + ')\\b', 'g');
function colourOf(title){
  const m = String(title || '').toLowerCase().match(COLOUR_RE);
  if(!m) return null;
  const set = [...new Set(m)].sort();
  return set.join('/');
}

/* Matching can be perfect and the answer still nonsense if the source price is
   wrong. 139 products quote a smaller pack for more than a larger one of the
   same thing at the same store - Petsworld has Smartheart 10 kg at ₹284,700
   beside its own 20 kg at ₹5,014 - and left alone that renders as a ₹279,686
   saving, which is the same lie as a mismatched pack by another route.

   The threshold is deliberately loose at 2x. Clearance and promotion really do
   invert pack pricing by modest amounts, and those are honest prices worth
   showing; nothing legitimate makes the small pack cost double the large one. */

export { COLOURS, COLOUR_RE, colourOf };
