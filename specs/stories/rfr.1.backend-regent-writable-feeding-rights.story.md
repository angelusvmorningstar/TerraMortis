---
id: rfr.1
epic: regent-feeding-rights
status: review
priority: critical
depends_on: []
---

# Story RFR-1: Backend — Regent-Writable Feeding Rights Endpoint

As a player who is the Regent of a territory,
I want to save feeding rights for my own territory from the Regency tab,
So that I can actually do the thing the Regency tab was built for without needing an ST to make every change.

---

## Context

**Production bug.** The Regency tab is a player-facing feature, but all territory writes are gated `requireST`. Regent-character's player saves the form and gets "Save failed: Insufficient role".

The correct permission pattern already exists for the sibling endpoint `POST /api/downtime_cycles/:id/confirm-feeding` (`server/routes/downtime.js:59-64`) — it checks `req.user.character_ids.includes(terr.regent_id)`. Reuse that pattern here.

Additional rule from product: a regent cannot remove a character from feeding_rights if that character has already submitted a DT using this territory in the active cycle. Protects the integrity of "she fed here with permission" after the fact.

---

## Acceptance Criteria

**Given** an authenticated ST user
**When** they call PATCH /api/territories/:id/feeding-rights with a body `{ feeding_rights: string[] }`
**Then** the territory document's `feeding_rights` is replaced with the new array
**And** response is 200 with the updated doc

**Given** an authenticated player whose `character_ids` includes the territory's `regent_id`
**When** they call the same endpoint with a body containing only `feeding_rights`
**Then** the update succeeds
**And** only `feeding_rights` and `updated_at` are modified (any other field in the body is ignored)

**Given** an authenticated player whose `character_ids` does NOT include `regent_id`
**When** they call the endpoint
**Then** response is 403 with message `"You are not the Regent of this territory"`

**Given** an active cycle exists
**And** character X has a submitted DT with `responses.feeding_territories[<territory-slug>] === 'resident'`
**And** character X is currently in `feeding_rights`
**When** the regent PATCHes with a `feeding_rights` that excludes X
**Then** response is 409 with `{ error: 'CONFLICT', message: 'Cannot remove characters who have already fed this cycle', locked: [X] }`

**Given** the same scenario but the caller is an ST
**Then** the removal is allowed (ST override)

**Given** no active cycle exists (or all are `status: 'closed'`)
**When** the regent PATCHes to remove any character
**Then** the removal is allowed (no lock applies)

**Given** the endpoint returns successfully
**Then** `territory.updated_at` is set to the current ISO timestamp

---

## Implementation Notes

- **New route**: `PATCH /api/territories/:id/feeding-rights` in `server/routes/territories.js`.
- **Existing routes unchanged**: `POST /api/territories` and `PUT /api/territories/:id` stay `requireST`. Dedicated endpoint for the narrow regent-write case.
- **Permission helper**: extract the existing pattern from `downtime.js:59-64` into `server/middleware/auth.js` as `isRegentOfTerritory(user, territory)`. Reuse in both places.

```js
// server/middleware/auth.js — proposed addition
export function isRegentOfTerritory(user, territory) {
  if (isStRole(user)) return true;
  const charIds = (user?.character_ids || []).map(String);
  return charIds.includes(String(territory?.regent_id));
}
```

- **Lock computation**:
  1. Resolve the territory slug from the territory doc — verify mapping from `territory.id` (e.g. `the_second_city`) to the DT form's `territoryEnum` slug (e.g. `secondcity`). Mapping may already exist in `public/js/tabs/downtime-data.js`; mirror it server-side in a small helper.
  2. Query `downtime_submissions` where `cycle_id === activeCycle._id`, `status === 'submitted'`, and `responses.feeding_territories` (JSON-parsed) has `<slug>: 'resident'`.
  3. Extract `character_id` from each matching submission → locked set.
  4. Compare to requested removal: `locked ∩ (current - requested)`. If non-empty, 409.
- **Active cycle query**: `getCollection('downtime_cycles').findOne({ status: 'active' })`.
- **Tests** (Vitest + Supertest in `server/tests/api-territories-regent-write.test.js` — new):
  - ST happy path
  - Regent happy path
  - Non-regent 403
  - Regent removing a locked character → 409
  - ST removing a locked character → 200 (override)
  - No active cycle, regent removes → 200
- **Schema**: no change. `feeding_rights` already exists on `territorySchema`.

---

## Files Expected to Change

- `server/routes/territories.js`
- `server/middleware/auth.js`
- `server/tests/api-territories-regent-write.test.js` (new)
- Possibly a small territory-slug mapping helper on the server side (`server/utils/territory-slugs.js` if not already present)

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Completion Notes

- New `PATCH /api/territories/:id/feeding-rights` endpoint added. Accepts MongoDB `_id` or slug `id` in the URL, body `{ feeding_rights: string[] }`.
- Permission via new `isRegentOfTerritory(user, territory)` helper in `server/middleware/auth.js`. ST role bypasses (returns true unconditionally); otherwise checks `user.character_ids.includes(territory.regent_id)`.
- Lock check: if an active cycle exists, queries submitted `downtime_submissions` in that cycle, parses each `responses.feeding_territories` JSON, and identifies character IDs marked `'resident'` on this territory (via `normaliseTerritorySlug` which maps `the_second_city` → `secondcity` etc.). Removal of any locked character → 409 with `{ error: 'CONFLICT', locked: [...] }`. ST override bypasses.
- New `server/utils/territory-slugs.js` — server-side mirror of `public/js/admin/downtime-constants.js` TERRITORY_SLUG_MAP. `normaliseTerritorySlug()` passes unknown strings through unchanged so arbitrary/test slugs still resolve when they match a territory's `id` field directly.
- Test harness fix: `server/tests/helpers/test-app.js` previously had a blanket `requireRole('st')` on `/api/territories` that didn't match production. Removed — now matches `server/index.js` prod mount (auth at app level; write gating inside router). Updated two existing tests in `api-characters.test.js` and `api-territories.test.js` that asserted the incorrect behaviour.
- Test suite: 12 new tests in `api-territories-regent-write.test.js`. All green (46/46 across affected files). 4 pre-existing failures in unrelated tests (`api-downtime-regent-gate.test.js`, `api-downtime.test.js`, `api-publish-cycle.test.js`) confirmed to reproduce on clean main — not caused by this story.

### File List

- `server/utils/territory-slugs.js` (new)
- `server/middleware/auth.js` (modified — added `isRegentOfTerritory`)
- `server/routes/territories.js` (modified — added PATCH endpoint, import updates)
- `server/tests/helpers/test-app.js` (modified — dropped incorrect `requireRole('st')` on `/api/territories`)
- `server/tests/api-characters.test.js` (modified — one test expectation updated to match prod)
- `server/tests/api-territories.test.js` (modified — one test expectation updated to match prod)
- `server/tests/api-territories-regent-write.test.js` (new — 12 tests)

### Change Log

- 2026-04-23: Implemented RFR.1 — PATCH /api/territories/:id/feeding-rights with regent+ST permission and locked-character guard.
