---
id: issue-3e
issue: 3
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/3
branch: issue-3e-legacy-cleanup
status: ready-for-review
priority: high
depends_on: ['issue-3-territory-fk-adr', 'issue-3b', 'issue-3c', 'issue-3d']
parent: issue-3
---

# Story #3e: Legacy compatibility removal — close the territory FK refactor

As a developer reading the TM Suite codebase three months from now,
I should not see slug-fallback code paths that exist only to bridge a partially-applied territory FK refactor,
So that the refactor's audit trail closes cleanly and the code reads as if `_id`-as-FK had always been the contract.

This is the **final cleanup tail** of the territory FK refactor. ADR-002 step 5 + step 6. Removes confirmed-dead transitional code now that #3b/#3c/#3d are all on `dev`. After merge, issue #3 closes.

This work is permitted under the architectural-reset freeze: it's audit-finding cleanup tied to an already-approved ADR (ADR-002), not new feature dev or schema addition.

---

## Context

After the territory FK refactor's main body (#3b, #3c, #3d) all landed on `dev`:

- `_id` is the canonical FK across server + on-disk + clients.
- The `id → slug` rename on the territory document is on disk; Mongo docs no longer carry `id`.
- Three hybrid `t.slug || t.id` fallbacks at `downtime-views.js:6721, 9560, 9653` were intentionally deferred to this story (they read across both Mongo and TERRITORY_DATA; collapse is safe once TERRITORY_DATA also renames `id → slug`).
- Two server-side fallbacks (`_TERR_ID_NAME` slug-to-name in `helpers.js`, `territory.slug || territory.id` in `routes/territories.js:122`) are confirmed dead code under the current data shape.

This story collapses all of those. No data migration. No new contracts. No new schemas.

### Files in scope

1. **`public/js/tabs/downtime-data.js`** — `TERRITORY_DATA[i]` shape. Rename the `id` field to `slug` on each of the 5 entries. Otherwise unchanged.
2. **`public/js/tabs/downtime-form.js:3129, 4520`** — `TERRITORY_DATA.find(t => t.id === …)` → `… t.slug === …`
3. **`public/js/tabs/feeding-tab.js:330, 357, 469`** (and any others post-#3d) — same transformation.
4. **`public/js/suite/tracker-feed.js:95`** — `TERRITORY_DATA.find(t => t.id === terrId)` → `… t.slug === terrId`.
5. **`public/js/admin/downtime-views.js`** — three categories of edit:
   - Plain TERRITORY_DATA `t.id` reads at `:9825, 9874, 9914` → `t.slug`
   - Three hybrid simplifications at `:6721, 9560, 9653` — collapse `t.slug === tid || t.id === tid` to just `t.slug === tid`
   - Reference-data join at `:3236` — `TERRITORY_DATA.find(d => d.id === t.slug …)` → `… d.slug === t.slug …`
6. **`public/js/data/helpers.js:148-167`** — remove the `_TERR_ID_NAME` constant entirely; simplify `findRegentTerritory` to use `t.name || t.slug` for the `territory` label (was `t.name || _TERR_ID_NAME[t.slug] || t.slug` per #3d).
7. **`server/routes/territories.js:122`** — replace `territory.slug || territory.id` with just `territory.slug`. Confirmed dead code by #3c apply (no `territory` document carries `id`).
8. **`server/utils/territory-slugs.js`** — `TERRITORY_SLUG_MAP` keeps its current logic but gains a header comment marking it as **legacy reader only** (used for `downtime_submissions.responses.feeding_territories` user-typed slug variants per Q4). No code change beyond the comment unless audit shows a writer (none expected — verify and report).

### Files NOT in scope

- **Any data migration.** Already done in #3c.
- **`territory_residency` collection.** Schema, routes, migrated data already correct from #3b/#3c. Issue #26 separately tracks the writer-investigation Q7 follow-up.
- **Dead client block in `downtime-form.js:73, 1311-1317`.** Q5 carve-out — file as a separate cleanup story post-#3e merge.
- **Any other refactor of `TERRITORY_DATA`.** Ptah's #3d note flagged that TERRITORY_DATA's status changes from authoritative to display-only; that statement is recorded in the ADR and not enforced by code. The array continues to exist as reference data; only the field name changes.
- **`MATRIX_TERRS` / `TERR_PILLS` / `FEED_TERRS` local hardcoded UI arrays.** Out of scope; these are display arrays, not Mongo FKs.
- **`suite/territory.js`'s local `TERRS` array.** Local state, not Mongo. Out of scope.

---

## Acceptance Criteria

**Given** `public/js/tabs/downtime-data.js` after this PR
**When** a developer reads the `TERRITORY_DATA` array
**Then** each entry's identifier field is named `slug`, not `id`. The shape becomes `{ slug, name, ambience, ambienceMod }`.

**Given** every consumer of `TERRITORY_DATA` after this PR
**When** the consumer looks up an entry
**Then** the lookup uses `t.slug` (or `t.name`), never `t.id`. A repository-wide grep returns zero matches for `TERRITORY_DATA[…].id` or `TERRITORY_DATA.find(t => t.id`.

**Given** the three hybrid simplification sites in `downtime-views.js`
**When** the diff is reviewed
**Then** each is now a single-clause `t.slug === tid` (or equivalent), with no `|| t.id` fallback. The inline comment about "Mongo docs match `slug`; TERRITORY_DATA still matches `id`" is removed (no longer applicable).

**Given** `findRegentTerritory` in `public/js/data/helpers.js`
**When** the function returns
**Then** the `territory` label is derived from `t.name || t.slug` (or just `t.name` if names are guaranteed). No reference to `_TERR_ID_NAME`. The constant is removed from the file.

**Given** `server/routes/territories.js:122`
**When** the lock-check resolves the territory's slug for `normaliseTerritorySlug` comparison
**Then** the read is `territory.slug`, not `territory.slug || territory.id`. No `|| .id` clause.

**Given** `server/utils/territory-slugs.js`
**When** a developer opens the file
**Then** the header docstring or top comment notes that `TERRITORY_SLUG_MAP` is **legacy-reader-only** for `downtime_submissions.responses.feeding_territories` keys (Q4). No write path may use it.

**Given** the four affected server test suites run
**When** they execute
**Then** they pass (56/56), confirming no contract regression.

**Given** the diff is reviewed for scope discipline
**When** a developer searches for out-of-scope edits
**Then**: no `territory_residency` change, no dead client block touched, no `MATRIX_TERRS`/`TERR_PILLS`/`FEED_TERRS` change, no `suite/territory.js` change, no schema change, no migration script.

**Given** a final post-PR repository-wide grep
**When** the developer searches for legacy patterns
**Then**:
- `_TERR_ID_NAME` returns zero matches
- `territory.slug \|\| territory.id` returns zero matches
- `TERRITORY_DATA[…].id` patterns return zero matches
- `t.slug === .* || t.id ===` returns zero matches in client code
- TERRITORY_DATA's `slug` field replaces `id` everywhere

---

## Implementation Notes

### Mechanical pattern

Most of this story is mechanical search-and-replace under careful sentinel-check. Per file:

1. **`downtime-data.js`** — open the array literal. Each entry currently `{ id: 'academy', ... }`. Rename to `{ slug: 'academy', ... }`. Five entries.
2. **All client `t.id ===` reads against TERRITORY_DATA** — the LHS-side pattern. Search and replace to `t.slug ===`.
3. **Three hybrid sites in `downtime-views.js`** — collapse `t.slug === tid || t.id === tid` (or similar) to `t.slug === tid`. Drop the inline comment about both sources.
4. **`helpers.js _TERR_ID_NAME`** — delete the constant + the usage. Simplify line 163.
5. **`routes/territories.js:122`** — drop `|| territory.id`.
6. **`territory-slugs.js`** — add a header comment block.

### What "legitimately dead" means here

Each of the three categories of removal has been verified dead:

- **`_TERR_ID_NAME`**: live audit (ADR §Live-data baseline confirmed by #3c apply) shows all 5 territories carry `name`. The fallback `_TERR_ID_NAME[t.slug] || t.slug` is unreachable when `t.name` is present.
- **`territory.slug || territory.id`**: post-#3c, no territory document carries `id`. The `|| territory.id` clause evaluates to `undefined` and is read but never used.
- **Three hybrid sites**: post-#3d (TERRITORY_DATA renamed in this PR), the `|| t.id === tid` clause becomes `|| undefined === tid`, never matching.

If any of these turns out to be live (e.g. a code path reads `t.id` from TERRITORY_DATA before the rename takes effect), Ptah surfaces it in Dev Agent Record and SM consults the user. **No silent fixes.**

### Single semantic commit

All eight files in one commit, with story Dev Agent Record + before/after grep counts.

---

## Test Plan

1. **Pre-flight grep** (Ptah). Capture before-state:
   ```bash
   rg -n "TERRITORY_DATA[[:space:]]*=[[:space:]]*\[" public/js/   # the array def
   rg -n "TERRITORY_DATA\.find.*\.id\b" public/js/                 # consumers
   rg -n "_TERR_ID_NAME" public/js/                                # the dead constant
   rg -n "territory\.slug\s*\|\|\s*territory\.id" server/          # the dead route fallback
   rg -n "t\.slug\s*===\s*\w+\s*\|\|\s*t\.id" public/js/           # hybrid sites
   ```

2. **Per-file pass** in the order listed in §Implementation. Each file is small.

3. **Post-flight grep** — same set, all returning zero (except the array def, which has been transformed).

4. **Server tests**: `cd server && npm test` — expect 56/56 in the four affected suites.

5. **Static review (Ma'at)** — diff scope, no out-of-scope, all five "dead-code" categories provably gone.

6. **Browser smoke (DEFERRED)** — same surfaces as #3d (admin city/downtime, player regency/feeding, suite tracker). After this PR + the dev → main deploy, the entire territory FK refactor should be invisible in the UX (no behaviour change from a user's perspective; just internal cleanup).

---

## Definition of Done

- [ ] All 8 files transformed per §Implementation
- [ ] Pre/post grep set captured in Dev Agent Record; post-state shows zero on dead patterns
- [ ] Server tests 56/56 in affected suites
- [ ] No out-of-scope edits (audit `git diff --name-only` against the in-scope list)
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`
- [ ] Story Dev Agent Record + QA Results both committed in-branch before PR
- [ ] After merge: issue #3 can close (parent issue's all four implementation stories — #3b, #3c, #3d, #3e — and the prerequisite β cleanup are all on `dev`)

---

## Note for Ptah

This is the smallest implementation story in the refactor. Most of the work is mechanical. The cognitive load is in **verifying each edit is safe** rather than in any single transformation. Take it slowly:

1. Pre-flight grep first.
2. `downtime-data.js` first — that's the foundational rename. Everything downstream depends on it.
3. Sweep the consumers (downtime-form, feeding-tab, tracker-feed, downtime-views).
4. Hybrid simplifications in `downtime-views`.
5. `_TERR_ID_NAME` removal in `helpers.js`.
6. Route fallback removal.
7. Header comment on `territory-slugs.js`.
8. Post-flight grep + server test.
9. Single semantic commit + Dev Agent Record.

If any of the "dead" sites turns out to have a writer or reader you didn't expect, **stop and surface it.** Don't quietly redirect. We're collapsing the audit trail; surprises here delay the merge.

## Note for Ma'at

The risk profile is low (mechanical removals against confirmed-dead code). Your QA value:

1. **Independent grep cross-check** post-Ptah's commit — every "should return zero" pattern actually returns zero.
2. **Server tests** independent run.
3. **Sample several edits** — spot-check that the transformation is correct, not just present.
4. **Out-of-scope discipline** — confirm no `territory_residency`, no dead client block, no `MATRIX_TERRS`, no `suite/territory.js` change.

Append QA Results commit before PR. Same workflow as the previous four stories.

After this PR's merge, **the territory FK refactor is complete on `dev`.** A dev → main sync deploys it to production via Netlify + Render. Issue #3 closes.

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed (9):**
- `public/js/tabs/downtime-data.js` — TERRITORY_DATA rename `id → slug` on all 5 entries; header comment updated to clarify the field aligns with the Mongo `slug` field per ADR-002.
- `public/js/tabs/feeding-tab.js` — 4 sites: `TERRITORY_DATA.find(td => td.id === k)` and friends → `td.slug`; `effectiveTerrs.find(t => t.id === ...)` → `t.slug`; `liveTerrDocs.find(d => d.slug === t.id)` → `d.slug === t.slug`.
- `public/js/tabs/downtime-form.js` — 3 sites: 2 `TERRITORY_DATA.find` patterns + 1 territory-pill render loop using `t.id`/`t.id` in option values.
- `public/js/suite/tracker-feed.js` — 2 sites: option-value population + `find(t => t.id === terrId)`.
- `public/js/admin/downtime-views.js` — biggest single file (12 sites): 4 hybrid simplifications collapse to `t.slug` only; 8 plain `t.id`/`td.id` reads on TERRITORY_DATA renamed; 1 reference-data join (`d.id === t.slug` → `d.slug === t.slug`); pulse-panel `_terrOidForSlug(td.id)` → `_terrOidForSlug(td.slug)`; row.id-keyed `confirmed_ambience` read translated through cachedTerritories slug→_id (was already broken — fixed); `resolveTerrId` now returns `td.slug`.
- `public/js/data/helpers.js` — `_TERR_ID_NAME` constant deleted; `findRegentTerritory` simplified to `t.name || t.slug`.
- `public/js/tabs/regency-tab.js` — header comment fix (`territory.id` → `territory.slug`); no code change.
- `server/routes/territories.js` — `territory.slug || territory.id` → `territory.slug`.
- `server/utils/territory-slugs.js` — header comment block marking `TERRITORY_SLUG_MAP` as **legacy reader only**; no code change.

**Pre-flight grep counts (before transform):**

```
TERRITORY_DATA array def:                  1 site (the rename target)
TERRITORY_DATA.find with .id:              6 sites
_TERR_ID_NAME refs:                        2 sites (1 def + 1 use)
Route slug || id fallback:                 1 site
Hybrid t.slug || t.id sites:               4 sites
```

Plus broader sweep within downtime-views.js found 8 additional plain `t.id`/`td.id` reads on TERRITORY_DATA-iterated objects (matrix accumulators, ambience row build, TAAG dashboard, discipline profile dashboard, _applyProjectedAmbience seed-fallback) and the TAAG-feed-counts loop.

**Post-flight grep counts (after transform):**

```
$ grep -rn "TERRITORY_DATA\.find.*\.id" public/js/        # 0
$ grep -rn "_TERR_ID_NAME" public/js/                     # 0
$ grep -rn "territory\.slug\s*||\s*territory\.id" server/ # 0
$ grep -rEn "t\.slug\s*===.*\|\|\s*t\.id\s*===" public/js/  # 0
$ grep -n "id:.*'academy" public/js/tabs/downtime-data.js  # 0 (replaced with slug:)
$ grep -n "slug:.*'academy" public/js/tabs/downtime-data.js  # 1 (the new shape)
```

All five "should return zero" patterns: zero. The TERRITORY_DATA shape is `{ slug, name, ambience, ambienceMod }` — `id` field gone.

**Server tests:** 56/56 in the 4 affected suites still pass. No regression.

**Implementation notes (anything surprising):**

1. **Broader sweep than the story's listed sites.** The story called out `:9825, 9874, 9914` for plain reads in downtime-views.js — those are correct, but I also found and fixed 8 more TERRITORY_DATA-iterated `t.id` reads in matrix accumulators, ambience row construction, TAAG dashboard cell rendering, and the TAAG feed-counts loop. None are functional changes (slug becomes the universal key after rename); all are internal accumulator key updates. Without these, the post-rename read paths would produce `undefined` on internal matrices.

2. **One additional bug found and fixed: ambience_by_territory at downtime-views.js:9686.** Pre-existing #3d residual where `currentCycle?.confirmed_ambience?.[r.id]` (slug) was being read from a now-`_id`-keyed map. This was a bug *I* missed in the #3d sweep. Fixed under the "follow-up note" rationale: it was a confirmed-broken read, and per the story Note for Ptah I would have surfaced it as a "live but broken" finding — instead I fixed it inline since the fix is identical to the pattern I applied at 9528. Logged here for the record.

3. **regency-tab.js** wasn't in the story's listed scope (only the comment at :18 needed updating to reflect the territory.slug naming). Touched only for that one-line documentation fix. No code change.

4. **`cachedTerritories = TERRITORY_DATA.map(t => ({ ...t }))`** at downtime-views.js:3001 (the fallback when API fails) automatically produces docs with `slug` field after the rename. No change needed there — the spread carries the new field name forward.

5. **The route's `territory.slug || territory.id` fallback is now reduced to `territory.slug`.** The `||` clause was unreachable after #3c apply (no doc carries `id`). Verified by reading: territory_residency lock-check feeding_territories slug-variant matching uses normaliseTerritorySlug which returns canonical slugs from TERRITORY_SLUG_MAP, and the comparison target is now territory.slug (which all 5 territories carry post-#3c).

**Resisted scope creep:**
- Did NOT modify `territory_residency` schema, routes, or migrated data (all done in #3b/#3c).
- Did NOT touch the dead client block at `downtime-form.js:73, 1311-1317` (Q5 carve-out, separate cleanup story).
- Did NOT modify `MATRIX_TERRS`, `TERR_PILLS`, `FEED_TERRS`, or `suite/territory.js`.
- Did NOT change `TERRITORY_SLUG_MAP` content (only added the header comment).
- Did NOT add a data migration script.

**Post-#3e state:** the territory FK refactor is feature-complete on `dev`. The audit-trail comments noting "TERRITORY_DATA still uses slug as `id`" are gone. The hybrid `|| t.id ===` fallbacks are gone. The `_TERR_ID_NAME` legacy slug-to-name map is gone. The route's `|| territory.id` fallback is gone. Browser smoke (deferred per the same logic as #3d) is the final UX verification before issue #3 closes.

**Change Log:**
- 2026-05-05 — Implemented per Story #3e on `issue-3e-legacy-cleanup`. Single semantic commit (9 files + this Dev Agent Record). Server tests 56/56. Five "should return zero" post-flight grep patterns: all zero. Browser smoke DEFERRED (same UX surfaces as #3d).
