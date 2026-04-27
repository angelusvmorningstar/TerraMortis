---
id: npcp.1
epic: npcp
status: ready-for-dev
priority: high
depends_on: []
---

# Story NPCP-1: Server-side scope on /api/npcs for player role

As a player calling any NPC list endpoint,
I should only receive NPCs whose `linked_character_ids` includes one of my own characters,
So that NPCs unrelated to my character (including ST-private plot NPCs and other players' relationships) cannot leak to me by virtue of any client-side surface that fetches the list.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 6 (NPC Privacy Hardening) — flagged the NPC list endpoints as a privacy defect. The current player-facing Personal Story section in `tabs/downtime-form.js` exposes a picker that lists every NPC in the system; this story closes that leak at the server, before the client (NPCP-2) is changed to stop using the picker.

The precedent is **NPCR-14** (`specs/stories/npcr.14.directory-scope-to-player-creations.story.md`, shipped 2026-04-24), which scoped the `/api/npcs/directory` endpoint to NPCs the player has personally quick-added. NPCP-1 follows the same defensive pattern but applies a different rule: the list returns NPCs **linked to the caller's character**, not NPCs created by the caller.

The two rules cover different needs:
- **NPCR-14 (`/directory`)**: scoped to a picker that intentionally lets the player link to NPCs they themselves have created
- **NPCP-1 (`/api/npcs` list)**: scoped to any general-purpose NPC fetch, so the only NPCs surfaced are those already linked to the caller's character

NPCs the player has self-created via the quick-add path (`POST /api/npcs/quick-add`) automatically pass NPCP-1's filter because the quick-add handler sets `linked_character_ids: [currentCharacterId]` at creation time. So one rule handles both ST-linked and self-created NPCs without an OR condition.

### Files in scope

- `server/routes/npcs.js` — main NPC routes file. Contains the list handler that needs scoping. Other handlers (`/directory`, `for-character/:characterId`, `quick-add`) already have appropriate scoping; do not modify them.
- `server/tests/` — new test file for the scoped list endpoint.

### Out of scope

- The DT form picker UI (handled by NPCP-2; this story changes the server only)
- `/directory` endpoint (already scoped by NPCR-14; do not duplicate the rule)
- `/for-character/:characterId` endpoint (already scopes by character_id; do not modify)
- `/quick-add` endpoint (POST, not a list; out of scope)
- Audit of other player-facing surfaces that consume NPC list data (deferred per user direction 2026-04-27 — only two dummy NPCs in the system today; no real data to leak yet)
- ST-side surfaces (STs continue to see and manage the full NPC roster, unfiltered)

---

## Acceptance Criteria

**Given** I am authenticated as a player (role: 'player')
**When** I call `GET /api/npcs` (the list endpoint)
**Then** the response contains only NPCs where `linked_character_ids` includes at least one of my `req.user.character_ids`.
**And** NPCs whose `linked_character_ids` does not overlap my characters are absent from the list.
**And** the filter is applied in the Mongo query, not in JavaScript post-fetch.

**Given** I am authenticated as a player with no characters (`req.user.character_ids` is empty or missing)
**When** I call `GET /api/npcs`
**Then** the response is an empty array.
**And** the handler does not error.

**Given** I am authenticated as an ST (role: 'st')
**When** I call `GET /api/npcs`
**Then** the response is unchanged from current behaviour: all NPCs, unfiltered.

**Given** I am authenticated as `dev` (Peter's privacy-redacted ST role)
**When** I call `GET /api/npcs`
**Then** the response is treated identically to ST: all NPCs, unfiltered.

**Given** an unauthenticated request to `GET /api/npcs`
**Then** the existing `requireAuth` middleware rejects it (no regression).

**Given** server tests for `GET /api/npcs`
**Then** they cover: player sees only NPCs linked to their characters; player with no characters gets empty list; ST sees all; dev sees all.

---

## Implementation Notes

- **Filter at query level, not post-fetch.** Push the `linked_character_ids` filter into the Mongo query (`find({ linked_character_ids: { $in: characterIds } })`). NPCR-14 explicitly chose this pattern over post-fetch filtering ("less data returned, less risk of accidental leak via later code change") — same reasoning applies here.
- **Role check.** Use the existing role helper pattern. Players are `req.user.role === 'player'` (or whatever the project's existing convention is — match what NPCR-14 does at the same handler). ST and dev roles bypass the filter.
- **Character ids form.** `req.user.character_ids` comes from the auth middleware. NPCs store `linked_character_ids` as an array of strings (same shape as NPCR.10/relationships); the `$in` predicate works directly.
- **Empty-character-array case.** Guard explicitly: if `character_ids` is empty/missing for a player, short-circuit to `res.json([])` rather than running a query that may return nothing or error. Defensive.
- **No client change in this story.** The DT form picker still exists; it just gets a smaller list. NPCP-2 removes the picker entirely. Shipping NPCP-1 first means the server is locked down before client behaviour changes, so any surface that calls `/api/npcs` (visible or hidden) becomes safe immediately.
- **Test pattern.** Follow `server/tests/api-npcs-directory.test.js` (NPCR-14's test file). Three to four `describe` cases:
  - Player with characters: response includes only NPCs whose `linked_character_ids` overlaps
  - Player with no characters: empty array
  - ST: full unfiltered list
  - dev: full unfiltered list (treat as ST)
- **Test marker.** Use `_test_marker: 'npcp-1'` on seeded test docs so teardown cleans them up cleanly even if a test fails mid-run (NPCR-14 precedent).

---

## Files Expected to Change

- `server/routes/npcs.js` — list handler (`GET /`) gains role-conditional Mongo filter on `linked_character_ids`.
- `server/tests/api-npcs-list.test.js` (new, or new `describe` block in an existing file) — four-case coverage as above.

No client-side changes in this story.

---

## Definition of Done

- All AC verified.
- Server tests pass including the new cases.
- Manual smoke test (or curl) confirms: player auth → scoped list; ST auth → unfiltered list.
- No regression on `/directory`, `/for-character/:characterId`, `/quick-add`, or any other existing endpoint.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `npcp-1-server-side-scope-api-npcs: ready-for-dev → in-progress → review` as work proceeds.
