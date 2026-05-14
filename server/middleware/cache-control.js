/**
 * Cache-Control header middleware (issue #255, perf).
 *
 * Two factories — one for read-only / slowly-changing data that's safe to
 * cache in the browser for a short TTL, the other for endpoints that vary
 * per user or mutate frequently and must always revalidate.
 *
 * Usage:
 *   import { cacheControl, noCache } from '../middleware/cache-control.js';
 *   app.use('/api/rules/aggregate', requireAuth, requireRole('st'),
 *           cacheControl(300), rulesAggregateRouter);
 *   app.use('/api/characters', requireAuth, noCache(), charactersRouter);
 *
 * Default TTL: 300s (5 minutes). Chosen as a safe in-session window —
 * absorbs repeats from page reloads and multi-tab use without surfacing
 * meaningfully stale data for the targeted endpoints (rule docs and
 * territory list, both of which change rarely and via ST writes that
 * the writer themselves immediately re-fetches).
 *
 * `private` directive ensures shared caches (CDNs, proxies) don't cache
 * across users. Combined with `Vary: Authorization` so a browser that
 * sees the same URL with a different bearer token treats it as a
 * different cache key.
 */

const DEFAULT_TTL_SECONDS = 300;

/**
 * Mark a route as cacheable in the browser for up to `maxAgeSeconds`.
 * @param {number} [maxAgeSeconds=300] TTL in seconds.
 */
export function cacheControl(maxAgeSeconds = DEFAULT_TTL_SECONDS) {
  return (req, res, next) => {
    res.setHeader('Cache-Control', `private, max-age=${maxAgeSeconds}`);
    // Authorization-bearing requests must vary on it — a cached response
    // for user A must not be served to user B even if the URL matches.
    res.setHeader('Vary', 'Authorization');
    next();
  };
}

/**
 * Mark a route as never-cached. Used for endpoints that vary per user
 * (e.g. /api/characters: mine=1 vs ST sees all) or mutate frequently
 * (downtime submissions, cycles).
 */
export function noCache() {
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
  };
}
