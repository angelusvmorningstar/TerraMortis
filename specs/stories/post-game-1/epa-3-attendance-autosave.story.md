# Story EPA.3: Auto-Save Attendance on Each Change

Status: done

## Story

**As an** ST taking attendance during a live game,
**I want** each tick or change to save immediately without a manual Save button,
**so that** navigating away or losing focus never loses partially-entered attendance data.

## Background

During the first live game (2026-04-18), the ST was mid-way through attendance entry, navigated away to another tab, and returned to find all attendance data wiped. Root cause: `public/js/admin/attendance.js` marks changes as `dirty` in memory and only saves when the ST clicks the explicit "Save Changes" button. There is no autosave.

The attendance write path goes through `PUT /api/game_sessions/:id` with the entire session body. There is no per-row attendance endpoint — this is fine, the whole-document PUT is the correct pattern.

**The fix:** replace the `markDirty()` + Save button flow with an immediate debounced PUT on every change.

### Current flow (broken)

```
ST ticks checkbox
  → attUpdate(idx, field, value) called
  → activeSession.attendance[idx][field] = value  (in-memory only)
  → markDirty() → dirty = true, shows Save button
  ST navigates away without clicking Save → all changes lost
```

### Required flow

```
ST ticks checkbox
  → attUpdate(idx, field, value) called
  → activeSession.attendance[idx][field] = value  (in-memory)
  → scheduleAutosave()  → debounced 800ms PUT /api/game_sessions/{id}
  Navigate away at any time → changes already persisted
```

## Acceptance Criteria

1. Every change to an attendance field (attended, costuming, downtime, extra, payment_method, paid) triggers an automatic save within 1 second, with no manual Save button required.
2. Rapid consecutive changes (ticking multiple boxes quickly) are debounced — only one API call fires after the burst, not one per tick.
3. A subtle saving indicator is shown while the debounce is pending or the PUT is in-flight, and clears on success.
4. On save failure, an error state is shown and the save is retried or the user is notified. The in-memory state is not rolled back (the user's changes are preserved visually).
5. The explicit "Save Changes" button is removed from the toolbar.
6. Adding a new character to the session (`confirmAddCharacter`) continues to save immediately as it does now (direct PUT) — no change to that flow.
7. Creating a new session (`createNewSession`) continues to save immediately — no change.
8. Deleting a session (`deleteSession`) continues to work — no change.
9. Sort order (player/character alphabetical) continues to work correctly.
10. Character names display in title case (capitalised) — fix any that are currently all-lowercase.

## Tasks / Subtasks

- [ ] Replace `markDirty()` + Save button with debounced autosave (AC: #1, #2, #3, #4)
  - [ ] Add `let _saveTimer = null` module-scope variable
  - [ ] Add `scheduleAutosave()` function: clears existing timer, sets 800ms timeout, calls `doAutosave()`
  - [ ] Add `doAutosave()` async function: shows saving indicator, calls `PUT /api/game_sessions/{id}`, clears indicator on success, shows error on failure
  - [ ] Replace `markDirty()` call in `attUpdate()` with `scheduleAutosave()`
  - [ ] Remove `dirty` flag and all references to it
  - [ ] Remove the `dirty` check in session selector change handler (no longer needed — save is immediate)
- [ ] Remove Save Changes button (AC: #5)
  - [ ] Remove `<button id="att-save-btn">` from `renderToolbar()` HTML
  - [ ] Remove `document.getElementById('att-save-btn')` event listener wiring
  - [ ] Remove `saveSession()` function (or repurpose as `doAutosave()`)
  - [ ] Remove `att-save-btn` show/hide calls from `selectSession()` and `markDirty()`
- [ ] Add saving indicator (AC: #3)
  - [ ] Add a small status span in the toolbar (e.g. `<span id="att-save-status"></span>`)
  - [ ] Show "Saving…" text when autosave is pending or in-flight
  - [ ] Clear on success (empty string)
  - [ ] Show "Save failed — retrying" on error (do not block the UI)
- [ ] Fix character name capitalisation (AC: #10)
  - [ ] In `renderGrid()`, confirm `charDisplay` uses `sortName(c)` from `helpers.js` — this should already capitalise correctly
  - [ ] Check `a.character_display` fallback — if this contains old lowercase data from the DB, apply `.replace(/\b\w/g, c => c.toUpperCase())` as a display-only transform

## Dev Notes

### Key File

- `public/js/admin/attendance.js` — entire implementation lives here. ~340 lines.

### Debounce Pattern

```js
let _saveTimer = null;

function scheduleAutosave() {
  clearTimeout(_saveTimer);
  const statusEl = document.getElementById('att-save-status');
  if (statusEl) statusEl.textContent = 'Saving\u2026';
  _saveTimer = setTimeout(doAutosave, 800);
}

async function doAutosave() {
  if (!activeSession) return;
  try {
    const { _id, ...body } = activeSession;
    const updated = await apiPut('/api/game_sessions/' + _id, body);
    Object.assign(activeSession, updated);
    const statusEl = document.getElementById('att-save-status');
    if (statusEl) statusEl.textContent = '';
  } catch (err) {
    const statusEl = document.getElementById('att-save-status');
    if (statusEl) statusEl.textContent = 'Save failed \u2014 will retry';
    // Retry after 3s
    _saveTimer = setTimeout(doAutosave, 3000);
  }
}
```

### What NOT to Change

- `confirmAddCharacter()` — already does an immediate PUT. Leave as-is.
- `createNewSession()` — already uses `apiPost`. Leave as-is.
- `deleteSession()` — leave as-is.
- Sort behaviour — `attSort()` and `_sortBy` remain.
- The attendance data model — `game_sessions.attendance[]` array is the correct storage location.

### No Server Changes

The server route `PUT /api/game_sessions/:id` at `server/routes/game-sessions.js` already accepts a full session body and applies `$set`. No changes needed server-side.

### Attendance GET endpoint

`GET /api/attendance` (at `server/routes/attendance.js`) is a player-facing read-only endpoint that returns attendance status for a specific character. It is NOT used by the admin attendance tab. Do not confuse the two. The admin tab uses `GET /api/game_sessions` directly.

### References

- [Source: specs/architecture/system-map.md#Section 7] — Attendance data flow
- [Source: public/js/admin/attendance.js#lines 169-173] — markDirty() and Save button
- [Source: public/js/admin/attendance.js#lines 290-295] — attUpdate()
- [Source: public/js/admin/attendance.js#lines 319-335] — saveSession()
- [Source: server/routes/game-sessions.js#lines 70-80] — PUT handler

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
