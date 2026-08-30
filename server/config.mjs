/**
 * Server configuration. Everything here stays on the server.
 * Override any value with an environment variable (see .env.example).
 */
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const num = (k, d) => Number(env(k, d));
const bool = (k, d) => String(env(k, d)).toLowerCase() === 'true' || env(k, d) === '1';

export const STORES = [
  { key: 'huft',          label: 'Heads Up For Tails', domain: 'headsupfortails.com' },
  { key: 'supertails',    label: 'Supertails',         domain: 'supertails.com' },
  { key: 'petslifestyle', label: 'Pets Lifestyle',     domain: 'www.pets-lifestyle.com' },
  { key: 'pawsindia',     label: 'Pawsindia',          domain: 'pawsindia.com' },
  { key: 'petsworld',     label: 'Petsworld',          domain: 'petsworld.in' },
  { key: 'zigly',         label: 'Zigly',              domain: 'zigly.com' },
];

/* A comma-separated STORE_OVERRIDES lets you point a key at a different host,
   e.g. for a staging mirror: STORE_OVERRIDES="zigly=localhost:9999,huft=localhost:9998"
   (http:// is used for localhost hosts). */
for (const pair of env('STORE_OVERRIDES', '').split(',').filter(Boolean)) {
  const [key, domain] = pair.split('=');
  const s = STORES.find((x) => x.key === key.trim());
  if (s && domain) s.domain = domain.trim();
}

export const CONFIG = {
  port: num('PORT', 8080),
  host: env('HOST', '0.0.0.0'),
  publicDir: env('PUBLIC_DIR', new URL('../public/', import.meta.url).pathname),
  dataDir: env('DATA_DIR', new URL('../data/', import.meta.url).pathname),

  /* Crawl cadence. Every store is re-walked this often; the whole catalogue
     (feed + collections + sitemap backfill) is rebuilt from what comes back. */
  refreshMinutes: num('REFRESH_MINUTES', 20),
  /* Pause between page requests to one store; raise if a store rate-limits. */
  pauseMs: num('PAUSE_MS', 400),
  maxPages: num('MAX_PAGES', 400),
  /* Walk every collection for stores that publish no product sitemap. */
  deep: bool('DEEP', true),
  /* Fetch any product only the sitemap knows about. Slow on first run, but it
     is the only way to guarantee nothing is missing. */
  sitemapBackfill: bool('SITEMAP_BACKFILL', true),
  /* Stores crawled in parallel (each store is still walked sequentially). */
  concurrency: num('CRAWL_CONCURRENCY', 3),
  userAgent: env('USER_AGENT', 'TheShelf/3.0 (+catalogue reader)'),

  /* When a product is opened, its variants are re-read from the store right
     then, so the drawer never shows a stale price. This caps how often. */
  liveDetailTtlSec: num('LIVE_DETAIL_TTL_SEC', 60),

  /* Persist the last crawl to disk so a restart serves data immediately while
     the fresh crawl runs. This is a cache of live data, not a hardcoded list;
     set to false to always start empty. */
  diskCache: bool('DISK_CACHE', true),

  /* Access control for the JSON API. Requests must come from the site itself
     (same-origin) unless ALLOWED_ORIGINS lists more. Rate limits are per IP. */
  allowedOrigins: env('ALLOWED_ORIGINS', '').split(',').map((s) => s.trim()).filter(Boolean),
  rateLimitPerMinute: num('RATE_LIMIT_PER_MINUTE', 240),
  /* Optional admin token for /api/admin/* (refresh, status). Empty = disabled. */
  adminToken: env('ADMIN_TOKEN', ''),
  /* Trust X-Forwarded-For (set true behind a reverse proxy). */
  trustProxy: bool('TRUST_PROXY', false),
};
