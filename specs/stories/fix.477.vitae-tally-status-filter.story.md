---
issue: 477
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/477
branch: ms/issue-477-vitae-tally-status-filter
---

# fix.477 — computeVitateTally status filter: feeding_rights replaces resident

**Status:** review

## Story

As a player with Regency, Lieutenant role, or merit-granted feeding rights,
I want the vitae tally in my feeding tab to reflect my actual territory's ambience,
so that I see the correct vitae sources rather than an incorrect Barrens −4.

## Acceptance Criteria

- **AC1** — Submission with `the_second_city: "feeding_rights"` → vitae tally shows Second City ambience, not Barrens
- **AC2** — Submission with `the_harbour: "poaching"` → vitae tally shows Harbour ambience, not Barrens
- **AC3** — Submission with legacy `the_academy: "resident"` → vitae tally still resolves correctly (backward compat)
- **AC4** — Submission with legacy `the_harbour: "poacher"` → vitae tally still resolves correctly (backward compat)
- **AC5** — Submission with all territories `"none"` → vitae tally defaults to Barrens −4
- **AC6** — Blocklist hotfix on main (commit `49c628e`) is replaced by the correct explicit whitelist
- **AC7** — Playwright test covers AC1 (`feeding_rights`) and AC2 (`poaching`) cases

## Tasks / Subtasks

- [x] T1 — Replace blocklist with explicit whitelist in `computeVitateTally`
  - [x] T1.1 — Change the status filter at `feeding-tab.js:500` from blocklist to whitelist
  - [x] T1.2 — Include all current and legacy status values (see Dev Notes)
  - [x] T1.3 — Parse-check via pre-commit hook: `git add` file, run `bash .githooks/pre-commit`
- [x] T2 — Add Playwright tests for AC1, AC2, AC3, AC4, AC5
  - [x] T2.1 — Create `tests/fix-477-vitae-tally-status-filter.spec.js`
  - [x] T2.2 — Run tests and verify all pass

## Dev Notes

### The bug

`computeVitateTally` in `public/js/tabs/feeding-tab.js` originally filtered territory grid entries with:

```js
if (status !== 'resident' && status !== 'poach') continue;
```

The DT form (downtime-form.js) writes `"feeding_rights"` for any territory where the character has feeding rights (Regent, Lieutenant, or merit), and `"poaching"` for poaching entries. Neither matches `"resident"` or `"poach"`, so ALL feeding-rights characters fell through to the Barrens −4 default whenever `feeding_vitae_tally` was not yet saved by the ST.

A hotfix (commit `49c628e`) replaced this with a blocklist:
```js
if (!status || status === 'none' || status === 'barrens') continue;
```

This is functional but does not express intent. The desired fix is an explicit whitelist.

### Canonical status values (from downtime-form.js)

From the DT form source (lines 5381–5389, 6164):

| Status value | Meaning | Written by |
|---|---|---|
| `"feeding_rights"` | Current term — character has feeding rights | DT form (current) |
| `"poaching"` | Current term — character is poaching | DT form (current) |
| `"none"` | Territory not selected | DT form |
| `"barrens"` | Player chose Barrens explicitly | DT form |
| `"resident"` | **Retired** — DT form migrates this to `"feeding_rights"` on load | Old submissions |
| `"poacher"` | **Retired** — DT form migrates this to `"poaching"` on load | Old submissions |
| `"poach"` | **Never used in real data** — was in original filter but the legacy term was always `"poacher"` | Original code artefact |

`"none"` and `"barrens"` must be skipped. All other values must be accepted (whitelist).

### The correct fix

```js
// Accept current terms and all legacy variants; skip unselected and the
// special Barrens entry (handled by the Barrens default above).
const ACTIVE_FEED_STATUSES = new Set([
  'feeding_rights', 'poaching',          // current
  'resident', 'poacher', 'poach',        // legacy / retired
]);
if (!ACTIVE_FEED_STATUSES.has(status)) continue;
```

Or inline as a single condition — either form is acceptable. The Set approach is preferred because it documents all values explicitly.

### File to modify

`public/js/tabs/feeding-tab.js` — **one line change** at the filter inside `computeVitateTally` (currently line 500 on the dev branch, which has the blocklist hotfix).

Do NOT change:
- The rest of `computeVitateTally` — slug lookup, ambience merging, tally shape
- `renderVitaeTallyCard` — purely display
- `buildPool` — pool computation, not tally
- Anything in `downtime-form.js` or `downtime-views.js`

### Pre-existing state on branch

The branch (`ms/issue-477-vitae-tally-status-filter`) was cut from `dev` after the hotfix was merged. The file currently has:
```js
if (!status || status === 'none' || status === 'barrens') continue;
```
This must be replaced with the whitelist.

### Test approach

Create a new Playwright spec: `tests/fix-477-vitae-tally-status-filter.spec.js`

Reuse the same sandbox pattern from `tests/fix-475-feeding-vitae-pipeline.spec.js`:
- `openFeedingTabSandbox(page, char, sub)` — same approach, cycle status `"game"`, inject submission, render feeding tab, wait for `.fvt-card`
- Route `**/api/downtime_cycles*` → `[{ _id: 'cycle-fix477', status: 'game', ... }]`
- Route `**/api/downtime_submissions*` → `[sub]`
- Route `**/api/territories*` → `[]`
- Route `**/api/**` → `[]` (catch-all)

The test helper should be self-contained in the new file (copy the minimal setup helpers rather than importing from the fix-475 file).

Test character: Presence 3, no merits (pool irrelevant — we're testing the vitae card, not dice).

Test submissions differ only in `feeding_territories` JSON:
- AC1: `{ the_second_city: 'feeding_rights' }` → `.fvt-card` contains "Second City", not "Barrens"
- AC2: `{ the_harbour: 'poaching' }` → `.fvt-card` contains "Harbour", not "Barrens"
- AC3: `{ the_academy: 'resident' }` → `.fvt-card` contains "Academy", not "Barrens"
- AC4: `{ the_harbour: 'poacher' }` → `.fvt-card` contains "Harbour", not "Barrens"
- AC5: `{ the_second_city: 'none', the_barrens_no_territory_: 'none' }` → `.fvt-card` contains "Barrens", value "-4"

Note: The vitae card only shows ambience when `tally.ambience !== 0`. Second City `ambienceMod` in TERRITORY_DATA should be non-zero (check the hardcoded data). For AC1, use Second City. For AC2, use Harbour (ambienceMod varies). For AC3, use Academy (Curated +3 in TERRITORY_DATA). Actually — for reliable tests, pick territories with non-zero ambienceMod so the card renders an ambience row. See `TERRITORY_DATA` in `public/js/tabs/downtime-data.js` for slug/ambienceMod values.

**Important from fix-475 experience:** The vitae card renders Barrens ambience row only when `tally.ambience !== 0`. Barrens is `−4` so it always renders. Named territories: check their `ambienceMod` — if `0`, the ambience row won't appear. Use territories with non-zero ambienceMod for named territory tests (Academy +3, Harbour 0 but can check `ambience_territory` text instead via `.fvt-card` containing text).

### Territory ambienceMod values (from TERRITORY_DATA)

Check `public/js/tabs/downtime-data.js` for exact values. From context:
- The Academy: `ambienceMod: 3` (Curated +3) — good for named territory test
- The Harbour: `ambienceMod: 0` (Untended −2? or Settled 0?) — varies per live DB; use `.not.toContainText('Barrens')` assertion for Harbour test
- The Second City: variable (Settled +0 in screenshots) — use text assertion not value assertion

Safest assertion pattern for named territory tests:
```js
await expect(sandbox.locator('.fvt-card')).not.toContainText('Barrens');
// OR for Academy specifically:
await expect(sandbox.locator('.fvt-card')).toContainText('Academy');
```

### Relation to fix-475

fix-475 (issue #475) fixed three bugs in the feeding pipeline. This story (fix-477) is a follow-up that was not in scope for fix-475 — it corrects the status filter terminology. The fix-475 test `AC5` tested the slug lookup fix using `{ the_academy: 'resident' }` as the submission — that test still passes because `'resident'` is now in the whitelist. No changes to fix-475 tests are needed.

## Dev Agent Record

### Debug Log

- AC1/AC3/AC4 value assertions initially failed with "strict mode violation" — `.fvt-card .fvt-val` resolves to 2 elements with the same positive value. Fixed by scoping to the `.fvt-row` containing the territory name, matching the pattern used in AC5's Barrens row assertion.

### Completion Notes

- T1: Replaced blocklist `if (!status || status === 'none' || status === 'barrens') continue;` with explicit `ACTIVE_FEED_STATUSES` Set in `computeVitateTally` at `feeding-tab.js`. Set includes all current (`feeding_rights`, `poaching`) and legacy (`resident`, `poacher`, `poach`) status values.
- T2: 5 Playwright tests created and all pass (5/5). Assertions for value rows scoped to `.fvt-row` by territory name to avoid strict-mode multiple-match failures.

## File List

- `public/js/tabs/feeding-tab.js` — whitelist filter applied in `computeVitateTally`
- `tests/fix-477-vitae-tally-status-filter.spec.js` — new Playwright spec (5 tests, AC1–AC5)
- `specs/stories/fix.477.vitae-tally-status-filter.story.md` — this story

## Change Log

- 2026-05-22: Story created from issue #477
- 2026-05-22: Implementation complete — T1 and T2 done, all 5 tests pass
