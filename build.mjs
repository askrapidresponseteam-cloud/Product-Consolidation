/* Minifies the portal.
 *
 * Three constraints shape this, and getting any of them wrong looks fine at
 * build time and breaks in the browser:
 *
 * 1. The markup drives the app through inline handlers - onclick="openP(3)",
 *    oninput="S.min=numOrNull(this.value)". Those resolve names against the
 *    global scope at click time, so if the minifier renames a top-level binding
 *    the handler calls something that no longer exists. Top-level mangling is
 *    therefore off, and `compress.toplevel` stays off too or functions only ever
 *    named from an HTML attribute get dropped as dead code.
 * 2. DATA is 5.7 MB of JSON on one line and is already as small as it gets.
 *    It is held out of the JS parser rather than pushed through it.
 * 3. CSS is squeezed at level 1 only. Level 2 merges and reorders rules, which
 *    can move a declaration across a media query boundary; there is no visual
 *    regression suite here to catch that, so it is not worth the few hundred
 *    bytes.
 */
import fs from 'node:fs';
import { minify as minifyJS } from 'terser';
import { minify as minifyHTML } from 'html-minifier-terser';
import CleanCSS from 'clean-css';

const SRC = 'index.src.html';
const OUT = 'index.html';
const src = fs.readFileSync(SRC, 'utf8');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

/* ---- carve the file into its four parts ---- */
const styleA = src.indexOf('<style>') + '<style>'.length;
const styleB = src.indexOf('</style>');
const scriptA = src.indexOf('<script>', styleB) + '<script>'.length;
const scriptB = src.lastIndexOf('</script>');

const css = src.slice(styleA, styleB);
const script = src.slice(scriptA, scriptB);

/* DATA is the first statement; everything after it is the app. */
const dataEnd = script.indexOf('\n', script.indexOf('const DATA = {'));
const data = script.slice(0, dataEnd).trim();
const app = script.slice(dataEnd);

if (!/^const DATA = \{.*\};$/s.test(data)) throw new Error('DATA statement not where expected');
console.log(`  parts: css ${kb(css.length)}, data ${kb(data.length)}, app ${kb(app.length)}`);

/* ---- css ---- */
const cssOut = new CleanCSS({ level: 1, format: false }).minify(css);
if (cssOut.errors.length) throw new Error('css: ' + cssOut.errors.join('; '));
for (const w of cssOut.warnings) console.log('  css warning:', w);

/* ---- app js ---- */
const jsOut = await minifyJS(app, {
  compress: { toplevel: false, drop_console: false },
  mangle: { toplevel: false },     // inline handlers call these names verbatim
  format: { comments: false },
});
if (jsOut.error) throw jsOut.error;

/* Names the markup calls but the JS never references. If compress ever starts
   dropping these the page loads clean and every button is dead, so assert. */
const FROM_HTML = ['openP', 'togg', 'toggleSidebar', 'numOrNull', 'resetAll',
                   'closeAll', 'drawFilters', 'apply', 'debApply', 'catsOpen', 'brandQuery'];
const missing = FROM_HTML.filter((n) => !new RegExp(`\\b${n}\\b`).test(jsOut.code));
if (missing.length) throw new Error('minifier removed names the markup calls: ' + missing.join(', '));

/* ---- markup ---- */
const shell = src.slice(0, styleA) + '\u0000CSS\u0000' + src.slice(styleB, scriptA) + '\u0000JS\u0000' + src.slice(scriptB);
const htmlOut = await minifyHTML(shell, {
  collapseWhitespace: true,
  conservativeCollapse: false,
  removeComments: true,
  removeRedundantAttributes: false,   // type="search" is load-bearing here
  removeAttributeQuotes: false,       // attribute values carry escaped data
  minifyJS: false,                    // handled above, and DATA must not be parsed
  minifyCSS: false,
  keepClosingSlash: true,
});

const out = htmlOut
  .replace('\u0000CSS\u0000', cssOut.styles)
  .replace('\u0000JS\u0000', data + '\n' + jsOut.code);

fs.writeFileSync(OUT, out);

/* ---- report ---- */
const orig = fs.statSync('index.orig.html').size;
const fixed = fs.statSync(SRC).size;
const min = fs.statSync(OUT).size;
import zlib from 'node:zlib';
const gzip = (f) => zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length;
const br = (f) => zlib.brotliCompressSync(fs.readFileSync(f)).length;

console.log(`\n  css   ${kb(css.length).padStart(9)} -> ${kb(cssOut.styles.length).padStart(9)}`);
console.log(`  app   ${kb(app.length).padStart(9)} -> ${kb(jsOut.code.length).padStart(9)}`);
console.log(`  data  ${kb(data.length).padStart(9)} -> ${kb(data.length).padStart(9)}  (untouched)`);
console.log(`\n  original    ${kb(orig).padStart(10)}`);
console.log(`  fixed       ${kb(fixed).padStart(10)}`);
console.log(`  minified    ${kb(min).padStart(10)}   ${((1 - min / fixed) * 100).toFixed(1)}% off the fixed build`);
console.log(`\n  minified + gzip    ${kb(gzip(OUT)).padStart(10)}`);
console.log(`  minified + brotli  ${kb(br(OUT)).padStart(10)}`);
console.log(`  fixed + brotli     ${kb(br(SRC)).padStart(10)}   (i.e. what minifying is actually worth over the wire)`);
