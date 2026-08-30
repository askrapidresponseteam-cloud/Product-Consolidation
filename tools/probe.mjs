#!/usr/bin/env node
/** Says what each configured store answers with, from this machine's network. Fetches nothing else. */
import { STORES } from '../server/config.mjs';
import { probe } from '../server/lib/shopify.mjs';
for (const s of STORES) {
  const r = await probe(s);
  console.log(`${s.label.padEnd(20)} ${r.ok ? `ok  ${r.base}${r.path}` : `FAIL  ${r.why}\n  tried: ${r.tried.join(', ')}`}`);
}
