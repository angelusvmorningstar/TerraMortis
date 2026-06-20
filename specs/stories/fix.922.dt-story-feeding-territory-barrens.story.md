---
title: 'DT downtime report: Territory Pulse dropped for real-territory feeders (_feedTerrEntries _id keys)'
type: 'fix'
issue: 922
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/922
branch: morningstar-issue-922-feeding-territory-barrens
created: '2026-06-20'
status: review
recommended_model: 'haiku/sonnet — single one-line edit reusing the existing resolveTerrId() helper; no design decisions, no new code paths'
context:
  - public/js/admin/downtime-story.js
---

## Intent

**Problem:** A player (Einar Solveig) reported their DT4 feeding report shows them feeding in **The Barrens** when they selected **The Second City**. Investigation of the DT4 export confirms the submission data is correct — `feeding_territories` holds the right territory `_id` (`69d9e54c00815d471503bea8` = The Second City) and `feeding_review.outcome` is the correct Second City narrative. The wrong "Barrens" is generated at render time, not stored.

`_feedTerrEntries()` (`downtime-story.js:3069`) resolves each feeding-grid key via `TERRITORY_SLUG_MAP[slug]`. Post-migration (ADR-002) the grid keys are Mongo `_id`s (24-hex), which are **not** in `TERRITORY_SLUG_MAP` (that map is keyed by slugs and display-name variants). So `rawId` comes back `undefined` and the code falls through to its default `{ id: 'barrens', name: 'The Barrens' }`. Every real-territory feed therefore renders as The Barrens in the player-facing DT Story report.

**Scope:** 24 of 29 DT4 submissions affected (every player who fed in a real territory). The 4 unaffected genuinely selected Barrens (Henry St. John, Carver, Anichka, Hazel); 1 is a draft with no feeding selection.

**Secondary impact:** `buildTerritoryContext` suppresses co-residents, poachers, and the territory pulse when `id === 'barrens'` (`downtime-story.js:2990, 3002, 3254, 3569`), so the 24 mislabelled reports also drop their co-resident lists and per-territory pulse content. Fixing the resolver restores these automatically.

**No data is corrupted.** No `territory_reports` or `published_outcome` are persisted on any submission (0 found across all 29) — the report is built live each render. A code fix corrects all 24 retroactively with no DB write.

**Fix:** `_feedTerrEntries()` already lives in a module that holds `_currentTerritories` (the `GET /api/territories` cache) and exposes an existing helper `resolveTerrId(raw)` (`downtime-story.js:75-79`) that maps a 24-hex `_id` → territory `slug` via that cache. Fall back to it when `TERRITORY_SLUG_MAP[slug]` misses. This is the same migration-aware resolution already used by the sibling resolvers `_playerFeedTerrsText` (`downtime-views.js:11662`) and `_getSubFedTerrs` (`downtime-views.js:11711`); `_feedTerrEntries` was simply missed when those were hardened.

**Approach:** One targeted edit, one file. Reuse the existing `resolveTerrId` helper — do **not** inline a new regex/territory lookup, and do **not** attempt the broader `normaliseTerritoryId()` consolidation (that is #816 / #496, out of scope here).

## Boundaries & Constraints

**Always:**
- Reuse the existing `resolveTerrId(slug)` helper for the `_id` fallback. It returns the territory `slug` (or `null`) by matching `String(td._id) === raw` against `_currentTerritories`.
- Preserve the existing order: try `TERRITORY_SLUG_MAP[slug]` first (handles legacy slug / display-name keys with zero behaviour change), then fall back to `resolveTerrId(slug)` only when the map misses.
- Keep the Barrens default intact: a genuinely-Barrens key (`the_barrens_no_territory_` → `TERRITORY_SLUG_MAP` returns `null`, `resolveTerrId` returns `null`) must still resolve to `{ id: 'barrens', name: 'The Barrens' }`.
- `name` continues to derive from `TERRITORY_DISPLAY[rawId]` (keyed by slug: `academy`, `harbour`, `dockyards`, `secondcity`, `northshore`).

**Never:**
- Do not write any data / migration script — submission data is already correct.
- Do not change `TERRITORY_SLUG_MAP`, `TERRITORY_DISPLAY`, or `resolveTerrId`.
- Do not touch the barrens-suppression branches in `buildTerritoryContext` — they become correct for free once the resolver returns real territory ids.
- Do not refactor toward a shared `normaliseTerritoryId()` boundary (tracked separately in #816 / #496).
- Do not modify the sibling resolvers in `downtime-views.js`; they already handle `_id` keys.

## Code Map — One Fix Site

### `_feedTerrEntries()` (`downtime-story.js:3069`)

**Existing helper this fix reuses (`downtime-story.js:75-79`, unchanged):**
```js
function resolveTerrId(raw) {
  if (!raw) return null;
  const t = (_currentTerritories || []).find(td => String(td._id) === raw);
  return t?.slug || null;
}
```

**Current (broken):**
```js
function _feedTerrEntries(sub) {
  const raw = parseFeedingTerritories(sub)
    .filter(([, v]) => v && v !== 'none' && v !== 'Not feeding here')
    .map(([slug]) => {
      const rawId = TERRITORY_SLUG_MAP[slug];   // _id keys miss → undefined
      return { slug, id: rawId || 'barrens', name: (rawId && TERRITORY_DISPLAY[rawId]) || 'The Barrens' };
    });
  // Deduplicate by id
  const seen = new Set();
  const deduped = raw.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  // Every player gets at least a Barrens entry
  return deduped.length ? deduped : [{ slug: 'the_barrens', id: 'barrens', name: 'The Barrens' }];
}
```

**Fix (single changed line):**
```js
function _feedTerrEntries(sub) {
  const raw = parseFeedingTerritories(sub)
    .filter(([, v]) => v && v !== 'none' && v !== 'Not feeding here')
    .map(([slug]) => {
      const rawId = TERRITORY_SLUG_MAP[slug] || resolveTerrId(slug);   // _id keys resolve via _currentTerritories
      return { slug, id: rawId || 'barrens', name: (rawId && TERRITORY_DISPLAY[rawId]) || 'The Barrens' };
    });
  // Deduplicate by id
  const seen = new Set();
  const deduped = raw.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  // Every player gets at least a Barrens entry
  return deduped.length ? deduped : [{ slug: 'the_barrens', id: 'barrens', name: 'The Barrens' }];
}
```

Resolution walk for Einar's grid `{"69d9e54c00815d471503bea8":"feeding_rights", ...}`:
- `TERRITORY_SLUG_MAP['69d9e54c00815d471503bea8']` → `undefined` (not a slug key)
- `resolveTerrId('69d9e54c00815d471503bea8')` → finds the territory doc by `_id` → returns `'secondcity'`
- `rawId = 'secondcity'` → `id: 'secondcity'`, `name: TERRITORY_DISPLAY['secondcity']` = `'The Second City'` ✓

Genuine-Barrens walk for `{"the_barrens_no_territory_":"barrens"}`:
- `TERRITORY_SLUG_MAP['the_barrens_no_territory_']` → `null` (explicit Barrens mapping in `downtime-constants.js:131`)
- `resolveTerrId('the_barrens_no_territory_')` → `null` (not a 24-hex `_id`)
- `rawId = null` → `id: 'barrens'`, `name: 'The Barrens'` ✓ (unchanged)

## Tasks

- [x] **T1 — `_feedTerrEntries` `_id` fallback** (`downtime-story.js:3073`)
  - Change `const rawId = TERRITORY_SLUG_MAP[slug];` → `const rawId = TERRITORY_SLUG_MAP[slug] || resolveTerrId(slug);`
  - No other lines in the function change.

- [x] **T2 — Parse-check**
  - Confirm `public/js/admin/downtime-story.js` parses cleanly (Node `new Function` / the repo `.githooks` parse-check).

- [x] **T3 — Verification harness (QA)** — re-scoped to the live surface (Territory Pulse in `compilePushOutcome`)
  - `tests/issue-922-dt-story-pulse-territory-resolve.spec.js` (3 tests, all pass; red-green verified).
  - AC-1: real territory by `_id` key → `## Territory Pulse — The Second City` included in the pushed `st_review.outcome_text` (fails pre-fix).
  - AC-2: genuine Barrens → no Territory Pulse heading (correctly skipped).
  - AC-3: legacy slug key → pulse still resolves (no regression).
  - Regression batch (territory/pulse area): `issue-922` + `fix-470` green (9/9). `fix-814` (1) and `issue-332` (4) show failures, but these are **pre-existing** — confirmed identical with the #922 change reverted (5 fail either way), so not introduced by this story. Flagged separately for triage; out of scope here.

## Files to Change

- `public/js/admin/downtime-story.js` — one line in `_feedTerrEntries`; no other files.

## Files Changed

- `public/js/admin/downtime-story.js` — one line in `_feedTerrEntries` (`_id` fallback via `resolveTerrId`); 3-line explanatory comment added above it.
- `tests/issue-922-dt-story-pulse-territory-resolve.spec.js` — new QA spec (3 tests).

## Dev Agent Record

### Completion Notes

**T1 — implemented.** `_feedTerrEntries` (`downtime-story.js:3073`) now resolves the grid key as `TERRITORY_SLUG_MAP[slug] || resolveTerrId(slug)`. Legacy slug / display-name keys still hit `TERRITORY_SLUG_MAP` first (zero behaviour change); post-ADR-002 `_id` keys, which are absent from that map, now fall back to the existing `resolveTerrId()` helper (`downtime-story.js:75-79`), which maps `_id` → territory `slug` via the module's `_currentTerritories` cache. Single line changed; the dedup and Barrens-default tail of the function are untouched. Reused the existing helper rather than inlining the regex/`cachedTerritories` lookup used by the sibling resolvers in `downtime-views.js`.

**T2 — parse-check green.** `node --input-type=module --check < public/js/admin/downtime-story.js` → `parse OK` (matches the `.githooks/pre-commit` method).

**Dev-side AC validation (logic simulation).** Replicated the fixed `map` step against all 29 DT4 grids from `backup_downtime_4_2026-06-18.json` using live-shaped territory docs (`{_id, slug}`). Result: **28 PASS / 0 FAIL** —
- All 24 real-territory feeders resolve to their selected territory (Einar → The Second City; René/Casamir/Aleksei/Eve → The Second City; Margaret/Jack/Macheath/Ivana → The Academy; etc.).
- The 4 genuine-Barrens characters (Henry St. John, Carver, Anichka, Hazel) still resolve to The Barrens.
- Humongulus (draft, no feeding selection) → Barrens default (n/a — not a regression).

Secondary impact resolves automatically: with real territory ids returned, `buildTerritoryContext`'s `id === 'barrens'` suppressions (`:2990, :3002, :3254, :3569`) no longer fire for these reports, restoring co-resident lists and territory-pulse content.

### Debug Log

- Confirmed the canonical territory field post-ADR-002 is `slug` (`server/schemas/territory.schema.js:30`; ADR-002 renamed legacy `id` → `slug`). `resolveTerrId` reads `t?.slug`, consistent with existing slug-dependent code in this module (territory-pulse injection `:3570`, `_terrGridVal` `:81`).

### QA Notes

**⚠️ Fixture trap for QA:** `data/dev-fixtures/territories.json` and the inline `TERRITORIES` in `public/js/dev-fixtures.js` are **stale** — they still carry the legacy pre-ADR-002 `id` field (`"id":"harbour"`) and have **no `slug`**. `resolveTerrId` keys off `slug`, so a Playwright/local run that feeds these fixtures as `_currentTerritories` will see `resolveTerrId` return `null` and the report will (wrongly) still show The Barrens — a false negative. QA must drive the harness with **live-shaped territory docs that include `slug`** (as in the dev simulation above). This staleness pre-dates and is orthogonal to this fix (it already breaks the territory-pulse path on localhost); flag separately if it warrants its own chore.

T3 (Playwright verification harness) remains for the QA cycle — assert Einar's report renders "The Second City" with co-resident/pulse blocks, Anichka still "The Barrens" with co-residents suppressed, and a legacy slug-keyed fixture still resolves (no regression).

### QA finding (Quinn, 2026-06-20) — BLOCKER: player-facing surface not reached in current code

While building the harness I traced every live consumer of `_feedTerrEntries` and found the patched function's territory-name output does **not** reach a player in the current `main`/`dev` code. The fix is logically correct (re-confirmed: 28/29 sim PASS), but it appears **necessary-but-not-sufficient** for Einar's actual complaint:

- `getApplicableSections` (`downtime-story.js:1148`) does **not** include `territory_reports`. `#886` ("drops redundant drafting layer", commit b64703d7) reworked the section list and the Territory Report section is no longer enumerated.
- Therefore both name-emitting consumers are unreachable:
  - `compilePushOutcome` `key === 'territory_reports'` branch (`:3601`, the `## ${terr.name}` heading the player reads) — **dead**: the loop iterates `getApplicableSections`.
  - `renderTerritoryReports` (`:3216`, switch case `:1458`, save re-render `:4225`) — not rendered; `renderCharacterView` (`:1395`) and `renderProgressTracker` (`:1378`) both iterate `getApplicableSections`.
- The only **live** `_feedTerrEntries` consumer is the Territory Pulse loop inside `feeding_validation` (`:3571`). It `continue`s when `terr.id === 'barrens'` (`:3572`). Pre-fix, real territories were misread as barrens and their pulse was **skipped**; post-fix they resolve and the pulse is emitted as `## Territory Pulse — The Second City`. This is a genuine improvement, but it never prints the literal "feeding in the barrens" Einar reported.
- `public/js/tabs/story-tab.js` (player Story tab) holds no territory logic — it renders the compiled markdown only.

**Conclusion:** no current live path prints a feeding-territory heading to the player, so Einar's literal "feeding in the barrens" is not reproducible against current `main`. Open question for Angelus: **which surface/environment did Einar see it on?** (a) a report delivered/cached under pre-#886 code where `territory_reports` was still published; (b) the Territory Pulse reading wrong/absent; (c) an untraced surface (portal readback / email digest). The answer decides whether this story also needs `territory_reports` restored to `getApplicableSections`, or whether the fix should instead be verified via the Territory Pulse output.

**T3 harness deferred** pending that decision — writing an E2E now would either assert against a dead path (false green) or omit Einar's real surface. Status left at `review`.

### QA resolution (Quinn, 2026-06-20) — surface identified; ticket mis-scoped

Angelus confirmed the player's surface: the **feeding tab** (roll calculator / player feeding view), not the DT Story report. That is `public/js/tabs/feeding-tab.js` → `computeVitateTally` (`:498`), whose ambience block defaults to `ambience_territory = 'Barrens'` (`:527-528`) and resolves the territory from `feeding_territories`.

**That function is already fixed by Peter's #920** ("feeding tab territory lookup uses _id post-migration", commit `5406f0a2`), which is **on `origin/main`/production**. `feeding-tab.js:536` now matches `(t._id && t._id === tid) || String(t.slug) === tid`; the caller passes live territory docs (`:193, :240`). So Einar's "feeding in the barrens" is resolved on production — his 11:04 report predates the deploy / a refresh.

**Implication for #922:** this story patched a *different* function (`_feedTerrEntries` in `downtime-story.js`) — same root-cause class, but **not** the surface the player saw. The `_feedTerrEntries` fix is still valid and worth keeping for one **live** reason: in `compilePushOutcome` the Territory Pulse loop (`:3571-3572`) does `continue` when `terr.id === 'barrens'`, so pre-fix every real-territory feeder had their **Territory Pulse silently dropped** from the published downtime report; post-fix it resolves and the pulse is included. The `territory_reports` publish branch (`:3601`) is dead (incidental). The original AC ("player report shows The Second City not The Barrens") was wrong about the surface and should be re-pointed.

**Recommendation:** re-scope #922 to "Territory Pulse dropped for real-territory feeders (`_feedTerrEntries` `_id` resolution)", keep the one-line fix, and verify via the Territory Pulse output in `compilePushOutcome`. Close the player-facing "feeding tab Barrens" concern as fixed-by-#920 (ask Einar to refresh). Decision is Angelus's.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-20 | 1.0 | Story authored from player report + DT4 export investigation and code inspection | Claude (SM) |
| 2026-06-20 | 1.1 | T1 implemented (one-line `resolveTerrId` fallback in `_feedTerrEntries`); T2 parse-check green; dev-side AC simulation 28/29 PASS (4 genuine-Barrens preserved, 1 draft n/a). Status → review | Claude (Dev) |
| 2026-06-20 | 1.2 | QA: surface re-scoped — Einar's feeding-tab complaint already fixed by #920 on main; this story now fixes the live Territory Pulse drop in `compilePushOutcome`. Added `tests/issue-922-...spec.js` (3/3 pass, red-green verified). Issue #922 retitled + comment added | Claude (QA) |
