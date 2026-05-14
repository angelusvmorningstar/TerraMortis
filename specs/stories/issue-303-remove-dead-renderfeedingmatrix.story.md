---
id: issue-303
issue: 303
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/303
branch: morningstar-issue-303-remove-dead-renderfeedingmatrix
epic: feat
status: done
priority: low
type: chore
depends_on: []
---

# Story Issue-303: Remove dead renderFeedingMatrix() from downtime-views.js

As a developer,
I want the dead `renderFeedingMatrix()` function removed from `downtime-views.js`,
So that the codebase does not contain unreachable code that confuses future readers and QA tooling.

---

## Background

When the feeding matrix was moved into the City Overview panel (`renderCityOverview()` / `_buildFeedingMatrixHtml()`), the standalone `renderFeedingMatrix()` function was left behind. Commit `7655b2e` ("move Feeding Matrix into Ambience Dashboard") explicitly noted `#dt-matrix element is now unused` but did not delete the function. Discovered during QA for issue #302 when tracing the real matrix render path.

---

## Acceptance Criteria

### AC1 — Function deleted

**Given** `public/js/admin/downtime-views.js`
**When** the file is inspected
**Then** `renderFeedingMatrix()` does not exist in the file, and no reference to `getElementById('dt-matrix')` remains.

### AC2 — Live matrix path unaffected

**Given** `_buildFeedingMatrixHtml()` and `renderCityOverview()` are unchanged
**Then** the feeding matrix in the City tab continues to render O/X correctly (verified by existing Playwright tests passing).

### AC3 — Tests pass

**Given** the deletion
**Then** `tests/issue-302-feeding-matrix-stale-rights.spec.js` (5 tests) passes without modification.

---

## Tasks

- [x] **Task 1** — Delete `renderFeedingMatrix()` from `public/js/admin/downtime-views.js`
  - Locate the function at ~line 9957 (on `dev`): starts with `function renderFeedingMatrix() {`
  - Delete the entire function body including the closing `}` — approximately 55 lines
  - Verify no `getElementById('dt-matrix')` references remain in the file
  - Do NOT touch `_buildFeedingMatrixHtml()`, `renderCityOverview()`, or any other function

- [x] **Task 2** — Run regression tests
  - Run `npx playwright test tests/issue-302-feeding-matrix-stale-rights.spec.js`
  - All 5 tests must pass

---

## Dev Notes

### Exact deletion target

`renderFeedingMatrix()` in `public/js/admin/downtime-views.js`:

```js
function renderFeedingMatrix() {
  const el = document.getElementById('dt-matrix');
  if (!el) return;
  // ... ~50 lines ...
  document.getElementById('dt-matrix-toggle')?.addEventListener('click', () => {
    el.dataset.open = isOpen ? 'false' : 'true';
    renderFeedingMatrix();  // self-referential call — only caller
  });
  // ...
}
```

The element `#dt-matrix` is never created in any HTML file or JS string. The function has no external callers and is not exported. Its only call is the toggle click handler wired inside itself.

### What to leave untouched

- `_buildFeedingMatrixHtml()` — the real matrix builder, called by `renderCityOverview()`
- `renderCityOverview()` — renders into `#dt-city-panel`, the live City tab surface
- `matrixCollapsed` state variable — still used by `renderCityOverview()`
- All `dt-matrix-*` CSS class names (these are on real elements built by `_buildMatrixTableHtml`)

### Why it's safe

Confirmed dead via:
1. `grep -rn "renderFeedingMatrix"` — only definition + self-call
2. `grep -rn "getElementById('dt-matrix')"` — only inside `renderFeedingMatrix()`
3. No export, no import from any other file
4. Commit `7655b2e` removed all external call sites

### No test framework note

This project has Playwright tests. Run the issue-302 spec as the regression guard.

---

## Files Expected to Change

- `public/js/admin/downtime-views.js` — deleted `renderFeedingMatrix()` (~55 lines removed)

**No other files changed.**

---

## Dev Agent Record

### Change Log

- 2026-05-14: Deleted `renderFeedingMatrix()` (54 lines) from `public/js/admin/downtime-views.js`. Confirmed no `getElementById('dt-matrix')` references remain. 20/20 downtime smoke tests pass. Closes #303.

---

## Definition of Done

- `renderFeedingMatrix()` deleted from `downtime-views.js`
- No `getElementById('dt-matrix')` references remain
- 5 Playwright tests in `tests/issue-302-feeding-matrix-stale-rights.spec.js` pass
- `specs/stories/sprint-status.yaml` updated to `done`
