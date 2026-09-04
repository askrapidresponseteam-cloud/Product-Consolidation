/**
 * Composes dist/index.html from parts: template + styles + data + bundled app.
 *
 * This exists because the previous workflow was to edit a 5.8MB single file
 * with regex string replacement, which is how a checkbox ended up rendered on
 * top of a discount badge and survived six test suites. Composing from sources
 * means the sources are the truth and the artifact is disposable.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = new URL('..', import.meta.url).pathname;
const r = (...p) => path.join(root, ...p);

const template = fs.readFileSync(r('src/app/index.template.html'), 'utf8');
const styles = fs.readFileSync(r('src/app/styles.css'), 'utf8');

const dataPath = r('data/data.json');
if (!fs.existsSync(dataPath)) {
  console.error('data/data.json is missing. It is the catalogue blob and is not in the repo.');
  process.exit(1);
}
const data = fs.readFileSync(dataPath, 'utf8').trim();

/* IIFE, not ESM: the artifact is a single file opened over file://, where
   module scripts are blocked by CORS. */
/* Debug build keeps the test hook; the shipped build has it eliminated. */
const debug = !process.argv.includes('--no-debug');

const built = await esbuild.build({
  entryPoints: [r('src/app/portal.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
  define: { __DEBUG__: String(debug) },
  /* folds away 'if (false) { ... }' so the hook really leaves the artifact */
  minifySyntax: !debug,
  logLevel: 'warning',
});
const app = built.outputFiles[0].text;

const out = template
  .replace('/* @STYLES */', styles)
  .replace('/* @DATA */', `const DATA = ${data};`)
  .replace('/* @APP */', app);

fs.mkdirSync(r('dist'), { recursive: true });
const outFile = debug ? 'dist/index.html' : 'dist/index.release.html';
fs.writeFileSync(r(outFile), out);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`app bundle  ${kb(app.length)}`);
console.log(`styles      ${kb(styles.length)}`);
console.log(`data        ${kb(data.length)}`);
console.log(`${outFile}  ${kb(out.length)}  (test hook: ${debug ? 'present' : 'eliminated'})`);
