/**
 * Produces a deploy directory containing exactly one file: the hardened build,
 * served as index.html.
 *
 * This exists because `dist/` normally holds three artifacts - the debug build
 * with a window.P test hook, the release build, and the hardened one - and
 * publishing that directory wholesale would put the debug hook and every
 * comment on the public internet. The deploy step rebuilds from scratch and
 * emits only what should be reachable.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Locate the repo root by walking up for package.json, rather than assuming
   this file sits exactly one directory below it. A hand-placed script in the
   wrong folder should not resolve to the wrong root and then fail somewhere
   confusing. */
function repoRoot(from) {
  let d = path.dirname(fileURLToPath(from));
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    d = path.dirname(d);
  }
  throw new Error('Could not find package.json above ' + fileURLToPath(from));
}
const root = repoRoot(import.meta.url);
const r = (...p) => path.join(root, ...p);
const run = (args) => execFileSync('node', args, { cwd: root, stdio: 'inherit' });

if (!fs.existsSync(r('data/data.json'))) {
  console.error('\ndata/data.json is missing.');
  console.error('It is the catalogue and the build cannot run without it.');
  console.error('Commit it, or set CATALOGUE_URL and fetch it in a prebuild step.\n');
  process.exit(1);
}

fs.rmSync(r('dist'), { recursive: true, force: true });
run([r('build/compose.mjs'), '--no-debug']);
run([r('build/harden.mjs')]);

/* Keep only the hardened artifact, named so Vercel serves it at "/". */
const hardened = fs.readFileSync(r('dist/index.min.html'));
fs.rmSync(r('dist'), { recursive: true, force: true });
fs.mkdirSync(r('dist'), { recursive: true });
fs.writeFileSync(r('dist/index.html'), hardened);

/* A deploy that quietly ships the debug hook is the failure this guards
   against, so it is checked rather than assumed. */
const text = hardened.toString();
const script = text.slice(text.indexOf('<script>'));
const leaked = ['P,MATCH,sellers', 'P, MATCH, sellers', 'rankQuotes,facet', 'Zigly writes'];
const found = leaked.filter((t) => script.includes(t));
if (found.length) {
  console.error(`\nRefusing to deploy: debug surface present (${found.join(', ')}).`);
  process.exit(1);
}

const kb = (fs.statSync(r('dist/index.html')).size / 1024).toFixed(0);
console.log(`\ndist/index.html  ${kb} KB  (hardened, no test hook, no comments)`);
console.log('dist contains:', fs.readdirSync(r('dist')).join(', '));
