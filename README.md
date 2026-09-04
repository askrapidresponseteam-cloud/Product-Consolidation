# The Shelf

Six-store pet catalogue: like-for-like product matching, an effective-price
engine, and faceted browse over 26,562 listings.

```bash
npm install
cp /path/to/data.json data/          # the catalogue blob, not in the repo
npm run verify                       # lint + unit tests + build + e2e + geometry
open dist/index.html
```

## Why this shape

The portal used to be one 5.8MB HTML file, edited by regex string replacement.
That is how a 25px checkbox ended up positioned exactly on top of the discount
badge — covering the "96%" and leaving the word "OFF" — and survived six test
suites, because headless tests cannot see one element painted over another.

So the decision logic now lives in modules with unit tests, and the artifact is
composed from sources rather than patched in place. `dist/` is disposable.

## Layout

| Path | What it holds |
|---|---|
| `src/matching/pack-size.js` | Parsing "how much is in this". Mass→kg, volume→L, multipacks at their **total**. |
| `src/matching/size-key.js` | Canonical pack key. Two variants may only be priced against each other when their keys match. |
| `src/matching/colour.js` | Colourway detection, to refuse cross-SKU price claims. |
| `src/matching/implausible.js` | Flags a price that contradicts the same store's larger pack. |
| `src/matching/gate.js` | **The like-for-like gate.** Every refusal reason in one place. |
| `src/matching/comparisons.js` | Builds the verified cross-store rows. |
| `src/pricing/rules.js` | Fee and promotion rules, per seller, with `source` and `asOf`. |
| `src/pricing/quote.js` | Interval quote + tier ladder for one variant. |
| `src/pricing/rank.js` | Proof-based ranking and headroom. |
| `src/facets/filter.js` | One-pass filtering with per-facet counts. |
| `src/format.js` | Money and text formatting. |
| `src/app/portal.js` | Render layer. The only file that touches the DOM. |

## The three invariants

**1. A comparison must be refused unless it can be shown sound.** Anything
unverifiable is dropped. A missing badge is a small loss; an invented 75% is a
lie the reader has no way to catch. Currently 191 of 6,108 aligned pairs are
refused: 119 different colourway, 60 unverifiable pack size, 12 self-
contradicting price.

**2. A promotion is never assumed.** Anything needing a code, a card, a first
order or a membership is priced as a separate labelled tier and kept out of the
headline *and* out of the ranking. The CTA quotes only what any visitor can pay
today.

**3. Cheapest is awarded on proof.** One store's worst case must beat every
other's best case. A seller publishing no fees gets an unbounded upper bound and
can never win — which is what makes the ranking hard to game. Where the leader's
fees are unknown, the headroom is reported instead ("cheaper unless its fees
exceed ₹1,314"), which stays true whatever the fees turn out to be.

## Data honesty

`src/pricing/rules.js` has verified data for **one seller of six**. The other
five are `null` on purpose: null yields "Price may vary at checkout", which is
true. A guess yields a number someone might drive to a checkout and be wrong
about. Adding a `RULES` entry makes that store rankable immediately.

Supertails' own site contradicts itself — the shipping policy page says free
above ₹699, while `shipment-details`, `track-your-order` and `return-details`
all say ₹599. Rather than pick one, both are carried and the quote **widens to a
range** between them. Getting that confirmed is the highest-value data fix
available.

## Verification

- `npm test` — 45 unit tests, including the adversarial pack-size cases.
- `test/parity.test.js` — replays the extracted modules over all 26,562 rows and
  pins the numbers the shipped build was verified against (5,917 accepted pairs,
  the exact refusal breakdown, 23 implausible variants, zero unsound pairs).
  This is what proves the extraction from the monolith changed nothing.
- `npm run e2e` — jsdom suites driving the real controls.
- `npm run check:collision` — computes badge/checkbox rectangles arithmetically
  at six card widths, because jsdom has no layout engine and eyeballing is what
  let the overlap through. Verified to fail against the broken positioning.

## Builds

| Command | Output | Test hook |
|---|---|---|
| `npm run build` | `dist/index.html` | present (`window.P` etc.) |
| `node build/compose.mjs --no-debug` | `dist/index.release.html` | eliminated |
| `npm run build:min` | `dist/index.min.html` | eliminated, comments stripped, locals mangled |

Minification exists to remove the comments, which describe the matching method
and ranking formula. **It does nothing for the data.** Anyone can `JSON.parse`
the blob and read all six sellers, 1,596 brands, 26,562 prices and the 2,084
cross-store match links. The method is hidden; its output is not. Hiding that
needs a server, which kills the single-file portability.

## Known gaps

- **`src/app/portal.js` is still one module.** The pure layer is decomposed and
  tested; the render layer is not. It is deliberately left whole rather than
  split without a way to verify the split cheaply.
- **Cart simulation is not implemented** and cannot live in a static file. The
  engine is shaped to accept it: replace the ruleset lookup in `quote()` with a
  cached simulation result and the ladder, intervals and ranking keep working.
- **Nothing here has been checked in a real browser.** Every test is headless,
  and headless testing is exactly what missed the badge overlap.
