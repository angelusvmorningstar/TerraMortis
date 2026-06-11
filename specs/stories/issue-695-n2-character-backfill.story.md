# Issue #695: N-2 — character-data backfill (legacy `free_<slug>` flat → `free_grants[<slug>]` map)

Status: Done

issue: 695
issue_url: https://github.com/angelusvmorningstar/issues/695
branch: piatra/issue-695-n2-character-backfill
epic: MNEC (specs/epic-mnec-necropolis-merits.md)
adr: ADR-005 Rev 2 D1 + D6 (specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md)
dispatch: PROCEED-WITH-NOTICE.

## Story

As an operator who has N-1's foundation in production,
I want an idempotent backfill script that moves persisted legacy `m.free_<slug>` flat fields into the new `m.free_grants[<slug>]` map per ADR-005 Rev 2 D1 (introduced by PR #672),
so that a future cleanup story can remove the union-sum fallback from `meritFreeSum` without stranding any character whose free-grant data still lives in the legacy fields.

## What ships

- **`server/scripts/backfill-free-grants.js`** — atomic, idempotent (`--dry-run` default, `--apply` to write). Optional `--character-id <id>` flag scopes to a single character (debugging convenience).
- Mirrors the established `server/scripts` pattern (per memory `feedback_server_scripts_dotenv_path`):
  - `import 'dotenv/config'` first.
  - `connectDb` / `getCollection` / `closeDb` from `db.js`.
  - Exports `backfill()` + `backfillCharacterMerits()` + `LEGACY_FREE_SLUGS`; `main()` is guarded by `import.meta.url === pathToFileURL(process.argv[1]).href` so importing the module in a test doesn't auto-connect or call `process.exit`.
- **Conflict handling — merit-scoped skip.** For each legacy slug on a merit:
  - Map absent / 0 → migrate (copy legacy → map, unset legacy).
  - Map present and EQUAL → no conflict; unset legacy (map already correct).
  - Map present and DIFFER → **whole-merit skip**. Other slugs on the same merit are NOT touched, even if they'd otherwise migrate cleanly. The summary lists every conflict by char + merit + slug values for human review.
- **Per-slug summary** — alphabetical counts of fields migrated per slug, plus a CONFLICTS section listing every skipped merit with its differing values.

## Why the whole-merit skip rather than per-slug skip

A conflict on one slug suggests the merit has data drift somewhere (otherwise the map and legacy values would never have diverged). Migrating the merit's OTHER slugs in isolation could compound the drift — the human resolving the one conflict might also want to investigate the others before any are mutated. Atomically skipping the merit keeps the resolution surface small.

## Acceptance gates

1. ✅ Script exists at `server/scripts/backfill-free-grants.js`. Runs against MongoDB Atlas via the established `db.js` pattern + `dotenv/config`-first.
2. ✅ Default = dry-run; `--apply` writes.
3. ✅ Per character, for each merit's `free_<slug>` (value > 0), value copies into `m.free_grants[<slug>]` and legacy field is unset.
4. ✅ Conflict (map AND legacy non-zero AND differ) → whole merit skipped, summary records the conflict.
5. ✅ Idempotent — second `--apply` reports `touched 0 char(s), 0 merit(s), 0 field(s)` (any merit-level conflict still surfaces in the summary on every run until resolved).
6. ✅ Zero legacy values not migrated (avoids creating empty map entries).
7. ✅ Equal map/legacy values not treated as conflict — legacy unset, map kept.
8. ✅ `--character-id <id>` scopes to a single character; other characters untouched.
9. ✅ Render-invocable from a Render one-off shell without code modification (env from process; `dotenv/config` no-ops when env is pre-set).
10. ✅ 9 vitest cases — pure-function (6) + DB-driven (3). Covers basic copy + unset, conflict skip, idempotency, zero-skip, equal-no-conflict, all-14-slugs coverage, --character-id scoping.
11. ✅ No regression — 1303/1303 individual tests pass.

## Pre-existing test-FILE failures carried forward

Four test files fail at import / read time on `dev`. **None are caused by N-2.**

- `tests/migrate-submission-cycle-id-to-oid.test.js` — references `../scripts/migrate-submission-cycle-id-to-oid.js` (archived in commit `f07887fc`).
- `tests/migrate-submission-territory-keys.test.js` — same archive-move trap.
- `tests/stm-13-backfill.test.js` — same archive-move trap.
- `tests/feature.691.hos-city-status-power.test.js` — new: uses a relative path `fs.readFileSync('server/routes/office-actions.js', ...)` that fails when vitest's cwd is `server/`. Introduced by PR #700 (HoS city status power), merged before N-2. The route + schema files DO exist; the test's path is wrong.

All four are noted but stay out of scope per N-2's brief.

## Out of scope

- **Removing the union-sum fallback from `meritFreeSum`.** N-1's runtime guard sums both the map AND the legacy fields; after this script runs everywhere the legacy fields are gone, but the fallback can stay in place safely. Future cleanup story removes it.
- The production run itself — Peter-triggered post-merge.

## Tasks / Subtasks

- [x] `server/scripts/backfill-free-grants.js` — script with `backfill()` + `backfillCharacterMerits()` + `LEGACY_FREE_SLUGS` exports; entry-point-guarded `main()`.
- [x] `server/tests/n2-backfill-free-grants.test.js` — 9 vitest cases (6 pure + 3 DB-driven).
- [x] Story file (this one).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Exports both `backfill` (DB-driven) and `backfillCharacterMerits` (pure).** The pure function takes a character doc and returns the migration plan + mutated merits without touching Mongo. Lets the test suite cover the migration logic without spinning up the test DB for every case, and gives future callers (e.g., a one-off cleanup invoked inside a route) a way to migrate in-memory without re-implementing the rules.
- **Equal map/legacy values are NOT a conflict** (interpreted leniently). Strictly the AC said "both non-zero values"; equal is unambiguous and unsetting legacy is correct. Different values is where human review is genuinely needed. Documented this in the script header.
- **Dry-run preserves the in-memory shape exactly** (input shallow-cloned). Caller uses the totals for preview; the mutated array is only written when `dryRun === false`. Verified by a test.
- **Verified live (read-only)** — ran `--dry-run` against `tm_suite_test` end-to-end (connect → scan → report → close). 0 fields to migrate in the test DB; test fixtures cover the actual migration paths.
- **Worktree pattern continued** (`/tmp/tm-ptah/n2-backfill`, node_modules + server/.env symlinked from main).

### File List

**New**
- `server/scripts/backfill-free-grants.js` — backfill script
- `server/tests/n2-backfill-free-grants.test.js` — 9 vitest cases
- `specs/stories/issue-695-n2-character-backfill.story.md` — this file

### Change Log

- 2026-06-11 (Ptah): N-2 character-data backfill shipped.
