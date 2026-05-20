# Issue #441: STM-13 — idempotent backfill (active:true on pre-Rev 4 mods, separately revertible)

Status: Done

issue: 441
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/441
branch: piatra/issue-441-stm-13-backfill-active
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 4 §D19 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE. Separately revertible per Imhotep's discipline — does NOT bundle into STM-10.

## Story

As a Storyteller / operator,
I want an idempotent, dry-runnable script that stamps `active: true` on pre-Rev 4 st_mods documents lacking the field,
so that the stored data shape matches the Rev 4 schema for cleanliness, without the lifecycle backend's correctness ever depending on the backfill having run.

## Decisions implemented (ADR-004 Rev 4 §D19)

- **Backfill-independence.** Correctness is already guaranteed without this script (the live query uses `active !== false`, the audit reader uses `event ?? 'created'`). This backfill is purely cosmetic — it makes the stored shape uniform.
- **Separately revertible.** Shipped as a standalone script, not bundled into STM-10's backend, so a problem with the backfill can be rolled back without disturbing the merged lifecycle logic.

## Tasks / Subtasks

- [x] Task 1 — `server/scripts/stm-13-backfill-active.js`: connect via the db.js pattern (`connectDb` / `getCollection` / `closeDb`, which carry the Atlas ssl-strip + tls config). `$set: { active: true }` on `{ active: { $exists: false } }`.
- [x] Task 2 — idempotency: the filter targets only missing-field docs, so a second run matches zero. Verified by test.
- [x] Task 3 — `--dry-run` flag: counts the would-update set, writes nothing. Default is LIVE (writes), per the issue (run `--dry-run` first to preview).
- [x] Task 4 — logging: scanned, updated (or would-update), skipped (field already present), elapsed time.
- [x] Task 5 — optional `--audit` flag: sibling backfill for `st_mod_audit` rows lacking `event` (`$set: { event: 'created' }`, matching the reader's §D19 default). Same idempotency + dry-run shape. Kept in-file behind an opt-in flag so the default run stays narrow (st_mods only).
- [x] Task 6 — Render-invocable without code edits: env comes from the process (Render env vars) or `server/.env` when run locally from `server/`. `import 'dotenv/config'` loads the latter before config.js resolves the URI.
- [x] Task 7 — vitest coverage (exported `backfill()` helper; auto-run guarded by an `import.meta.url === argv[1]` entry-point check so importing the module in a test does not connect/exit).

## Acceptance Criteria

1. Script exists and runs against MongoDB Atlas — ✅ (dry-run executed end-to-end against the real connection)
2. No-arg run writes `active: true` to pre-Rev 4 mods; idempotent (second run = 0) — ✅ test
3. `--dry-run` identifies the same set, skips writes — ✅ test
4. Logs scanned / updated / skipped / elapsed — ✅
5. Render one-off shell invocable without code modification — ✅ (env from process; dotenv no-ops when the file is absent)
6. No regression — ✅ 1058/1058 (1053 base + 5 new; base predates the STM-11 merge — STM-13 touches disjoint files)
7. Optional audit event-field backfill — ✅ `--audit` flag, mirrored idempotency + dry-run

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Dry-run default is OFF (writes live), per the issue** — opposite of some older repo scripts that default to dry-run + require `--apply`. The issue explicitly specifies live-by-default with `--dry-run` to preview, so the script header tells the operator to run `--dry-run` first.
- **db.js reuse vs the cwd-relative dotenv convention.** The issue asked to mirror `server/db.js`'s connection pattern — `connectDb()` carries the legacy-`ssl=`-strip + `tls: true` Atlas handling that the bare-`MongoClient` scripts re-implement ad hoc, so reusing it is the more faithful + correct choice. But config.js resolves its `.env` at the repo root, whereas the env file lives at `server/.env`; the established scripts load env cwd-relative via `import 'dotenv/config'` (run from `server/`). I added `import 'dotenv/config'` as the FIRST import so, run locally from `server/`, it populates `process.env.MONGODB_URI` from `server/.env` before config.js reads it (dotenv never overwrites an already-set var). On Render the env vars are pre-set, so the dotenv load is a harmless no-op.
- **Entry-point guard for testability.** The script exports `backfill()` and `main()` and only auto-runs `main()` when invoked directly (`import.meta.url === pathToFileURL(process.argv[1]).href`). This lets the vitest suite import and exercise `backfill()` without triggering a real connect + `process.exit`.
- **Test isolation under serial-but-shared DB.** vitest runs integration files serially against a shared `tm_suite_test` connection, but other files mutate `st_mods` / `st_mod_audit`. The test scopes its filters to a per-test `character_id` so `updated`/`skipped` assertions are deterministic regardless of concurrent residue.
- **Explicit `active: false` is never flipped.** The filter is `{ $exists: false }`, so a deliberately-deactivated mod is left alone — only truly field-less (pre-Rev 4) docs are touched. Asserted in the test.
- **Verified live (read-only).** Ran `--dry-run --audit` against a real Mongo connection end-to-end (connect → count → report → close) to confirm the connection pattern works; no writes performed. The actual production run is Peter-triggered post-merge (out of scope).
- **Worktree pattern continued** (`/tmp/tm-ptah/stm-13`, node_modules + server/.env symlinked from main).

### File List

- `server/scripts/stm-13-backfill-active.js` (new) — idempotent active:true backfill; `--dry-run` + optional `--audit`; exported `backfill()`/`main()` with entry-point guard
- `server/tests/stm-13-backfill.test.js` (new) — 5 vitest cases: backfill correctness, explicit-false untouched, idempotency, dry-run, audit event backfill + its idempotency
- `specs/stories/issue-441-stm-13-backfill-active.story.md` — this file

### Change Log

- 2026-05-20 (Ptah): STM-13 idempotent backfill script
