# Story feature.49: Retroactive Attendance Add

## Status: review

## Story

**As an** ST,
**I want** to add a character to an existing game session's attendance table after the session was created —
**so that** I can correct omissions when a character is created after a game, or when a player was missed during session setup.

## Background

When a new game session is created, `createNewSession()` pre-populates `attendance` with every active, non-retired character from the in-memory `chars` array. However there is no mechanism to add a character retroactively — if a character is created after the game was logged, or if someone was simply missed, the ST has no recourse short of manual MongoDB edits.

The fix is an "Add Character" button on the attendance table toolbar that opens a dropdown of active characters not already in the session. On confirm, the new row is appended to `activeSession.attendance` and saved immediately to the API via `PUT /api/game_sessions/:id`.

---

## Acceptance Criteria

1. An **"+ Add Character"** button appears in the attendance toolbar (`.att-toolbar-right`) whenever a session is active.
2. Clicking the button renders a compact inline form (or a small inline `<select>` + confirm button) immediately below or adjacent to the toolbar — **not** a modal.
3. The select dropdown is populated with all active non-retired characters **not already present** in `activeSession.attendance` (match on `character_id`). Characters are sorted by display name.
4. If no eligible characters remain, the button is disabled or hidden.
5. On confirmation:
   a. A new attendance entry is appended to `activeSession.attendance`:
      ```js
      {
        character_id:      c._id,
        character_name:    c.name,
        character_display: displayName(c),
        player:            c.player || '',
        attended:          false,
        costuming:         false,
        downtime:          false,
        extra:             0,
        paid:              false,
        payment_method:    ''
      }
      ```
   b. The updated session is saved immediately via `PUT /api/game_sessions/:id` (do not wait for a separate "Save Changes" click).
   c. `renderGrid()` is called to display the new row; the table re-sorts alphabetically by display name as normal.
6. If the API call fails, an `alert()` reports the error and the local `activeSession.attendance` state is rolled back (remove the appended entry).
7. The "Add Character" select/confirm form closes after a successful add or when the user clicks a Cancel button.
8. The inline form does not interfere with the existing "Save Changes" / "Delete Session" dirty-state flow — adding a character via this path saves immediately and does not set `dirty = true`.

---

## Technical Notes

### File to change

**`public/js/admin/attendance.js`** — all changes are in this one file.

No API, schema, or server changes required. `PUT /api/game_sessions/:id` accepts the full session body including `attendance`; the route strips `_id` and does `$set` on everything else. This already works for `saveSession()`.

### Existing patterns to follow

- `esc()` — use for all dynamic string interpolation into HTML
- `displayName(c)` — already imported from `helpers.js`, use for display and sort
- `apiPut()` — already imported from `data/api.js`
- Inline HTML approach — `renderGrid()` uses `wrap.innerHTML = html`. The Add Character form follows the same imperative pattern; no component abstraction needed.
- `chars` — module-level, already filtered to `!c.retired` in `initAttendance`. Use this directly; do not re-filter.

### Finding already-present characters

```js
const presentIds = new Set(activeSession.attendance.map(a => a.character_id));
const eligible   = chars.filter(c => !presentIds.has(c._id)).sort((a, b) =>
  displayName(a).localeCompare(displayName(b))
);
```

Match on `character_id` (not `character_name`) — character names can change and `_id` is the stable key.

### Inline form approach

Add a `<div id="att-add-form" style="display:none">` immediately after the toolbar `<div>` in `renderToolbar()`. The "Add Character" button toggles it visible/hidden. The form contains:

```html
<div id="att-add-form" style="display:none" class="att-add-form">
  <select id="att-add-sel">
    <option value="">— select character —</option>
    <!-- eligible chars injected by showAddForm() -->
  </select>
  <button id="att-add-confirm">Add</button>
  <button id="att-add-cancel">Cancel</button>
</div>
```

`showAddForm()` populates the `<select>`, makes the `<div>` visible, and disables the "Add Character" button to prevent double-open. `hideAddForm()` resets.

### Save-then-render flow

```js
async function confirmAddCharacter() {
  const sel = document.getElementById('att-add-sel');
  const c   = chars.find(ch => ch._id === sel.value);
  if (!c) return;

  const entry = {
    character_id: c._id, character_name: c.name,
    character_display: displayName(c), player: c.player || '',
    attended: false, costuming: false, downtime: false,
    extra: 0, paid: false, payment_method: ''
  };

  activeSession.attendance.push(entry);
  hideAddForm();

  try {
    const { _id, ...body } = activeSession;
    const updated = await apiPut('/api/game_sessions/' + _id, body);
    Object.assign(activeSession, updated);
  } catch (err) {
    activeSession.attendance.pop(); // rollback
    alert('Failed to add character: ' + err.message);
  }

  renderGrid();
}
```

Note: `dirty` is NOT set. This path saves immediately; the "Save Changes" button stays hidden.

### Button disabled state

After `initAttendance` / `selectSession`, check `eligible.length` in `showAddForm()`. If it would be empty, disable the "Add Character" button and add a tooltip (`title="All characters already in this session"`).

---

## Tasks / Subtasks

- [x] Task 1: Add "Add Character" button to toolbar
  - [x] In `renderToolbar()`, add `<button class="att-btn" id="att-add-btn">+ Add Character</button>` to `.att-toolbar-right` before the Save/Delete buttons
  - [x] Add `<div id="att-add-form" style="display:none" class="att-add-form"></div>` immediately after the toolbar `<div>` (before `#att-grid-wrap`)
  - [x] Wire `document.getElementById('att-add-btn').addEventListener('click', showAddForm)`

- [x] Task 2: Implement `showAddForm()` and `hideAddForm()`
  - [x] `showAddForm()`: build eligible list, populate `<select>`, make form visible, disable `#att-add-btn`
  - [x] If eligible is empty: `alert('All active characters are already in this session.')` and return (no form shown)
  - [x] `hideAddForm()`: hide form, re-enable `#att-add-btn`

- [x] Task 3: Implement `confirmAddCharacter()`
  - [x] Follow the save-then-render flow above exactly
  - [x] Rollback on API failure; always call `renderGrid()` at end

- [x] Task 4: Wire confirm/cancel buttons
  - [x] In `showAddForm()`, after injecting HTML, wire:
    - `document.getElementById('att-add-confirm').addEventListener('click', confirmAddCharacter)`
    - `document.getElementById('att-add-cancel').addEventListener('click', hideAddForm)`

- [x] Task 5: CSS — add `.att-add-form` styles to `public/css/admin-layout.css`
  - [x] Inline flex row, `gap: 8px`, `padding: 8px 16px`, `background: var(--surf1)`, `border-bottom: 1px solid var(--surf2)`
  - [x] `#att-add-sel` styled to match `.att-select`

- [ ] Task 6: Manual verify
  - [ ] Create a new session — confirm "Add Character" button present
  - [ ] Select a character not in the session — confirm row appears immediately after confirm
  - [ ] Reload page — confirm new row persists (was saved to API)
  - [ ] Add all remaining characters — confirm button becomes disabled / alert shown
  - [ ] Simulate API failure (dev tools → block request) — confirm rollback, error alert, no phantom row

---

## Dev Notes

### File map

| File | Change |
|---|---|
| `public/js/admin/attendance.js` | `showAddForm()`, `hideAddForm()`, `confirmAddCharacter()`, `renderToolbar()` additions |
| `public/css/admin-layout.css` | `.att-add-form` styles |

### No server changes

`PUT /api/game_sessions/:id` (`server/routes/game-sessions.js:70`) already accepts the full attendance array and does a `$set` replace — no schema change needed.

### `attUpdate` and index alignment

`attUpdate(idx, field, value)` references `activeSession.attendance[idx]` by the original array index (before sort). The sorted display order in `renderGrid()` is cosmetic — inline `onchange` handlers pass the raw `i` index from the pre-sort map. After `confirmAddCharacter()` calls `renderGrid()`, the new entry appears in its sorted position with a fresh index. This is already how all rows work.

### Not wiring `dirty`

The Add Character path saves immediately. If the ST also has unsaved checkbox edits in the grid at the same time, those will also be included in the PUT body (since `activeSession.attendance` is mutated in place by `attUpdate`). This is acceptable behaviour — the immediate save is comprehensive.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- `getEligibleChars()` builds the available set by diffing `activeSession.attendance` character_ids against the full `chars` array; sorts by `displayName`.
- `showAddForm()` injects the select/confirm/cancel inline form into `#att-add-form` and disables the trigger button to prevent double-open. Alerts and returns immediately if no eligible characters remain.
- `hideAddForm()` clears the form innerHTML and re-enables the trigger button; called on cancel, session switch, and after successful add.
- `confirmAddCharacter()` pushes the entry to `activeSession.attendance`, immediately PUTs the full session body, then `Object.assign`s the server response back. On failure it pops the last entry (rollback) and alerts. `dirty` is never set — this path saves immediately.
- `selectSession()` now calls `hideAddForm()` before rendering to avoid a stale open form on session switch.
- The dropdown option label includes player name in parentheses so STs can identify characters without memorising player names.
- Task 6 (manual verify) requires live API data — marked pending.

### File List

- `public/js/admin/attendance.js`
- `public/css/admin-layout.css`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft | Claude (SM) |
| 2026-04-12 | 1.1 | Implementation complete — Tasks 1–5 done | Claude (Dev) |
