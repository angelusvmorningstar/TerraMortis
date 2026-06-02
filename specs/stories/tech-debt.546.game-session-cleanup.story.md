# Story tech-debt.546: Game session data cleanup

## Status: review

## Issue
[#546](https://github.com/angelusvmorningstar/TerraMortis/issues/546) — Data: clean up orphaned game sessions and test downtime cycles

## Branch
`ms/issue-546-clean-game-sessions-cycles`

---

## Story

**As a** coordinator,
**I want** the check-in session dropdown to show exactly the 5 canonical game sessions,
**so that** orphaned test data no longer pollutes the session picker and downtime cycle list.

---

## Background

### Confirmed live state (inspected 2026-06-02)

**`game_sessions` — 11 documents, 5 needed:**

| _id (prefix) | game_number | session_date | title | attendance | Action |
|---|---|---|---|---|---|
| `69ccd6e4` | null | 2026-02-26 | "Game 1" | 31 | **PATCH** → game_number=1, date=2026-02-21 |
| `69ccd95f` | null | 2026-03-21 | "Game 2" | 33 | **PATCH** → game_number=2 |
| `69e21a34` | null | 2026-04-18 | "Game 3" | 32 | **PATCH** → game_number=3 |
| `69fc0b91` | 3 | 2026-05-01 | null | 0 | **DELETE** (orphan) |
| `69fc0b92` | 4 | 2026-05-01 | null | 0 | **DELETE** (orphan) |
| `6a0c1e61` | 3 | 2026-05-01 | null | 0 | **DELETE** (orphan) |
| `6a0c1e62` | 4 | 2026-05-01 | null | 0 | **DELETE** (orphan) |
| `6a0c1e86` | 3 | 2026-05-01 | null | 0 | **DELETE** (orphan) |
| `6a0c1e86` | 4 | 2026-05-01 | null | 0 | **DELETE** (orphan) |
| `69e99877` | 4 | 2026-05-23 | null | 26 | **KEEP** (real Game 4) |
| `6a167616` | 5 | 2026-06-20 | null | 0 | **KEEP** (correct Game 5) |

**`downtime_cycles` — 7 documents, 4 needed:**

| _id (prefix) | game_number | status | Action |
|---|---|---|---|
| `69f2dc48` | 1 | closed | **KEEP** (DT1) |
| `69d0a3c5` | 2 | closed | **KEEP** (DT2) |
| `69e955c7` | 3 | closed | **KEEP** (DT3) |
| `6a11a381` | 4 | active | **KEEP** (DT4 active) |
| `69fc0b8d` | 99 | — | **DELETE** (test cycle) |
| `6a0c1e5c` | 99 | — | **DELETE** (test cycle) |
| `6a0c1e85` | 99 | — | **DELETE** (test cycle) |

---

## Acceptance Criteria

- [x] All 6 orphaned session documents (date 2026-05-01, zero attendance) are deleted
- [x] Games 1–3 have `game_number` set as integer (1/2/3)
- [x] Game 1 `session_date` corrected from `"2026-02-26"` to `"2026-02-21"`
- [x] Games 2–3 `session_date` unchanged (already correct)
- [x] Game 4 (`69e99877`) and Game 5 (`6a167616`) untouched
- [x] 3 test cycles (`game_number: 99`) deleted from `downtime_cycles`
- [x] DT1–DT4 (`69f2dc48`, `69d0a3c5`, `69e955c7`, `6a11a381`) untouched

---

## Scope

**In scope**: One server script, dry-run by default, `--apply` to execute. No UI changes, no server code changes, no API changes.

**Out of scope**: Retroactive payment data (#547), player ID linkage.

---

## Dev Notes

### Script to create

**`server/scripts/cleanup-sessions-and-cycles.js`**

Pattern: dry-run by default, `--apply` to execute. Follows `restore-dt1-charles-cyrus.js` conventions.

```js
import { MongoClient, ObjectId } from 'mongodb';

const DRY_RUN = !process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }

const DB_NAME = 'tm_suite';

// Orphaned sessions to delete (zero attendance, wrong date)
const ORPHAN_SESSION_IDS = [
  '69fc0b9189cbae1cbdcaeb9a',
  '69fc0b9289cbae1cbdcaeb9b',
  '6a0c1e611b85125e3bed32b1',
  '6a0c1e621b85125e3bed32b2',
  '6a0c1e866b75f53426e22954',
  '6a0c1e866b75f53426e22955',
].map(id => new ObjectId(id));

// Patch operations for Games 1–3
const SESSION_PATCHES = [
  { _id: new ObjectId('69ccd6e4327efb46ce373f45'), $set: { game_number: 1, session_date: '2026-02-21' } },
  { _id: new ObjectId('69ccd95f327efb46ce373f46'), $set: { game_number: 2 } },
  { _id: new ObjectId('69e21a343205c7c7574c769e'), $set: { game_number: 3 } },
];

// Test cycles to delete (game_number: 99)
const ORPHAN_CYCLE_IDS = [
  '69fc0b8de083123d75ab3a1a',
  '6a0c1e5cec036c394a6028af',
  '6a0c1e85c890f59f2faba4c4',
].map(id => new ObjectId(id));
```

**Safety checks the script must perform before any writes:**
1. Verify each ORPHAN_SESSION_ID exists AND has `attendance.length === 0` — abort if any has attendance
2. Verify each SESSION_PATCH `_id` exists AND has attendance — abort if any is missing or empty (guard against wrong IDs)
3. Verify each ORPHAN_CYCLE_ID exists AND has `game_number === 99` — abort if any has a real game_number

**Output format (dry-run):**
```
[DRY RUN] Would delete 6 orphaned sessions
[DRY RUN] Would patch: 69ccd6e4 → game_number=1, session_date=2026-02-21
[DRY RUN] Would patch: 69ccd95f → game_number=2
[DRY RUN] Would patch: 69e21a34 → game_number=3
[DRY RUN] Would delete 3 test cycles
Run with --apply to execute.
```

**Output format (--apply):**
```
Deleted 6 orphaned sessions.
Patched Game 1 (69ccd6e4): game_number=1, session_date=2026-02-21
Patched Game 2 (69ccd95f): game_number=2
Patched Game 3 (69e21a34): game_number=3
Deleted 3 test cycles.
Done.
```

### Run commands

```
# Dry run first (always):
node --env-file=../.env scripts/cleanup-sessions-and-cycles.js
# from server/ directory

# Apply after reviewing dry-run output:
node --env-file=../.env scripts/cleanup-sessions-and-cycles.js --apply
```

(User runs these themselves — do not auto-execute `--apply`.)

### What NOT to change

- Game 4 (`69e99877`) — correct, has real attendance, do not touch
- Game 5 (`6a167616`) — correct placeholder, do not touch
- DT1–DT4 cycle documents — do not touch
- Any server routes, API handlers, or frontend code — this is data-only

### Verify after applying

Re-run `server/scripts/inspect-session-data.js` and confirm:
- 5 game_sessions remain, all with integer `game_number` 1–5
- Game 1 shows `session_date: "2026-02-21"`
- 4 downtime_cycles remain (game_number 1, 2, 3, 4)
- No documents with `game_number: 99`

---

## Dev Agent Record

### File List
- `server/scripts/cleanup-sessions-and-cycles.js` — new cleanup script (dry-run by default, `--apply` to execute)

### Change Log
- 2026-06-02: Wrote `cleanup-sessions-and-cycles.js`. Dry-run verified: 6 orphaned sessions identified, 3 patch operations confirmed, 3 test cycles identified. All safety checks pass (orphans confirmed zero attendance, patches confirmed non-zero attendance, cycles confirmed game_number=99).

### Completion Notes
Script written and dry-run verified. All operations confirmed correct against live DB inspection. ACs will be satisfied once the user runs `--apply`; the script prints a post-apply verification summary automatically. Do not run `--apply` without user confirmation — this is a destructive database operation.
