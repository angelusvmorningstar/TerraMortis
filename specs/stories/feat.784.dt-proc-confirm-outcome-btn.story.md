---
title: 'DT processing: add Confirm Outcome button to mark action as Complete'
type: 'feat'
issue: 784
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/784
branch: ms/issue-784-dt-proc-confirm-outcome-btn
created: '2026-06-16'
status: review
recommended_model: 'sonnet — localised UI change, two render sites + one wiring block'
context:
  - public/js/admin/downtime-views.js
---

## Intent

The DT processing action panel ribbon (Pending → Valid → Complete) already derives
"Complete" correctly at render time — it requires a terminal `pool_status` AND any
narrative field (`outcome`, `player_facing_note`, `story_context`) to be non-empty.
The gap: the Outcome textarea only saves on blur and the card never re-renders after
that save. There is also no explicit control to finalise the outcome.

This story adds a **"Confirm Outcome"** button (styled like "Add Note") that saves the
outcome text and triggers a full re-render so the ribbon chip updates to Complete.
It also widens the Outcome textarea from rows="2" to rows="4".

---

## Root cause (do NOT re-investigate)

### Ribbon state derivation

`_deriveActionRibbonState` (line 8418) returns:
- `pending` — if `pool_status === 'pending'`
- `complete` — if `DONE_STATUSES.has(pool_status)` AND any of
  `rev.outcome`, `rev.player_facing_note`, `rev.story_context` is non-empty
- `valid` — everything else

`DONE_STATUSES` (line 277): `validated`, `no_roll`, `no_feed`, `maintenance`,
`resolved`, `no_effect`, `skipped`, `obvious`, `neutral`, `subtle`.

### Why the ribbon doesn't advance on blur

The blur handler (line 5467) calls `saveEntryReview` but does NOT call
`renderProcessingMode`. The ribbon chip is only updated on a full re-render.
The "Add Note" button (line 5488) is the existing pattern: save + call
`renderProcessingMode(container)`. The "Confirm Outcome" button must do the same.

### Two render sites

The Outcome textarea is rendered in two places:

1. **Project action panel** — line 9409:
   ```js
   h += '<div class="proc-section proc-player-note-section">';
   h += '<div class="proc-mod-panel-title">Outcome</div>';
   h += `<textarea class="proc-outcome-input proc-player-note-input" data-proc-key="${esc(entry.key)}" rows="2" ...>`;
   h += '</div>';
   ```

2. **Merit action panel** — line 10164:
   ```js
   h += '<div class="proc-section proc-player-note-section">';
   h += '<div class="proc-mod-panel-title">Outcome</div>';
   h += `<textarea class="proc-outcome-input proc-player-note-input" data-proc-key="${esc(entry.key)}" rows="2" ...>`;
   h += '</div>';
   ```

Both need the same changes: rows="4" + button.

### Event wiring location

All action panel event listeners are wired in `wireProcessingEvents` (around line 5466).
The "Confirm Outcome" button handler goes in this same function, after the existing
outcome blur handler block (line 5466–5475), mirroring the Add Note block (5488–5503).

---

## Fix specification

### T1 — Update Outcome textarea height + add button (both render sites)

**At line ~9410 (project action panel):**
```js
// Before:
h += '<div class="proc-section proc-player-note-section">';
h += '<div class="proc-mod-panel-title">Outcome</div>';
h += `<textarea class="proc-outcome-input proc-player-note-input" data-proc-key="${esc(entry.key)}" rows="2" placeholder="What happened — appears in the DT result...">${esc(outcomeVal)}</textarea>`;
h += '</div>';

// After:
h += '<div class="proc-section proc-player-note-section">';
h += '<div class="proc-mod-panel-title">Outcome</div>';
h += `<textarea class="proc-outcome-input" data-proc-key="${esc(entry.key)}" rows="4" placeholder="What happened — appears in the DT result...">${esc(outcomeVal)}</textarea>`;
h += `<button class="dt-btn proc-confirm-outcome-btn" data-proc-key="${esc(entry.key)}">Confirm Outcome</button>`;
h += '</div>';
```

**At line ~10165 (merit action panel) — identical change.**

Note: the `proc-player-note-input` class is removed from the Outcome textarea. It was
a dual-class accident that caused the blur handler to save the same text to BOTH
`outcome` AND `player_facing_note` fields simultaneously. The Outcome section should
only write to `outcome`; the separate Player Feedback textarea below it writes to
`player_facing_note`. Removing the class fixes the accidental double-write.

### T2 — Wire the Confirm Outcome button handler

In `wireProcessingEvents`, after the existing outcome blur block (around line 5475),
add:

```js
// Wire confirm-outcome buttons
container.querySelectorAll('.proc-confirm-outcome-btn').forEach(btn => {
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    const key = btn.dataset.procKey;
    const ta = container.querySelector(`.proc-outcome-input[data-proc-key="${key}"]`);
    const text = ta ? ta.value.trim() : '';
    if (!text) return;
    const entry = _getQueueEntry(key);
    if (!entry) return;
    await saveEntryReview(entry, { outcome: text });
    renderProcessingMode(container);
  });
});
```

---

## Acceptance criteria

- [ ] **AC-1** The Outcome textarea renders at rows="4" in both the project and merit
      action panels.
- [ ] **AC-2** A "Confirm Outcome" button appears below the Outcome textarea in both
      panels, styled with `dt-btn`.
- [ ] **AC-3** Clicking "Confirm Outcome" with text in the box saves `outcome` to the
      DB and re-renders the panel, advancing the ribbon chip from Valid to Complete when
      the action's `pool_status` is already terminal.
- [ ] **AC-4** Clicking "Confirm Outcome" with an empty textarea is a no-op.
- [ ] **AC-5** The Outcome textarea no longer carries the `proc-player-note-input`
      class — the Player Feedback textarea below it is unaffected.

---

## Dev notes

### Do NOT change

- `_deriveActionRibbonState` — already correct
- `player_facing_note` blur handler — unaffected; its textarea keeps `proc-player-note-input`
- `saveEntryReview` — no changes needed
- `renderProcessingMode` — no changes needed; just call it after the save

### The dual-class bug (AC-5)

The textarea at line 9412 has both `proc-outcome-input` AND `proc-player-note-input`.
The first triggers `saveEntryReview(entry, { outcome: ... })` on blur; the second
triggers `saveEntryReview(entry, { player_facing_note: ... })` on blur. Both fire for
the same element, writing the outcome text into two fields. The fix is to remove
`proc-player-note-input` from the Outcome textarea only. The separate Player Feedback
textarea below it still has `proc-player-note-input` and is unaffected.

### No CSS changes needed

`dt-btn` is already defined and matches the Add Note button style exactly.

### Testing approach

No Playwright needed. Manual smoke test on dev:
1. Open the DT processing panel, expand any action that is in a terminal pool_status
   (e.g. "validated").
2. Verify Outcome textarea is taller.
3. Type narrative text. Click "Confirm Outcome".
4. Ribbon chip should update to "Complete" without a page reload.
5. Refresh the page — outcome persists; ribbon still shows Complete.
6. Test with empty textarea — button click does nothing.

---

## Dev Agent Record

### Files to change

- `public/js/admin/downtime-views.js`
  - Line ~9410: rows="2"→"4", remove `proc-player-note-input` from Outcome textarea,
    add Confirm Outcome button
  - Line ~10165: same changes for merit action panel
  - Line ~5475 (after outcome blur block): add `.proc-confirm-outcome-btn` click handler

### Files changed

- `public/js/admin/downtime-views.js`

### Completion notes

Three changes to `downtime-views.js`:
1. Project action panel (line 9370): rows="2"→"4", removed `proc-player-note-input`
   from Outcome textarea, added `proc-confirm-outcome-btn` button below it.
2. Merit action panel (line 10164): identical changes.
3. `wireProcessingEvents` (~line 5471): added `.proc-confirm-outcome-btn` click handler
   — guards empty textarea, saves `outcome` via `saveEntryReview`, calls
   `renderProcessingMode(container)` to trigger ribbon re-render.
Also fixed dual-class bug: Outcome textarea no longer carries `proc-player-note-input`,
so blur no longer double-writes outcome text into `player_facing_note`.
