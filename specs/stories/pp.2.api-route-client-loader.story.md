# Story PP.2: API Route and Client Loader

## Status: Ready for Review

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

- [x] Task 1: Create API route (AC: 1, 2, 3, 7, 8)
  - [ ] Create `server/routes/rules.js`
  - [ ] `GET /` — query `purchasable_powers` collection, sort by `category` then `name`, return array
  - [ ] `GET /` with `?category=X` — add filter `{ category: req.query.category }` to query
  - [ ] `GET /:key` — find one by `{ key: req.params.key }`, return 404 if not found
  - [ ] `PUT /:key` — ST only (`requireRole('st')`), update by key, return updated doc
  - [ ] `POST /` — ST only, validate with `purchasablePowerSchema`, insert new power
  - [ ] Wire into `server/index.js`: `app.use('/api/rules', requireAuth, rulesRouter)`

- [x] Task 2: Create client loader (AC: 4, 5, 6)
  - [ ] In `public/js/data/loader.js`, add `loadRulesFromApi()` following the `loadCharsFromApi()` pattern
  - [ ] Fetch from `/api/rules`, cache to localStorage key `tm_rules_db`
  - [ ] On API failure, fall back to localStorage cache
  - [ ] Export `getRulesDB()` that returns the cached array (or null if not loaded)
  - [ ] Export `getRuleByKey(key)` helper for single lookups
  - [ ] Export `getRulesByCategory(category)` helper for filtered access

- [x] Task 3: Wire loader into app startup (AC: 4)
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
Claude Opus 4.6

### Debug Log References
N/A — no runtime testing possible without MongoDB connection locally

### Completion Notes List
- API route at `/api/rules` with GET (all, ?category filter, :key), POST (ST, validated), PUT (ST, by key)
- Client loader follows exact `loadCharsFromApi` pattern — try API, cache localStorage, fallback
- `getRulesDB()` provides sync access after async load
- `getRuleByKey(key)` and `getRulesByCategory(cat)` helpers exported for consumer migration
- `invalidateRulesCache()` for ST edit flow (clear localStorage so next load fetches fresh)
- Rules loading is non-blocking (fire-and-forget with `.catch()`) to avoid slowing app startup
- Wired into all 3 entry points: app.js, player.js, admin.js

### File List
- `server/routes/rules.js` (created)
- `server/index.js` (modified — added rules route import and registration)
- `public/js/data/loader.js` (modified — added rules loader, getRulesDB, getRuleByKey, getRulesByCategory, invalidateRulesCache)
- `public/js/app.js` (modified — import loadRulesFromApi, call in loadAllData)
- `public/js/player.js` (modified — import and call loadRulesFromApi)
- `public/js/admin.js` (modified — import and call loadRulesFromApi)

## QA Results

### Review Date: 2026-04-07

### Reviewed By: Quinn (Test Architect)

**Scope:** Full story review — API route, client loader, app startup wiring.

#### AC Verification

| AC | Status | Notes |
|----|--------|-------|
| AC1: GET /api/rules returns full collection sorted | PASS | `.sort({ category: 1, name: 1 }).toArray()` |
| AC2: ?category=merit filter | PASS | Filter applied when query param present |
| AC3: GET /api/rules/:key returns single | PASS | `findOne({ key })`, 404 on miss |
| AC4: loadRulesFromApi() fetches + caches to localStorage | PASS | Fetches `/api/rules`, caches to `tm_rules_db`, wired into all 3 entry points |
| AC5: Falls back to localStorage if API unreachable | PASS | try/catch with localStorage fallback chain |
| AC6: getRulesDB() synchronous accessor | PASS | Returns `_rulesCache` or reads from localStorage |
| AC7: Any authenticated user can read | PASS | `requireAuth` on router mount, no role check on GET |
| AC8: POST/PUT are ST-only with schema validation | PARTIAL | POST has both requireRole('st') + validate(). PUT has requireRole('st') but NO schema validation. |

#### Findings Summary

- **1 medium:** PUT route missing schema validation (REQ-001) — AC8 explicitly says "with schema validation"
- **1 medium:** PUT route passes unfiltered body to $set (SEC-001) — low real-world risk (ST-only)
- **1 low:** No try/catch on handlers (MNT-001) — matches existing codebase pattern

#### Strengths

- Client loader exactly mirrors `loadCharsFromApi` pattern — consistent
- `invalidateRulesCache()` proactively supports PP.8 (admin editor)
- Non-blocking rules load (`fire-and-forget .catch(() => {})`) avoids slowing app startup
- POST route has proper duplicate key check (409 Conflict)
- `_id` and `key` correctly stripped from PUT body

### Gate Status

Gate: CONCERNS → specs/qa/gates/pp.2-api-route-client-loader.yml

---

### Re-review Date: 2026-04-07

### Reviewed By: Quinn (Test Architect)

**Scope:** Re-review of 2 medium-severity issues from initial review.

#### Issue Resolution

| Issue | Severity | Status | Evidence |
|-------|----------|--------|----------|
| REQ-001: PUT no schema validation | medium | RESOLVED | UPDATABLE_FIELDS allowlist (lines 38-42), only allowlisted fields pass to $set, empty update returns 400 |
| SEC-001: Unfiltered body to $set | medium | RESOLVED | Same allowlist fix — key, category, _id all blocked from updates |

#### AC8 Updated

| AC | Status | Notes |
|----|--------|-------|
| AC8: POST/PUT are ST-only with schema validation | PASS | POST: full schema validation. PUT: field allowlist (appropriate for partial updates). |

### Gate Status

Gate: PASS → specs/qa/gates/pp.2-api-route-client-loader.yml
