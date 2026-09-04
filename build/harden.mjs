/**
 * Produces dist/index.min.html from the release build: comments stripped,
 * locals mangled, CSS and markup compressed.
 *
 * The point is not the byte saving. The comments in this codebase describe the
 * matching method, the ranking formula and per-store data quirks by name, and
 * that is the part worth removing before the file leaves the building. The
 * catalogue blob itself cannot be hidden - the page renders it - so this
 * raises the cost of reading the logic and does nothing for the data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify as terser } from 'terser';
import CleanCSS from 'clean-css';
import { minify as htmlmin } from 'html-minifier-terser';

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

const src = r('dist/index.release.html');
if (!fs.existsSync(src)) {
  console.error('Run `node build/compose.mjs --no-debug` first.');
  process.exit(1);
}
const html = fs.readFileSync(src, 'utf8');

/* Globals the static markup calls by name via on*= attributes. The bundle
   assigns these onto window explicitly, so mangling internals is safe, but the
   property names themselves must survive. */
const PINNED = ['apply', 'debApply', 'resetAll', 'clearSearch', 'togg', 'toggleSidebar',
  'drawFilters', 'openP', 'closeAll', 'openCompare', 'closeCompare', 'togglePick',
  'unpick', 'clearPicks', 'S', 'catsOpen', 'brandQuery'];

const sOpen = html.indexOf('<script>');
const sClose = html.indexOf('</script>', sOpen);
const head = html.slice(0, sOpen);
const tail = html.slice(sClose + '</script>'.length);
const script = html.slice(sOpen + '<script>'.length, sClose);

/* The data blob is one enormous literal; splitting it off keeps terser fast
   and means a parser change can never rewrite the catalogue. */
const nl = script.indexOf('\n', script.indexOf('const DATA ='));
const dataLine = script.slice(0, nl).trim();
const appCode = script.slice(nl + 1);

const cssOpen = head.indexOf('<style>') + '<style>'.length;
const cssClose = head.indexOf('</style>');
const cssMin = new CleanCSS({ level: 2 }).minify(head.slice(cssOpen, cssClose)).styles;
const headMin = head.slice(0, cssOpen) + cssMin + head.slice(cssClose);

const out = await terser(appCode, {
  ecma: 2020,
  compress: { passes: 2, drop_console: true, drop_debugger: true },
  mangle: { reserved: PINNED, properties: false },
  format: { comments: false },
});
if (out.error) throw out.error;

const opts = { collapseWhitespace: true, removeComments: true, minifyJS: false,
               minifyCSS: false, removeAttributeQuotes: false, keepClosingSlash: true };
const shell = await htmlmin(headMin + '</SPLIT>', opts);
const foot = await htmlmin('<SPLIT>' + tail, opts);

const final = shell.replace('</SPLIT>', '')
  + '<script>\n' + dataLine + '\n' + out.code + '\n</script>'
  + foot.replace('<SPLIT>', '');

fs.writeFileSync(r('dist/index.min.html'), final);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const leaks = ['Shopify', 'multiplier', 'Zigly writes', 'colourway is a different SKU'];
const found = leaks.filter((t) => out.code.includes(t));

console.log(`app   ${kb(appCode.length)} -> ${kb(out.code.length)}`);
console.log(`css   ${kb(head.slice(cssOpen, cssClose).length)} -> ${kb(cssMin.length)}`);
console.log(`dist/index.min.html  ${kb(final.length)}`);
console.log(`comments in logic    ${(out.code.match(/\/\*/g) || []).length}`);
console.log(`descriptive leaks    ${found.length ? found.join(', ') : 'none'}`);
