#!/usr/bin/env node
/**
 * A tiny fake Shopify storefront for local development and tests.
 * Serves /products.json, /collections.json, /collections/<h>/products.json,
 * /sitemap.xml and /products/<handle>.json from a JSON file of Shopify-shaped
 * products. Prices drift slightly on every read so "live" changes are visible.
 *
 *   node tools/mock-store.mjs <port> <products.json> [--drift]
 */
import http from 'node:http';
import fs from 'node:fs';
const [port, file, ...flags] = process.argv.slice(2);
const drift = flags.includes('--drift');
const products = JSON.parse(fs.readFileSync(file, 'utf8'));
const byHandle = new Map(products.map((p) => [p.handle, p]));
const cols = [{ handle: 'all', products_count: products.length }, { handle: 'hidden-extra', products_count: 3 }];
const withDrift = (p) => !drift ? p : { ...p, variants: p.variants.map((v) => ({ ...v, price: String(Math.round(Number(v.price) * (0.97 + Math.random() * 0.06))), available: Math.random() > 0.15 })) };
const page = (list, url) => { const lim = +url.searchParams.get('limit') || 30, pg = +url.searchParams.get('page') || 1; return list.slice((pg - 1) * lim, pg * lim).map(withDrift); };
http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const j = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.pathname === '/products.json') return j({ products: page(products.slice(0, Math.max(1, products.length - 3)), url) });  /* feed hides the last 3 */
  if (url.pathname === '/collections.json') return j({ collections: (+url.searchParams.get('page') || 1) === 1 ? cols : [] });
  if (url.pathname === '/collections/all/products.json') return j({ products: page(products.slice(0, Math.max(1, products.length - 3)), url) });
  if (url.pathname === '/collections/hidden-extra/products.json') return j({ products: page(products.slice(-3, -1), url) }); /* one still only in the sitemap */
  if (url.pathname === '/sitemap.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); return res.end(`<sitemapindex><sitemap><loc>http://localhost:${port}/sitemap_products_1.xml</loc></sitemap></sitemapindex>`); }
  if (url.pathname === '/sitemap_products_1.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); return res.end(`<urlset>${products.map((p) => `<url><loc>http://localhost:${port}/products/${p.handle}</loc></url>`).join('')}</urlset>`); }
  const m = /^\/products\/(.+)\.json$/.exec(url.pathname);
  if (m) { const p = byHandle.get(decodeURIComponent(m[1])); return p ? j({ product: withDrift(p) }) : (res.writeHead(404), res.end()); }
  res.writeHead(404); res.end();
}).listen(+port, () => console.log(`mock store on :${port} with ${products.length} products`));
