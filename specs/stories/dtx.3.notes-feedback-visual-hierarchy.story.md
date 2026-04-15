# Story DTX.3: Notes and Feedback Visual Hierarchy

Status: ready-for-dev

## Story

As an ST processing downtimes,
I want the ST notes section to appear above the player feedback field and be visually distinct from it,
so that the primary analytical tool (ST notes) has higher visual prominence and Claude context is clearly differentiated from outbound player communication.

## Acceptance Criteria

1. ST notes section renders above player feedback in the left panel.
2. ST notes panel title reads "ST Notes" (drops the current "(ST only)" suffix).
3. Player feedback section renders below ST notes with a visually distinct background tint.
4. Player feedback panel title reads "Player Feedback" (unchanged from current).
5. No regression on any existing E2E tests referencing `proc-notes-thread`, `proc-note-textarea`, `proc-add-note-btn`, `proc-feedback-input`, or the notes/feedback section labels.

## Tasks / Subtasks

- [ ] Task 1: Reorder sections and update titles in `downtime-views.js` (AC: 1, 2, 3, 4)
  - [ ] Locate the two rendering blocks at lines ~6691–6718 in `_renderLeftPanel` (or its equivalent note/feedback render section):
    - Block A (currently first): Player Feedback — `proc-section` wrapper, label "Player Feedback", `proc-feedback-input`
    - Block B (currently second): ST Notes — `proc-section` wrapper, label "ST Notes (ST only)", `proc-notes-thread` + `proc-note-add`
  - [ ] Swap the render order so Block B (ST Notes) is emitted first, Block A (Player Feedback) second
  - [ ] On the ST Notes `proc-section` wrapper, add modifier classes: `proc-notes-panel proc-notes-primary`
    - New HTML: `<div class="proc-section proc-notes-panel proc-notes-primary">`
    - **Do not rename** `proc-section` — existing tests key on it
  - [ ] Change the ST Notes label string from `'ST Notes (ST only)'` to `'ST Notes'`
  - [ ] On the Player Feedback `proc-section` wrapper, add modifier class: `proc-feedback-section`
    - New HTML: `<div class="proc-section proc-feedback-section">`
    - **Do not rename** `proc-section`
  - [ ] Leave all other HTML, class names, data attributes, and event bindings unchanged

- [ ] Task 2: Add CSS for visual differentiation (AC: 3, 5)
  - [ ] Open `public/css/admin-layout.css` (this is where all `proc-*` CSS lives — **not** `admin-processing.css`)
  - [ ] Find the `.proc-note-add` / `.proc-note-textarea` block (~line 4720) as the insertion anchor
  - [ ] Add the following rules after the existing `proc-notes-thread` / `proc-note-*` block:

    ```css
    /* DTX-3: notes primary panel prominence */
    .proc-notes-panel.proc-notes-primary {
      /* no background change — notes thread already uses --surf2 per entry */
    }

    /* DTX-3: player feedback section tint */
    .proc-feedback-section {
      background: var(--surf2);
      border-radius: 4px;
      padding: 8px 10px;
      margin-top: 4px;
    }
    .proc-feedback-section .proc-detail-label {
      margin-bottom: 4px;
    }
    ```

  - [ ] Verify the Player Feedback section now has a surface-level background distinct from a plain `proc-section`, making it visually clear it is a separate outbound context from the ST notes above

- [ ] Task 3: Smoke-test in browser (AC: 1–5)
  - [ ] Open admin processing panel on any entry with existing notes and a feedback value
  - [ ] Confirm: ST Notes section appears first, "ST Notes" label (no suffix)
  - [ ] Confirm: Player Feedback section appears below, has tinted background
  - [ ] Confirm: existing note-add, delete, and feedback-save interactions still work
  - [ ] Run E2E suite; confirm all tests pass with no regressions

## Dev Notes

### Current Code Structure (lines 6691–6718)

**Current order — Player Feedback FIRST, ST Notes SECOND:**

```js
// ── Player Feedback (lines 6691–6695) ──
h += '<div class="proc-section">';
h += '<div class="proc-detail-label">Player Feedback</div>';
h += `<input class="proc-feedback-input" type="text" data-proc-key="${esc(entry.key)}" value="${esc(feedback)}" placeholder="Visible to player (pool correction reason, etc.)...">`;
h += '</div>';

// ── ST Notes (lines 6697–6718) ──
h += '<div class="proc-section">';
h += '<div class="proc-detail-label">ST Notes (ST only)</div>';
if (thread.length) {
  h += '<div class="proc-notes-thread">';
  for (let noteIdx = 0; noteIdx < thread.length; noteIdx++) {
    const note = thread[noteIdx];
    const time = note.created_at
      ? new Date(note.created_at).toLocaleString('en-GB', { ... })
      : '';
    h += '<div class="proc-note-entry">';
    h += `<div class="proc-note-meta">...author...time...<button class="proc-note-delete-btn"...>×</button></div>`;
    h += `<div class="proc-note-text">${esc(note.text)}</div>`;
    h += '</div>';
  }
  h += '</div>';
}
h += '<div class="proc-note-add">';
h += `<textarea class="proc-note-textarea" ...></textarea>`;
h += `<button class="dt-btn proc-add-note-btn" ...>Add Note</button>`;
h += '</div>';
h += '</div>';
```

**After change — ST Notes FIRST, Player Feedback SECOND:**

```js
// ── ST Notes ──
h += '<div class="proc-section proc-notes-panel proc-notes-primary">';
h += '<div class="proc-detail-label">ST Notes</div>';
// ... (rest of thread/note-add block unchanged) ...
h += '</div>';

// ── Player Feedback ──
h += '<div class="proc-section proc-feedback-section">';
h += '<div class="proc-detail-label">Player Feedback</div>';
h += `<input class="proc-feedback-input" type="text" data-proc-key="${esc(entry.key)}" value="${esc(feedback)}" placeholder="Visible to player (pool correction reason, etc.)...">`;
h += '</div>';
```

### CSS File Location

All `proc-*` processing panel CSS lives in **`public/css/admin-layout.css`**, not `admin-processing.css`. The relevant block starts around line 4635 (`.proc-feedback-input`) through ~4733 (`.proc-note-textarea`). Add new rules after this block.

### Design Tokens Available

- `--surf2`: `#E5DEC9` (light/parchment) / `#1E1A16` (dark) — secondary surface
- `--surf2-a8`: 80% opacity variant
- `--bdr`: border colour
- `--txt1`, `--txt3`: primary / muted text

The `proc-feedback-section` tint uses `var(--surf2)` directly on the wrapper div, giving the entire Player Feedback area a surface-level background. This differentiates it from the ST Notes section which has no wrapper background (individual note entries use `--surf2`, but the section background is transparent).

### Class Rename Constraint

Do **not** rename or remove `proc-section` from either wrapper. Existing E2E tests use `.proc-section` as a count/existence selector. Only add modifier classes — never replace the base class.

### No Data or Save Path Changes

This story is purely a rendering reorder + CSS addition. No changes to:
- Event handlers
- `saveEntryReview` calls
- Any data fields on entries or review objects
- Any other rendering functions

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/dtx.3.notes-feedback-visual-hierarchy.story.md`
