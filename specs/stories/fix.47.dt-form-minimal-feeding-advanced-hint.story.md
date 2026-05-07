---
id: fix.47
task: 47
issue: 112
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/112
branch: morningstar-issue-112-minimal-feeding-advanced-hint
epic: epic-dt-form-mvp-redesign
status: review
priority: medium
---

# Story fix.47 — DT form: hint players that Advanced mode unlocks manual feeding pool selection

As a player filling in the downtime form in MINIMAL mode,
I should see a small hint beneath the auto-derived feeding pool
So that I know switching to Advanced mode is available if I want to customise my hunt pool.

## Context

ADR-003 §Q2 (dt-form.20) introduced a MINIMAL feeding path where the pool is
auto-derived from the character sheet and the chosen territory + method. The
auto-pick is intentional and correct. However, players who expect to customise
their pool have no way of knowing ADVANCED mode offers a manual pool builder.

The fix is a single `<p class="qf-desc">` line appended inside the existing
MINIMAL pool-display block in `renderQuestion()`. No logic, no CSS, no schema
changes.

## Files in Scope

- `public/js/tabs/downtime-form.js` — add hint paragraph (~line 5664)
- `tests/fix-47-minimal-feeding-advanced-hint.spec.js` — new: 2 Playwright tests

## Files NOT in Scope

- `public/js/data/dt-completeness.js` — no completeness logic change
- `public/css/` — `.qf-desc` already styled; no new CSS required
- `public/js/tabs/downtime-data.js` — no section data change
- Any server file

## Acceptance Criteria

**AC-1 — Hint visible in MINIMAL mode**
Given the form is in MINIMAL mode
And the Feeding section is rendered
Then a hint paragraph is visible beneath the pool-display block
And the hint text communicates that Advanced mode enables pool customisation

**AC-2 — Hint absent in ADVANCED mode**
Given the form is in ADVANCED mode
When the Feeding section is rendered
Then the hint paragraph from AC-1 is not present

**AC-3 — Hint does not add a required field or affect completeness**
Given a player is in MINIMAL mode and has filled all MINIMAL required fields
When completeness is evaluated
Then the hint does not cause a false "incomplete" result

## Implementation Notes

### Insertion point

`renderQuestion()` in `downtime-form.js`, inside the `if (_formMode(...) === 'minimal')` block.
Current structure (lines ~5634–5667):

```javascript
if (_formMode(responseDoc?.responses) === 'minimal') {
  // ... pool computation ...
  h += '<div class="qf-field dt-feed-min-pool">';
  // pool display paragraphs
  h += '</div>';           // ← insert hint AFTER this line, BEFORE the closing `} else {`
} else {
  // ADVANCED pool builder
}
```

### Change

Add one line immediately after `h += '</div>';` that closes `dt-feed-min-pool`:

```javascript
h += '<p class="qf-desc dt-feed-min-pool__advanced-hint">Want to customise your pool? Switch to <strong>Advanced</strong> mode at the top of the form.</p>';
```

**Do not** add a modifier class that requires new CSS. `.qf-desc` (italic, 13 px, `--warm-mid`
colour) is the established hint pattern — see `dt-feed-vi-hint` and `dt-shoutout-limit-hint`
as existing precedents. The BEM modifier `dt-feed-min-pool__advanced-hint` is a selector hook
for tests only; no CSS rule targets it.

### Why no click-to-switch

A clickable button that triggers `.dt-mode-pill[data-dt-mode="advanced"].click()` would be
ideal ergonomically but risks re-render edge cases if the mode toggle fires from inside a
rendered question subtree. Static text is safe, unambiguous, and satisfies the AC. The mode
selector is already visible at the top of the form; a directional phrase is enough.

### Test approach

Use the Playwright harness from `tests/fix-46-game-recount-non-attendee.spec.js`:
- `setupSuite(page, char, attendedFlag)` for route mocks + navigation
- `openDowntimeForm(page, char)` to inject the module and wait for `#dt-btn-submit`

AC-1: confirm `page.locator('.dt-feed-min-pool__advanced-hint')` is visible in MINIMAL mode
and its `textContent` contains "Advanced".

AC-2: switch to ADVANCED mode (click `[data-dt-mode="advanced"]`, wait for `aria-pressed="true"`),
then assert `.dt-feed-min-pool__advanced-hint` is not present in the DOM.

AC-3 is satisfied implicitly by the completeness-module unit tests (fix.46 AC-4 pattern); no
additional test needed unless the modifier class erroneously becomes a form field key.

## Test Plan

1. `npx playwright test tests/fix-47-minimal-feeding-advanced-hint.spec.js` — both tests green.
2. `npx playwright test tests/fix-46-game-recount-non-attendee.spec.js` — no regression.
3. Smoke: load DT form in MINIMAL mode → confirm hint appears below pool. Switch to ADVANCED → confirm hint gone.

## Definition of Done

- [x] `public/js/tabs/downtime-form.js` — one line added inside MINIMAL block
- [x] `.dt-feed-min-pool__advanced-hint` paragraph visible in MINIMAL feeding render
- [x] Paragraph absent from ADVANCED feeding render
- [x] `tests/fix-47-minimal-feeding-advanced-hint.spec.js` created with 2 passing tests
- [x] No new CSS added
- [x] No regressions in fix-45 feeding-validation tests

## Dev Agent Record

**Agent:** Claude (Morningstar)
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/tabs/downtime-form.js`

**Added**
- `tests/fix-47-minimal-feeding-advanced-hint.spec.js`

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | Claude (Morningstar) | Story created + implemented: one `<p class="qf-desc dt-feed-min-pool__advanced-hint">` line added inside MINIMAL block in `renderQuestion()`. 2 Playwright tests passing. No CSS added. |

### Completion Notes

Single-line addition after the `dt-feed-min-pool` closing div, inside the `if (_formMode(...) === 'minimal')` branch. The paragraph is absent from the ADVANCED branch by structural placement — no conditional guard needed. `expandFeedingSection()` helper added to test harness to open the collapsed section before asserting hint visibility.
