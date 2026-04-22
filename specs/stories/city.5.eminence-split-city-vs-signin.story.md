# Story: city.5 — Fix Eminence & Ascendancy Split: City View All-Players vs Sign-In Attendance-Filtered

## Status: review

## Summary

Two separate Eminence & Ascendancy calculations are needed:

1. **City view (ST admin)** — should show totals from ALL active non-retired characters' `status.city`, regardless of session attendance. Currently broken: it requires a game session with `attended: true` entries, showing "No attendance data" when the session has no ticked attendance.

2. **Sign-In tab (game app)** — should filter by characters marked `attended: true` in the current session (correct in principle, keep as-is).

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/admin/city-views.js` | Remove session dependency from `renderAscendancy()` — sum all active chars |
| `public/js/game/signin-tab.js` | No change — attendance-filtered logic is correct |

---

## Acceptance Criteria

1. City view Eminence & Ascendancy always shows data for all active non-retired characters, regardless of whether a game session exists or has ticked attendance
2. The section label in the city view does not reference a session date (no "Game 2" / "2026-05-23" label)
3. Sign-In tab top-2 summary continues to filter by `attended: true`
4. City view shows "No characters" placeholder only if there are genuinely no active characters

---

## Tasks / Subtasks

- [x] Fix `renderAscendancy()` in `city-views.js` (AC: #1, #2, #4)
  - [x] Removed `_latestSession` dependency entirely
  - [x] Sums `status.city` across all active non-retired chars
  - [x] Removed "No session data" / "No attendance data" placeholders
  - [x] Section label is plain "Eminence & Ascendancy" — no session tag
  - [x] "No characters" placeholder retained for empty case
- [x] Preserve sign-in tab behaviour (AC: #3)
  - [x] `calcEminence()` in `signin-tab.js` unchanged — still filters by `attended: true`

---

## Dev Notes

### Current `renderAscendancy()` — session-dependent (city-views.js lines 149–196)

Filters by `_latestSession.attendance` → `attended === true`. If no session or no ticked attendance, shows "No attendance data".

### Target — all active chars, no session needed

```js
function renderAscendancy() {
  const active = chars.filter(c => !c.retired);
  const eminenceMap = {};
  const ascendancyMap = {};
  for (const c of active) {
    const cs = c.status?.city || 0;
    if (c.clan)     eminenceMap[c.clan]       = (eminenceMap[c.clan]       || 0) + cs;
    if (c.covenant) ascendancyMap[c.covenant] = (ascendancyMap[c.covenant] || 0) + cs;
  }
  // ... sort and render same as before, no session label
}
```

### `_latestSession` still needed?

`_latestSession` was only introduced for `renderAscendancy()`. Once this function no longer uses it, the session fetch in `initCityView()` can be removed entirely (or kept if needed for other future use — leave in but the eminence render no longer depends on it).

### Sign-In tab (`signin-tab.js`) — no change

`calcEminence(session, chars)` already correctly filters by attended characters. This behaviour is correct and stays.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- `renderAscendancy()` now sums status.city for all active non-retired chars — no session dependency
- _latestSession fetch in initCityView() still runs but is no longer used by this function
- Sign-in tab calcEminence() unchanged — still attendance-filtered

### File List

- `public/js/admin/city-views.js`

### Change Log

- 2026-04-23: Implemented city.5 — city view eminence uses all-player totals
