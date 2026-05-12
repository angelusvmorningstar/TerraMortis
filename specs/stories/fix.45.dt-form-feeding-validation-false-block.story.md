---
id: fix.45
task: 45
issue: 97
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/97
branch: morningstar-issue-97-feeding-validation-false-block
epic: epic-dt-form-mvp-redesign
status: done
priority: high
---

# Story fix.45 — DT form: feeding method must not block submission

As a player submitting the DT form in ADVANCED mode,
I should never see "How does your character hunt?" as a required-field error,
So that filling in my feeding territory is the only gate — not feeding method, which is optional.

## Context

DTFP-4 changed `feeding_method.required` from `true` to `false` in `downtime-data.js`. The intent: pool components (territory) are the submission gate, not the method label.

The required-field loop in `submitForm()` (`downtime-form.js` line ~1007) is:
```javascript
for (const section of DOWNTIME_SECTIONS) {
  for (const q of section.questions) {
    if (!q.required) continue;   // ← feeding_method is skipped here
    const el = document.getElementById(`dt-${q.key}`);
    if (!el || !el.value.trim()) missing.push(q.label);
  }
}
```

Because `feeding_method.required` is already `false`, `"How does your character hunt?"` is already excluded from the `missing` array. **The fix is already in place.** This story's job is to:

1. Confirm the fix is correct by reading the current state of the two relevant files.
2. Add Playwright regression tests so this never silently regresses.

## Files in Scope

- `tests/fix-45-feeding-validation-false-block.spec.js` — New: 3 Playwright tests (primary deliverable)
- `public/js/tabs/downtime-data.js` — Read-only confirm: `feeding_method.required: false`
- `public/js/tabs/downtime-form.js` — Read-only confirm: required-field loop uses `if (!q.required) continue`

## Files NOT in Scope

- `public/js/data/dt-completeness.js` — banner completeness system; separate from toast validation; do not touch
- Any server schema — feeding_method is optional at every layer

## Acceptance Criteria

**AC-1 — Method blank, territory filled → no feeding-method error**
Given a player has selected a feeding territory
And has left "How does your character hunt?" blank
When they click Submit
Then the error toast does NOT contain "How does your character hunt?"

**AC-2 — Both blank → territory error only**
Given a player has left both feeding territory and feeding method blank
When they click Submit
Then the error toast contains "Feeding Territory"
And does NOT contain "How does your character hunt?"

**AC-3 — Both filled → no feeding section errors**
Given a player has selected a feeding territory and a feeding method
When they click Submit
Then neither "Feeding Territory" nor "How does your character hunt?" appear in any error toast

## Implementation Notes

### Confirming the fix

In `downtime-data.js`, the feeding section questions array must have:
```javascript
{ key: 'feeding_method', label: 'How does your character hunt?', ..., required: false }
```

In `downtime-form.js` `submitForm()`, the required-field loop must have `if (!q.required) continue;` before the `missing.push` call. Both are true in the current codebase — no code changes needed.

### Playwright test approach

Use the existing harness pattern from `tests/dt-form-32-joint-authoring-remove.spec.js`:
- `setupSuite(page, char)` — routes, localStorage, navigate
- `openDowntimeForm(page, char)` — injects module, waits for `#dt-btn-submit`
- `switchToAdvanced(page)` — clicks `[data-dt-mode="advanced"]`, waits for `aria-pressed="true"`

To test the toast:
- Click `#dt-btn-submit`
- Wait for the toast / error message element to appear
- Assert its text does NOT include the forbidden string

The submit button for draft save is `#dt-btn-submit` (not `#dt-btn-submit-final`). After clicking it without a valid submission state, the form will either show a validation toast or attempt a save. Check the existing toast selector used in other DT form tests.

To trigger AC-1 / AC-2 without a valid session cookie, the mock for `POST /api/downtime_submissions` in `setupSuite` returns 200 — so the form will try to save if validation passes. The key is that missing-field validation fires *before* the API call; if the `missing` array is non-empty, `submitForm` returns early and shows the toast.

For the territory-blank case (AC-2): `feeding_territories` defaults to `'{}'` in a fresh form. The territory check in `submitForm()` is:
```javascript
const territories = (() => { try { return JSON.parse(responses['feeding_territories'] || '{}'); } catch { return {}; } })();
if (!Object.values(territories).some(v => v && v !== 'none')) missing.push('Feeding Territory');
```
This fires outside the required-field loop, so it always runs. The toast for AC-2 will include "Feeding Territory" but not "How does your character hunt?".

### Toast selector

`showToast(message, type)` appends a `<div id="dt-toast" class="dt-toast dt-toast-error">` to `document.body`. The element is removed after 4 s. In tests, wait for `#dt-toast` to be visible immediately after clicking submit.

The error message format is:
```
Please complete required fields before submitting: Field1, Field2, Field3 (+N more).
```

## Test Plan

1. Run `npx playwright test tests/fix-45-feeding-validation-false-block.spec.js` — all 3 tests green.
2. Run existing DT form tests to confirm no regressions: `npx playwright test tests/dt-form-*.spec.js`.

## Definition of Done

- [x] Confirmed `feeding_method.required: false` in `downtime-data.js`
- [x] Confirmed required-field loop skips `required: false` fields in `downtime-form.js`
- [x] `tests/fix-45-feeding-validation-false-block.spec.js` created with 3 passing tests
- [x] AC-1: toast does not contain "How does your character hunt?" when method blank, territory filled
- [x] AC-2: toast contains "Feeding Territory" and not feeding-method label when both blank
- [x] AC-3: no feeding errors when both filled
- [x] No regressions in other DT form tests

## Dev Agent Record

**Agent:** Claude (Morningstar)
**Date:** 2026-05-07

### File List

**Added**
- `tests/fix-45-feeding-validation-false-block.spec.js`

**Read (no changes)**
- `public/js/tabs/downtime-data.js`
- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | James (story) | Story created from issue #97 analysis. Fix already in place via DTFP-4; story scope is regression tests only. |
| 2026-05-07 | Claude (Morningstar) | Confirmed fix in place. 3 Playwright regression tests added and passing. No code changes to production files. |
