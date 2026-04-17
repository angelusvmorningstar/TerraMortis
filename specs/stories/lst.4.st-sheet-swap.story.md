# Story: ST Sheet View Swap

**Story ID:** lst.4
**Epic:** Live Session Toolkit — Game App QoL
**Status:** ready-for-dev
**Date:** 2026-04-18
**Blocked by:** lst.3 (tracker migration must be complete first)

---

## User Story

As an ST using the game app on a tablet, when I tap a character in the Characters list, I want to see the same single-column character sheet that players see — not the old editor sheet — so both I and the player are looking at the same layout.

---

## Background & Diagnosis

Two sheet renderers exist in the game app:

| Renderer | File | DOM target | Used when |
|---|---|---|---|
| `editorRenderSheet` | `public/js/editor/sheet.js` | `#sh-content` | ST opens a character via `openChar()` |
| `suiteRenderSheet` | `public/js/suite/sheet.js` | `#sh-content-suite` | Player views their own sheet |

When an ST taps a character in the Characters tab, `openChar()` in `public/js/app.js` is called. It currently calls `editorRenderSheet(c)` (the old editor layout) and navigates to `goTab('editor')`.

The player's sheet path calls `suiteRenderSheet()` (the new single-column layout) and navigates to `goTab('sheets')`.

**The fix is surgical: change two lines in `openChar()`.** After lst.3 ships, the suite sheet already reads from the canonical tracker — tracker state wiring is automatic.

### Mockup reference

The target layout is prototyped at `public/test layout/sheet-col1-mockup.html`. This is a static HTML prototype — do not copy it directly. The `suite/sheet.js` renderer is the live implementation. Use the mockup only as a visual reference if layout questions arise.

---

## Tasks

### Task 1 — Swap the renderer in `openChar()`

In `public/js/app.js`, function `openChar()` (around line 135):

**Current code:**
```js
function openChar(idx) {
  editorState.editIdx = idx;
  const c = editorState.chars[idx];
  // ... header updates ...
  renderIdentityTab(c);
  renderAttrsTab(c);
  editorRenderSheet(c);           // ← OLD: editor sheet
  // ... pools panel ...
  setSheetView('sheet');
  goTab('editor');                // ← OLD: navigates to editor tab
}
```

**Change to:**
```js
function openChar(idx) {
  editorState.editIdx = idx;
  const c = editorState.chars[idx];
  // ... header updates (unchanged) ...
  renderIdentityTab(c);
  renderAttrsTab(c);
  editorRenderSheet(c);           // keep — still needed for the editor/attrs tabs
  // Suite sheet — same character, suite renderer, correct DOM target
  suiteState.sheetChar = c;
  document.getElementById('sh-empty').style.display = 'none';
  document.getElementById('sh-content-suite').style.display = '';
  suiteRenderSheet();             // ← NEW: suite renderer
  // ... pools panel (unchanged) ...
  setSheetView('sheet');
  goTab('sheets');                // ← NEW: navigate to sheets tab, not editor
}
```

**Why keep `editorRenderSheet(c)`?** The editor and attrs tabs still use it. The ST may navigate to those tabs after opening a character. Keeping it ensures those tabs are populated.

### Task 2 — Verify tracker is wired (automatic after lst.3)

After lst.3 ships, `suiteRenderSheet()` reads tracker state via `trackerRead()` from `game/tracker.js`, which now reads from MongoDB. No extra wiring is needed — confirm the tracker boxes on the ST's sheet view show the same values as the tracker tab.

### Task 3 — Verify `sh-content-suite` is present in `index.html`

Confirm `#sh-content-suite` exists in the DOM of `index.html`. If it is inside a tab panel that is hidden by default, ensure the tab navigation makes it visible. This is likely already correct (the player sheet path uses it) — verify only.

---

## Acceptance Criteria

- [ ] When the ST taps a character in the Characters list, the game app navigates to the Sheets tab showing the suite (single-column) layout
- [ ] Tracker boxes on the ST's sheet view match the values in the Tracker tab (both reading from MongoDB after lst.3)
- [ ] The editor tab still works — navigating back to Characters → Edit still renders the editor sheet and attrs tabs
- [ ] The player's own sheet path is unchanged
- [ ] No regression in the pools panel (roll tab character context still set correctly)

---

## Files to Change

| File | Change |
|---|---|
| `public/js/app.js` | `openChar()`: add `suiteState.sheetChar = c`, `suiteRenderSheet()`, change `goTab('editor')` → `goTab('sheets')` |

---

## Critical Constraints

- **Do not remove `editorRenderSheet(c)` from `openChar()`** — the editor and attrs tabs still depend on it.
- **`suiteState.sheetChar`** must be set before calling `suiteRenderSheet()` — the suite renderer reads from `state.sheetChar` (see `suite/sheet.js` `onSheetChar()` pattern).
- **lst.3 must be complete** before this story ships — if the tracker is still localStorage, the ST's sheet will show correct layout but tracker state won't be shared across devices.
- **The mockup at `public/test layout/sheet-col1-mockup.html` is a prototype** — use it for visual reference only, do not copy its HTML into production code.

---

## Reference

- SSOT: `specs/reference-data-ssot.md`
- Suite sheet renderer: `public/js/suite/sheet.js` — `renderSheet()`, `onSheetChar()`
- Blocked by: lst.3
- Unlocks: lst.5 (ST feeding confirm) has cleaner context once the sheet is unified
