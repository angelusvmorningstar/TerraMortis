---
issue: 504
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/504
branch: morningstar-issue-504-safe-place-locations
---

# Story feature.504: Safe-place locations section in player downtime form

**Story ID:** feature.504
**Epic:** Player downtime form polish (standalone GitHub issue)
**Status:** review
**Date:** 2026-05-31
**Issue:** [#504](https://github.com/angelusvmorningstar/TerraMortis/issues/504)
**Branch:** morningstar-issue-504-safe-place-locations

---

## User Story

As a player filing a downtime, I want to record the street and suburb of each of my safe places (and my haven), so that the STs know where my character's secure locations physically are for travel review, security, and plot purposes.

---

## Background

The player-facing downtime form captures how a character travelled to and from Court (the `travel` question), but never asks where the character's safe places actually are. STs want concrete geography per safe place.

The `travel` question lives inside the `court` section, which is **gated on attendance** (`gate: 'attended'`). Safe-place locations are relevant whether or not the player attended last game, so the locations must live in their **own ungated section** rather than being bolted onto the gated Travel question. The section is placed immediately after Court (i.e. after Travel) in render order.

**Key domain fact:** A Haven is always built on top of a Safe Place — it is never an independent location. In the data, `Haven.attached_to` holds the `domKey()` of the Safe Place it sits on. So the haven is **not** a separate input; it is one of the safe-place locations, optionally marked "(Haven)".

> Note on the player app entry point: the canonical player app is `index.html` + `public/js/app.js` (`player.html` contains a redirect shim — see feature.502 QA notes). The downtime form is the shared tab module `public/js/tabs/downtime-form.js` rendered inside that app, so no `player.html` work is involved here.

---

## Acceptance Criteria

1. A new downtime-form section for safe-place locations exists, rendered immediately after the `court` section and **not gated on attendance** (it shows whether or not the player attended last game, in both MINIMAL and ADVANCED form modes).
2. Given a character with N `Safe Place` domain-merit instances, the section renders N location text inputs, one per safe place, each labelled by its `domKey()` (e.g. "Safe Place" or "Safe Place (Downtown Loft)").
3. Given a character with a `Haven` (which is built on a safe place), no extra input appears beyond the per-safe-place inputs; the safe place whose `domKey()` equals `Haven.attached_to` is visibly marked as hosting the haven (e.g. a "(Haven)" tag on that input's label).
4. Given a character with zero `Safe Place` merits, the section is omitted entirely (no empty shell, no haven prompt — a haven cannot exist without a safe place).
5. Each location input accepts free text (street + suburb) in a single field.
6. Entered location values are saved with the downtime submission (auto-save + submit) and reload correctly into the inputs when the form is re-opened.

---

## Decisions on the issue's open questions

These were left open on the issue; resolved here so the dev does not have to guess. Flag to ST if any are wrong.

- **Haven marking (AC#3):** Do **not** add a separate haven input or a player-operated checkbox. The haven's location is already one of the safe-place locations. Use the existing `Haven.attached_to` → `domKey(safePlace)` link to append a "(Haven)" marker to the matching safe place's label. Zero new player interaction; purely derived from existing data.
- **Labelling (AC#2):** Label each input with `domKey(merit)` so multiple safe places are distinguishable. Where `qualifier` is null this is just "Safe Place"; the dev should still render all N inputs (they remain distinct by position).
- **Section wording:** Proposed title **"Safe Places and Havens"**; proposed intro: *"For each of your safe places, tell us the street and suburb where it is located. If you have a haven, it sits on one of these safe places."* ST may reword later — keep British English.

---

## Relevant data shapes (verified against code)

**Merit object (domain category)** — on `currentChar.merits[]`:
```js
{ category: 'domain', name: 'Safe Place', qualifier: null /* or 'Downtown Loft' */,
  cp, xp, free, free_*, rating, shared_with: [...], attached_to /* Haven/MG only */ }
```

- **Safe Place is multi-instance**: multiple separate `{category:'domain', name:'Safe Place'}` entries, one per safe place. `MULTI_INSTANCE_DOMAIN = new Set(['Safe Place','Feeding Grounds'])` — `public/js/editor/domain.js:14`.
  - **Count of safe places** = `currentChar.merits.filter(m => m.category==='domain' && m.name==='Safe Place')` then `.length` / iterate. (NOT `effectiveDomainDots`, which **sums dots** — `downtime-form.js:379-387`.)
- **Haven** is a single domain merit; `CAP_DOMAIN = new Set(['Haven','Mandragora Garden'])` — `domain.js:17`. Its rating is capped by the attached Safe Place via `attached_to` (`domain.js:77-88, 245-250`), confirming the dependency.
- **`domKey(m)`** = `m.name + (m.qualifier ? ' ('+m.qualifier+')' : '')` — `public/js/editor/domain.js:24`. This is the value `Haven.attached_to` is compared against.
- **`currentChar`** is the full character doc, freshly fetched, `merits` reliably present — set in `renderDowntimeTab` at `downtime-form.js:~1313-1337`. It is the base (non-overlay) doc for merits.

---

## Tasks / Subtasks

- [x] **Task 1 — Section metadata** (AC: #1, #4)
  - [x] In `public/js/tabs/downtime-data.js`, add a section object to `DOWNTIME_SECTIONS` for `key: 'safe_place_locations'` with `title` ("Safe Places and Havens"), `gate: null`, `intro`, `questions: []`. Placed after the `court` entry.
- [x] **Task 2 — Skip in the generic loop** (AC: #1, #4)
  - [x] In `downtime-form.js`, added `if (section.key === 'safe_place_locations') continue;` to the generic render loop (next to the `personal_story` skip) so the loop does not emit an empty shell.
- [x] **Task 3 — Custom renderer** (AC: #2, #3, #4, #5, #6)
  - [x] Added `domKey` to the existing import from `../editor/domain.js` (`meritEffectiveRating`, `esc` already in scope).
  - [x] Wrote `renderSafePlaceLocationsSection(saved)` following the `renderPersonalStorySection` pattern, with the standard `qf-section collapsed` wrapper.
  - [x] Computes `safePlaces` via `merits.filter(m => m.category==='domain' && m.name==='Safe Place')`.
  - [x] Returns `''` when `safePlaces.length === 0` (AC#4).
  - [x] Finds the haven and marks the safe place whose `domKey()` equals `haven.attached_to` with a `(Haven)` tag (`.qf-haven-tag`).
  - [x] Renders one `type="text"` input per safe place (`id=dt-safe_place_location_${i}`, `data-safe-place-location="${i}"`, `class="qf-input"`), value pre-filled from `saved['safe_place_location_'+i]`; reuses `qf-field`/`qf-label`/`qf-input`.
  - [x] Calls it from `renderForm` immediately before `renderPersonalStorySection(saved)` (order: Court → Safe Places & Havens → Personal Story), so it shows in both modes regardless of attendance.
- [x] **Task 4 — Collect & persist** (AC: #6)
  - [x] Added a collection block after the `personal_story` collector that recomputes `safePlaces` the same way and reads each `dt-safe_place_location_${i}` input into `responses` (presence-gated, silent-leave).
  - [x] Reload confirmed by test AC#6 (values from `responseDoc.responses` repopulate the inputs).
- [x] **Task 5 — Local test data** (AC: #2, #3)
  - [x] In `public/js/dev-fixtures.js`, gave Yusuf Kalusicj two Safe Places (`Harbour Warehouse`, `Northshore Flat`) and a Haven `attached_to: "Safe Place (Harbour Warehouse)"`. Edit applied via a guarded single-occurrence Node replace + `JSON.parse` validation of the CHARS array (no automated test depends on dev-fixtures; Playwright uses route mocks).
- [x] **Task 6 — Test** (AC: all)
  - [x] Added `tests/issue-504-safe-place-locations.spec.js` (5 tests): N inputs per safe place; `(Haven)` marker on the attached safe place + no extra input; zero-safe-places → section absent; ungated (present with `attended:false` while Court is `dt-gated-hidden`); saved values reload. All 5 pass. DT player smoke suite (16) re-run green — no regressions.

---

## Dev Notes

- **Reuse, don't reinvent**: the custom-renderer + explicit-call + manual-collect pattern is exactly how `personal_story`, `blood_sorcery`, and `acquisitions` already work. Follow `renderPersonalStorySection` (`4349`) and its collector (`556-561`) verbatim in shape.
- **`esc()` every interpolated string** (merit names, qualifiers) — no exceptions.
- **British English** in all UI copy.
- **Index-keyed responses** (`safe_place_location_0..N`) match the established slot convention (`game_recount_${n}`, `aspiration_${n}_*`). Order is stable within a character doc. If a safe place is added/removed between cycles the indices shift, but each downtime is a per-cycle snapshot, so this is acceptable for v1. Do not over-engineer a slug-keyed scheme.
- **Why not `effectiveDomainDots` for the count**: it *sums dots* across instances (`379-387`); we need the *number of instances*, so filter + length/iterate is correct.
- **Gate vs mode**: `gate: null` handles attendance-independence in the generic loop, but we render explicitly anyway (so the gate field is moot) — the explicit call placement is what guarantees it shows in both modes and regardless of attendance, exactly like personal_story.
- **Locations are optional — do NOT gate submission on them.** The fields must not feed the form's minimum-completeness / submit-block logic (the per-section `travelOk`-style checks at `downtime-form.js:6149-6172`), and the section's `qf-section-tick` need not be driven. A player may legitimately leave a location blank. Wiring these into the completeness gate would block all submissions — avoid.
- **Out of scope** (do not build): ST/admin-side display of these locations in DT processing views; address validation/geocoding. The data lands in `responses` and is available to consumers later.
- **Local dev**: the dev-fixtures fetch interceptor (`dev-fixtures.js`, under `local-test-token`) serves the character; no new `/api/*` endpoint is added by this story, so no new interceptor handler is required.

### Project Structure Notes

- Files touched: `public/js/tabs/downtime-data.js` (section entry), `public/js/tabs/downtime-form.js` (skip + renderer + collector + import), `public/js/dev-fixtures.js` (test data), `tests/issue-504-safe-place-locations.spec.js` (new). No server, schema, or DB changes — `responses` accepts arbitrary keys.
- No new CSS tokens; reuse `qf-field` / `qf-label` / existing text-input class.

### References

- Section schema + `DOWNTIME_SECTIONS`: `public/js/tabs/downtime-data.js:191-223` (court/travel) and section array
- Generic render loop + skip list: `public/js/tabs/downtime-form.js:2059-2090`
- Gate evaluation (`gate:null` always shows): `public/js/tabs/downtime-form.js:2076-2079`
- Custom-renderer exemplar: `renderPersonalStorySection` `public/js/tabs/downtime-form.js:4349`; called at `2093`
- Custom collector exemplar: `public/js/tabs/downtime-form.js:556-561`
- `effectiveDomainDots` (sum, not count): `public/js/tabs/downtime-form.js:379-387`
- `domKey`, `CAP_DOMAIN`, `MULTI_INSTANCE_DOMAIN`, haven cap: `public/js/editor/domain.js:14,17,24,77-88,245-250`
- `currentChar` set + fresh fetch: `public/js/tabs/downtime-form.js:~1313-1337`
- Imports already in scope: `esc` (`:14`), `meritEffectiveRating` (`:20`); add `domKey` to the `:20` import
- Issue: [#504](https://github.com/angelusvmorningstar/TerraMortis/issues/504)

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- Parse-check (ES module): `downtime-data.js`, `downtime-form.js`, `dev-fixtures.js` all clean.
- `tests/issue-504-safe-place-locations.spec.js` — 5/5 pass (chromium, ~26s).
- `tests/downtime-player-smoke.spec.js` — 16/16 pass (regression check on the shared render loop + collector).

### Completion Notes List

- New ungated section "Safe Places and Havens" renders after Court via an explicit `renderSafePlaceLocationsSection(saved)` call (mirrors `personal_story`), so it appears in both MINIMAL and ADVANCED modes and independent of the attendance gate.
- One `type="text"` input per `Safe Place` domain-merit instance, labelled by `domKey()`. The safe place whose `domKey()` equals `Haven.attached_to` gets a `(Haven)` tag — no separate haven input, matching the domain rule that a haven is built on a safe place.
- Zero safe places → renderer returns `''`, section omitted entirely.
- Responses are index-keyed (`safe_place_location_${i}`), collected in `collectResponses` alongside `personal_story` (presence-gated silent-leave), and reload from `responseDoc.responses`.
- Locations are optional and deliberately NOT wired into the completeness/submit gate.
- No server/schema/DB changes — `responses` accepts arbitrary keys.
- dev-fixtures: Yusuf Kalusicj given 2 Safe Places + a Haven for manual local verification (validated by re-parsing the CHARS array).

### File List

- `public/js/tabs/downtime-data.js` — added `safe_place_locations` section to `DOWNTIME_SECTIONS` (after `court`)
- `public/js/tabs/downtime-form.js` — import `domKey`; skip section in generic loop; `renderSafePlaceLocationsSection`; explicit render call before personal story; collection block in `collectResponses`
- `public/js/dev-fixtures.js` — Yusuf Kalusicj: 2 Safe Places (Harbour Warehouse, Northshore Flat) + Haven attached to Harbour Warehouse
- `tests/issue-504-safe-place-locations.spec.js` — new, 5 Playwright tests

### Change Log

- 2026-05-31 — Implemented #504 safe-place locations section (Tasks 1-6). 5 new tests pass; 16 DT smoke tests green (no regressions). Status → review.
- 2026-05-31 — QA (Quinn): verified all ACs against shipped code; added save-path test for AC#6. 6/6 issue-504 tests pass. Verdict: PASS.

---

## QA Results (Quinn, claude-opus-4-8)

**Verdict: PASS** — all acceptance criteria verified against the shipped code, not just the dev's own tests.

### Acceptance criteria
- **AC#1 (ungated, after Court, both modes):** PASS. Rendered via explicit `renderSafePlaceLocationsSection` call before `renderPersonalStorySection` (downtime-form.js:2104), outside the gated generic loop. `safe_place_locations` is absent from `MINIMAL_SECTIONS` but the explicit call (like personal_story) renders it in both modes. Test asserts it is present while Court is `dt-gated-hidden`.
- **AC#2 (N inputs per Safe Place, labelled by domKey):** PASS. `merits.filter(category==='domain' && name==='Safe Place')`; one `type="text"` input each, label `esc(domKey(sp))`.
- **AC#3 (haven marks its safe place, no extra input):** PASS. `(Haven)` tag where `haven.attached_to === domKey(sp)`; no separate input.
- **AC#4 (zero safe places → omitted):** PASS. Renderer returns `''`; test asserts section count 0 while personal_story still renders.
- **AC#5 (single free-text field):** PASS. Single `type="text"` per location.
- **AC#6 (save + reload):** PASS. Reload from `responseDoc.responses` tested; **added a save-path test** (type → 2s autosave → `/api/downtime_submissions` body carries `responses.safe_place_location_0`) since the dev only covered reload.

### Code quality
- **XSS:** safe — `domKey` value is `esc()`-escaped; the `(Haven)` `<span>` is literal markup.
- **Completeness gate:** correctly NOT wired in. `isMinimalComplete` (dt-completeness.js) ignores the section; `updateSectionTicks` falls through to the generic "all fields filled" rule, so the section ✔ is cosmetic and never gates submission. Confirmed submit button unaffected.
- **Collect/render symmetry:** both filter `currentChar.merits` identically and run unconditionally (outside the mode-skip loop), so indices align in both modes; reload reads the same keys.
- **No regressions:** `downtime-player-smoke.spec.js` 16/16 green; `node --check` clean on all three edited modules + the dev-fixtures CHARS array re-parses.

### Findings (non-blocking)
1. **[Low/cosmetic]** `.qf-haven-tag` has no CSS rule — the `(Haven)` marker renders as plain inline text. Functional, but a gold-accent style (`--gold2`) would make it pop. Optional follow-up.
2. **[Low/edge]** If a character has two Safe Places with the *same* `domKey` (e.g. both `qualifier: null`) and a Haven attached to that key, *both* inputs get the `(Haven)` marker (domKey is the only match key). Real-world safe places carry distinct qualifiers, so low impact; worth a qualifier-uniqueness note if multi-null-qualifier data appears. Not fixed in QA — behaviour call for the dev/ST.

### Test coverage
- `tests/issue-504-safe-place-locations.spec.js` — **6/6 pass** (~19s chromium): N-inputs, haven marker (+no extra input), zero-SP omission, ungated, reload, save-payload.
