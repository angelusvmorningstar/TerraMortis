---
id: dt-form.34
task: 34
issue: 95
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/95
branch: morningstar-issue-95-blood-sorcery-rite-persist
epic: epic-dt-form-mvp-redesign
status: done
priority: high
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md
---

# Story dt-form.34 — Fix: Submit button loses click handler after inline re-render

As a player using the downtime form,
I should be able to click "Submit Downtime" / "Update Submission" after any inline re-render (e.g. selecting a Blood Sorcery rite, changing the feed pool selectors),
So that my form actually saves when I click the button, regardless of how many re-renders have occurred.

## Context

GH #95 was filed after Anichka's Blood Sorcery rite selection did not persist after save + hard refresh. Investigation traced the root cause to a broken event delegation pattern — not to the sorcery collection logic itself.

### Root Cause

`renderForm(container)` sets `container.innerHTML = h` on every render, which destroys all existing child DOM elements (including the Submit button) and inserts fresh ones. Event wiring is guarded:

```javascript
// downtime-form.js line 2144
if (container._dtWired) return;
container._dtWired = true;
```

All event listeners are wired **once only** on the first render. The `#dt-btn-submit` listener is bound directly to the button element:

```javascript
// downtime-form.js line 3198
document.getElementById('dt-btn-submit')?.addEventListener('click', submitForm);
```

When any inline re-render fires (sorcery rite change, feed pool select change, mode toggle), `container.innerHTML = h` replaces the DOM. The old button element — and its click listener — is destroyed. The new button has no listener. Subsequent clicks on "Submit Downtime" fire nothing, silently.

The container's delegated click handler (wired once to `container` which itself is not replaced) already handles `#dt-btn-submit-final` via `e.target.closest()`:

```javascript
// downtime-form.js line 2165
if (e.target.closest('#dt-btn-submit-final')) {
  e.preventDefault();
  openSubmitFinalModal(container);
  return;
}
```

The `#dt-btn-submit` button has no equivalent delegated handler — an oversight.

### Why This Showed Up with Story #27

Before dt-form.27, blood sorcery rendered before the mode toggle affected it for ADVANCED users. Story #27 moved the section inside `if (mode === 'advanced')`, so every user now switches from MINIMAL → ADVANCED to reach it. That mode switch triggers `renderForm()`, which is the first re-render, which loses the submit listener. The bug pre-existed #27 but was invisible to sorcery users who never triggered a re-render before submitting.

### Files in Scope

- `public/js/tabs/downtime-form.js` — two changes:
  1. Add `#dt-btn-submit` to the delegated click handler (~line 2165)
  2. Remove the direct `addEventListener` at line 3198

### Files NOT in Scope

- `collectResponses()` — sorcery collection logic is correct; no change needed
- `renderSorcerySection()` — no change needed
- `scheduleSave()` — no change needed
- Server-side downtime route — no change needed
- Any other story's code

## Acceptance Criteria

**Given** a player opens the downtime form in MINIMAL mode and switches to ADVANCED
**When** they fill in the Blood Sorcery section and click "Submit Downtime" / "Update Submission"
**Then** the form saves (status indicator shows "Saved HH:MM" or transitions to submitted state) and the rite selection persists on hard refresh

**Given** a player changes the feed pool selectors (attr / skill / discipline dropdowns) which trigger a re-render
**When** they then click "Submit Downtime"
**Then** the form saves correctly

**Given** any inline re-render (sorcery rite, feed pool, mode toggle)
**When** the Submit button is clicked
**Then** `submitForm()` is invoked — button shows "Submitting…" while in-flight

**Given** the form loads fresh (no prior re-render)
**When** the Submit button is clicked
**Then** behaviour is unchanged (submit still works as before — regression check)

## Implementation Notes

### The Fix — `public/js/tabs/downtime-form.js`

**Step 1 — add delegated handler for `#dt-btn-submit` inside the container click listener (~line 2165):**

```javascript
// dt-form.34: delegated submit — survives re-renders unlike the direct listener below.
if (e.target.closest('#dt-btn-submit')) {
  submitForm();
  return;
}
// dt-form.31: Submit Final button (ADVANCED only) opens the modal.
if (e.target.closest('#dt-btn-submit-final')) {
  e.preventDefault();
  openSubmitFinalModal(container);
  return;
}
```

**Step 2 — remove the now-redundant direct listener at line 3198:**

```javascript
// DELETE this line:
document.getElementById('dt-btn-submit')?.addEventListener('click', submitForm);
```

That is the entire fix. Two lines changed. No other logic touched.

### What NOT to Change

- The `_dtWired` guard pattern — correct; keep it
- The `#dt-btn-submit-final` handler — already correctly delegated; leave it
- `collectResponses()` — the sorcery collection was correct all along
- The mode toggle handler or sorcery select change handler

## Test Plan

- Static review: `document.getElementById('dt-btn-submit')` line removed; `e.target.closest('#dt-btn-submit')` case added before the submit-final case
- Browser smoke (required before PR):
  1. Open form as Anichka (Crúac). Switch to ADVANCED. Select a rite. Click "Submit Downtime" — confirm status shows "Saved" or submitted state. Hard refresh — confirm rite persists.
  2. Change a feed pool selector (triggers re-render). Click "Submit Downtime" — confirm saves.
  3. Open form as a non-sorcery character in MINIMAL. Click "Submit Downtime" — confirm saves (regression check).

## Definition of Done

- [x] `document.getElementById('dt-btn-submit')` direct listener removed from line 3198
- [x] `e.target.closest('#dt-btn-submit')` delegated handler added to container click listener
- [x] Smoke test 1: rite persists after switch MINIMAL→ADVANCED → select → submit → hard refresh
- [x] Smoke test 2: submit works after feed pool re-render
- [x] Smoke test 3: submit works on fresh form with no prior re-render (regression)
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude Sonnet 4.6 (James)
**Date:** 2026-05-06

### File List

**Modified**
- `public/js/tabs/downtime-form.js` — delegated `#dt-btn-submit` handler; removed direct listener; fixed `saveDraft`/`submitForm` POST-vs-PUT guard to check `_id` presence

### Completion Notes

Three changes total. (1) Added delegated handler for `#dt-btn-submit` inside the container click listener — same pattern as `#dt-btn-submit-final`, survives `container.innerHTML` re-renders. (2) Removed the direct `document.getElementById` listener that was destroyed on every re-render. (3) Fixed `saveDraft()` and `submitForm()` POST-vs-PUT guard: changed `!responseDoc` to `!responseDoc?._id` so the mode-toggle's in-memory responseDoc (which has no `_id`) routes to POST rather than PUT to `/undefined`.

Smoke tests confirmed on live server (localhost:8080 against real API, no dev fixtures): test 1 with Charles Mercer (rite persists), tests 2–3 with any character. Anichka's form has unrelated blocking issues logged separately.

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-06 | James (story) | Story created from GH #95. Root cause identified during create-story analysis: submit button loses delegated handler after re-renders. Status → ready. |
| 2026-05-06 | James (dev) | Implemented fix: delegated #dt-btn-submit handler; removed direct listener. Status → review. |
| 2026-05-06 | James (dev) | Additional fix: POST-vs-PUT guard uses `!responseDoc?._id`; diagnostic logs added then removed; all smoke tests passed. Status → done. |

## Dependencies

- **Upstream**: #17 (MINIMAL/ADVANCED mode lifecycle — the re-render pattern that triggers the bug)
- **Downstream**: dt-form.27 (Blood Sorcery reorder) — unblock that story once this fix is verified; the reorder itself is correct
