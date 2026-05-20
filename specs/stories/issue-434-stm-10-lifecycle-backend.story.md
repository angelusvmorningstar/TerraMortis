# Issue #434: STM-10 — lifecycle backend (active + toggle + tombstone-delete + event stream)

Status: Ready for Review

issue: 434
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/434
branch: piatra/issue-434-stm-10-lifecycle-backend
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 4 §D15-D20 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE (D16 dissent window closed by Angelus sign-off). Tombstone-before-destroy is HALT-DAR-pinned LOAD-BEARING.

## Story

As a Storyteller,
I want ST mods to be persistent and toggleable (create → active ↔ inactive → permanently deleted) with an immutable audit event stream,
so that mods can be paused without losing them, permanently removed for list cleanliness, and every lifecycle event stays accountable even after the mod doc is destroyed.

## Decisions implemented (ADR-004 Rev 4 §D15-D20)

- **D15** — `active: boolean` on st_mods, defaults `true` on create.
- **D16** — `PATCH /api/st_mods/:id { active }` toggle, writes `activated`/`deactivated` audit event, broadcasts matching WS op.
- **D17** — audit collection is now a lifecycle event stream (`event: created|activated|deactivated|deleted`). DELETE writes a `deleted` tombstone BEFORE destroying the mod doc.
- **D18** — WS op set widened: `create` / `activate` / `deactivate` / `delete`. The STM-9 `revoke` op is retired.
- **D19** — backfill-independence: `active !== false` (missing field = active) + `event ?? 'created'` (missing field = created). No hard migration needed; STM-13 ships the idempotent backfill separately.
- **D20** / Position B — mod docs deletable for list cleanliness; audit ledger immutable.

## Tasks / Subtasks

- [x] Task 1 — POST: `active: true` on create + `created` lifecycle audit event (replaces STM-1's implicit creation row).
- [x] Task 2 — PATCH `/api/st_mods/:id`: flip active, write `activated`/`deactivated` event (delta + reason captured at event), broadcast, roll back the flag if the audit insert fails.
- [x] Task 3 — DELETE: **tombstone-before-destroy** (HALT-DAR). Write `deleted` audit row first; if it fails, abort the delete (500). Then deleteOne. Broadcast `delete` (retiring `revoke`).
- [x] Task 4 — Overlay filter: `applyStMods` skips `active === false` mods (the bulk/single GET still returns all so STM-11/12 see the full set).
- [x] Task 5 — `event ?? 'created'` decoration on the audit GET for pre-Rev4 rows.
- [x] Task 6 — WS `broadcastStModUpdate` JSDoc op-set widening; grep confirmed no `=== 'revoke'` consumer (the panel's `action === 'revoke'` is a UI action name, not the WS op; updated the STM-9 test's `revoke` assertion to `delete`).
- [x] Task 7 — 13 vitest cases (5 required + 8 extra: PATCH 400/404, GET-returns-all, DELETE 404, legacy-active-field overlay).

## Acceptance Criteria

1. st_mods stores `active`, defaults true — ✅
2. **HALT-DAR: tombstone-before-destroy + rollback on tombstone failure** — ✅ explicit vitest gate (tombstone survives permanent delete; rollback leaves mod intact when tombstone insert fails)
3. PATCH deactivate flips + audit + WS deactivate — ✅
4. PATCH activate flips + audit + WS activate — ✅
5. POST writes `created` event — ✅
6. Overlay skips inactive — ✅ (applyStMods filter)
7. GET returns all mods (active + inactive) — ✅
8. Audit GET returns full lifecycle stream; legacy rows read `created` — ✅
9. WS ops: create/activate/deactivate/delete; `revoke` retired — ✅
10. Grep `=== 'revoke'` — ✅ none found (WS op); STM-9 test updated
11. ≥5 vitest cases — ✅ 13
12. No regression — ✅ 1053/1053 (STM-6 filter-by-character test updated: revoke now adds a tombstone row, so CHAR_A's audit stream is 4 = 3 created + 1 deleted)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Audit field naming: dual-stamp.** Rev 4 names the actor `by` and timestamp `at`. STM-6's audit reader (GET sort by `created_at` + admin page reading `created_by.discord_name`) is out of scope for STM-10 (STM-11 owns the audit-view migration). To avoid breaking the merged STM-6 surface during the STM-10→STM-11 window, `buildAuditEvent` writes BOTH `by`/`at` (canonical Rev 4) AND `created_by`/`created_at` (back-compat aliases, same values). STM-11 migrates the reader to by/at and drops the aliases. Documented in the helper JSDoc + PR.
- **Tombstone-before-destroy ordering (HALT-DAR).** DELETE: resolve doc → write `deleted` tombstone → (if tombstone insert throws) abort with 500, mod survives, no ledger entry → else deleteOne → broadcast. The merge-gate vitest spies `getCollection` (not a single collection instance — the driver returns a fresh Collection per call) with a Proxy that rejects `st_mod_audit.insertOne` once, asserting the mod doc remains.
- **PATCH rollback symmetry.** If the activated/deactivated audit insert fails, the active flag is rolled back to its prior value (mirrors STM-1's create rollback) — the ledger is the source of truth; a flag flip with no audit row would lie.
- **delta + reason captured AT the event** (not referenced live) so a later edit/revoke can't rewrite history. Matches the DT-snapshot principle from STM-8.
- **Overlay filter is client-side** (`applyStMods` skips `active === false`); the server GET returns all mods so STM-11's audit view and STM-12's panel can show active + inactive. `active !== false` treats missing field as active (D19).
- **`revoke` retirement.** Grep found the WS op only at the DELETE call site (changed to `delete`) + the STM-9 test (updated) + JSDoc (widened). No `=== 'revoke'` consumer exists — the panel's `data-stm-action="revoke"` / `action === 'revoke'` is a UI action label routing to DELETE, unrelated to the WS op string. STM-12 will rework the panel UI (toggle / delete-permanent); for STM-10 the panel's revoke button still maps to DELETE which now tombstones.
- **Worktree pattern continued.**

### File List

- `server/routes/st_mods.js` (modified) — `buildAuditEvent` helper; POST active+created event; new PATCH toggle; DELETE tombstone-before-destroy; audit GET `event ?? 'created'` decoration; DELETE op `revoke`→`delete`
- `server/ws.js` (modified) — `broadcastStModUpdate` JSDoc op-set widened
- `public/js/data/st-mods.js` (modified) — `applyStMods` skips `active === false`; strips overlay when all mods inactive
- `server/tests/stm-10-lifecycle.test.js` (new) — 13 vitest cases incl. the tombstone-before-destroy + rollback merge gates
- `server/tests/stm-9-ws-broadcast.test.js` (modified) — DELETE op assertion `revoke`→`delete`; dedupe sample op updated
- `server/tests/api-st-mods.test.js` (modified) — STM-6 filter-by-character total 3→4 (revoke now writes a tombstone)
- `specs/stories/issue-434-stm-10-lifecycle-backend.story.md` — this file

### Change Log

- 2026-05-20 (Ptah): STM-10 lifecycle backend
