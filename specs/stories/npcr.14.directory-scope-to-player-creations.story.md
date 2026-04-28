---
id: npcr.14
epic: npcr
status: review
priority: high
depends_on: [npcr.6, npcr.8]
---

# Story NPCR-14: Scope the NPC picker directory to the player's own quick-adds

As a player using the Relationships tab's "Link to existing NPC" picker,
I should only see NPCs I have personally quick-added,
So that ST-owned NPCs with private plot or character content (e.g. Keeper's decanted dead wife) do not leak to any authenticated player just by existing in the register.

---

## Context

`GET /api/npcs/directory` powers the "Link to existing NPC" picker in `public/js/tabs/relationships-tab.js` (call site: line 738). The current handler (`server/routes/npcs.js` lines 98-107) returns every NPC with `status` in `['active', 'pending']` with no role gate, no ownership filter. Every authenticated user sees every NPC in the register.

That exposes ST-private NPCs the instant they're created as `status='active'`. The canonical example: Odeliese, Keeper's decanted dead wife — a character-private NPC whose mere existence is a secret from other players.

Players should only be able to link to NPCs they have personally quick-added via `POST /api/npcs/quick-add`. Those records already carry `created_by.type='player'` and `created_by.player_id=<caller>` (set in the quick-add handler at lines 74-78), so the scoping data is in place — the directory endpoint just needs to honour it.

STs keep full visibility — the Relationships tab is the main surface where STs link PCs to already-existing register NPCs, and that workflow must remain unrestricted.

### Out of scope

- No retrospective audit: per user confirmation, no player-owned relationship edges currently point at ST-owned NPCs. Nothing to clean up.
- `GET /api/npcs/for-character/:characterId` is unchanged. That returns NPCs already linked to the caller's own character; there is no picker exposure via this endpoint.
- Admin NPC Register views unchanged.

---

## Acceptance Criteria

**Given** I am authenticated as a player (role: 'player') **When** I call `GET /api/npcs/directory` **Then** the response contains only NPCs where `created_by.type === 'player'` AND `created_by.player_id === req.user.player_id`. **And** ST-owned NPCs (those without a `player_id` in `created_by`, or with a different `player_id`) are absent from the list.

**Given** I am authenticated as an ST or dev **When** I call `GET /api/npcs/directory` **Then** the response is unchanged: all NPCs with `status` in `['active', 'pending']`, unfiltered.

**Given** I am a player with no quick-added NPCs **When** I open the Relationships tab "Link to existing NPC" picker **Then** the dropdown is empty. **And** a helper line directs me to use Quick-add new NPC or ask the ST.

**Given** the picker mode copy **Then** "Link to existing NPC" is renamed for the player view to "Link to one of your NPCs" (or equivalent wording that makes the scoping clear). ST view keeps the existing label.

**Given** the `/directory` handler **Then** it still rejects unauthenticated requests (existing `requireAuth` behaviour at the router level — no regression).

**Given** server tests for `/api/npcs/directory` **Then** they cover: player sees only own quick-adds; ST sees all; empty list for a player with no quick-adds.

---

## Implementation Notes

- The handler is ~10 lines. Add a role check after the existing find: if `req.user.role` is not ST/dev, additionally filter `created_by.type === 'player'` and `created_by.player_id === String(req.user.player_id)`.
- Player ID comes from the auth middleware. It is stored in `_quickAddLastAt` keying (line 42: `playerId = String(req.user?.player_id || req.user?.id || '')`) — use the same form for consistency.
- `created_by` wasn't part of the existing projection (lines 100-104). Either add `created_by: 1` to the projection and filter client-side inside the handler, or push the filter into the Mongo query. Pushing into the query is cleaner — less data returned, less risk of accidental leak via later code change.
- Picker copy: `relationships-tab.js` around the `renderAddPanel` function (see the mode labels and picker header around `npcMode === 'new'` / `npcMode === 'existing'` branches). One string change for the player-mode label; leave ST label as-is since role is detectable client-side.
- Empty-state message: current behaviour probably shows an empty `<select>`. Add a small conditional: if `_tabState.npcs.length === 0` and player mode, render "You haven't created any NPCs yet. Use Quick-add new NPC or ask the ST."
- Tests: `server/tests/api-npcs-quick-add.test.js` exists. A new test file `server/tests/api-npcs-directory.test.js` (or a new `describe` block in an existing file) is the right home for the three AC test cases.

---

## Files Expected to Change

- `server/routes/npcs.js` — `/directory` handler gains role-conditional filter.
- `server/tests/api-npcs-directory.test.js` (new) — three-case coverage (player sees own, ST sees all, empty player case).
- `public/js/tabs/relationships-tab.js` — picker label copy + empty-state message for player mode.

---

## Definition of Done

- All ACs verified.
- Server tests pass including the three new cases.
- Manual browser smoke: as ST, picker shows full directory; as player, picker shows only my quick-adds.
- No regression on `for-character` / admin NPC Register endpoints.
- File list in completion notes matches actual changes.

---

## Dev Agent Record

### Implementation Notes

Implemented 2026-04-24 under bmad-dev-story workflow.

- Server-side filter applied in the Mongo query itself (not post-fetch), so ST-owned NPCs never enter the response payload for a player caller. Cheaper and more defensive — future code change to the projection can't accidentally leak.
- Used `req.user.player_id || req.user.id` (same form as the quick-add rate-limit keying at line 42) for consistency.
- Client picker copy changes: added two hints in the "Existing NPC" mode of `relationships-tab.js`. Empty state explains Quick-add / ST link path; non-empty state clarifies scoping via a footer hint. Both hints suppressed for ST role.
- Imported `isSTRole` into `relationships-tab.js` — previously not imported there.
- Tests use `_test_marker: 'npcr-14'` on seeded docs so tearDown cleans them up cleanly even if a test fails mid-run.

### Test results

- `server/tests/api-npcs-directory.test.js` — 3 cases, all pass
- Regression: `api-npcs-quick-add.test.js` + `api-npc-flags.test.js` + `api-relationships.test.js` — 71 tests, all pass

### File List

- `server/routes/npcs.js` (modified) — `/directory` handler: role-conditional Mongo filter on `created_by.type` + `created_by.player_id`.
- `server/tests/api-npcs-directory.test.js` (new) — 3 tests covering player scoping, ST unfiltered, empty-state.
- `public/js/tabs/relationships-tab.js` (modified) — imports `isSTRole`; adds empty-state hint and footer hint in the "Existing NPC" picker mode (player role only).
- `specs/stories/sprint-status.yaml` (modified) — NPCR block added with npcr-14 tracking.

### Change Log

- 2026-04-24 — NPCR-14 implemented. ready-for-dev → in-progress → review.
