# Story fix.551: /api/attendance — select session by game_number field

## Status: review

## Issue
[#551](https://github.com/angelusvmorningstar/TerraMortis/issues/551) — /api/attendance: select session by game_number field, not array position

## Branch
`ms/issue-551-attendance-game-number-fix`

---

## Story

**As a** player submitting a downtime,
**I want** the attendance gate to look up my game by its number, not its position in a sorted list,
**so that** my attendance is never incorrectly reported as false because of session insertion order.

---

## Background

The downtime form calls `GET /api/attendance?character_id=X&game_number=N` to determine whether a player attended a given game. The route resolves the session by **array position**: it fetches all sessions sorted by date and takes `all[gameNumber - 1]`. This broke during testing when 6 empty orphan sessions (date `2026-05-01`) sorted between Game 3 and Game 4, pushing the index onto an empty orphan and returning `attended=false` for everyone in DT4.

The orphans were removed by #546, but the positional approach remains fragile — any session added or dated oddly will misalign the index again. The correct fix is a direct field lookup.

---

## Acceptance Criteria

- [ ] `GET /api/attendance?game_number=N` selects the session whose `game_number` field equals N
- [ ] Fallback (no `game_number` in query) still returns the most recent session (unchanged)
- [ ] No regression on the `attended` flag or attendee-list in the response
- [ ] The route comment on line 10 updated to reflect the new behaviour

---

## Scope

**In scope**: 3-line change in `server/routes/attendance.js` + comment update.

**Out of scope**: the PATCH endpoint; the first-match behaviour for duplicate attendance entries; `public/js/tabs/downtime-form.js` (caller is unchanged).

---

## Dev Notes

### Exact change — `server/routes/attendance.js`

**Lines 10 and 16–18:**

```js
// BEFORE (line 10 comment):
// If game_number provided, looks up the Nth game session (sorted by date); otherwise uses the most recent.

// AFTER:
// If game_number provided, selects the session whose game_number field equals N; otherwise uses the most recent.
```

```js
// BEFORE (lines 16-18):
if (gameNumber && Number.isInteger(gameNumber) && gameNumber > 0) {
  const all = await col().find({}).sort({ session_date: 1 }).toArray();
  latest = all[gameNumber - 1] || null;
}

// AFTER:
if (gameNumber && Number.isInteger(gameNumber) && gameNumber > 0) {
  latest = await col().findOne({ game_number: gameNumber }) || null;
}
```

That is the complete change. Two fewer lines. The `findOne` returns null if no session has that `game_number`, which is the same null-handling path as before (`latest = all[gameNumber - 1] || null`).

### What NOT to change

- The fallback branch (lines 19-22) — unchanged, still fetches most recent by date
- `matchesChar()`, the character name lookup, the attendee-list resolution — all unchanged
- The PATCH endpoint — not in scope
- `public/js/tabs/downtime-form.js` — caller already passes `currentCycle.game_number` correctly

---

## Dev Agent Record

### File List
- `server/routes/attendance.js` — lines 10 and 16-18 modified

### Change Log
- 2026-06-02: Replaced positional `all[gameNumber-1]` fetch with `col().findOne({ game_number: gameNumber })`. Updated route comment. Fallback (no game_number) unchanged.

### Completion Notes
3-line change. `findOne({ game_number: N })` returns null if no session has that number — same null path as before. Eliminates dependency on session insertion order and date sorting. All downstream logic (matchesChar, attendee-list, PATCH endpoint) untouched.
