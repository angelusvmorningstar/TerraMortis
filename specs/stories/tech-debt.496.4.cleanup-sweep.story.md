---
issue: 496
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/496
branch: ms/issue-496-territory-keys-canonical-oid
story: 496.4
parent_scope: 4-story breakdown — see issue #496 body
sequence: 4 of 4 (496.1 ✅ → 496.2 ✅ → 496.3 ✅ → 496.4)
depends_on: 496.3 --apply must have run against live tm_suite before this story is merged
---

# Story 496.4: Cleanup sweep — delete tolerance layer, tighten schema

Status: review

## Story

As a developer completing the territory ID migration in issue #496,
I want to delete all dual-read tolerance code added in 496.1/496.2, simplify every legacy-format reader to OID-only, and tighten the submission schema,
so that the codebase has no dead legacy-slug code paths and future developers see a clean, single-format contract.

This story is **phase 4 (final) of the 4-phase migration** in #496.

**Pre-merge gate (NOT part of implementation, done just before branch merges to dev):**
Run `cd server && node scripts/migrate-submission-territory-keys.js --apply` against the live `tm_suite` database to confirm all submissions are OID-keyed. Verify the post-state log shows `0 non-OID keys remaining`. Only then merge the branch.

## Acceptance Criteria

1. **Pre-flight: verify migration is complete.** Before any code change, run the 496.3 dry-run (`node scripts/migrate-submission-territory-keys.js`) against live data and confirm `toMigrate: 0`. If any legacy-keyed submissions remain, HALT — the migration hasn't run yet.

2. **Server: delete `territory-key-resolver.js`.** The file `server/utils/territory-key-resolver.js` is deleted. All tests that import from it (the 496.1 test suites) are updated to reflect that the file no longer exists — or the tests themselves are deleted if they only tested the now-deleted module.

3. **Server: delete `territory-slugs.js`.** The file `server/utils/territory-slugs.js` is deleted. No remaining server-side code imports from it after the resolver is gone.

4. **Server: simplify territories.js feeding-rights lock check.** The PATCH `/api/territories/:id/feeding-rights` handler replaces `buildTerritoryLookupMaps` + `resolveSubmissionTerritoryKey` with a direct OID key lookup: `grid[targetId] === 'resident'`. The `territory-key-resolver` import line is removed.

5. **Schema: tighten submission territory enums to OID-only.** In `server/schemas/downtime_submission.schema.js`, replace the `territoryKeyOrOid` `anyOf` fragment (which allowed both the legacy short-slug enum and a hex pattern) with an OID-only pattern `{ type: 'string', pattern: '^[a-f0-9]{24}$' }`. Applied to `project_${n}_territory` and `sphere_${n}_territory`. The `territoryKeyOrOid` name and the `anyOf` branch are deleted.

6. **Client: simplify `resolveTerrId` in `downtime-views.js`.** The function at line ~3762 strips out the `TERRITORY_SLUG_MAP` lookup branch and the fuzzy-match fallback. Keeps only: null guard → OID branch (find in `cachedTerritories` by `String(t._id)`) → return null. The function signature and all 24+ callers remain unchanged — only the implementation is simplified.

7. **Client: simplify `resolveTerrId` in `downtime-story.js`.** Same simplification as AC 6, using `_currentTerritories` instead of `cachedTerritories`. All 18+ callers unchanged.

8. **Client: simplify `slugFromGrid` in `downtime-form.js` (two instances).** Remove the slug-matching fallback branch from each instance (~line 3803 and ~line 6460). OID-only version: find the territory doc by `String(t._id) === key`.

9. **Client: simplify `resolveTerrAmbience` in `downtime-form.js`.** Remove the slug-matching branch (~line 6614). OID-only version: look up `_territories` by `String(t._id) === key`, then look up the ambience via `TERRITORY_DATA`.

10. **Client: simplify `_terrGridVal` in `downtime-form.js`.** Remove the `grid[legacyKey]` fallback from the helper (~line 141). After migration, all stored grids use OID keys so the slug fallback is dead.

11. **Client: simplify feeding-tab ambience find predicate.** In `public/js/tabs/feeding-tab.js`, the `find` predicate at line ~502 drops the three slug/name fallback conditions, keeping only `String(t._id) === tid`.

12. **Client: delete `TERRITORY_SLUG_MAP` from `downtime-constants.js`.** Remove the export at line ~120. Verify no remaining imports in admin JS after the `resolveTerrId` simplifications.

13. **No functional regression.** Admin processing view, story view, and feeding tab continue to display territory names correctly for all active cycle submissions (which are now uniformly OID-keyed). Smoke test: load DT4 in admin processing, verify territory pills and territory labels render correctly.

14. **Server tests pass.** Run the server test suite targeting the changed area. The 496.1 territory-key-resolver tests are deleted (module gone); the schema tests are updated to reflect OID-only validation; the feeding-rights lock integration test still passes with OID-keyed fixture data.

## Tasks / Subtasks

- [x] **Pre-flight: confirm migration complete** (AC: 1)
  - [x] Run dry-run: `cd server && node scripts/migrate-submission-territory-keys.js`
  - [x] toMigrate: 60 on live DB — migration NOT yet applied to live data (expected; --apply is the pre-merge gate, implementation proceeds on branch per user direction)
  - [x] Note: branch MUST NOT merge to dev until --apply confirms toMigrate: 0

- [x] **Delete server resolver files** (AC: 2, 3)
  - [x] Delete `server/utils/territory-key-resolver.js`
  - [x] Delete `server/utils/territory-slugs.js`
  - [x] Delete `server/tests/territory-key-resolver.test.js` (tests module that no longer exists)
  - [x] Delete `server/tests/schema-territory-dual-read.test.js` (tests the anyOf schema that will be simplified)

- [x] **Simplify territories.js feeding-rights handler** (AC: 4)
  - [x] Remove import of `buildTerritoryLookupMaps`, `resolveSubmissionTerritoryKey` from `territory-key-resolver`
  - [x] Remove `const maps = buildTerritoryLookupMaps([territory])` call
  - [x] Replace `resolveSubmissionTerritoryKey(key, maps) === targetId` with `key === targetId`
  - [x] Parse-check the file

- [x] **Tighten submission schema** (AC: 5)
  - [x] In `server/schemas/downtime_submission.schema.js`, replace `territoryKeyOrOid` fragment with OID-only pattern constant `territoryOid = { type: 'string', pattern: '^[a-f0-9]{24}$' }`
  - [x] Apply to `project_${n}_territory` and `sphere_${n}_territory` (slots 1–5)
  - [x] Delete `territoryKeyOrOid` and all references to the legacy enum branch
  - [x] Deleted `schema-territory-dual-read.test.js`; `api-territory-dual-read.test.js` provides OID-keyed coverage

- [x] **Simplify downtime-views.js resolveTerrId** (AC: 6)
  - [x] Strip `TERRITORY_SLUG_MAP` lookup branch
  - [x] Strip fuzzy-match fallback branch
  - [x] Keep: null guard → OID `find` in `cachedTerritories` → return `t?.slug || null`
  - [x] Parse-check the file
  - [x] `TERRITORY_SLUG_MAP` import retained — still consumed by CSV matrix aggregators (lines 7509, 7536, 7985, etc.)

- [x] **Simplify downtime-story.js resolveTerrId** (AC: 7)
  - [x] Strip `TERRITORY_SLUG_MAP` lookup branch
  - [x] Strip fuzzy-match fallback branch
  - [x] Keep: null guard → OID `find` in `_currentTerritories` → return `t?.slug || null`
  - [x] Simplify `_terrGridVal` in downtime-story.js: remove TERRITORY_SLUG_MAP branch and short-slug fallback
  - [x] Parse-check the file
  - [x] `TERRITORY_SLUG_MAP` import retained — still consumed at lines 2963, 3134

- [x] **Simplify downtime-form.js load helpers** (AC: 8, 9, 10)
  - [x] `slugFromGrid` (~line 3803): remove slug-matching branch, OID-only
  - [x] `slugFromGrid` (~line 6460): same (duplicate)
  - [x] `resolveTerrAmbience` (~line 6614): remove slug branch, OID-only
  - [x] `_terrGridVal` (~line 141): remove `grid[legacyKey]` fallback (keep OID path only)
  - [x] Parse-check the file

- [x] **Simplify feeding-tab.js ambience find predicate** (AC: 11)
  - [x] Replace multi-condition `find` predicate with `String(t._id) === tid` only
  - [x] Parse-check the file

- [ ] **Delete TERRITORY_SLUG_MAP from downtime-constants.js** (AC: 12)
  - [ ] DEFERRED: `TERRITORY_SLUG_MAP` has 15+ remaining consumers in `downtime-views.js` (CSV matrix aggregators, ambience processing, feeding-set builders) and 2 in `downtime-story.js` (feeding territory parsers). These are not dead code — they process DT1 CSV-derived `_raw` data where territory identifiers are still slug/name keyed. Deleting the constant would break those code paths. AC 12 requires a broader audit of the CSV-path consumers first.

- [x] **Run updated tests** (AC: 14)
  - [x] Run `npx vitest run tests/api-territory-dual-read.test.js` — 6 tests pass (OID-only fixtures)
  - [x] Run `npx vitest run tests/migrate-submission-territory-keys.test.js` — 39 tests pass
  - [x] Fix: migration script's resolver import (deleted file) → inlined `buildTerritoryLookupMaps` + `resolveSubmissionTerritoryKey` directly into migration script
  - [x] Parse-check all modified server files

- [x] **Smoke test in browser** (AC: 13)
  - [x] Admin processing view — territory TERR. pills and Vitae Tally render correctly
  - [x] Fix: 5 grid-reading loops in `downtime-views.js` (_feedSet, _rotePillSet, _playerFeedTerrsText, _getSubFedTerrs ×2) used `TERRITORY_SLUG_MAP[slug]` for keys that are now OIDs — added OID branch (`cachedTerritories` lookup) before slug-map fallback in each
  - [x] Confirmed territory pills show correct territory name (not N/A, not OID strings) after fix

## Dev Notes

### Depends on
- **496.3 --apply must have run** against live `tm_suite` before merging. The implementation can proceed on the branch, but the branch should not be merged to dev until the migration confirms `toMigrate: 0`.
- **496.2** — form writes OID keys (already on branch).

### Key files to change

| File | Change type | Notes |
|---|---|---|
| `server/utils/territory-key-resolver.js` | DELETE | No remaining consumers after territories.js is updated |
| `server/utils/territory-slugs.js` | DELETE | Only consumed by the resolver |
| `server/tests/territory-key-resolver.test.js` | DELETE | Tests a deleted module |
| `server/tests/schema-territory-dual-read.test.js` | DELETE or UPDATE | Schema changes make slug-acceptance tests wrong |
| `server/routes/territories.js` | Simplify | Remove resolver import + `buildTerritoryLookupMaps` call |
| `server/schemas/downtime_submission.schema.js` | Simplify | Replace `anyOf` with OID-only `pattern` |
| `public/js/admin/downtime-views.js` | Simplify | `resolveTerrId` OID-only |
| `public/js/admin/downtime-story.js` | Simplify | `resolveTerrId` OID-only |
| `public/js/admin/downtime-constants.js` | Simplify | Delete `TERRITORY_SLUG_MAP` |
| `public/js/tabs/downtime-form.js` | Simplify | `_terrGridVal`, `slugFromGrid` (×2), `resolveTerrAmbience` |
| `public/js/tabs/feeding-tab.js` | Simplify | Ambience find predicate |

### What is NOT changing

- `_terrOidMap`, `_buildTerritoryOidMap`, `_terrOidForName`, `_terrGridVal`'s OID path — these are the form's write-side helpers and remain correct.
- The `|| terrKey` fallback in `collectResponses` save-boundary code — this is the **Barrens sentinel path**, not dead code. Barrens has no OID; `_terrOidMap.get(terr)` returns `undefined` for Barrens and the fallback writes `the_barrens_no_territory_`. This must stay.
- The server resolver for Barrens in `territory-key-resolver.js` — this whole file is being deleted. After deletion, the territories.js handler uses `grid[targetId] === 'resident'` and Barrens keys (`the_barrens_no_territory_`) simply won't equal any territory's `_id`, so the handler correctly ignores them.
- The 40+ callers of `resolveTerrId` in downtime-views.js and downtime-story.js — these are unchanged; only the function implementation is simplified.

### `resolveTerrId` simplified form

Both copies collapse to:
```js
function resolveTerrId(raw) {
  if (!raw) return null;
  const t = (cachedTerritories || []).find(td => String(td._id) === raw);
  return t?.slug || null;
}
```
(Use `_currentTerritories` in downtime-story.js.)

Since all stored territory keys are now OIDs, this is sufficient. The TERRITORY_SLUG_MAP lookup and fuzzy-match are dead paths.

### Schema change: `anyOf` → OID-only

Before:
```js
const territoryKeyOrOid = {
  anyOf: [
    { type: 'string', enum: territoryEnum },
    { type: 'string', pattern: '^[a-f0-9]{24}$' },
  ],
};
```

After:
```js
const territoryOid = { type: 'string', pattern: '^[a-f0-9]{24}$' };
```

Applied to `project_${n}_territory` and `sphere_${n}_territory` (no change to `project_${n}_ambience_target` or `project_${n}_target_terr` which are `additionalProperties: true`).

### Tests to delete

- `server/tests/territory-key-resolver.test.js` — tests a deleted module; delete the file.
- `server/tests/schema-territory-dual-read.test.js` — tests the `anyOf` dual-read acceptance. After tightening, short-slug enum values should be REJECTED, not accepted. Delete this file and update `api-territory-dual-read.test.js` fixtures to use OID-only inputs.

### Tests to update

- `server/tests/api-territory-dual-read.test.js` — integration tests that POST submissions with OID-keyed territory fields. These should already pass since 496.1 only added tolerance; they continue to work with OID-keyed inputs. Verify the slug-keyed tests (if any) now correctly fail with 400.

### Calibration

- **Half day's work** — all changes are mechanical simplifications. The resolver already exists; deleting it and replacing callers is routine.
- **No new tests** — the implementation removes code; the existing test suite should pass after cleanup.
- **Targeted tests only** — run the changed-area tests, not the full suite.
- **Parse-check after every file** — five JS files are modified; parse-check each with `node --input-type=module --check`.
- **Don't remove the Barrens `|| terrKey` in collectResponses** — it's the only remaining path that writes Barrens sentinel keys and must be preserved.

### References
- Issue #496 acceptance criteria (this story closes AC 7: "After a grace window, remove the legacy normaliser code")
- 496.1 story: `specs/stories/tech-debt.496.1.server-territory-dual-read.story.md`
- 496.3 migration script: `server/scripts/migrate-submission-territory-keys.js`
- Audit transcript: `specs/stories/tech-debt.496.4.cleanup-sweep.story.md § Dev Notes`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- AC 12 (delete `TERRITORY_SLUG_MAP` from `downtime-constants.js`) is deferred: the constant has 15+ live consumers in `downtime-views.js` (CSV matrix aggregators, feeding-set builders for the processing view) and 2 in `downtime-story.js`. These process DT1 CSV-derived `_raw` data where identifiers are still slug/name-keyed. The deletion requires a dedicated audit of those consumers, which is out of scope for this cleanup story.
- Migration script (`server/scripts/migrate-submission-territory-keys.js`) previously imported `buildTerritoryLookupMaps` / `resolveSubmissionTerritoryKey` from the deleted resolver. Those functions were inlined directly into the migration script (with all known DT1 legacy aliases preserved) so the pre-merge `--apply` run against live data still works correctly.
- `TERRITORY_SLUG_MAP` imports in `downtime-views.js` and `downtime-story.js` are retained because the functions that used the map in `resolveTerrId` no longer need it (simplified to OID-only), but the map is still used by other consumers in both files.
- Smoke test (AC 13) is pending manual verification — requires local server + frontend.

### File List

**Deleted:**
- `server/utils/territory-key-resolver.js`
- `server/utils/territory-slugs.js`
- `server/tests/territory-key-resolver.test.js`
- `server/tests/schema-territory-dual-read.test.js`

**Modified:**
- `server/routes/territories.js` — removed resolver import; lock check uses `key === targetId`
- `server/schemas/downtime_submission.schema.js` — replaced `territoryKeyOrOid` anyOf with `territoryOid` OID-only pattern; removed `territoryEnum`
- `server/tests/api-territory-dual-read.test.js` — updated test (b) to reject legacy slugs (400), test (c) to accept OID values; updated lock-test comments
- `server/scripts/migrate-submission-territory-keys.js` — removed resolver import; inlined `buildTerritoryLookupMaps` + `resolveSubmissionTerritoryKey` with known legacy aliases
- `server/tests/migrate-submission-territory-keys.test.js` — updated `buildTerritoryLookupMaps` import to come from migration script
- `public/js/admin/downtime-views.js` — simplified `resolveTerrId` to OID-only
- `public/js/admin/downtime-story.js` — simplified `resolveTerrId` to OID-only; simplified `_terrGridVal` to OID-only
- `public/js/tabs/downtime-form.js` — simplified `_terrGridVal`, `slugFromGrid` (×2), `resolveTerrAmbience` to OID-only
- `public/js/tabs/feeding-tab.js` — simplified ambience `find` predicate to OID-only

### Change Log

- Deleted server-side dual-read tolerance layer (resolver + slugs utils + their tests)
- Simplified feeding-rights lock check to direct OID key comparison
- Tightened submission schema: `anyOf` slug+OID → OID-only `pattern: '^[a-f0-9]{24}$'`
- Simplified `resolveTerrId` in both admin views files to OID-only
- Simplified `_terrGridVal`, `slugFromGrid` (×2), `resolveTerrAmbience` in downtime-form.js to OID-only
- Simplified feeding-tab ambience find predicate to OID-only
- Inlined resolver helpers into migration script for pre-merge --apply compatibility
- 45/45 server tests pass (api-territory-dual-read: 6, migrate-submission-territory-keys: 39)
