# Issue #358: STM-1 — Backend st_mods + st_mod_audit collections, CRUD API, audit log

Status: Ready for Review

issue: 358
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/358
branch: piatra/issue-358-stm-1-backend-st-mods
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE — pure new backend; no ADR-D touchpoints

## Story

As a Storyteller,
I want a backend store and CRUD API for ST mods plus an immutable audit log,
so that downstream stories (STM-2 overlay, STM-4 sheet UX, STM-5 admin panel) have a stable foundation, and every mod creation event is recoverable even after the mod itself is revoked.

## Acceptance Criteria

1. New collection `tm_suite.st_mods` accepts inserts via `POST /api/st_mods` with the documented shape (character_id, stat_path, delta, reason, show_reason_to_player, created_by, created_at).
2. New collection `tm_suite.st_mod_audit` accepts inserts via the same handler and is written **inside the same request** as the `st_mods` insert. Audit row is the same shape minus `show_reason_to_player`.
3. `POST /api/st_mods` validates inputs and returns `400` when: `delta` is not an integer, `reason` is empty/whitespace, or `stat_path` is not on the whitelist (static set from ADR-004 §D3 plus regex `^(merits|disciplines)\.[0-9]+\.dots$`).
4. `GET /api/st_mods?character_id=:id` returns active mods for a character (ordered by `created_at` ascending so multi-mod stacks render in creation order downstream).
5. `DELETE /api/st_mods/:id` hard-deletes the document from `st_mods` and **leaves the `st_mod_audit` row intact**.
6. `GET /api/st_mod_audit?character_id=:id` returns audit history for a character, including audit rows whose `st_mods` document has since been deleted.
7. All four routes return `401` to unauthenticated callers (use existing Discord OAuth ST-auth middleware).
8. Manual smoke (curl or Postman) sequence passes end-to-end: create → list → revoke → confirm audit row survives.

## Tasks / Subtasks

- [x] Task 1 — Create new route file `server/routes/st_mods.js` mounting the four endpoints (AC: 1, 4, 5, 6, 7)
  - [x] Import the existing ST-auth middleware (match the pattern used in `server/routes/characters.js` or whichever route file is the cleanest current ST-auth gate)
  - [x] Wire `GET /api/st_mods`, `POST /api/st_mods`, `DELETE /api/st_mods/:id`, `GET /api/st_mod_audit` — all behind the ST-auth middleware
  - [x] Mount the router in the app's main route table (likely `server/index.js` or `server/app.js` — confirm against current convention)
- [x] Task 2 — Implement `stat_path` validation whitelist (AC: 3)
  - [x] Define the static whitelist inline in the route file. Source: ADR-004 §D3 — `Attributes` (9 attrs × {dots, bonus}), `Skills` (24 skills × {dots, bonus}), `Current State` (damage / willpower / vitae / blood_potency — verify exact field names against `public/js/data/accessors.js` before pinning), `Derived` (defence, health_max, willpower_max, size, speed, initiative).
  - [x] Combined predicate: `path ∈ STATIC_WHITELIST || /^(merits|disciplines)\.[0-9]+\.dots$/.test(path)`
  - [x] Reject with `400 { error: 'invalid stat_path', stat_path }` when neither matches
  - [x] Reject with `400 { error: 'delta must be integer' }` when delta is non-integer (including float, string, null)
  - [x] Reject with `400 { error: 'reason is required' }` when reason is missing or trims to empty
- [x] Task 3 — Implement audit-row coupling in `POST /api/st_mods` (AC: 2)
  - [x] Insert into `st_mods` first; on success, insert into `st_mod_audit` with the same payload (minus `show_reason_to_player`) and the `st_mods` `_id` reused as the audit row's `_id` (so revoke-time matching is trivial) OR a separate ObjectId — Ptah's call, document in PR
  - [x] If the audit insert fails after the `st_mods` insert succeeds, **roll back** the `st_mods` insert (best-effort sequential rollback acceptable; full transaction not required for v1). Document the choice in the PR description.
- [x] Task 4 — Manual smoke verification (AC: 8)
  - [x] Pick a known character ObjectId from `tm_suite.characters`
  - [x] curl sequence: POST (valid mod) → GET (verify present) → DELETE → GET (verify gone from st_mods) → GET /api/st_mod_audit (verify audit row survived)
  - [x] Capture the curl session output in the PR description's test plan

## Dev Notes

### Files to create

**`server/routes/st_mods.js`** (new) — single route file mounting the four endpoints.

### Files to modify

**`server/index.js`** or whichever file currently mounts the API route table — add the `st_mods` router. Match the existing import + `app.use('/api/...', router)` pattern verbatim; one line of change is the target.

### What NOT to change

- `server/routes/characters.js` — not in STM-1's scope; STM-3 will add the `st_mods_suppressed` PATCH endpoint there
- The `characters` collection schema — STM-1 does not touch it
- `public/` — no client work in this story; STM-2+ own the render integration
- `CLAUDE.md` — the "Derived stats are never stored" amendment lands in STM-2, NOT here
- `specs/architecture/adr-004-st-mods-overlay.md` — ADR is frozen; don't edit

### Reference materials

- **ADR-004** at `specs/architecture/adr-004-st-mods-overlay.md`:
  - §D3 — the static whitelist composition (Attributes/Skills/Current State/Derived)
  - §"Concerns" item 2 — explicit rationale for whitelist-at-write-time
- **PRD** at `specs/epic-stm-st-mods.md`:
  - §"Design Decisions / Audit log is append-only" — confirms audit-survives-revoke contract
  - STM-1 story block at the bottom of the file
- **`server/db.js`** — `getCollection(name)` pattern for new collection access. No schema migration; Mongo creates the collection on first insert.

### Pre-commit hygiene checklist (per saved feedback)

- [ ] `git status | head -1` immediately after branch creation — confirm on `piatra/issue-358-stm-1-backend-st-mods`
- [ ] `git status | head -1` before staging — confirm no stray files from a parallel session
- [ ] `git status | head -1` before commit — same check, last line of defence

### Branch hygiene

Branch from current `dev` (which is up to date as of 2026-05-18). Do **not** merge `dev` into the branch mid-implementation unless `dev` lands a conflicting commit — there are no in-flight PRs touching `server/routes/` or `server/index.js`, so this should not happen.

### Coverage that is explicitly NOT required

- No frontend changes — defer to STM-2..STM-6
- No CLAUDE.md amendment — defer to STM-2
- No `app_settings` collection — defer to STM-3
- No `st_mods_suppressed` PATCH — defer to STM-3

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **AC#8 substitution.** Per agreement with the user, the literal-curl smoke (no local Mongo available in this dev env) was substituted with a vitest integration test that walks the identical create → list → revoke → audit-survives sequence end-to-end via supertest. Test name: `AC#8 — end-to-end smoke (create → list → revoke → audit survives) > walks the full lifecycle`. Same assertions a curl run would make, but it lives in CI so it cannot rot.
- **Audit row _id strategy.** Separate ObjectId per audit row, linked to the mod via `st_mod_id` field. Rationale: gives the audit table its own identity (forward-compat for future audit events on the same mod, e.g. revocation rows), and the lookup-by-st_mod_id is just as cheap as lookup-by-_id with a single index later.
- **Audit-rollback-on-failure.** Sequential write with best-effort rollback. If `st_mods` insert succeeds but `st_mod_audit` insert throws, we attempt to delete the freshly-inserted mod and return 500. No Mongo transaction in v1 — full transaction would require a replica-set test environment we don't currently configure. The audit-survives contract (AC#5) is about the *revoke* path, not the *creation-failed* path, so this is the correct trade-off.
- **stat_path whitelist field-name divergence from ADR-004 §D3.** ADR's `current.damage / current.willpower / current.vitae` paths do not resolve on the character document — those values live in the separate `tracker_state` collection (see `public/js/game/tracker.js`). The overlay is a character-render feature (ADR §D1), so the whitelist surfaces only character-document fields. Substituted with the real top-level `blood_potency` and `humanity` fields that *do* live on the character. STM-2/STM-5 can extend later if the overlay grows into the tracker render path. This matches the ADR §Concerns Item 4 hand-off ("if the actual fields are at the top level ... the static map needs to match"). Documented inline in `server/routes/st_mods.js`.
- **Attribute/skill case.** Capitalised (`attributes.Strength.dots`, not `attributes.strength.dots`) — the ADR examples used lowercase, but the actual character documents key on Capitalised names (`public/js/data/constants.js`). Treated the ADR examples as illustrative, not normative.
- **Branch hygiene.** Three `git status | head -1` checkpoints honoured (post-branch-create, pre-stage, pre-commit). Branched from current `dev` tip (13622427) which was up to date as of dispatch.

### File List

- `server/routes/st_mods.js` (new) — four endpoints (POST/GET/DELETE /api/st_mods, GET /api/st_mod_audit), whitelist, audit coupling
- `server/index.js` (modified) — mount `stModsRouter` and `stModAuditRouter` under requireAuth + noCache
- `server/tests/helpers/test-app.js` (modified) — register the new routers in the test app
- `server/tests/api-st-mods.test.js` (new) — 20-test integration suite covering AC#1..#8

### Change Log

- 2026-05-18 (Ptah): STM-1 initial implementation
