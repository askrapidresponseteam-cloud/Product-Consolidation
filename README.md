# The Shelf

Six-store pet catalogue with live prices. Everything that reads the stores,
parses pack sizes, matches products across stores and ranks results runs on
the server. The browser gets only what it needs to draw.

## Run it

Node 18 or newer. No install, no dependencies.

```bash
cp .env.example .env          # edit if needed
node tools/probe.mjs          # says which stores answer from this network
node server/index.mjs         # http://localhost:8080
```

Or `docker build -t shelf . && docker run -p 8080:8080 -v shelf-data:/data shelf`.

On first start the page comes up immediately and the status pill in the top
bar shows "Reading stores…" while the crawl runs. A full first crawl of all six
stores takes roughly 10–25 minutes because every collection and every sitemap
entry is checked, not just the flat feed. After that, stores are re-crawled
every `REFRESH_MINUTES` (default 20) and the UI redraws itself when a new
crawl lands.

## How "live" works

| Layer | Source | Freshness |
|---|---|---|
| Cards currently on screen | Re-read from the store in the background while they are visible; the card updates itself and flashes when a price or stock changes | live, each product at most once per `LIVE_DETAIL_TTL_SEC` (default 60 s) |
| Product drawer | Re-read from the store the moment it opens | live |
| Everything else (filters, sort, comparison, cards not on screen) | Server index, rebuilt after every crawl | ≤ `REFRESH_MINUTES` |

The on-screen re-check is what makes the site feel live without hammering the
stores: the server only ever re-reads products somebody is looking at, one
store at a time with `PAUSE_MS` between requests, and pushes changes to every
open tab over a server-sent-events channel (`/api/live`). A visitor's tab
reports the ids on screen to `/api/watch` as they scroll; nothing is re-checked
once they scroll past. `/api/admin/status` shows how many tabs are open and
how many products are being watched.

Nothing is hardcoded. If a store doesn't answer, its products stay at their
last live read and the store is marked `stale`; if it has never answered it
simply isn't in the catalogue. `DISK_CACHE` keeps the last live crawl on disk
so a restart serves data while the fresh crawl runs; set it to `false` to
always start empty.

## Completeness

For each store the crawler unions three sources: the flat `/products.json`
feed, every collection's feed, and the product sitemap, individually fetching
any handle the feeds didn't return. The per-store `stats` in
`/api/admin/status` show feed count, collection additions, sitemap size and
how many products were backfilled, so you can see it's complete.

## Layout

```
server/
  index.mjs          HTTP server: static files + JSON API, origin/rate/path guards
  config.mjs         all knobs (env vars); store list
  lib/shopify.mjs    live crawler (feed + collections + sitemap backfill)
  lib/catalog.mjs    crawl scheduling, index, queries, render-only DTOs
  lib/live.mjs       on-screen re-check workers + push channel
  lib/normalize.mjs  raw store product -> internal record
  lib/pack.mjs       pack size / unit price parsing
  lib/match.mjs      cross-store matching
  lib/classify.mjs   category and pet inference
public/
  index.html         3 KB shell, no data, no inline scripts
  app.js             draws API responses; no catalogue logic
  style.css
tools/
  probe.mjs          check store reachability
  mock-store.mjs     fake Shopify store for local dev (see `npm run mock`)
test/                node --test
```

## API (same-origin only)

- `GET /api/meta` — store status, product count, last build time
- `GET /api/products?q=&store=&pet=&cat=&brand=&min=&max=&disc=&stock=1&both=1&sort=&page=` — 48 per page, plus facet counts
- `GET /api/products/:id` — detail, re-read live from the store
- `GET /api/live` (SSE) + `POST /api/watch {token, ids}` — on-screen re-check channel
- `POST /api/admin/refresh`, `GET /api/admin/status` — need `X-Admin-Token` (set `ADMIN_TOKEN`)

Requests from other origins get 403; each IP gets `RATE_LIMIT_PER_MINUTE`.
Only display values are returned (a price, a label, a verdict string), not the
rules that produced them. The static files contain no product data.

## Local development without hitting the real stores

```bash
node tools/mock-store.mjs 9100 tools/sample-store.json --drift &
STORE_OVERRIDES=petsworld=localhost:9100 REFRESH_MINUTES=1 node server/index.mjs
```

`--drift` nudges prices on every read so you can watch the drawer show a live
price that differs from the grid.

## Running behind a proxy

Set `TRUST_PROXY=true` so rate limiting sees real client IPs, and terminate
TLS at the proxy. If the UI is served from a different host than the API, add
that origin to `ALLOWED_ORIGINS`.
