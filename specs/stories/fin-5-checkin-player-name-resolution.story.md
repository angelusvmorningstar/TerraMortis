---
id: fin.5
epic: fin
status: ready-for-dev
priority: high
depends_on: []
---

# Story FIN-5: Resolve real player names on the Check-In tab

As a coordinator on the live Check-In tab,
I should see each player's real display name (e.g. "Kurtis W", "Katie H") next to their character,
So that I can match the person at the door to the correct row without having to recognise placeholder strings like "Player A" or memorise the alphabetic order from a redacted import.

---

## Context

The Check-In tab (`public/js/game/signin-tab.js`, mounted by FIN-3 as the coordinator's at-the-door tool) reads `attendance[].player` verbatim and renders it in the `.si-player` cell at line 160. The data behind that cell is broken: every row in Game 3's `attendance` array has `player: 'Player A'`, `'Player B'`, ..., `'Player AA'`, etc. — placeholder strings that were seeded into the database during an early redacted import or test fixture and never backfilled with real names.

The `players` collection is fine. 34 player records exist with proper `display_name` values (`Kurtis W`, `Katie H`, `Nathan H`, `Sky K`, `Symon G`, …) and each player's `character_ids` array correctly links them to their character. The data link from attendance rows to real names is just never made.

Two complementary fixes:

1. **Backfill historical sessions.** A one-off script that walks every `game_sessions[*].attendance[]` entry, resolves `character_id → players.character_ids → players.display_name`, and writes the result back to `attendance[].player`. Permanent, also future-proofs admin reports that group by `attendance.player`.
2. **Harden the renderer.** The signin tab should not blindly trust whatever string is in `attendance[].player`. If the field is missing, empty, or matches the placeholder pattern (`/^Player [A-Z]{1,2}$/`), resolve it live from `character_id → players.display_name` at render time. Self-healing for any future data drift, and unblocks the live coordinator workflow even before the migration runs.

Both fixes are needed: (1) cleans history so reports work; (2) is the load-bearing render-time guarantee.

### Files in scope

- `public/js/game/signin-tab.js` — `render()` at line ~104; resolve player display name with a fallback chain rather than reading `a.player` raw at line 160.
- `server/scripts/backfill-attendance-player.js` — new one-off backfill script. Mirrors the shape of existing backfill scripts under `server/scripts/`.
- (Read-only) `players` collection — source of truth for `display_name`.

### Out of scope

- The rendering of `display_name` on any other admin surface (Engine, Attendance & Finance summary). Those surfaces either already resolve correctly or are out of scope for FIN-5; verify but do not refactor unless a leak is found in the same shape.
- Changing the `attendance[].player` schema field shape. It stays a string; we just fill it with the right value.
- Renaming player records, editing the `players` collection, or adding new player fields.
- Real-time subscription to player display-name changes (if a player renames themselves, attendance rows already written keep their snapshotted name — acceptable for an audit field).
- The "Did Not Attend" dropdown cleanup (FIN-6) and the session-rate refactor (FIN-7) — independent stories.

---

## Acceptance Criteria

### Render-time fallback

**Given** I am a coordinator on the Check-In tab
**When** an attendance row has `player` set to a real display name (e.g. `"Kurtis W"`)
**Then** the row's `.si-player` cell renders that string verbatim.

**Given** an attendance row's `player` field is missing, empty string, or matches the placeholder pattern `/^Player [A-Z]{1,2}$/`
**When** the row renders
**Then** the renderer resolves the name from the `players` collection by walking `attendance.character_id → players.character_ids → players.display_name` (or `username` if `display_name` is empty).
**And** falls back to `'—'` (em dash) only if no match is found.

**Given** the players collection is loaded once at tab init (not per-row)
**Then** the lookup is O(1) per row via a `Map<character_id, display_name>` built once in `initSignIn`.

### Sort order respects resolved name

**Given** the attendance list sorts alphabetically by player name
**When** rendering
**Then** the sort key is the **resolved** display name, not the raw `attendance.player` string. Otherwise rows with placeholder strings will sort by `"Player A", "Player AA", "Player B"` even though they're displayed as `"Kurtis W", "Katie H"`, etc.

### Backfill script

**Given** the backfill script `server/scripts/backfill-attendance-player.js`
**When** I run it (`node server/scripts/backfill-attendance-player.js`)
**Then** it iterates every document in `game_sessions`.
**And** for each `attendance[i]`, looks up the matching player via the same `character_id → players.character_ids → players.display_name` chain.
**And** writes the resolved name back to `attendance[i].player` only if the current value is missing, empty, or matches the placeholder pattern.
**And** logs a per-session summary: total rows, rows updated, rows skipped because already real, rows skipped because no player match.
**And** does not modify rows that already hold real-looking names.
**And** is idempotent — running it twice produces no further changes the second time.

**Given** an attendance row whose `character_id` does not match any player record
**Then** the script logs a warning with the session title, character_id, and current `player` value, and does not touch the row.

**Given** the script runs against `MONGODB_URI` set to `tm_suite_test` (the test DB)
**Then** it operates against the test DB and does not require any --confirm flag for the live DB. The user's existing import-script discipline (memory `feedback_imports.md`) means the user runs it themselves; the script just needs to be safe to invoke.

### No regression

**Given** the existing Check-In tab rendering, payment dropdown, attendance checkbox, eminence/ascendancy header, and footer total
**Then** none of those break.

---

## Implementation Notes

### Renderer

In `signin-tab.js`, build a player-by-character lookup at init:

```js
let _session = null;
let _chars = [];
let _players = [];
let _playerByCharId = new Map();

export async function initSignIn(el, chars) {
  // ...existing code...
  _chars = chars || [];
  _players = await apiGet('/api/players');
  _playerByCharId = new Map();
  for (const p of _players) {
    const name = p.display_name || p.username || '';
    if (!name) continue;
    for (const cid of (p.character_ids || [])) {
      _playerByCharId.set(String(cid), name);
    }
  }
  // ...rest of init...
}
```

Then a small resolver:

```js
const PLACEHOLDER_RE = /^Player [A-Z]{1,2}$/;

function resolvePlayerName(att) {
  const raw = att.player || '';
  if (raw && !PLACEHOLDER_RE.test(raw)) return raw;
  const fromMap = _playerByCharId.get(String(att.character_id));
  return fromMap || '—';
}
```

Use `resolvePlayerName(a)` everywhere `a.player` is currently read — both at line 160 (the render cell) and at lines 108–110 (the sort comparator). The sort comparator becomes:

```js
const att = (_session.attendance || []).slice().sort((a, b) => {
  const pa = resolvePlayerName(a).toLowerCase();
  const pb = resolvePlayerName(b).toLowerCase();
  return pa.localeCompare(pb);
});
```

### Backfill script

Mirror the shape of an existing backfill script. Sketch:

```js
// server/scripts/backfill-attendance-player.js
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const PLACEHOLDER_RE = /^Player [A-Z]{1,2}$/;

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'tm_suite');
  try {
    const players = await db.collection('players').find({}).toArray();
    const byCharId = new Map();
    for (const p of players) {
      const name = p.display_name || p.username || '';
      if (!name) continue;
      for (const cid of (p.character_ids || [])) byCharId.set(String(cid), name);
    }

    const sessions = await db.collection('game_sessions').find({}).toArray();
    for (const s of sessions) {
      let updated = 0, skippedReal = 0, skippedNoMatch = 0;
      const next = (s.attendance || []).map(a => {
        const cur = a.player || '';
        if (cur && !PLACEHOLDER_RE.test(cur)) { skippedReal++; return a; }
        const resolved = byCharId.get(String(a.character_id));
        if (!resolved) { skippedNoMatch++; return a; }
        updated++;
        return { ...a, player: resolved };
      });
      if (updated > 0) {
        await db.collection('game_sessions').updateOne(
          { _id: s._id }, { $set: { attendance: next } }
        );
      }
      console.log(`${s.title || s.session_date}: updated=${updated} skipped-real=${skippedReal} skipped-no-match=${skippedNoMatch}`);
    }
  } finally {
    await client.close();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
```

User runs the script themselves per memory `feedback_imports.md`; do not invoke it from the application.

### No tests required

Both halves are mechanical lookups with no business logic. Manual smoke (Check-In tab shows real names; sort order alphabetical by resolved name) is sufficient. If a quick unit-test is desired, mock `_playerByCharId` and assert `resolvePlayerName` returns the right string for placeholder/missing/real input — optional, not required.

---

## Files Expected to Change

- `public/js/game/signin-tab.js` — load `_players`, build `_playerByCharId` Map in `initSignIn`; new `resolvePlayerName(att)` helper; replace direct `a.player` reads in `render()` (sort comparator + `.si-player` cell).
- `server/scripts/backfill-attendance-player.js` — new one-off script. Idempotent.

No schema changes, no API changes.

---

## Definition of Done

- All AC verified.
- Manual smoke as coordinator: Check-In tab on Game 3 shows real names instead of `Player A`, `Player B`, etc.; rows sort alphabetically by the resolved name.
- Backfill script ran against live `tm_suite` (user invokes); per-session summary printed; running it again produces zero updates.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `fin-5-checkin-player-name-resolution: ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Independent of FIN-6 (dropdown cleanup) and FIN-7 (session-rate model). Can ship in any order.
- Recommended ship first of the three because it is a visible defect on every Check-In open today.
