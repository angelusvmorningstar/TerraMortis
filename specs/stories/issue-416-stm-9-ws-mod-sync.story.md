# Issue #416: STM-9 — WS-driven mod invalidation

Status: Ready for Review

issue: 416
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/416
branch: piatra/issue-416-stm-9-ws-mod-sync
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 3 §D11 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE (HALT-DAR on Task 3 dedupe was scoped to "ping if mirror exposes API gap"; mirror is straightforward — proceeding)

## Story

As an ST or player with multiple browser tabs / clients connected,
I want ST mod create/revoke events broadcast to all connected sessions and reflected in their in-memory caches within ~1 second,
so that the cache-entry invariant (STM-7 D8) doesn't drift mid-session and the visible sheet always reflects the current server state.

## Tasks / Subtasks

- [x] Task 1 — `broadcastStModUpdate(characterId, op, stModId)` in `server/ws.js`. Mirrors `broadcastTrackerUpdate`. Frame shape: `{ type: 'st_mod', characterId, op, st_mod_id }`.
- [x] Task 2 — POST + DELETE hooks in `server/routes/st_mods.js`. POST broadcasts AFTER both inserts succeed; DELETE resolves character_id before deletion and broadcasts only when deleteOne removed a row.
- [x] Task 3 — Local-write dedupe in `public/js/data/ws.js`. Mirror of `markLocalWrite`. Uses a constant 'st_mod' token keyed by character_id rather than per-mod-id (POST race avoidance).
- [x] Task 4 — Client WS dispatch: `_ws.onmessage` routes `msg.type === 'st_mod'` to `_handleStModMsg`. Panel calls `markLocalWrite` before POST/DELETE.
- [x] Task 5 — Boot wires: admin / player / app `initWS` extended with `onStModUpdate` callback that re-runs `applyOverlayToAll([target])` and re-renders the sheet if active.
- [x] Task 6 — 9 vitest cases covering POST/DELETE broadcast emission + dedupe behaviour.

## Acceptance Criteria

1. `broadcastStModUpdate` exported — ✅
2. POST emits create on success — ✅
3. DELETE emits revoke on success — ✅
4. Frame shape matches tracker convention — ✅
5. Single client dispatch handler — ✅
6. Refetch + re-overlay + re-render-if-active — ✅
7. Local-write dedupe — ✅ constant-token mirror
8. Cross-client smoke — ⏳ needs Peter
9. Player smoke — ⏳ needs Peter
10. ≥3 vitest cases — ✅ 9
11. No regression — ✅ 1021/1021 pass

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **HALT-DAR mirror survey:** `markLocalWrite(charId, fields)` records `charId+':'+key` for each key in `fields`. The function is generic — no tracker-shape coupling. For st_mod I pass `{ st_mod: true }` so the recorded key is `charId:st_mod`. Pure consumer-side reuse. No Angelus escalation needed.
- **Constant 'st_mod' token vs per-mod-id matching:** initially considered `charId + ':' + stModId`, but POST doesn't know the new mod's _id until response returns and WS frames typically arrive a few ms BEFORE the HTTP response — per-id matching would race. Constant token is the right shape; the contract is "panel just mutated this character, suppress echo for ECHO_WINDOW".
- **DELETE resolves character_id before deletion** so the broadcast knows the right channel. Skips broadcast on 404 (deleteOne returned 0).
- **POST broadcasts AFTER both inserts succeed** so the audit-rollback path never emits a phantom create frame.
- **Rebased onto post-STM-8 dev tip before push** so the PR diff is minimal and focused.

### File List

- `server/ws.js` (modified) — `broadcastStModUpdate` export
- `server/routes/st_mods.js` (modified) — POST + DELETE hooks
- `public/js/data/ws.js` (modified) — `_handleStModMsg` + `_onStModUpdate` + dispatch
- `public/js/admin/st-mods-panel.js` (modified) — `markLocalWrite` before POST/DELETE
- `public/js/admin.js` (modified) — `onStModUpdate` callback
- `public/js/player.js` (modified) — `onStModUpdate` callback + `applyOverlayToAll` import
- `public/js/app.js` (modified) — `onStModUpdate` callback (sheet tracker repaint on st_mod for active sheet char)
- `server/tests/stm-9-ws-broadcast.test.js` (new) — 9 vitest cases
- `specs/stories/issue-416-stm-9-ws-mod-sync.story.md` — this file

### Change Log

- 2026-05-20 (Ptah): STM-9 initial implementation
