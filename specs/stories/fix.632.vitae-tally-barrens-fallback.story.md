# Story Fix.632: Vitae tally ambience always falls to Barrens (slug vs _id)

## Status: review (product bug fixed + spec corrected; fix-477 5/5 green, feeding regression clean)

## Metadata
- issue: 632
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/632
- branch: morningstar-issue-632-vitae-tally-barrens-fallback
- type: fix (PRODUCT bug + stale test)
- found_by: #626/#624 regression sweep

---

## Story

**As a** player projecting my feeding vitae,
**I want** the ambience bonus to reflect the territory I declared feeding rights in,
**so that** my vitae tally is correct instead of always showing the Barrens −4 penalty.

---

## ⚠️ Task 0 — TRIAGE (DONE; verdict below)

**Verdict: REAL PRODUCT BUG, plus a separately-stale test.** Evidence:

### The product bug (player-facing)
`computeVitateTally` (public/js/tabs/feeding-tab.js:479) resolves the ambience bonus by matching the player's declared feeding territories against `TERRITORY_DATA`:
```js
const td = effectiveTerrs.find(t => String(t._id) === tid);   // :509
```
But `effectiveTerrs` is built from `TERRITORY_DATA` (:495), whose entries have **`slug`, not `_id`** — the field was renamed `id`→`slug` (ADR-002, downtime-data.js:120-127, e.g. `{ slug: 'academy', name: 'The Academy', ambienceMod: +3 }`). So `t._id` is **always `undefined`**, the `find` never matches, and `ambience` keeps its Barrens default (−4) for **every** feeding character — regardless of status or territory. That's why AC1–AC4 all return Barrens while AC5 (the no-territory default) passes.

The real feeding form writes the grid keys as **slugs**: the territory pills use `data-terr-val="${t.slug}"` (downtime-form.js:5844) and `slugFromGrid()` reads the grid back as a slug (:3906/3920/6883). So the grid is `{ "<slug>": "<status>" }` (e.g. `{ academy: 'feeding_rights' }`) — the match must be on **`t.slug`**, not `t._id`.

**Player impact:** the live player-side vitae projection (`feeding-tab.js:175/222`, used when no ST-saved `feeding_vitae_tally` exists) shows the wrong ambience (always Barrens −4) for any character with declared feeding rights. Wrong but bounded — an ST-saved tally overrides it.

### The stale test (separate)
`tests/fix-477-vitae-tally-status-filter.spec.js` builds the grid with keys `the_academy` / `the_harbour` / `the_dockyards` (e.g. `buildSub({ the_academy: 'feeding_rights' })`) — the **pre-rename** ids. The current slugs are `academy` / `harbour` / `dockyards` / `northshore` / `secondcity` (no `the_` prefix). So even after the product fix, the spec's keys won't match `TERRITORY_DATA.slug`; the spec's mock must be updated to the real slugs.

(Note: this spec is a **module sandbox** test — it creates a `#feed-sandbox-477` div and `import`s `feeding-tab.js` then calls `renderFeedingTab(sandbox, c)` (spec :48-53). It does NOT boot the full app, so it does **not** need the #625 `bootApp` harness.)

---

## Acceptance Criteria

- [ ] **AC1** — `computeVitateTally` resolves ambience by `slug` (the field the form actually writes), so a character with feeding rights in a territory gets that territory's `ambienceMod`, not Barrens.
- [ ] **AC2** — `tests/fix-477-vitae-tally-status-filter.spec.js` grid keys use the real slugs (`academy`/`harbour`/`dockyards`/`northshore`/`secondcity`); the spec is **5/5 green**.
- [ ] **AC3** — No other feeding/vitae spec regresses (run the feeding specs).
- [ ] **AC4** — The product change is confined to the ambience-resolution lookup; the herd / oath / ghoul / rite / manual maths are untouched.

---

## Tasks

### Task 1 — Product fix (the bug)
In `public/js/tabs/feeding-tab.js:509`, change the territory match from `_id` to `slug`:
```js
const td = effectiveTerrs.find(t => String(t.slug) === tid);
```
Confirm `tid` (the grid key) is the slug the form writes (verified: `slugFromGrid` + `data-terr-val=t.slug`). Nothing else in `computeVitateTally` changes.

### Task 2 — Fix the stale spec mock
In `tests/fix-477-vitae-tally-status-filter.spec.js`, replace the grid keys `the_academy`/`the_harbour`/`the_dockyards`/(others) with the real slugs `academy`/`harbour`/`dockyards`/`northshore`/`secondcity` everywhere they appear (the `buildSub({...})` calls + the AC5 all-`none` case). Keep the expected ambience values (Academy +3, Harbour −2, North Shore +2, Second City +2) — those come from `TERRITORY_DATA` and are correct.

### Task 3 — Verify
Run `tests/fix-477-vitae-tally-status-filter.spec.js` → 5/5 green. Then run the other feeding-tab specs (e.g. `feat-16-17-fix44-tracker-feeding.spec.js` feeding tests, `fix-473-feeding-custom-pool-blank.spec.js`) to confirm no regression. One persistent http-server; never concurrent Playwright.

---

## Dev Notes

### Key locations
- `public/js/tabs/feeding-tab.js:479` `computeVitateTally`; `:495-498` `effectiveTerrs` (TERRITORY_DATA ⊕ liveTerrDocs by `slug`); `:506` `ACTIVE_FEED_STATUSES`; **`:509` the buggy `t._id` match**.
- `public/js/tabs/downtime-data.js:122-127` `TERRITORY_DATA` (`slug`/`name`/`ambience`/`ambienceMod`; **no `_id`** — `id`→`slug` per ADR-002).
- `public/js/tabs/downtime-form.js:5844` (pill `data-terr-val=t.slug`), `slugFromGrid` (:3906/3920/6883) — proof the grid keys are slugs.
- `tests/fix-477-vitae-tally-status-filter.spec.js` — sandbox spec; stale `the_*` grid keys.

### Guardrails
- **Don't weaken the test to go green** (fix.617 rule) — this IS a real bug; fix the product (Task 1) AND correct the stale mock (Task 2). Both are needed for green.
- Keep the change to the ambience lookup only (AC4).
- British English. `liveTerrDocs` merge stays keyed on `slug` (already correct, :496) — only the grid-key match (:509) is wrong.

### Why both fixes are needed
The product fix alone won't green the spec (its keys are `the_academy`, not `academy`); the test fix alone won't help real users (the product still matches `_id`). Apply both.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Task 0 verdict (AC — recorded)
REAL PRODUCT BUG: `computeVitateTally` matches feeding territories on `t._id`, but `TERRITORY_DATA` entries have `slug` (no `_id`, ADR-002), so the match always fails → ambience always Barrens −4 for every feeding character. The form writes slug keys (`slugFromGrid` / `data-terr-val=t.slug`). Fix = match on `t.slug`. The spec is separately stale (`the_academy` vs `academy` slugs) and must be corrected too.

### Debug Log References
- `npx playwright test tests/fix-477-vitae-tally-status-filter.spec.js` → **6 passed** (5 ACs + 1 QA guard).
- **QA sign-off (Quinn):** +1 multi-territory test — the tally picks the BEST ambience across several declared feeding territories (academy +3 / harbour −2 / dockyards 0 → Academy +3). Exercises the loop + max-selection + slug-match across multiple entries; doubles as a regression guard (pre-fix → Barrens). Green first run.
- Regression: `fix-473-feeding-custom-pool-blank` + `feat-16-17-fix44-tracker-feeding` → **38 passed / 3 skipped (#627 fixme) / 0 failed** (incl. feat-16-17:958 "vitae tally uses live territory ambience").

### Completion Notes List
- **Task 1 (product fix) — done.** `feeding-tab.js:509`: `String(t._id)` → `String(t.slug)`. The territory match now uses the slug the form actually writes, so a feeding character's ambience resolves to their declared territory instead of always falling to Barrens −4. One-line change, confined to the ambience lookup (AC4).
- **Task 2 (stale spec) — done.** `tests/fix-477-vitae-tally-status-filter.spec.js`: grid keys `the_academy`/`the_harbour`/`the_north_shore`/`the_second_city`/`the_dockyards` → real slugs `academy`/`harbour`/`northshore`/`secondcity`/`dockyards` (5 replacements). Expected ambience values unchanged.
- **Task 3 (verify) — done.** fix-477 5/5; feeding specs 38/3-skip/0-fail (no regression).
- **AC1✅ AC2✅ AC3✅ AC4✅.** Did NOT weaken the test (fix.617 rule) — fixed the real product bug + the stale mock.

### File List
- public/js/tabs/feeding-tab.js (`:509` `_id`→`slug`)
- tests/fix-477-vitae-tally-status-filter.spec.js (grid keys → real slugs)
- specs/stories/fix.632.vitae-tally-barrens-fallback.story.md (this story)

### Change Log
- 2026-06-06 — fix.632: feeding vitae tally ambience matched on `t._id` (always undefined since TERRITORY_DATA uses `slug`, ADR-002) → always Barrens −4. Fixed the match to `t.slug` + corrected the stale spec grid keys. fix-477 5/5 green, feeding regression clean.
