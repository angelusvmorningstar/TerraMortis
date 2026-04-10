# Story Fix.12: Attendance List — Alphabetical Character Order

## Status: ready-for-dev

## Story

**As an** ST using the attendance tracker,
**I want** the character rows in the attendance grid to be sorted alphabetically by character display name,
**so that** I can quickly find a specific character without scanning an arbitrary order.

## Background

The attendance tab renders rows in `renderGrid()` (`public/js/admin/attendance.js` ~line 137). It currently reads:

```js
// Preserve original array order for display (matches MongoDB document order)
const sorted = att.map((a, i) => {
  const c = chars.find(ch => ch._id === a.character_id || ch.name === a.character_name || ch.name === a.name);
  const player = a.player || (c ? c.player : '') || '';
  return { a, i, player };
});
```

The comment "preserve original array order" was written when the intent was to match the session creation order (sorted by player name at creation time, line 116). In practice this means display order depends on when the session was created — existing sessions stored in MongoDB are displayed in document order, which may not be alphabetical.

The `i` index in `{ a, i }` refers to the position of each entry in `activeSession.attendance` and is used in `attUpdate(idx, ...)` to write back to the correct array slot. This index must not change. The sort only affects display order, not the underlying data.

The correct sort key is character display name, using `displayName(c)` — the same function used to populate `character_display` on each attendance entry. `displayName` applies the moniker override (moniker > name) and prepends honorific, which matches how characters are displayed elsewhere in the app. This is consistent with the character tab sort (which uses `sortName`, the same field without honorific — either works here since the user said "alphabetical by first name, moniker overrides").

`sortName` is not currently imported in `attendance.js`. Use `displayName(c)` (already imported) as the sort key, falling back to `a.character_display` for entries where the character object is not found.

## Acceptance Criteria

1. When an existing session is loaded, the attendance rows are displayed in ascending alphabetical order by character display name (moniker overrides legal name)
2. When a new session is created and loaded, the rows are in the same alphabetical order
3. Editing any row (checking attendance, costuming, payment, etc.) still saves correctly — the `attUpdate(idx, ...)` index must refer to the original array position, not the sorted position
4. Characters whose attendance record has no matching `chars` entry (name mismatch) are sorted by `a.character_display` and appear at the end or alphabetically in-band with their stored display name

## Tasks / Subtasks

- [ ] In `public/js/admin/attendance.js`, in `renderGrid()`, after building the `sorted` array (line ~148), add a sort:
  ```js
  sorted.sort((x, y) => {
    const nameX = x.c ? displayName(x.c) : (x.a.character_display || x.a.name || '');
    const nameY = y.c ? displayName(y.c) : (y.a.character_display || y.a.name || '');
    return nameX.localeCompare(nameY);
  });
  ```
  where `x.c` and `y.c` are the resolved character objects. Update the object shape in `sorted` to include `c`:
  ```js
  const sorted = att.map((a, i) => {
    const c = chars.find(ch => ch._id === a.character_id || ch.name === a.character_name || ch.name === a.name);
    const player = a.player || (c ? c.player : '') || '';
    return { a, i, c, player };
  });
  sorted.sort((x, y) => { ... });
  ```
- [ ] In the render loop starting at line ~173, the `c` lookup (`chars.find(...)`) is now redundant — use `sorted[*].c` already resolved above. Update the loop to use the pre-resolved `c`.
- [ ] Remove or update the "Preserve original array order" comment.

## Dev Notes

- `i` in each sorted entry is the original index into `activeSession.attendance`. The `attUpdate(i, ...)` call in inline handlers uses this index to mutate the right slot. The sort must not change `i`.
- `displayName` is already imported at the top of `attendance.js`. No new imports needed.
- New session creation sort (line 116) sorts by `a.player` — leave that unchanged. The display sort operates independently on render.
- Manual check: Load any existing session and confirm rows appear in character name order, not player name or document insertion order.

---

## Dev Agent Record

### Implementation Plan
_To be filled by dev agent_

### Debug Log
_To be filled by dev agent_

### Completion Notes
_To be filled by dev agent_

## File List
_To be filled by dev agent_

## Change Log
_To be filled by dev agent_
