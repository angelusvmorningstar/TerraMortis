# Story: city.3 — Dynamic Eminence & Ascendancy

## Status: review

## Summary

The Eminence & Ascendancy section in the City view is fully hardcoded with static numbers. It should dynamically sum the `status.city` of characters who **attended** the most recent game session, grouped by clan (Eminence) and covenant (Ascendancy). The "Game 2" label should also be dynamic.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/admin/city-views.js` | Fetch game sessions in init; replace `renderAscendancy()` with dynamic calculation |

---

## Acceptance Criteria

1. Eminence totals are calculated by summing `status.city` of characters marked `attended: true` in the most recent game session, grouped by clan
2. Ascendancy totals are calculated by summing `status.city` of characters marked `attended: true`, grouped by covenant
3. Results are sorted descending by total
4. The section label shows the session title/date dynamically (not hardcoded "Game 2")
5. If no session data is available, the section shows a placeholder ("No session data")
6. Clans/covenants with zero attendance-weighted status are omitted from the list

---

## Tasks / Subtasks

- [x] Fetch game sessions in `initCityView()` (AC: #1, #2, #4, #5)
  - [x] Add `apiGet('/api/game_sessions')` call in `initCityView()`
  - [x] Store latest session as module-level `_latestSession` (sort by date, take first)
  - [x] Fail gracefully — `_latestSession = null` if fetch fails
- [x] Replace `renderAscendancy()` with dynamic version (AC: #1–#6)
  - [x] If `_latestSession` is null, render placeholder
  - [x] Build attended character set from `_latestSession.attendance` where `attended === true`
  - [x] Match attended entries to `chars` by `character_id`
  - [x] Sum `status.city` per clan → Eminence map
  - [x] Sum `status.city` per covenant → Ascendancy map
  - [x] Sort both maps descending, filter out zero totals
  - [x] Render with dynamic label from session date/title

---

## Dev Notes

### Session data structure

```js
// game_session document
{
  _id, session_date, title,
  attendance: [
    { character_id: '...', attended: true, player: '...' },
    { character_id: '...', attended: false, ... },
  ]
}
```

### Calculation

```js
const attendedIds = new Set(
  (_latestSession.attendance || [])
    .filter(a => a.attended)
    .map(a => String(a.character_id))
);
const attendedChars = chars.filter(c => attendedIds.has(String(c._id)));

const eminence = {};
const ascendancy = {};
for (const c of attendedChars) {
  const cs = c.status?.city || 0;
  if (c.clan)     eminence[c.clan]       = (eminence[c.clan]       || 0) + cs;
  if (c.covenant) ascendancy[c.covenant] = (ascendancy[c.covenant] || 0) + cs;
}
```

### Module-level variable

Add `let _latestSession = null;` alongside the existing `let chars`, `let terrDocs` declarations (around line 29).

### Session label

Use `_latestSession.title || _latestSession.session_date || 'Latest Session'` in the heading.

### `_latestSession` init in `initCityView()`

```js
try {
  const sessions = await apiGet('/api/game_sessions');
  _latestSession = sessions.sort((a, b) => b.session_date.localeCompare(a.session_date))[0] || null;
} catch { _latestSession = null; }
```

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- `_latestSession` added as module-level var, fetched in `initCityView()` sorted by `session_date` desc
- `renderAscendancy()` fully replaced — builds attended char set from session attendance, sums `status.city` per clan/covenant, sorts descending, filters zeros
- Session label uses `title || session_date || 'Latest Session'`
- Graceful fallback to placeholder when no session or no attended chars

### File List

- `public/js/admin/city-views.js`

### Change Log

- 2026-04-23: Implemented city.3 — dynamic Eminence & Ascendancy from attendance
