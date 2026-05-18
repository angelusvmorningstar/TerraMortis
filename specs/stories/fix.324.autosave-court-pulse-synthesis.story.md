# Story fix.324: Autosave Court Pulse synthesis textarea on blur

**Story ID:** fix.324
**Epic:** Downtime admin UX
**Status:** review
**Date:** 2026-05-18
**Issue:** [#324](https://github.com/angelusvmorningstar/TerraMortis/issues/324)
**Branch:** ms/issue-324-autosave-court-pulse-synthesis

---

## User Story

As an ST writing the Court Pulse synthesis, I want my typed content saved automatically when I tab away, so that a panel re-render or accidental reload does not discard what I have written.

---

## Acceptance Criteria

- [ ] Given the ST types into `#dt-court-pulse-synthesis-ta`, when the textarea loses focus, the content is persisted via `updateCycle(cycleId, { st_court_synthesis_draft: text })`
- [ ] The status span (`.dt-court-pulse-save-status`) shows `"Saving…"` → `"Saved ✓"` → clears after ~1500 ms on success, or `"Save failed"` on error — via `_setAutosaveStatus`
- [ ] No-op guard: if the textarea value equals `currentCycle.st_court_synthesis_draft` at blur time, no `updateCycle` call is made
- [ ] In-memory mirrors `currentCycle.st_court_synthesis_draft` and `allCycles[idx].st_court_synthesis_draft` are updated after a successful autosave (same as `_handleCourtPulseSave`)
- [ ] The existing "Save synthesis" button (`_handleCourtPulseSave`) still works with no regression

---

## Implementation

### File: `public/js/admin/downtime-views.js`

#### Change 1 — focusout delegation (line 536, inside the existing `focusout` listener)

Add one branch inside the `focusout` handler immediately before its closing `});`, after the last `_handleProcFieldBlur` branch:

```js
    // Issue #324: Court Pulse synthesis autosave on blur
    const cpSynthTa = e.target.closest('.dt-court-pulse-synthesis-ta');
    if (cpSynthTa) { _handleCourtPulseBlur(cpSynthTa); return; }
```

The full focusout block (lines 524–536) will then read:

```js
document.addEventListener('focusout', e => {
  const aqNote = e.target.closest('.dt-action-queue-note-input');
  if (aqNote) { _handleActionQueueNoteSave(aqNote); return; }
  const procFeedDesc = e.target.closest('.proc-feed-desc-ta');
  if (procFeedDesc) { _handleProcFieldBlur(procFeedDesc, 'description'); return; }
  const procMeritDesc = e.target.closest('.proc-merit-desc-ta');
  if (procMeritDesc) { _handleProcFieldBlur(procMeritDesc, 'description'); return; }
  const procSorcNotes = e.target.closest('.proc-sorc-notes-input');
  if (procSorcNotes) { _handleProcFieldBlur(procSorcNotes, 'sorc_notes'); return; }
  // Issue #324: Court Pulse synthesis autosave on blur
  const cpSynthTa = e.target.closest('.dt-court-pulse-synthesis-ta');
  if (cpSynthTa) { _handleCourtPulseBlur(cpSynthTa); return; }
});
```

#### Change 2 — new `_handleCourtPulseBlur` handler

Add immediately after `_handleCourtPulseSave` (after line 2036, before `// ── DTIL-2`):

```js
async function _handleCourtPulseBlur(ta) {
  const panel = ta.closest('.dt-court-pulse-panel');
  const cycleId = panel?.dataset.cycleId;
  if (!cycleId) return;
  const text = ta.value;
  // No-op guard: skip if value unchanged since last save
  if (text === (currentCycle?.st_court_synthesis_draft ?? '')) return;
  const status = panel?.querySelector('.dt-court-pulse-save-status');
  _setAutosaveStatus(status, 'saving');
  try {
    await updateCycle(cycleId, { st_court_synthesis_draft: text });
    if (currentCycle && String(currentCycle._id) === cycleId) {
      currentCycle.st_court_synthesis_draft = text;
    }
    const idx = allCycles.findIndex(c => String(c._id) === cycleId);
    if (idx >= 0) allCycles[idx].st_court_synthesis_draft = text;
    _setAutosaveStatus(status, 'saved');
  } catch {
    _setAutosaveStatus(status, 'error');
  }
}
```

No HTML changes are needed — the existing `<span class="dt-court-pulse-save-status">` at line 1992 serves as the status indicator for both the manual save and the blur autosave.

---

## Dev Notes

### Exact locations (verified against current file)

| Symbol | Line | Notes |
|--------|------|-------|
| `focusout` delegation block | 524–536 | Add new branch before closing `});` |
| `_handleCourtPulseSave` | 2014–2036 | Mirror this exactly for the blur handler |
| `_setAutosaveStatus` | 2197–2203 | Already exists — use directly |
| `renderCourtPulsePanel` | 1967–1996 | No change needed — status span already present at line 1992 |
| `currentCycle` | module-level (line 32) | In-scope in `_handleCourtPulseBlur` — no need to pass as arg |
| `allCycles` | module-level | Also in-scope |

### Status span reuse

The existing `<span class="dt-court-pulse-save-status">` (line 1992, inside `.dt-court-pulse-actions`) is reused for autosave feedback. Both the manual save button and the blur handler write to this same span — this is intentional and correct: they represent the same "save state" for the same field.

No new HTML span is needed. Do **not** add a second `dt-autosave-status` span — the `_setAutosaveStatus` helper accepts any element (it is not restricted to spans with that CSS class).

### No-op guard pattern

The guard `if (text === (currentCycle?.st_court_synthesis_draft ?? '')) return;` checks the in-memory value, not a DOM snapshot. This is the same pattern as `_handleProcFieldBlur` (line 2212). It is correct because `currentCycle` is always updated after a successful save (line 2025 in `_handleCourtPulseSave`).

### What to preserve

- `_handleCourtPulseSave` is **not modified** — it remains the manual force-save path
- `renderCourtPulsePanel` is **not modified** — no new DOM elements needed
- The `focusout` handler is additive only — no existing branches removed

### No test framework

Per CLAUDE.md: verify manually. Test by typing in the synthesis textarea, tabbing away, and confirming the status span flashes "Saved ✓" and the value is persisted after a panel re-render.

---

## Files to Change

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Add one branch in `focusout` handler (line 536); add `_handleCourtPulseBlur` function after line 2036 |
