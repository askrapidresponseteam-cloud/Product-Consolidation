/**
 * Runs every jsdom suite against the composed build and, where the suite does
 * not need the test hook, against the hardened build too.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const NEEDS_HOOK = new Set(['drawer', 'filters', 'engine-test']);
const SUITES = ['suite', 'multi', 'drawer', 'filters', 'engine-test', 'badgecheck', 'guards'];
const targets = ['dist/index.html'];
if (fs.existsSync('dist/index.min.html')) targets.push('dist/index.min.html');

let failed = 0;
for (const t of targets) {
  const hardened = t.includes('.min.');
  console.log(`\n=== ${t} ===`);
  for (const s of SUITES) {
    if (hardened && NEEDS_HOOK.has(s)) { console.log(`  ${s.padEnd(12)} skipped (needs the debug hook)`); continue; }
    try {
      const out = execFileSync('node', ['--max-old-space-size=4096', `e2e/${s}.mjs`, t],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const bad = /ERR |ReferenceError|TypeError|<-- BUG|OVERLAP/.test(out);
      console.log(`  ${s.padEnd(12)} ${bad ? 'FAIL' : 'ok'}`);
      if (bad) { failed++; console.log(out.split('\n').filter((l) => /ERR|BUG|OVERLAP/.test(l)).join('\n')); }
    } catch (e) {
      failed++; console.log(`  ${s.padEnd(12)} ERROR\n${String(e.stdout || e.message).slice(0, 300)}`);
    }
  }
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nall suites ok');
process.exit(failed ? 1 : 0);
