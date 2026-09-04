/**
 * Fee and promotion rules, per seller, with provenance.
 *
 * Every rule carries `source` and `asOf` so staleness is visible. A seller with
 * no verified data is `null` on purpose: null yields "Price may vary at
 * checkout", which is true, whereas a guess yields a number someone might act
 * on and also lets any seller win the ranking by not publishing its fees.
 */

const RULES = {
  'Supertails': {
    known: true,
    asOf: 'February 2026',
    source: 'supertails.com/pages/supertails-shipping-delivery-policy',
    taxIncluded: true,          // Indian MRP-based retail quotes tax-inclusive
    handling: 0,                // the policy states no handling or processing fees
    /* Two thresholds because the site states two. The policy page, dated
       February 2026, says free above 699. shipment-details, track-your-order
       and return-details all say 599. Rather than pick one and present a
       false precision, both are carried: between 599 and 699 the shipping is
       genuinely uncertain and the quote widens to a range. */
    freeAbove: [599, 699],
    flat: 49,
    caveats: [
      'Free-shipping threshold is stated as \u20b9699 on the shipping policy page and \u20b9599 on three other pages of the same site, so between those figures the total is a range.',
      'The \u20b949 fee is stated for the 30-60 minute and same-day tiers. The standard national tier publishes no fee, so addresses outside those cities may differ.',
    ],
    offers: [{
      code: 'SWAG13', pct: 13, cap: 300, minSubtotal: 1800,
      label: '13% off, capped at \u20b9300',
      requires: 'New users, app orders only',
      conditional: true,        // never in the headline, never in the ranking
      source: 'Site-wide banner, supertails.com',
      note: 'The FAQ page states a \u20b91,499 minimum for what appears to be the same offer; the banner says \u20b91,800. The higher figure is used.',
    }],
  },

  /* The other five publish nothing this file has verified. Null is deliberate.
     A null yields "Price may vary at checkout", which is true. A guess yields
     a number someone might drive to a checkout and be wrong about, and would
     also let any seller win the ranking by simply not publishing its fees. */
  'Heads Up For Tails': null,
  'Pets Lifestyle': null,
  'Pawsindia': null,
  'Petsworld': null,
  'Zigly': null,
};

/* Shipping as an interval, so conflicting published thresholds widen the
   answer instead of silently resolving to whichever was read last. */

export { RULES };
