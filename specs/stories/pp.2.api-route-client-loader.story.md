# Story PP.2: API Route and Client Loader

## Status: Approved

## Story

**As a** frontend developer,
**I want** an API endpoint serving the purchasable powers collection and a client-side loader with localStorage caching,
**so that** all apps can access rules data without hardcoded JS imports.

## Acceptance Criteria

1. `GET /api/rules` returns the full `purchasable_powers` collection sorted by category + name
2. `GET /api/rules?category=merit` returns only merits
3. `GET /api/rules/:key` returns a single power by slug key
4. Client-side `loadRules()` fetches on startup, caches to localStorage key `tm_rules_db`
5. Client falls back to localStorage cache if API is unreachable
6. `getRulesDB()` accessor returns the cached data synchronously after initial load
7. Any authenticated user can read rules (no role restriction on GET)
8. `POST /api/rules` and `PUT /api/rules/:key` are ST-only with schema validation

## Tasks / Subtasks

- [ ] Task 1: Create API route (AC: 1, 2, 3, 7, 8)
  - [ ] Create `server/routes/rules.js`
  - [ ] `GET /` — query `purchasable_powers` collection, sort by `category` then `name`, return array
  - [ ] `GET /` with `?category=X` — add filter `{ category: req.query.category }` to query
  - [ ] `GET /:key` — find one by `{ key: req.params.key }`, return 404 if not found
  - [ ] `PUT /:key` — ST only (`requireRole('st')`), update by key, return updated doc
  - [ ] `POST /` — ST only, validate with `purchasablePowerSchema`, insert new power
  - [ ] Wire into `server/index.js`: `app.use('/api/rules', requireAuth, rulesRouter)`

- [ ] Task 2: Create client loader (AC: 4, 5, 6)
  - [ ] In `public/js/data/loader.js`, add `loadRulesFromApi()` following the `loadCharsFromApi()` pattern
  - [ ] Fetch from `/api/rules`, cache to localStorage key `tm_rules_db`
  - [ ] On API failure, fall back to localStorage cache
  - [ ] Export `getRulesDB()` that returns the cached array (or null if not loaded)
  - [ ] Export `getRuleByKey(key)` helper for single lookups
  - [ ] Export `getRulesByCategory(category)` helper for filtered access

- [ ] Task 3: Wire loader into app startup (AC: 4)
  - [ ] In `public/js/app.js` `loadAllData()`, call `loadRulesFromApi()` alongside character loading
  - [ ] In `public/js/player.js` `loadCharacters()`, call `loadRulesFromApi()` before rendering
  - [ ] In `public/js/admin.js` `init()`, call `loadRulesFromApi()` before rendering

## Dev Notes

### API route pattern
Follow existing route pattern from `server/routes/characters.js` — Router, parseId, getCollection, requireRole middleware.
[Source: server/routes/characters.js]

### Middleware wiring
Add to `server/index.js` alongside existing route registrations. Use `requireAuth` (not `requireRole`) for GET access.
[Source: server/index.js, line ~60-70 for route registration pattern]

### Client loader pattern
`loadCharsFromApi()` in `data/loader.js` is the exact pattern to follow — try API, cache to localStorage, fall back to cache on failure.
[Source: public/js/data/loader.js]

### localStorage key
Use `tm_rules_db` — follows the `tm_chars_db` naming convention.

### Testing

- Verify `GET /api/rules` returns all ~620 entries sorted
- Verify `?category=merit` filter returns only merits (~189)
- Verify `GET /api/rules/lay-open-the-mind` returns single document
- Verify 404 for nonexistent key
- Verify PUT requires ST role (403 for player)
- Client: verify localStorage populated after first load
- Client: verify fallback works when API unreachable (disconnect network, reload)

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-07 | 1.0 | Initial draft | Bob (SM) |

## Dev Agent Record

### Agent Model Used
_TBD_

### Debug Log References
_TBD_

### Completion Notes List
_TBD_

### File List
_TBD_

## QA Results
_Pending implementation_
