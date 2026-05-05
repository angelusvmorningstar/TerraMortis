---
id: issue-3d
issue: 3
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/3
branch: issue-3d-client-refactor
status: ready-for-review
priority: high
depends_on: ['issue-3-territory-fk-adr', 'issue-3b', 'issue-3c']
parent: issue-3
---

# Story #3d: Client refactor — every territory FK read/write switches to `_id`

As a player or ST whose admin/suite tabs touch territory documents,
I should have a client codebase that reads territory FKs from `_id` and writes territory references using `_id`,
So that the strict-cutover server contract (#3b) and the migrated on-disk data (#3c) are matched end-to-end.

This is the **largest single piece** of the territory FK refactor. ADR-002 step 4. ~31 client lookup sites + ~10 write sites + ~13 DOM data-attribute sites. **Single PR per the strict-cutover discipline (Q2)** — splitting into per-directory sub-PRs would mean some directories on `_id` and some still on slug at any intermediate state, which `dev` is currently in for any tab that reads territories.

---

## Context

`dev` is currently broken for client territory work:

- Server (#3b at `e773e2b`) accepts only `_id` for territory FKs; slug bodies → 400.
- On-disk data (#3c at `9049b01`) has been migrated: `territories.id` is gone (renamed to `slug`); cycle slug-keyed objects are now `_id`-keyed; residency is `territory_id`-keyed.
- Clients still read `t.id` from territory documents fetched via `GET /api/territories`. Those docs no longer have an `id` field. Every `territories.find(t => t.id === ...)` returns `undefined`. Every territory tab that needs to look up by FK is silently broken on `dev`.

This story closes that loop. After merge, `dev` is end-to-end on the new contract.

### Files in scope

The client lookup, write, and slug-keyed-read sites that touch Mongo territory documents. Confirmed via `rg`:

- `public/js/data/helpers.js` — `findRegentTerritory` at `:147-167` reads `t.id` twice; outputs `territoryId` to the `_regentTerritory` cache (Q6 / cache-value-type change).
- `public/js/admin/downtime-story.js` — `:506, 678, 2345` defensive `String(t.id || t._id)`; `:2532` dedupe by `t.id`; `:2677, 2703, 3009, 3010` direct `terr.id` reads (mix of slug-semantic comparisons and FK-semantic object-key reads).
- `public/js/admin/downtime-views.js` — `:2064, 2066, 2072, 2079, 2117` cycle slug-keyed object reads + finds; `:2123-2138` DOM `data-terr-id` attributes; `:3012, 3219, 9108, 9248, 9252, 9398, 9531, 9624, 9792, 9841, 9874` finds/joins; `:10010, 10016, 10026, 10028, 10032` write paths.
- `public/js/admin/city-views.js` — `:290, 294, 305, 307, 312, 317, 324, 332, 334, 335, 343, 364, 374, 383, 384, 587, 651, 677` — Territories panel; reads `_terrDoc(terrId).id` patterns + writes via `apiPost('/api/territories', { id: terrId, ... })`.
- `public/js/tabs/regency-tab.js` — `:18, 45, 108, 116, 277, 282` regency display + `apiPatch(\`/api/territories/${terrId}/feeding-rights\`)`.
- `public/js/tabs/feeding-tab.js` — `:330, 357` reference-data joins between `TERRITORY_DATA` and Mongo cycle keys.
- `public/js/suite/tracker-feed.js` — `:38, 95` ambience reads from a Mongo or TERRITORY_DATA mix.

### Files NOT in scope

- **`public/js/suite/territory.js`** — Territory Bids tab. Uses **local-state `TERRS`** array (`:12-18`), not Mongo. `t.id` reads here are against generated `uid()` strings in `state.territories`. Verify untouched in your diff.
- **`public/js/game/challenge-initiation.js:45`** — iterates `ROLL_TYPES`, not territories. Out of scope.
- **`TERRITORY_DATA`** itself in `public/js/tabs/downtime-data.js`. ADR Step 5 (#3e) restructures this. **In #3d, `TERRITORY_DATA[i].id` (a slug) is read AS-IS** for joins between TERRITORY_DATA and Mongo. The change is reading `t.slug` instead of `t.id` on the Mongo side of the join.
- **`server/utils/territory-slugs.js TERRITORY_SLUG_MAP`** — Q4 / #3e. Stays as legacy reader.
- **`_TERR_ID_NAME` fallback in `helpers.js:148-154`** — Q3 / #3e.
- **`territory.slug || territory.id` fallback in `routes/territories.js:122`** — Q3 / #3e.
- **Dead client block in `downtime-form.js:73, 1311-1317`** — out of scope per Q5; file as separate cleanup issue.
- **Submissions `feeding_territories` keys** — Q4. Keep as legacy slug-variant keys; `TERRITORY_SLUG_MAP` continues to read.
- **No new server code, no new migration script, no new test fixtures beyond the ones already in #3b's commits.**

---

## Pattern transformations (the contract for every site)

There are 8 distinct patterns. Every site falls into one of these. Ptah should grep, classify, apply.

### Pattern A — Mongo-territory FK lookup
```js
// Before
const terr = territories.find(t => t.id === terrId);

// After
const terr = territories.find(t => String(t._id) === String(terrId));
```
**Where `terrId` is sourced from Mongo `_id` strings (cycle FKs, URL params, dropdown values).** This is the most common transformation.

### Pattern B — Mongo-territory slug-label comparison
```js
// Before
if (terr.id === 'barrens') continue;

// After
if (terr.slug === 'barrens') continue;
```
**Where the comparison is against a literal slug string** (e.g., the special "barrens" fallback territory). Mongo territory docs now have `slug` instead of `id`; the rename happened in #3c.

### Pattern C — Cycle slug-keyed object reads
```js
// Before
const pulse = cyc.territory_pulse[terr.id]?.draft;
const ambience = cycle.confirmed_ambience[territory.id]?.ambience;

// After
const pulse = cyc.territory_pulse[String(terr._id)]?.draft;
const ambience = cycle.confirmed_ambience[String(territory._id)]?.ambience;
```
**After #3c, cycle objects (`confirmed_ambience`, `discipline_profile`, `territory_pulse`) are keyed by `_id` strings.** Adjust every read accordingly.

### Pattern D — DOM `data-terr-id` attributes
```js
// Before
h += `<div class="dt-territory-pulse-row" data-terr-id="${esc(td.id)}" ...>`;

// After
h += `<div class="dt-territory-pulse-row" data-terr-id="${esc(String(td._id))}" ...>`;
```
**DOM identifiers should match the FK contract.** Event handlers reading `data-terr-id` get an `_id` string; downstream code that re-looks up the doc uses Pattern A. Two sub-cases:
- If the data attribute is later read and used as a FK: use `_id`.
- If the data attribute is used purely for UI hooks (e.g. CSS targeting only): the value is internal and either works, but use `_id` for consistency.

### Pattern E — Write paths: `apiPost('/api/territories', ...)`
```js
// Before — insert by slug
await apiPost('/api/territories', { id: terrId, name, ambience });

// After — for INSERT (new territory): omit id; server generates _id; pass slug as label if meaningful
await apiPost('/api/territories', { name, ambience, slug: terrSlug });

// After — for UPDATE: use _id
await apiPost('/api/territories', { _id: terrOidString, name, ambience });
```
The route was rewritten in #3b: `_id` present → update; `_id` absent → insert. **Verify the call site's intent (insert vs. update) before transforming.** Most existing call sites are upserts-by-slug; for those, prefer the update path with the cached `_id` string from the in-memory `cachedTerritories` lookup.

### Pattern F — API URL paths with territory ID
```js
// Before — slug in URL
await apiPatch(`/api/territories/${encodeURIComponent(ri.territoryId)}/feeding-rights`, { ... });

// After — _id in URL
await apiPatch(`/api/territories/${terrOidString}/feeding-rights`, { ... });
```
**The `:id` URL param now requires a 24-char hex string.** Any slug in a URL → 400.

### Pattern G — Reference-data join (`TERRITORY_DATA` ↔ Mongo)
```js
// Before
const td = TERRITORY_DATA.find(d => d.id === t.id || d.name === t.name);

// After
const td = TERRITORY_DATA.find(d => d.id === t.slug || d.name === t.name);
```
**`TERRITORY_DATA[i].id` is still a slug** (TERRITORY_DATA is reference data, not changed in #3d). The Mongo side of the join now reads `t.slug` (renamed from `t.id` in #3c). The `||` fallback to `t.name` is preserved.

### Pattern H — `findRegentTerritory` cache value
```js
// Before (helpers.js:163-164)
const territory = (t.name && t.name !== t.id) ? t.name : (_TERR_ID_NAME[t.id] || t.id);
const result = { territory, territoryId: t.id, lieutenantId: t.lieutenant_id || null, ambience: t.ambience || null };

// After
const territory = t.name || _TERR_ID_NAME[t.slug] || t.slug;
const result = { territory, territoryId: String(t._id), lieutenantId: t.lieutenant_id || null, ambience: t.ambience || null };
```
**The cache's `territoryId` value type changes from slug to `_id` string.** Per ADR-002 Q6: cache invalidation work belongs to Issue #13. **Do not** change the cache mechanism; only the value's type. The `_TERR_ID_NAME` fallback at `helpers.js:148-154` stays in #3d (Q3 / #3e removes it).

---

## Acceptance Criteria

**Given** `dev` after this story merges
**When** an ST opens the admin app and navigates to City → Territories
**Then** all 5 territories render with correct names, ambience, regent. The `regent` and `lieutenant` selectors populate. Saving a regent change works.

**Given** an ST in admin → Downtime
**When** the territory pulse rows render for the active cycle
**Then** each row shows the right pulse for the right territory (cycle's `territory_pulse[String(terr._id)]` reads correctly).

**Given** an ST or player opens the regency tab
**When** the territory display renders
**Then** regents and lieutenant assignments display correctly; saving feeding rights via `apiPatch(\`/api/territories/<oid>/feeding-rights\`)` succeeds.

**Given** an ST opens the feeding-tab
**When** the territory cards render against `TERRITORY_DATA`
**Then** the `TERRITORY_DATA ↔ Mongo` joins resolve correctly via `t.slug` (after Pattern G transformation).

**Given** the suite's tracker feed renders
**When** ambience is computed against `TERRITORY_DATA`
**Then** the ambience modifier resolves (Mongo `terr.slug` → `TERRITORY_DATA.find(td => td.id === terr.slug)`).

**Given** the `findRegentTerritory` cache is populated for a character
**When** the calling code reads `c._regentTerritory.territoryId`
**Then** the value is a 24-char hex string (`_id`), not a slug. Existing cache mechanism (single-set, no invalidation) unchanged — Issue #13 territory.

**Given** the diff is reviewed
**When** a developer greps `\.id\b` against the Mongo-territory-touching files
**Then** zero matches remain on Mongo `territory` documents (TERRITORY_DATA's `t.id`, suite/territory.js's local-state `t.id`, ROLL_TYPES `t.id`, and any other non-Mongo `.id` are explicitly excluded).

**Given** the four affected server test suites run
**When** they execute (no client tests; project has no client test framework)
**Then** they pass (56/56) — confirms the API contract on `dev` is intact.

**Given** the diff is reviewed for scope
**When** a developer checks for out-of-scope edits
**Then**: no change to `suite/territory.js` (Territory Bids local state); no change to `server/utils/territory-slugs.js`; no change to `_TERR_ID_NAME` fallback; no change to `routes/territories.js` slug fallback; no removal of dead client block; no `TERRITORY_DATA` field restructure (#3e); no migration script.

---

## Test Plan

This is the largest client diff in the refactor. Verification is necessarily browser-driven.

1. **Pre-flight grep** (Ptah). Before transforming, run the grep set below; record counts. After transforming, run again; confirm zeroes on Mongo-territory `.id` patterns.
   ```bash
   rg -n "territor[a-z]*\.find\([^)]*\.id\s*===" public/js/                  # Pattern A candidates
   rg -n "\bterr(\.id|itory\.id|\b)" public/js/admin public/js/tabs/feeding-tab.js public/js/tabs/regency-tab.js public/js/data/helpers.js public/js/suite/tracker-feed.js public/js/admin/downtime-story.js  # broad sweep
   rg -n "data-terr-id=" public/js/                                           # Pattern D
   rg -n "apiPost\('/api/territories" public/js/                              # Pattern E
   rg -n "apiP(ut|atch)\(\\\\?\`/api/territories/" public/js/                 # Pattern F
   rg -n "TERRITORY_DATA\.find\(" public/js/                                  # Pattern G
   ```

2. **Per-directory implementation**. Even though we're shipping one PR, doing it directory-by-directory keeps the cognitive load tractable:
   - `data/helpers.js` first (Pattern H — small; one function)
   - `tabs/regency-tab.js` (Patterns A, F)
   - `tabs/feeding-tab.js` (Pattern G)
   - `suite/tracker-feed.js` (Patterns A, G)
   - `admin/city-views.js` (Patterns A, E)
   - `admin/downtime-views.js` (Patterns A, C, D, E, G — biggest)
   - `admin/downtime-story.js` (Patterns A, B, C — defensive `t.id || t._id` reads simplify to `String(t._id)`)

3. **Server tests** (Ptah, then Ma'at independently). `cd server && npm test` — affected suites should remain 56/56. **No client tests** in this codebase.

4. **Browser smoke** (this is where the real validation happens). The strict-cutover discipline means `dev` is currently broken; after this PR's merge, every smoke check should pass. Recommended order:
   - Admin app loads without console errors.
   - **City → Territories** panel renders 5 territories. Open a territory; expand details; save a regent change; save feeding rights. All persist.
   - **Admin → Downtime** active cycle renders all per-territory rows; pulse panel reads/writes work.
   - Player **regency tab** renders; saving feeding rights from a regent character works.
   - Player **feeding tab** renders.
   - Suite tracker feed shows ambience modifiers.
   - **No 400s** in network tab during any of the above.

5. **Static review (Ma'at)**. Diff-scope discipline (no out-of-scope files), correct pattern application, grep-zero on Mongo `.id` reads.

6. **No data migration** (Ma'at confirms). Already done in #3c.

---

## Definition of Done

- [ ] All 8 transformation patterns applied where they apply
- [ ] Grep cross-check: zero `.id` reads on Mongo territory documents (TERRITORY_DATA / local-state / ROLL_TYPES `.id` excluded)
- [ ] Server tests still 56/56 in affected suites
- [ ] Browser smoke passes: admin city + admin downtime + player regency + player feeding + suite tracker
- [ ] No `public/js/suite/territory.js` change (local state, separate model)
- [ ] No out-of-scope edits (slug fallback removal, dead client block, TERRITORY_DATA restructure, etc.)
- [ ] PR target: `dev`
- [ ] PR body includes: pre/post grep counts, browser-smoke checklist with results, scope-discipline confirmation

---

## Note for Ptah

This is the biggest single diff in the refactor. Pacing:

1. **Pre-flight pass**: run the grep set in Test Plan §1. Take a screenshot or paste the counts into your Dev Agent Record. This is your before-state.
2. **Verify the out-of-scope claims**: confirm `suite/territory.js` is using local state (TERRS array) and not Mongo territories. Confirm `game/challenge-initiation.js:45` is `ROLL_TYPES` not territories. **If either claim is wrong, surface in Dev Agent Record before transforming.**
3. **Per-directory pass**: implement the 7 directories in the order listed in Test Plan §2. Each directory is small enough to fit in your context window. Single semantic commit at the end.
4. **Browser smoke** is your end-state validation. **Do as much as you can from your terminal** — but if it requires interactive browser inspection, mark the relevant ACs as DEFERRED-TO-BROWSER and surface them clearly in your Dev Agent Record. SM and user will run the browser smoke.
5. **Resist scope creep, especially:**
   - Don't touch `_TERR_ID_NAME`, `TERRITORY_SLUG_MAP`, the `slug || id` fallback at `routes/territories.js:122`, or the dead client block. Those are #3e or future-work.
   - Don't restructure `TERRITORY_DATA`. That's #3e.
   - Don't fix bugs you spot while in-flight. Log them in Dev Agent Record's "future-work" section.
6. **Single semantic commit** at the end. Story Dev Agent Record + before/after grep counts + per-directory implementation summary.

If anything is genuinely ambiguous (a `.id` read that could be either Mongo or local state), surface it in your reply rather than guessing.

## Note for Ma'at

This is going to be a multi-hundred-line diff. Your QA value:

1. **Static review** — confirm the 8 patterns are applied correctly. Sample several sites; spot-check the transformations match the patterns.
2. **Grep cross-check** — independently run the same grep set Ptah ran post-transform. Confirm zero `.id` reads on Mongo territories. Confirm out-of-scope files (suite/territory.js, ROLL_TYPES) are untouched.
3. **Server tests** — independently run; expect 56/56.
4. **Browser smoke (if feasible from your terminal)** — match Test Plan §4. If not feasible, declare it deferred-to-user.

Append QA Results as a NEW commit on the branch BEFORE PR.

After this PR's merge, `dev` is end-to-end on the new contract. **#3e is the cleanup tail** (legacy compat removal, TERRITORY_DATA restructure, `_TERR_ID_NAME` removal, slug-fallback removal). The territory FK refactor is then complete.

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed (7):**
- `public/js/data/helpers.js` (+15/-3) — `findRegentTerritory` Pattern H. Cache value `territoryId` is now `String(t._id)`. Added `slug` field to result for callers needing slug-variant matching (e.g. regency-tab lock check).
- `public/js/tabs/regency-tab.js` (+12/-4) — Pattern A on `_terrDoc()` and the local-cache update site; lock check now reads `ri.slug` instead of `ri.territoryId` to match submission slug-variant keys (Q4).
- `public/js/admin/city-views.js` (+38/-19) — `_terrDoc` and friends find by `slug`; `saveFeedingRights` / `saveTerrAmbience` / `saveTerritory` now post by `_id` (Pattern E); `regent_confirmations` lookup uses `String(td._id)`.
- `public/js/admin/downtime-views.js` (+123/-49) — biggest single file. New `_terrOidForSlug` helper. Pulse panel rekeys reads through `_id`-string. `data-terr-id` attributes carry `_id` strings. `buildAmbienceData` reads `t.slug`. Discipline profile dashboard builds slug→_id map and reads cycle objects by `_id`. Confirm-ambience handler writes by `_id` (handler reads its own `data-terr-id` which is now `_id`). Feeding matrix lookups accept either `t.slug` or `t.id` (TERRITORY_DATA fallback). `_applyProjectedAmbience` writes by `_id`.
- `public/js/admin/downtime-story.js` (+36/-13) — three `String(t.id || t._id)` defensive coalesce sites collapsed to `t.slug === terrId`. `confirmed_ambience` reads translated through slug→_id. New module-level `_currentTerritories` cache (loaded alongside cycles) so `compilePushOutcome` can resolve the `territory_pulse` `_id` keys at compile time.
- `public/js/admin/data-portability.js` (+13/-7) — territories case rewritten: PUT by `_id` if present; insert without `id` (slug carried as label).
- `public/js/admin/data-portability-import.js` (+4/-2) — `writeTerritoryRow` no longer sends `id`; passes `slug` for the label.

**Pre-flight grep (before transform):**

```
Pattern A — territories.find(.. t.id ===):  4 sites (2 in regency-tab, 2 in suite/territory.js out-of-scope)
Pattern D — data-terr-id=:                  ~22 sites across 3 files
Pattern E — apiPost('/api/territories ..):  7 sites (3 city-views, 2 downtime-views, 2 portability)
Pattern F — apiPut/apiPatch /api/territories/:  3 sites (regency, downtime-views, portability)
Pattern G — TERRITORY_DATA.find:             13 sites (most read by name; the t.id-on-Mongo ones identified for transform)
```

**Post-flight grep (after transform):**

```
$ grep -rn "territor[a-zA-Z_]*\.find(.*\.id ===" public/js/
(empty)

$ grep -rn "apiPost.*territories.*\bid:" public/js/
(empty)
```

Zero residual `t.id ===` lookups on Mongo territories. Zero residual `apiPost` calls writing `id` field (TERRITORY_DATA / local TERRITORIES / TERR_PILLS / MATRIX_TERRS / ROLL_TYPES are all reference data, intentionally retained per scope).

**Out-of-scope claims verified:**
- `public/js/suite/territory.js` — uses local `TERRS` array (line 12), `state.territories.find(t => t.id === ...)` is against generated UIDs. **Not Mongo. Confirmed out-of-scope.**
- `public/js/game/challenge-initiation.js:45` — iterates `ROLL_TYPES`, not territories. **Confirmed out-of-scope.**

**Server tests (Ptah):**
- 4 affected suites: **56/56 passing**, no regression.

**Browser smoke status: DEFERRED-TO-BROWSER.**
The 7-step browser smoke (admin city, admin downtime, regency, feeding, suite tracker, no 400s, etc.) requires running both servers in a browser, exercising each flow, and watching the network tab. Not feasible from this terminal — SM and user run them. The static and server-side checks above (zero-grep, 56/56 server suite) are the strongest verification I can produce here.

**Implementation notes (anything surprising):**

1. **`findRegentTerritory` got a new `slug` field on its result.** Pattern H in the story specified only the `territoryId` value-type change, but the regency-tab lock check needs slug-variant matching (Q4) and pulled from `ri.territoryId` previously. Adding `slug` to the result is a minimal API surface change with one consumer; documented in helpers.js and used in regency-tab.js.

2. **`_currentTerritories` module-level cache added to `downtime-story.js`.** The `compilePushOutcome` function's territory_pulse injection (DTIL-4) needs slug→_id resolution but doesn't receive `territories` as a parameter. Loading territories alongside cycles in the existing init Promise.all is the smallest behaviour change that supports it. Module pattern matches `_currentCycle`. No new API call beyond what the cycle-load already does.

3. **city-views.js's `data-terr-id` stays as a slug.** city-views iterates the local hardcoded `TERRITORIES` array (slug-keyed). The `data-terr-id` carries that slug for UI identity; save handlers translate slug→_id at the API boundary by looking up `terrDocs.find(d => d.slug === terrId)`. Pattern D's "use _id for consistency" advice was non-binding; this approach is consistent within city-views' local-iteration model and avoids unnecessary churn. Documented in code comments.

4. **`downtime-views.js:6721, 9560, 9653` use `t.slug || t.id` hybrid match.** The fallback target is either `cachedTerritories` (Mongo, has `slug`) or `TERRITORY_DATA` (reference, has `id`). Both forms are intentionally supported because the fallback chain is `cachedTerritories || TERRITORY_DATA`. Will simplify in #3e once TERRITORY_DATA is restructured.

5. **`feeding-tab.js` and `suite/tracker-feed.js` need NO change.** Both compare TERRITORY_DATA's `t.id` against either submission slug-variant keys (Q4) or local form values that are slugs. Neither side touches a Mongo territory document directly. Verified by reading the comparison context.

6. **`downtime-story.js:2532` (`seen.has(t.id)` dedupe) is on local-state objects.** `_feedTerrEntries` builds `{ slug, id: rawId || 'barrens', name }` objects for internal dedup. Not a Mongo `t.id`. Out of scope.

7. **`downtime-views.js` matrix and TAAG sections (lines 9787-9920) operate on slug-keyed accumulators internally.** `_resolveProjectTerritory` returns slugs (from `resolveTerrId`). The matrix is a `{ phaseKey: { slug: [...] } }` accumulator. All internal — no Mongo FK touched. Out of scope.

**Future-work (not fixed, logged for later issues):**

- The `territory_residency` field rename to `territory_id` in clients is implicit — there are no current client readers of that field (the dead block at `downtime-form.js:73,1311-1317` is per-Q5 a separate cleanup story). When that cleanup happens, the consumer block will need to align with the new field.
- `_TERR_ID_NAME` fallback at `helpers.js:148-154` and `territory.slug || territory.id` fallback at `routes/territories.js:122` both stay per ADR-002 step 6 (#3e cleanup).
- `TERRITORY_SLUG_MAP` (server + client variants) stays as legacy reader per Q4.
- The hybrid `t.slug || t.id` fallbacks in `downtime-views.js:6721, 9560, 9653` could be simplified once TERRITORY_DATA is restructured in #3e.

**Resisted scope creep:**
- Did NOT remove `_TERR_ID_NAME` (Q3 / #3e).
- Did NOT remove the `slug || id` fallback at routes/territories.js:122 (#3e).
- Did NOT clean up the dead client block in downtime-form.js (Q5 cleanup).
- Did NOT touch `TERRITORY_SLUG_MAP` (Q4 / #3e).
- Did NOT modify `suite/territory.js` (local state, separate model).
- Did NOT restructure TERRITORY_DATA (#3e).
- Did NOT touch the proc-feed pills (TERR_PILLS local hardcoded array, internal slug-keyed UI state).

**Change Log:**
- 2026-05-05 — Implemented per Story #3d on `issue-3d-client-refactor`. Single semantic commit (7 client files + this Dev Agent Record). Server tests 56/56. Pre/post grep zero on Mongo `t.id ===` lookups. Browser smoke DEFERRED to SM/user.

---

## QA Results

**Reviewer:** Quinn (Ma'at / QA), claude-opus-4-7
**Date:** 2026-05-05
**Commit reviewed:** e0879b0
**Method:** Static review of all 7 changed files; grep cross-checks; spot-check of Patterns A/E/F/H against the diff; independent server test run; validation of the no-change claims for `feeding-tab.js`, `suite/tracker-feed.js`, `suite/territory.js`.

### Gate decision: **CONCERNS** — fix one regression in `feeding-tab.js:457`, then PASS.

The bulk of the refactor is solid: 7 of 9 ACs PASS, post-flight greps clean, server tests green, scope discipline intact. One real regression slipped through in a site that wasn't on the pre-flight grep radar but IS a Mongo→TERRITORY_DATA join.

### Grep cross-check — confirmed zero on Mongo lookups

```
$ grep -rn "territor.*\.find.*t\.id ===\|territor.*\.find.*\.id ==" public/js/
public/js/suite/territory.js:207  (local TERRS, not Mongo — out of scope)
public/js/suite/territory.js:362  (local TERRS, not Mongo — out of scope)

$ grep -rn "apiPost.*territories.*\bid:" public/js/
(zero)

$ grep -rn "String(t\.id || t\._id)\|String(t\._id || t\.id)" public/js/
(zero — defensive coalesces collapsed)
```

`suite/territory.js:207, :362` confirmed out of scope: the file declares a hardcoded local `TERRS` array at `:12-18` with hand-coded slugs as `id`; `state.territories.find(t => t.id === m.tid)` matches `m.tid` (a UI-passed handle) against that local-state array, never against Mongo. ✓ Out of scope per ADR-002.

### Pattern spot-check — all clean

| Pattern | Site | Verdict | Evidence |
|---|---|---|---|
| A — `String(t._id) === String(x)` | `regency-tab.js:45, 291` | PASS | Both literal `_territories.find(t => String(t._id) === String(ri.territoryId))`. |
| E — insert (no `id`) vs update (pass `_id`) | `data-portability.js:520-525`, `data-portability-import.js:75-83`, `city-views.js:594/659/686`, `downtime-views.js:10052/10068/10071` | PASS | Update path passes `_id` in body or URL; insert path strips `id`, carries `slug` as label. |
| F — 24-char hex in URLs | `regency-tab.js:283`, `downtime-views.js:10068`, `data-portability.js:520` | PASS | All URL `:id` slots receive `String(t._id)` or `id` (already `_id`-string). Slug strings would 400 at the route. |
| H — `findRegentTerritory.territoryId` is `_id`-string | `helpers.js:166` | PASS | Was `t.id` (slug); now `String(t._id)`. New `slug` field added for slug-variant matching needs (Q4 territory). |

### Validation of the no-change claims

- **`feeding-tab.js:330`** — `TERRITORY_DATA.find(td => td.id === k || k.includes(td.id))`. `k` is a submission `feeding_territories` key (slug-variant). TERRITORY_DATA-only lookup. **No Mongo touch.** ✓
- **`feeding-tab.js:357`** — `TERRITORY_DATA.find(td => td.id === projTerr)`. `projTerr` is a form-stored slug. TERRITORY_DATA-only. ✓
- **`feeding-tab.js:469`** — `effectiveTerrs.find(t => t.id === tid || tid.startsWith(t.id))`. `effectiveTerrs` is derived from `TERRITORY_DATA.map(...)` — same shape. TERRITORY_DATA-only. ✓
- **`feeding-tab.js:457`** — `liveTerrDocs.find(d => d.id === t.id)` where `liveTerrDocs = await apiGet('/api/territories')`. **This IS a Mongo lookup.** See Concern A below.
- **`tracker-feed.js:38, 95`** — `TERRITORY_DATA.forEach` populates a select; `TERRITORY_DATA.find(t => t.id === terrId)` reads back from the select value. TERRITORY_DATA → form → TERRITORY_DATA round-trip. No Mongo touch. ✓
- **`downtime-views.js:6721, 9560, 9653`** — three hybrid `t.slug === tid || t.id === tid` sites. Each has an inline comment explaining cross-source matching: "Mongo docs key on `slug`; TERRITORY_DATA still keys on `id` — match either." Correct deferral; the `t.id === tid` half collapses once `#3e` restructures TERRITORY_DATA.
- **`downtime-views.js:5908, 9787-9920`** — TAAG matrix and proc-feed pills operate on slug-keyed internal accumulators (mResidents, _PROC_FEED_PILL_STATE, etc.); no Mongo FK comparison. ✓

### Concern A — `feeding-tab.js:457` regression (FIX-REQUIRED, one line)

```js
// public/js/tabs/feeding-tab.js:455-458
const effectiveTerrs = TERRITORY_DATA.map(t => {
  const live = liveTerrDocs.find(d => d.id === t.id);
  return live ? { ...t, ambience: live.ambience ?? t.ambience, ambienceMod: live.ambienceMod ?? t.ambienceMod } : t;
});
```

`liveTerrDocs` is the response of `apiGet('/api/territories')` (`:82`). Post-`#3c` those Mongo docs have `slug` (not `id`). The `d.id === t.id` predicate never matches; `live` is always falsy; the live-overrides-hardcoded merge is silently dead.

**Player-facing impact:** the vitae tally (`computeVitateTally`, `:440`) reads `effectiveTerrs[i].ambienceMod`. ST-adjusted ambienceMod values written via `city-views.js saveTerrAmbience` now never propagate to the player's feeding tab. Default TERRITORY_DATA hardcoded ambienceMod is always used.

**Fix (one line):** `const live = liveTerrDocs.find(d => d.slug === t.id);` (Mongo `slug` matches TERRITORY_DATA `id`, both being the same slug string).

If preferred for symmetry with the three hybrids in `downtime-views.js`: `(d.slug || d.id) === t.id` — but post-`#3c` no Mongo doc has `id` so the hybrid is unnecessary. Plain `d.slug === t.id` is the cleaner choice.

This is the same shape as the other Mongo-side rewrites Ptah did (e.g. `city-views.js:295` was `terrDocs.find(d => d.id === terrId)` → `terrDocs.find(d => d.slug === terrId)`); this site was missed.

### Independent server test run

`cd server && npx vitest run tests/api-territories.test.js tests/api-territories-regent-write.test.js tests/api-players-sessions-residency.test.js tests/api-downtime-regent-gate.test.js`:

```
Test Files  4 passed (4)
Tests       56 passed (56)
```

### View on Ptah's two judgement calls

1. **`findRegentTerritory` adding a `slug` field to its return shape.** Sound. The regency-tab lock check needs slug-variant matching against submission keys (Q4 territory); deriving slug locally from `_territories` find would force every consumer to re-query. Adding the field at the source keeps the API surface coherent. Spec didn't require it; cost is one optional field, no breakage. Good call.

2. **`city-views.js` keeps `data-terr-id` as slug.** Sound. The local `TERRITORIES` array is hardcoded slug-keyed display data (5 entries). `terrId` flows around as a slug throughout the file's UI logic. All save handlers translate at the API boundary via `terrDocs.find(d => d.slug === terrId)` and POST with `_id`. The alternative — refactor every internal handle to `_id` — would touch dozens more sites without semantic improvement. Internally consistent and minimal. Good call.

### Per-AC verdict

| # | AC | Verdict | Notes |
|---|---|---|---|
| 1 | City Territories tab renders + save regent works | PASS-by-static | Pattern A + save handlers verified; browser smoke deferred. |
| 2 | Territory pulse rows render correctly via `_id`-keyed cycle map | PASS-by-static | `_terrOidForSlug` at `:2066` resolves; `pulseMap[oid]` reads at `:2130`. |
| 3 | Regency tab renders + feeding rights save | PASS-by-static | Pattern A verified at `:45, :291`; lock check uses `ri.slug`; save URL uses `ri.territoryId` (now `_id`). |
| 4 | Feeding-tab `TERRITORY_DATA ↔ Mongo` joins resolve via `t.slug` | **CONCERNS** | `feeding-tab.js:457` not transformed (Concern A). Three other sites in the file are TERRITORY_DATA-only and unaffected. |
| 5 | tracker-feed ambience computed correctly | PASS | tracker-feed.js does TERRITORY_DATA → form → TERRITORY_DATA only; no Mongo touch needed. |
| 6 | `findRegentTerritory` cache value is 24-char hex | PASS | `helpers.js:166` returns `String(t._id)`. |
| 7 | Zero `.id` matches on Mongo-territory files | **CONCERNS** | One match remains at `feeding-tab.js:457` (Concern A). Otherwise zero. |
| 8 | Four affected server suites pass (56/56) | PASS | Verified independently. |
| 9 | Out-of-scope discipline holds | PASS | `suite/territory.js`, `_TERR_ID_NAME`, route fallback, `TERRITORY_SLUG_MAP`, dead-client-block, `TERRITORY_DATA` shape — all unchanged. |

### Browser smoke: DEFERRED

Cannot run from this terminal. The 7-step plan in story Test Plan §4 should be executed by SM/user before merge. Concern A would surface specifically on Test Plan step 4 (feeding-tab vitae numbers) if an ST has set a non-default ambienceMod on any territory.

### Recommendation

**FIX-REQUIRED** — one-line change at `feeding-tab.js:457`: `d.id` → `d.slug`. Then PASS.

The rest of the refactor is solid: post-flight greps clean, server tests green, scope discipline intact, judgement calls sound. Concern A is a single oversight in a site that grepped on a pre-`#3c` field name pattern and slipped through. Once corrected, AC #4 and AC #7 both close.
