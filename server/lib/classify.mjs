/**
 * Category and pet-type inference from what the store publishes
 * (product_type, tags, title, vendor). Server-side only.
 *
 * Every rule is scored, not first-match, because titles are messy:
 * "Chicken Jerky Treats for Dogs" is Treats, not Fresh Food, and
 * "Cat Litter Scoop" is Litter, not Toys. Most specific signals win.
 */

export const CATEGORIES = [
  'Dry Food', 'Wet Food', 'Fresh Food', 'Treats & Chews', 'Health & Wellness', 'Pharmacy',
  'Toys', 'Clothing', 'Collars & Leashes', 'Beds, Mats & Travel', 'Bowls & Feeders',
  'Grooming', 'Litter & Cleanup', 'Training', 'Vet Services', 'Gifting & Merch',
  'Small Pet Supplies', 'Other',
];
export const PETS = ['Dog', 'Cat', 'Dog & Cat', 'Small Pets', 'Pet Parent', 'Other'];

/* [category, weight, regex] evaluated on title; product_type / tags get a boost. */
const CAT_RULES = [
  ['Wet Food', 6, /\b(wet food|gravy|in jelly|jelly|pate|pat[eé]|broth|mousse|loaf|cans?\b|canned|pouch(es)?|tin\b|tins\b|chunks in)\b/],
  ['Dry Food', 5, /\b(dry (dog|cat|pet)? ?food|kibble|dry food|adult food|puppy food|kitten food|senior food|dog food|cat food|complete food|formula|nutrition)\b/],
  ['Fresh Food', 6, /\b(fresh food|freshly cooked|home ?cooked|raw food|raw meal|frozen|fresh meal|cooked meal|gently cooked|dehydrated meal)\b/],
  ['Treats & Chews', 6, /\b(treats?|chews?|chewy|jerky|biscuits?|cookies?|bones?|dental sticks?|sticks?|dog snack|snacks?|rawhide|bully|munchies|crunchies|training treat|lick(able)? ?mat treat|creamy treat|calcium bone|antler|hoof|trachea|ears?\b|freeze[- ]dried)\b/],
  ['Health & Wellness', 5, /\b(supplement|vitamin|probiotic|omega|calcium|joint|hip|multivitamin|immunity|digestive|skin ?& ?coat|wellness|nutraceutical|oil\b|fish oil|salmon oil|liver tonic|tonic|health|coat care|syrup|drops|gel\b|tablets?|capsules?|paste\b)\b/],
  ['Pharmacy', 9, /\b(deworm(er|ing)?|ticks?|fleas?|spot[- ]?on|anti[- ]tick|medicine|medication|antibiotic|ointment|oilment|prescription|vet diet|veterinary diet|renal|hepatic|urinary care|hypoallergenic diet|gastro ?intestinal|nexgard|bravecto|frontline|simparica|drontal|kiwof|praziquantel|ivermectin|tablet for|\d+ ?mg|mcg|oral suspension|suspension|syrup|drops?|lotion|liquid|aid drops?|dusting powder|injection|inj\b|iodine|antiseptic|anti[- ]?fungal|anti[- ]?bacterial|wound|dermat|vet\b|veterinary)\b/],
  ['Toys', 7, /\b(toys?|plush|squeak(y|er)|rope toy|ball\b|balls\b|frisbee|fetch|chew toy|puzzle|tug|teaser|wand|catnip|feather|interactive|kong\b|scratcher|scratching|tunnel|cat tree|tree house|laser)\b/],
  ['Clothing', 8, /\b(t[- ]?shirts?|shirts?|tees?|polo|hoodies?|sweaters?|sweatshirts?|jackets?|raincoats?|coats?|vests?|dress(es)?|frock|tops?\b|costumes?|jumpers?|onesies?|apparel|clothing|clothes|pyjamas?|pajamas?|kurta|sherwani|lehenga|socks|booties|boots|shoes|life jacket)\b/],
  ['Collars & Leashes', 8, /\b(collars?|leash(es)?|harness(es)?|lead\b|leads\b|name ?tags?|id tag|martingale|retractable|muzzle|choke chain|slip lead|bandanas?|bow ?ties?|bowties?|scarf|scarves|neckwear)\b/],
  ['Beds, Mats & Travel', 7, /\b(beds?|mattress|cushion|mats?\b|blanket|crate|carrier|kennel|cage\b|travel|car seat|stroller|backpack|sofa|couch|cot\b|house\b|tent|hammock|cooling mat|playpen|pen\b)\b/],
  ['Bowls & Feeders', 8, /\b(bowls?|feeders?|fountain|water dispenser|slow feeder|lick ?mat|drinker|bottle|food container|storage|scoop for food|placemat|elevated|diner)\b/],
  ['Grooming', 7, /\b(shampoo|conditioner|grooming|brush(es)?|comb|deshedding|nail clipper|nail (grinder|trimmer)|clippers?|trimmer|wipes?|paw balm|paw butter|nose balm|ear cleaner|tear stain|dry bath|perfume|cologne|deodori[sz]er|spray\b|towel|bath\b|dental (kit|care)|toothbrush|toothpaste|finger brush|detangler|coat spray|serum)\b/],
  ['Litter & Cleanup', 8, /\b(litter|poop|poo bags?|waste bags?|pee pads?|training pads?|pads?\b|scooper|litter tray|litter box|odou?r (remover|eliminator)|stain (remover|cleaner)|urine|diapers?|nappies|clean ?up|disinfectant|floor cleaner|enzyme)\b/],
  ['Training', 7, /\b(training|clicker|whistle|potty|house[- ]?training|bark control|bell\b|agility|repellent|deterrent|trainer)\b/],
  ['Vet Services', 12, /\b(consult(ation)?|vet visit|vaccination|vaccine|teleconsult|check[- ]?up|lab test|blood test|test\b|grooming service|boarding|day ?care|appointment|service\b|surgery|surgical|spay(ing)?|neuter(ing)?|castration|procedure|package|treatment|stabili[sz]ation|excision|x-?ray|ultrasound|scan\b|biopsy|dental scaling|administration|gloves?|gown|sterile|syringe|catheter|cannula|hospital|icu|admission|euthanasia|cremation)\b/],
  ['Gifting & Merch', 7, /\b(gift|hamper|birthday|cake\b|card\b|mug\b|keychain|tote|sticker|poster|frame|human|for pet parents?|pet parent|voucher|e-?gift|combo|bundle)\b/],
  ['Small Pet Supplies', 9, /\b(rabbits?|guinea ?pigs?|hamsters?|birds?\b|parrots?|budgies?|aquarium|fish tank|fish food|fish flakes?|turtles?|tortoises?|hay\b|seed mix|bird food|bird seed|small animals?|small pets?|cockatiels?|finch(es)?|love ?birds?|gerbils?|chinchillas?)\b/],
];

const TYPE_HINTS = [
  ['Wet Food', /wet/i], ['Dry Food', /dry|kibble/i], ['Fresh Food', /fresh|raw|frozen/i],
  ['Treats & Chews', /treat|chew|snack|biscuit/i], ['Health & Wellness', /supplement|health|wellness|vitamin/i],
  ['Pharmacy', /pharma|medicine|tick|flea|deworm|vet diet|prescription/i], ['Toys', /toy|scratch/i],
  ['Clothing', /cloth|apparel|wear|shirt|dress|jacket/i], ['Collars & Leashes', /collar|leash|harness|walk/i],
  ['Beds, Mats & Travel', /bed|mat|travel|crate|carrier|kennel|house/i], ['Bowls & Feeders', /bowl|feeder|fountain/i],
  ['Grooming', /groom|shampoo|brush|hygiene|bath/i], ['Litter & Cleanup', /litter|clean|waste|pee|pad|poop/i],
  ['Training', /train/i], ['Vet Services', /service|consult|vet/i], ['Gifting & Merch', /gift|merch|human|parent/i],
  ['Small Pet Supplies', /small|bird|fish|rabbit|aqua/i],
];

/* Food family wins over generic hits: a "Chicken & Rice Adult Dog Food 3 kg" is Dry Food
   even though "chicken" could hint at treats; food words score after the others. */
function scoreCats(title, type, tags) {
  const t = ` ${title.toLowerCase()} `;
  const scores = new Map();
  const add = (c, w) => scores.set(c, (scores.get(c) || 0) + w);

  for (const [cat, w, re] of CAT_RULES) {
    const m = t.match(re);
    if (m) add(cat, w + Math.min(m.length, 3));
  }
  const meta = `${type || ''} ${tags || ''}`;
  for (const [cat, re] of TYPE_HINTS) if (re.test(meta)) add(cat, 6);

  /* Disambiguation: "food" words plus a pack size in kg lean dry; ml/g pouch lean wet. */
  if (/\b(food|diet)\b/.test(t)) {
    if (/\b\d+(\.\d+)?\s*kg\b/.test(t)) add('Dry Food', 3);
    if (/\b\d+\s*(g|gm|gms)\b/.test(t) && !/\bkibble|dry\b/.test(t)) add('Wet Food', 2);
  }
  /* a treat product often mentions "chicken" etc; if it says treat, drop food hits */
  if (/\btreats?\b|\bchews?\b|\bjerky\b/.test(t)) { scores.delete('Dry Food'); scores.delete('Wet Food'); }
  /* dental chews are treats; dental kits are grooming */
  if (/\bdental\b/.test(t) && /\b(kit|toothbrush|toothpaste)\b/.test(t)) scores.delete('Treats & Chews');
  /* a therapeutic diet is still food */
  if (scores.has('Pharmacy') && /\b(food|kibble)\b/.test(t)) scores.set('Pharmacy', scores.get('Pharmacy') - 8);
  /* supplements are wellness unless the product is plainly a drug form */
  if (scores.has('Pharmacy') && scores.has('Health & Wellness') && !/\b(supplement|probiotic|omega|multivitamin|vitamin)\b/.test(t)) scores.set('Health & Wellness', scores.get('Health & Wellness') - 4);
  /* "spray" on a tick product is pharmacy, not grooming */
  if (scores.has('Pharmacy') && scores.has('Grooming')) scores.set('Grooming', scores.get('Grooming') - 4);
  /* toys that are shaped like bones should stay toys */
  if (scores.has('Toys') && /\btoy\b/.test(t)) scores.delete('Treats & Chews');
  return scores;
}

export function classifyCategory({ title, type, tags }) {
  const scores = scoreCats(title || '', type, tags);
  let best = 'Other', bestScore = 0;
  for (const [c, s] of scores) if (s > bestScore) { best = c; bestScore = s; }
  return best;
}

export function classifyPet({ title, type, tags }) {
  const t = ` ${(title || '')} ${(type || '')} ${(tags || '')} `.toLowerCase();
  const dog = /\b(dogs?|puppy|puppies|canine|pup\b|pups\b|breed)\b/.test(t);
  const cat = /\b(cats?|kitten|kittens|feline|kitty|litter)\b/.test(t);
  const small = /\b(rabbits?|guinea ?pigs?|hamsters?|birds?|parrots?|budgies?|aquarium|fish (food|tank|flakes?)|turtles?|tortoises?|cockatiels?|small (pets?|animals?)|gerbils?|chinchillas?)\b/.test(t);
  const human = /\b(pet parents?|for humans?|mug\b|tote\b|keychain|t-shirt for (men|women)|hoodie for (men|women))\b/.test(t);
  if (small && !dog && !cat) return 'Small Pets';
  if (human && !dog && !cat) return 'Pet Parent';
  if (dog && cat) return 'Dog & Cat';
  if (dog) return 'Dog';
  if (cat) return 'Cat';
  if (/\b(pets?)\b/.test(t)) return 'Dog & Cat';
  return 'Other';
}
