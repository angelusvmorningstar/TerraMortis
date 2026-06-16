# Story Tech-Debt.602: Repair downtime-processing-feature96.spec.js for the flat card wall

## Status: review

> **Done 2026-06-05 — but the "opener-only" premise was WRONG (corrected below).** Swapped the opener AND found, during dev, that the flat card wall removed two whole subsystems the spec tested: the status ribbon (`_renderStatusRibbon`/`.proc-status-ribbon` — now dead code, no caller) AND the validation button-set (`.proc-val-btn[data-status=...]` / `.proc-pool-clear-btn` — not rendered anywhere). So 35 tests assert removed UI and were **retired** (`describe.skip`/`test.skip` with per-block rationale); **15 valid tests kept** (roll buttons, Confirm Dice Pool present/absent/click, auto-merit compact panel, roll-label text). Result: **15 passed, 35 skipped, 0 failed, exit 0**. Test-only; no product code.

## Metadata
- issue: 602
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/602
- branch: morningstar-issue-602-feature96-flat-wall-repair
- type: tech-debt (test-only repair)
- sibling-of: #585 (same #581 flat-wall debt, repaired in `downtime-processing.spec.js`)

---

## Story

**As** a developer,
**I want** `tests/downtime-processing-feature96.spec.js` to run green on the flat card wall,
**so that** its progress-ribbon coverage is a usable regression gate again (it currently hangs the suite).

**TEST-ONLY. No product code changes.**

---

## Background & audit (good news — opener-only)

#581 removed the processing view's phase accordions. `feature96.spec.js` still drives them via its own `openFirstAction(page, phaseLabel)` (`:208-219`): it waits for `.proc-phase-section`, expands a `.proc-phase-header`/`.proc-phase-toggle`, then clicks the first row. Those wrappers no longer exist, so the helper times out and the suite hangs.

**Crucially, the assertions are still valid.** The tests check the **pool-status ribbon** — `.proc-status-ribbon` + `.proc-ribbon-step` with `ribbon-past` / `ribbon-active <val>` / `ribbon-future`, where `val` ∈ {pending, confirmed, rolled}. That ribbon is **intact** in the flat wall (`downtime-views.js:7186-7199`, steps `[['pending','Pending'],['confirmed','Confirmed'],['rolled','Rolled']]`). So this is a pure **opener swap** — no assertion rewrites, no test retirements expected.

(Note: there is a *separate* card-state chip via `_deriveActionRibbonState` → pending/valid/complete. feature96 does NOT test that; leave it alone.)

### The model (#585's repair to mirror)
`downtime-processing.spec.js:206-211` `openActionInPhase(page, phaseKey)`:
```js
await page.waitForSelector('.proc-action-row', { timeout: 8000 });
await page.locator(`.proc-filter-pill[data-filter-dim="phases"][data-filter-val="${phaseKey}"]`).first().click();
await page.locator('.proc-action-row').first().click();
await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
```
It takes a phase **key** (`ambience`, `feeding`), not a label — feature96 passes labels ('Ambience', 'Feeding'), so the repaired opener must map label → key.

---

## Acceptance Criteria

- [x] **AC1 (green)** — `downtime-processing-feature96.spec.js` runs to completion: **15 passed, 35 skipped, 0 failed**, no hangs.
- [x] **AC2 (flat-wall opener)** — `openFirstAction` rewritten to the filter-pill + `.proc-action-row` + `.proc-action-detail` pattern; name/signature kept (call sites unchanged).
- [x] **AC3 (label→key map)** — `PHASE_KEY = { Ambience:'ambience', Feeding:'feeding', Investigative:'investigate', Sorcery:'resolve_first' }` (all four labels the spec passes).
- [x] **AC4 (retire obsolete, NOT weaken)** — premise corrected: the ribbon and the `.proc-val-btn` set are dead code, so 35 tests targeting them were **retired** with per-block rationale (`describe.skip`/`test.skip`), not weakened. The 15 kept tests use live selectors only. (User-chosen approach: retire-obsolete-keep-valid.)
- [x] **AC5 (test-only)** — only `tests/downtime-processing-feature96.spec.js` changed; no `public/**`.

---

## Tasks

### Task 1 — Swap the opener (AC2, AC3) — [x] DONE
`openFirstAction` rewritten to the filter-pill pattern + `PHASE_KEY` (4 labels).

### Task 2 — Run, reconcile, green (AC1, AC4) — [x] DONE
Run exposed that the premise was wrong: `_renderStatusRibbon`/`.proc-status-ribbon` has no caller (dead) and `.proc-val-btn`/`.proc-pool-clear-btn` are not rendered anywhere. Verified each selector live/dead against `downtime-views.js`. Retired the 6 fully-obsolete blocks (F96-1/2/3/6, F310-1/4) + 3 individual obsolete tests (F96-4 ribbon/committed, F310-5 ribbon) with rationale. Kept 15 tests on live selectors (`.proc-proj-roll-btn`, `.proc-feed-roll-btn`, `.proc-confirm-pool-btn`, `.proc-compact-merit-panel`). 15 passed / 35 skipped / 0 failed.

### Task 3 — Scope guard + sweep note (AC5) — [x] DONE
Confirm `git status` shows only `tests/downtime-processing-feature96.spec.js` (+ the story/sprint-status). In Dev Notes, record the broader sweep: a grep for `proc-phase-section|proc-phase-toggle|proc-phase-header|openFirstAction` matched ~12 spec files, but that includes false positives (`downtime-processing.spec.js` passes). Recommend verifying the genuinely-broken set and filing a SEPARATE tracking issue — do NOT repair them here.

---

## Dev Notes

### Files / artifacts
- `tests/downtime-processing-feature96.spec.js:208-219` — broken `openFirstAction` (the only edit).
- `tests/downtime-processing.spec.js:206-211` — `openActionInPhase` (the model).
- `public/js/admin/downtime-views.js:7186-7199` — the pool-status ribbon DOM (the assertions' target; intact).
- `tests/fix-586-target-prepopulate.spec.js` — minimal flat-wall harness reference.

### Must preserve / watch-outs
- Keep `openFirstAction`'s name + signature so all ~51 call sites work unchanged.
- The pool-status ribbon (`.proc-ribbon-step.<val>`) is NOT the card-state chip (`_deriveActionRibbonState`). feature96 tests the former; both exist — don't conflate.
- Some tests filter by 'Feeding' — the flat wall auto-renders a feeding row per submission, so the feeding pill + first row should land on it. Verify the first-row pick is the intended action (single-action fixtures make this safe).
- Do NOT weaken assertions to force green (AC4). Do NOT touch product code (AC5).
- Broader flat-wall test debt exists (sweep ~12 files, minus false positives) — out of scope; recommend a separate tracking issue. `dt-form-34-submit-delegation.spec.js:165` is a DIFFERENT pre-existing failure (player-form `#dt-feed-custom-attr` < 2 options), NOT flat-wall — do not lump it in.

### References
- #585 (`tech-debt.585`, the sibling repair + `openActionInPhase`), #581 (flat card wall).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- `_renderStatusRibbon` (`downtime-views.js:7191`) has NO caller — dead code.
- `.proc-val-btn` / `.proc-pool-clear-btn` — 0 occurrences in `downtime-views.js` (only XP approve/flag use `data-status`). Removed by the flat wall.
- `npx playwright test downtime-processing-feature96.spec.js` — 15 passed, 35 skipped, 0 failed (exit 0).

### Completion Notes List

- **Story premise was wrong** (my SM error): I saw `_renderStatusRibbon` defined and assumed the ribbon was intact, but it is never called. The flat card wall (#581/#595) replaced both the 3-step pool-status ribbon and the `.proc-val-btn` validation button-set. So feature96 was largely testing removed UI.
- Opener: `openFirstAction` → filter-pill (`.proc-filter-pill[data-filter-dim="phases"][data-filter-val="<key>"]`) + first `.proc-action-row` + wait `.proc-action-detail`, with `PHASE_KEY` mapping the 4 labels (Ambience/Feeding/Investigative/Sorcery → ambience/feeding/investigate/resolve_first).
- Retired (with rationale): F96-1, F96-2, F96-3, F96-6, F310-1, F310-4 (`describe.skip`) + F96-4 ribbon/committed tests + F310-5 ribbon test (`test.skip`) = 35 tests.
- Kept (live selectors, 15): F96-4 compact-merit-panel, F96-5 roll buttons, F96-7 Confirm Dice Pool present/absent, F310-2 Confirm absent, F310-3 Confirm click, F310-5 roll-label/Re-roll.
- User decision (mid-dev): retire-obsolete-keep-valid (vs retire-whole-spec / rewrite).

### File List

- `tests/downtime-processing-feature96.spec.js` (modified — opener swap + 35 retirements; test-only)
- `specs/stories/tech-debt.602.feature96-flat-wall-repair.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Repaired feature96 for the flat card wall: flat-wall opener (filter pill) + retired 35 tests that assert the removed status ribbon / `.proc-val-btn` button-set (with rationale). 15 valid tests kept and green. Test-only. **NOTE:** 35/50 retired — feature96 is now thin; consider whether it earns its keep vs folding the 15 into `downtime-processing.spec.js` (flagged for the user).
