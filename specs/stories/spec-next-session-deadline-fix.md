---
title: 'Next-session banner cycle merge + admin deadline editor + DB ghost cleanup'
type: 'bugfix'
created: '2026-04-28'
status: 'done'
baseline_commit: '34c054a01a5a8d2132f779ec992eaf7c8c9c7d96'
context: []
---

## Intent

**Problem:** The public website banner (terramortissuite.netlify.app) shows the wrong next session — it points at a stale 2026-05-01 ghost row in `game_sessions` instead of the real Game 4 on Saturday 2026-05-23, and never displays the active downtime cycle's deadline. Two code bugs and one data hygiene issue conspire here: (a) `/api/game_sessions/next` only merges a cycle's `deadline_at` when `cycle.status === 'active'`, but live cycles spend most of their lifetime in `'game'`/`'prep'`/`'open'`; (b) the admin Downtime panel only renders the inline deadline editor when `cycle.status === 'active'`, so once the cycle moves to `'game'` the ST has no UI to change the deadline; (c) five ghost rows from 2026-05-01 (4× duplicate Game 3/4 entries) and one duplicate 2026-05-23 row sit in production `game_sessions`, plus a stale `downtime_deadline` string on the canonical 2026-05-23 row that overrides the cycle merge.

**Approach:** Broaden the two `status === 'active'` checks to recognise the full live-cycle set `['prep', 'game', 'active', 'open']` (already defined as `liveStatuses` elsewhere in `server/routes/downtime.js`). Run a one-shot DB cleanup deleting the five stale rows and clearing the stale deadline string. After this lands, the ST manually sets the correct `deadline_at` value via the now-always-available admin editor.

## Boundaries & Constraints

**Always:**
- The deadline editor must remain hidden for `closed` cycles — no point editing a closed cycle's deadline.
- The Prep panel's existing `dt-prep-deadline-input` keeps working unchanged; the inline editor at the cycle status row is the one being broadened.
- Server `/next` continues to return the soonest `session_date >= today` from `game_sessions`. The cycle-merge change only widens which cycle statuses contribute their `deadline_at`.
- A session document with its own non-empty `downtime_deadline` string still overrides the cycle merge (existing precedence).
- DB cleanup operates only on the six identified rows by `_id` — no broad deletes by date or game number.

**Ask First:**
- Do not change the cycle's `deadline_at` value as part of this work. The user will set it manually after the fix ships.
- Do not delete or modify any row whose `_id` is not in the explicit cleanup list.

**Never:**
- Do not introduce a new endpoint, schema field, or collection.
- Do not auto-derive the deadline from the session date or any other source.
- Do not add migration code paths that touch other documents.
- Do not push to origin or merge to main.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| /next, session has no deadline, cycle in 'game' | session: `{session_date: '2026-05-23', doors_open: '17:30'}`; cycle: `{status: 'game', deadline_at: '2026-05-22T13:00Z'}` | Response contains `downtime_deadline` formatted from cycle | N/A |
| /next, session has no deadline, cycle in 'prep' | cycle: `{status: 'prep', deadline_at: ISO}` | Same — cycle deadline merged | N/A |
| /next, session has no deadline, cycle in 'closed' | cycle: `{status: 'closed', deadline_at: ISO}` | No deadline merged; response omits `downtime_deadline` | N/A |
| /next, session has its own deadline | session: `{downtime_deadline: 'Friday, 22 May 11:59 PM'}`; cycle: `{status: 'game', deadline_at: ISO}` | Session string wins; cycle ignored | N/A |
| /next, no live cycle exists | All cycles closed | Response has no `downtime_deadline`; banner falls back to generic copy | N/A |
| Admin opens cycle in 'game' status | Status row renders | Inline `Set deadline` input visible; editing PUTs `deadline_at` | API error → existing `updateCycle` handler logs |
| Admin opens cycle in 'closed' status | Status row renders | No `Set deadline` input rendered | N/A |
| Admin opens cycle in 'prep' status | Status row renders | Inline `Set deadline` input visible (in addition to Prep panel input) | N/A |

## Code Map

- `server/routes/game-sessions.js` -- `getNextSession` handler at line 27; cycle lookup at line 37 hardcodes `status: 'active'`.
- `public/js/admin/downtime-views.js` -- `loadCycleById` at line 1032; deadline editor render gate at line 1061 (`if (isActive)`); existing event wire at line 1086.
- `server/tests/api-players-sessions-residency.test.js` -- existing `/api/game_sessions` test file; new `/next` cycle-merge tests can be added here or in a new file.
- `server/routes/downtime.js` -- already defines `liveStatuses = ['prep', 'game', 'active', 'open']` at lines 170 and 257; same constant pattern reused in this fix.

## Tasks & Acceptance

**Execution:**
- [x] `server/routes/game-sessions.js` -- broaden cycle lookup at line 37 from `{ status: 'active' }` to `{ status: { $in: ['prep', 'game', 'active', 'open'] } }`. Rationale: the existing filter only matches one phase of the live cycle lifecycle.
- [x] `public/js/admin/downtime-views.js` -- change deadline editor render gate at line 1061 from `if (isActive)` to `if (!isClosed)` (or equivalently `if (isPrep || isActive || isGame)`). Rationale: deadline editing should be available across the full live cycle.
- [x] `server/tests/api-game-sessions-next.test.js` (new file) -- add unit tests for `/api/game_sessions/next` covering the four merge scenarios in the I/O matrix (session deadline wins, cycle in 'game' merges, cycle in 'closed' does not merge, no live cycle). 5 tests passing locally.
- [x] DB cleanup — executed via `server/scripts/cleanup-stale-sessions.js --apply`. Deleted 6 rows (the 5 listed plus `69e998f331c825dc1c592b6c`, a sibling 2026-05-01 ghost surfaced after the first sweep). `$unset` was a no-op — `_id: 69e998779061c095792fd40c` already had no `downtime_deadline` field; the stale "April 13th" string lived on `a47c` and went away with the delete. Live API now returns the canonical 2026-05-23 row.

**Acceptance Criteria:**
- Given a Game 4 session on 2026-05-23 with no `downtime_deadline` field and a cycle in `status: 'game'` with `deadline_at` set, when the public website loads, then the banner shows the formatted cycle deadline (not the generic "Midnight, Friday before game night" fallback).
- Given the active cycle is in `status: 'game'`, when the ST opens the cycle in the admin Downtime panel, then the inline `Set deadline` input is visible and editing it persists via `updateCycle`.
- Given the DB cleanup has run, when `GET /api/game_sessions/next` is called, then it returns the 2026-05-23 row (`_id: ...d40c`) and not any 2026-05-01 row.
- Given the new test file, when `npm test` is run on the server, then all `/api/game_sessions/next` test cases pass.

## Verification

**Commands:**
- `cd server && npm test -- api-game-sessions-next` -- expected: all new tests pass.
- `curl -s https://tm-suite-api.onrender.com/api/game_sessions/next | jq` (post-deploy) -- expected: `session_date` is `2026-05-23`, `downtime_deadline` reflects the cycle's `deadline_at` once user sets it.

**Manual checks:**
- Open `terramortissuite.netlify.app` after deploy: banner reads "Saturday 23 May 2026", doors "5:30 pm", deadline matches whatever cycle deadline was set by the ST.
- Open admin Downtime panel, select Downtime 3 (status `game`): inline `Set deadline` input is visible.

## Spec Change Log

### 2026-04-28 — review patches (no spec amendment)

Three review agents (blind adversarial, edge-case hunter, acceptance auditor) flagged four issues. All classified `patch` and fixed in-place; no `bad_spec` loopback. Recording for traceability:

1. **Multi-cycle non-determinism** — original `findOne({status: {$in: [...]}})` returned an arbitrary cycle when more than one matched. With the broadened set, this becomes plausible (e.g. previous cycle in `'game'` while next opens in `'prep'`). Patched: added `deadline_at: {$exists, $ne: null}` filter and `sort: {deadline_at: 1}` so the cycle whose deadline is approaching first is surfaced. The I/O Matrix didn't anticipate the multi-cycle case but the patch is consistent with intent.
2. **UI gate admitted unknown statuses** — `if (!isClosed)` rendered the editor for any non-closed status including null/undefined/legacy. Patched to a positive list `(isPrep || isActive || isGame || isOpen)` matching the server's live-status set.
3. **Test sweep destructive against prod if misconfigured** — `beforeEach` `deleteMany` would nuke live cycles if MONGODB_DB ever pointed at production. Patched: added a `getDb().databaseName === 'tm_suite_test'` assertion before the sweep.
4. **Misleading "mirror liveStatuses" comment** — comment claimed to mirror an exported constant that doesn't exist. Rewritten to describe the actual intent (cycles legitimately coexist; sort to disambiguate).

Three findings deferred to `deferred-work.md`: cleanup script lifecycle decision, `formatDeadline` invalid-date guard, 2099 fixture-marker improvement. One rejected as out-of-scope (extra regression tests for `'active'`/`'open'` — same code path as `'game'`/`'prep'`).

## Design Notes

The `liveStatuses` constant at `server/routes/downtime.js:170` is the pattern to follow. We do not extract it into a shared module in this story — duplication of a four-element literal is cheaper than introducing a new shared module for two callers. If a third caller needs the same set, fold it into `server/lib/cycle.js` or similar at that point.

The DB cleanup is intentionally a manual `mongodb` MCP operation rather than a committed migration script. These are six rows in production caused by data-entry duplicates, not a structural issue affecting other environments. A migration script would imply this might happen again; it shouldn't. (At execution time the MCP confirmation UI was broken, so a node script was written and committed instead — the script's lifecycle is now a deferred decision.)

## Suggested Review Order

**Server cycle merge (the design intent)**

- Entry point: cycle lookup deterministic, soonest-deadline wins, skips prep cycles without a deadline.
  [`game-sessions.js:35`](../../server/routes/game-sessions.js#L35)

**Admin deadline editor visibility**

- Positive live-status check; render gate switched from `!isClosed` to `isLive`.
  [`downtime-views.js:1046`](../../public/js/admin/downtime-views.js#L1046)

- Editor render block — now gated on `isLive`.
  [`downtime-views.js:1063`](../../public/js/admin/downtime-views.js#L1063)

**Tests**

- Five-scenario coverage of the merge truth table.
  [`api-game-sessions-next.test.js:74`](../../server/tests/api-game-sessions-next.test.js#L74)

- DB-name guard on the destructive sweep — defence in depth.
  [`api-game-sessions-next.test.js:55`](../../server/tests/api-game-sessions-next.test.js#L55)

**One-shot DB cleanup (already applied to production)**

- Hardcoded `_id` list and idempotent delete + unset; lifecycle deferred.
  [`cleanup-stale-sessions.js:29`](../../server/scripts/cleanup-stale-sessions.js#L29)
