---
issue: 483
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/483
branch: ms/issue-483-checkin-roster-new-session
---

# feature.483 — Check-In: roster-first rendering + New Session in Check-In

**Status:** review

## Story

As a coordinator or ST running game-night check-in,
I want Check-In to show the full non-retired character roster automatically,
so that I can tick who arrived without needing to pre-populate the session in a separate admin tab.

## Acceptance Criteria

- **AC1** — Check-In shows all non-retired characters regardless of whether they have an existing `session.attendance[]` entry
- **AC2** — Ticking a character attended creates their entry in `session.attendance[]` and saves it to the API
- **AC3** — Characters already in `session.attendance[]` retain their existing data (payment method, costuming, downtime flags) across renders
- **AC4** — When no session exists, Check-In shows a "+ New Session" button; confirming creates the session and re-renders the roster
- **AC5** — The new session confirm dialog shows the derived game number (max existing game_number + 1)
- **AC6** — Session header shows game date, game number, and attended/total count
- **AC7** — Eminence/Ascendancy summary continues to work correctly (reads from `session.attendance` which now gets populated on tick)

## Tasks / Subtasks

- [x] T1 — Roster-first rendering in `signin-tab.js`
  - [x] T1.1 — Change `render()` to iterate `_chars.filter(c => !c.retired)` sorted by player name, merging with existing `session.attendance[]` entries by `character_id`
  - [x] T1.2 — For a char with an existing entry: render their existing row (attended, payment, etc.) as before
  - [x] T1.3 — For a char with no existing entry: render a row with all fields unchecked/empty
  - [x] T1.4 — Update header stat to show `attendedCount / totalRosterCount` (not attendance array length)
- [x] T2 — Upsert-on-tick write path
  - [x] T2.1 — Change `wireEvents()` to key by `character_id` (data attribute `data-char-id`) instead of array `idx`
  - [x] T2.2 — When a char has no existing attendance entry and their checkbox is ticked, push a new entry to `_session.attendance[]` and schedule autosave
  - [x] T2.3 — New entry shape: `{ character_id, character_name, character_display, player, attended: true, costuming: false, downtime: false, extra: 0, paid: false, payment: {}, payment_method: '' }` — matches the shape that `confirmAddCharacter()` uses in `attendance.js`
- [x] T3 — "+ New Session" button when no session exists
  - [x] T3.1 — Add `apiPost` to the imports from `../data/api.js`
  - [x] T3.2 — When `!_session` after load, render a prompt with a "+ New Session" button instead of the old "Create one in ST Admin → Attendance" message
  - [x] T3.3 — On click: fetch all sessions to derive next game number (max `session.game_number` + 1, default to 1), confirm with user ("Create session for Game N?"), POST to `/api/game_sessions` with `{ session_date: today, game_number: N, attendance: [] }`, then re-render
  - [x] T3.4 — After creation, set `_session` and call `render()` normally
- [x] T4 — Preserve session rate and eminence
  - [x] T4.1 — Confirm `calcEminence()` still works — it reads from `_session.attendance` filtered by `attended`, which is correctly populated by T2

## Dev Notes

### Architecture overview

**Entry point:** `app.js:361`
```js
if (t === 'signin') initSignIn(document.getElementById('t-signin'), suiteState.chars);
```
`suiteState.chars` is the full loaded character array (already has ST mods overlay applied). Retired characters must be filtered out — use `_chars.filter(c => !c.retired)`.

The tab is `coordinatorOnly: true` — visible to coordinators and STs, not plain players.

### File to modify: `public/js/game/signin-tab.js`

**Current state — what it does today:**
- Fetches all sessions, picks the most recent by `session_date`
- Renders only rows in `session.attendance[]` — empty session = empty table
- `wireEvents()` keys by array index (`data-idx`), directly mutates `_session.attendance[idx]`
- `charForEntry(a)` looks up the char for an attendance row
- `doAutosave()` does `PUT /api/game_sessions/:id` with full session body (no change needed)

**What this story changes:**
- `render()` now drives from `_chars` (roster), not `session.attendance`
- `wireEvents()` keys by `character_id` (roster-safe, stable across renders)
- New: upsert logic when ticking a char with no prior entry
- New: no-session state with "+ New Session" button

**What must be preserved:**
- `doAutosave()` and its retry logic — no change
- `calcEminence()` — reads from `_session.attendance`; stays correct as long as entries are in `session.attendance` when marked attended (which T2 ensures)
- Session rate input and payment handling — these work on existing entries; same pattern applies to new entries
- `resolvePlayerName()` — unchanged
- `_playerByCharId` lookup via `/api/players/display-names` — unchanged

### Key implementation pattern

Replace the render loop. Current:
```js
const att = (_session.attendance || []).slice().sort(...);
att.forEach((a, idx) => {
  const c = charForEntry(a);
  ...
  h += `<div class="si-row..." data-idx="${idx}">`;
});
```

New approach — iterate roster, merge entries:
```js
const entryByCharId = new Map(
  (_session.attendance || []).map(a => [String(a.character_id), a])
);
const roster = _chars
  .filter(c => !c.retired)
  .sort((a, b) => resolveRosterPlayerName(a).localeCompare(resolveRosterPlayerName(b)));

roster.forEach(c => {
  const a = entryByCharId.get(String(c._id)) || null; // null = no entry yet
  const attended = a?.attended || false;
  ...
  h += `<div class="si-row..." data-char-id="${c._id}">`;
});
```

For `resolveRosterPlayerName(c)` — just use `c.player || displayName(c)` to sort by player name.

### Key implementation pattern — upsert on tick

In `wireEvents()`, change from index-based to char-id-based:
```js
_el.querySelectorAll('.si-att-chk').forEach(chk => {
  chk.addEventListener('change', () => {
    const charId = String(chk.dataset.charId);
    let entry = _session.attendance.find(a => String(a.character_id) === charId);
    if (!entry) {
      // First tick: create the attendance entry
      const c = _chars.find(ch => String(ch._id) === charId);
      if (!c) return;
      entry = {
        character_id:      c._id,
        character_name:    c.name,
        character_display: displayName(c),
        player:            c.player || '',
        attended:          false,
        costuming:         false,
        downtime:          false,
        extra:             0,
        paid:              false,
        payment:           {},
        payment_method:    '',
      };
      _session.attendance.push(entry);
    }
    entry.attended = chk.checked;
    scheduleAutosave();
    render();
  });
});
```

Apply the same pattern to payment select and other per-row controls: find entry by `charId`, create if missing.

### "+ New Session" implementation

When `!_session`, render:
```html
<div class="si-empty">
  No upcoming session.
  <button class="si-new-session-btn">+ New Session</button>
</div>
```

Handler:
```js
async function handleNewSession() {
  let sessions = [];
  try { sessions = await apiGet('/api/game_sessions'); } catch { sessions = []; }
  const maxNum = sessions.reduce((m, s) => Math.max(m, s.game_number || 0), 0);
  const gameNum = maxNum + 1;
  if (!confirm(`Create session for Game ${gameNum}?`)) return;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const created = await apiPost('/api/game_sessions', {
    session_date: today,
    game_number:  gameNum,
    attendance:   [],
  });
  _session = created;
  await loadPlayerNames();  // populate _playerByCharId
  render();
}
```

Extract player-name loading into a helper (`loadPlayerNames()`) so it can be called both in `initSignIn` and after session creation.

### Import change needed

`signin-tab.js` currently imports:
```js
import { apiGet, apiPut } from '../data/api.js';
```

Add `apiPost`:
```js
import { apiGet, apiPut, apiPost } from '../data/api.js';
```

### What NOT to change

- `public/js/admin/attendance.js` — out of scope; remains the historical management view
- `public/js/admin/next-session.js` — out of scope; leave as secondary path for editing session metadata
- `public/js/app.js` — call signature of `initSignIn(el, chars)` does not change
- `doAutosave()` — no change; `PUT /api/game_sessions/:id` with full body already handles partial attendance arrays correctly
- The payment amount display (`$${rowAmount}`) — render it as `$0` for chars with no entry (rowAmount defaults to 0 when no payment method set)

### Session header

Keep showing: session date, attended count, status span. Update `attended / total` to `attendedCount / roster.length` (not `att.length`).

### Retired characters

Show only non-retired characters (`.filter(c => !c.retired)`). Do not show retired as dimmed — out of scope per issue.

## Dev Agent Record

### Debug Log
- `fin-checkin-finance.spec.js` had a stale assertion for `'Did Not Attend'` option (retired in FIN-6 per `payment-helpers.js`). Test was failing before this story; removed the assertion.
- `attendance.spec.js` has 3 pre-existing failures in "Save flow" tests (around `window.attUpdate`). These cover `attendance.js` which was not modified; not a regression.

### Completion Notes
- T1: `render()` rewritten to iterate `_chars.filter(c => !c.retired)` sorted by `resolveRosterPlayerName(c)`. Builds `entryByCharId` map from `session.attendance`; merges per char. `data-idx` replaced with `data-char-id` on row div, checkbox, and select. Header stat updated to `attendedCount / roster.length`.
- T2: `wireEvents()` keyed by `dataset.charId` throughout. On first tick of a char with no entry: creates a full entry object (matching `confirmAddCharacter()` shape from `attendance.js`) and pushes to `_session.attendance` before setting `attended`. Same upsert pattern applied to payment select.
- T3: `apiPost` added to imports. `initSignIn` now calls `renderNoSession()` when `!_session`, which renders the `+ New Session` button and wires its click handler. `handleNewSession()` fetches all sessions, derives game number, confirms, POSTs, sets `_session`, calls `loadPlayerNames()` then `render()`. Player name loading extracted into `loadPlayerNames()` helper so it can be called from both `initSignIn` and `handleNewSession`.
- T4: `calcEminence()` unchanged — reads from `_session.attendance`; correctly populated by T2 upsert.
- Session header now shows "Game N — date" format (AC6). `charForEntry` removed (no longer needed). `resolvePlayerName(att)` replaced by `resolveRosterPlayerName(c)`. `sortName` import removed.
- 9 new E2E tests in `tests/feature-483-checkin-roster-new-session.spec.js` — all pass (9/9).
- 15/15 tests pass across both Check-In test files.

## File List

- `public/js/game/signin-tab.js` — full rewrite per story spec
- `tests/feature-483-checkin-roster-new-session.spec.js` — 9 new E2E tests (AC1–AC6)
- `tests/fin-checkin-finance.spec.js` — removed stale 'Did Not Attend' assertion (pre-existing failure)

## Change Log

- 2026-05-22: Story created — Check-In roster-first rendering + New Session button
- 2026-05-22: Implementation complete — all tasks done, 9/9 new tests pass, 15/15 total Check-In tests pass
