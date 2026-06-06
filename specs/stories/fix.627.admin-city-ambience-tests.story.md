# Story Fix.627: Restore the admin City-tab ambience tests (test drift)

## Status: review (3 tests restored; feat-16-17 36 pass / 0 skip / 0 fail)

## Metadata
- issue: 627
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/627
- branch: morningstar-issue-627-admin-city-ambience-drift
- type: fix (TEST-ONLY — the product is correct)
- found_by: #626 (quarantined the 3 tests as `test.fixme`)

---

## Story

**As a** developer maintaining the suite,
**I want** the 3 quarantined admin City-tab ambience tests rewritten to the current admin UI,
**so that** coverage of the ambience pre-select + save flow is restored (it was `test.fixme`'d in #626).

---

## ⚠️ Task 0 — TRIAGE (DONE; verdict: TEST DRIFT, product is correct)

The 3 tests in `tests/feat-16-17-fix44-tracker-feeding.spec.js` (currently `test.fixme`, with a `#627` note from #626) assert a **pre-rename mock shape** and an **old auto-save-on-change** design. The admin City ambience flow in `public/js/admin/city-views.js` is correct. Two distinct causes:

### Cause 1 — pre-select test (`:925` "live territory ambience is reflected in select")
The render iterates `TERRITORIES` (const `city-views.js:16`; entries have `id` = the slug, e.g. `'academy'`) and resolves the live doc via `_terrDoc(t.id)` → `terrDocs.find(d => d.slug === terrId)` (`:294`). It pre-selects the ambience option from `curAmb = td?.ambience || t.ambience` (`:431`, `selected` at `:439`).
**The spec's `LIVE_TERRITORIES` mock (spec `:103-108`) gives the live docs `{ _id, id: 'academy', ambience: 'Verdant', … }` with NO `slug`.** So `_terrDoc('academy')` finds nothing → `td` undefined → `curAmb` falls back to the `TERRITORIES` default (not `'Verdant'`) → the select isn't pre-set. Production matches on **`slug`** everywhere (`:294/323/535/628/633/694/699/721`) because the real `/api/territories` docs have `slug`. **The mock is stale.**

### Cause 2 — PUT-on-change tests (`:937` "changing ambience fires a PUT", `:993` "auto-save on change")
Ambience is **not** auto-saved on change. The render emits an explicit **`<button class="city-save-btn" data-terr-amb-save="${t.id}">Save Ambience</button>`** (`:445`); the click handler (`:584`, `e.target.closest('[data-terr-amb-save]')`) does `apiPost('/api/territories', { _id, name, ambience, ambienceMod })` (`:697`). The container's `change` listener (`:592`) only updates local display, no network write. So `selectOption(...)` alone fires nothing — **you must click "Save Ambience".** The tests assert auto-save, which the (intended) redesigned UI doesn't do.

**Verdict: test-only.** If the dev finds a genuine product defect while implementing, STOP and escalate (fix.617 rule) — but the triage says the product is correct.

---

## Acceptance Criteria

- [ ] **AC1** — The 3 `test.fixme` markers (and their `#627` notes) are removed so the tests run.
- [ ] **AC2 (pre-select)** — `LIVE_TERRITORIES` mock entries carry `slug` (the field production matches on); `:925` passes (academy select pre-set to `'Verdant'`).
- [ ] **AC3 (save)** — `:937` and `:993` click the **Save Ambience** button after `selectOption`, then assert the `/api/territories` POST fired; both pass.
- [ ] **AC4** — `feat-16-17-fix44-tracker-feeding.spec.js` runs fully green (~36 pass / 0 skip / 0 fail; was 33 pass / 3 skip).
- [ ] **AC5** — **No product code changed.** Test-only.

---

## Tasks

### Task 1 — Fix the `LIVE_TERRITORIES` mock (Cause 1)
In `tests/feat-16-17-fix44-tracker-feeding.spec.js` (`:103-108`), add `slug` to each live-territory entry matching its `id` (`slug: 'academy'`, `'dockyards'`, `'harbour'`, `'northshore'`, `'secondcity'`). Keep `id` (the render's `TERRITORIES` loop + `data-terr-id` use it); production's live-doc lookup (`_terrDoc`) matches on `slug`. This makes `_terrDoc('academy')` resolve the live doc so `curAmb = 'Verdant'`.

### Task 2 — Rewrite the 2 save tests to use the Save button (Cause 2)
For `:937` and `:993`: after `academySel.selectOption('Tended')` (or the dockyards one), **click the territory's Save Ambience button** — `page.locator('[data-terr-amb-save="academy"]')` (or scope `.city-save-btn` with text "Save Ambience" within that territory card) — THEN assert the `/api/territories` write fired (`putCalled`) and/or the `.city-save-status` feedback. The mock route already accepts POST.

### Task 3 — Un-fixme + run green
Remove the 3 `test.fixme` → `test` and delete the `#627` inline notes (search `test.fixme` + `#627` in the spec). Run `feat-16-17` → all green (no skips).

### Task 4 — Regression
Confirm no other feat-16-17 test regressed (full single-pass run, ~3.5 min). One persistent http-server; never concurrent Playwright.

---

## Dev Notes

### Key locations
- `public/js/admin/city-views.js` — `TERRITORIES` (`:16`); `_terrDoc` slug-match (`:294`); ambience render + pre-select (`:430-448`, `data-terr-id=t.id`, `curAmb` `:431`, `selected` `:439`); Save button (`:445`); save click handler + POST (`:584`/`:697`); change listener (`:592`, display-only).
- `tests/feat-16-17-fix44-tracker-feeding.spec.js` — `LIVE_TERRITORIES` (`:103-108`, missing `slug`); the 3 `test.fixme` ambience tests (`:925`/`:937`/`:993`) with `#627` notes; `setupAdmin` + `openCityTabWithTerritory` harness.

### Guardrails
- **Test-only** (AC5). Don't touch `city-views.js` — it's correct. Escalate if a real product issue appears (fix.617).
- The real `/api/territories` docs use `slug` — that's *why* production matches on it; the mock just hadn't kept up.
- British English. One Playwright run at a time.

### Why this isn't #632
#632 was a real product bug (`computeVitateTally` matched `t._id` against `TERRITORY_DATA` which has `slug`). Here the *product* correctly matches `slug`; it's the *test mock* that supplies `id` instead of `slug`, plus the tests predate the explicit Save-Ambience button. Opposite verdict, test-only fix.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Task 0 verdict (recorded)
TEST DRIFT (product correct). (1) `LIVE_TERRITORIES` mock docs lack `slug`, but production resolves live docs via `_terrDoc` = `find(d => d.slug === terrId)` → pre-select falls back to default. (2) Ambience saves via the explicit "Save Ambience" button (`data-terr-amb-save` → `apiPost`), not auto-save-on-change; the tests must click it. Fixes are in the spec only.

### Debug Log References
- `npx playwright test tests/feat-16-17-fix44-tracker-feeding.spec.js` → **36 passed / 0 skipped / 0 failed** (was 33 pass / 3 skip; the 3 are now restored). `grep test.fixme` = 0.

### Completion Notes List
- **Task 1 — done.** Added `slug` to each `LIVE_TERRITORIES` entry (`slug: 'academy'`…) so `_terrDoc = find(d => d.slug === terrId)` resolves the live doc → pre-select reads `curAmb = 'Verdant'`.
- **Task 2 — done.** The 2 save tests now click the explicit `[data-terr-amb-save="<slug>"]` Save Ambience button after `selectOption`, then assert the `/api/territories` write. Renamed to drop the misleading "auto-save on change" wording.
- **Task 3 — done.** Removed the 3 `test.fixme` markers + the `#626` quarantine note; replaced with a one-line `#627` note explaining the mock-slug + save-button reality.
- **Task 4 — done.** feat-16-17 fully green; no other test regressed.
- **AC1-AC5 ✅.** TEST-ONLY — `city-views.js` untouched (the admin City ambience flow was already correct; the tests had drifted).

### File List
- tests/feat-16-17-fix44-tracker-feeding.spec.js (LIVE_TERRITORIES `slug`; 3 tests un-fixme'd + Save-button clicks)
- specs/stories/fix.627.admin-city-ambience-tests.story.md (this story)

### Change Log
- 2026-06-06 — fix.627: restored the 3 admin City-tab ambience tests (test-only). Added `slug` to the live mock + clicked the explicit Save Ambience button. feat-16-17 36/36 green. No product change.
