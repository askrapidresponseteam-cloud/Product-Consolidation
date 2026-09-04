/** Money and text formatting. Indian digit grouping throughout. */

const inr = (n) => '\u20b9' + Math.round(n).toLocaleString('en-IN');

/* Unit prices go below 1 rupee often enough that rounding them to zero is
   wrong; keep a decimal or two only where it carries information. */
const inrp = (n) => (n < 10
  ? '\u20b9' + n.toFixed(n < 1 ? 2 : 1)
  : '\u20b9' + Math.round(n).toLocaleString('en-IN'));

const esc = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const tokens = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);

const money = (n) => inr(Math.round(n));

/* A single figure when the bounds agree, a range when they do not. Conflicting
   published fee thresholds are why this exists. */
const band = (lo, hi) => (Math.round(lo) === Math.round(hi)
  ? money(lo)
  : `${money(lo)}\u2013${money(hi)}`);

export { inr, inrp, esc, tokens, money, band };
