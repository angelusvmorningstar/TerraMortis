---
title: 'Legacy data-migration cleanup — excise one-shot cruft from applyDerivedMerits'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/design/rules-engine-adversarial-revision.md
---

## Intent

**Problem:** `applyDerivedMerits` (`public/js/editor/mci.js:18-119`) currently runs ~100 lines of one-shot legacy data-migration code on every character render: stripping legacy derived merits, renaming `up`→`cp`, clearing stale MCI `granted_by` markers, backfilling Fucking Thief `granted_by`, deduplicating Mandragora Garden, renaming legacy fighting-style entries, and auto-mapping MCI tier grants. This is not rules. Running it on every render obscures the rule logic, makes the snapshot harness (RDE-1) lock in migration behaviour, and slows render. Per ADR-001 §Implementation plan, this story excises that code into a one-shot script.

**Approach:** Move every block at `mci.js:22-119` into `server/scripts/migrate-legacy-character-fields.js`. Run the script once against `tm_suite` (and `tm_suite_test` to keep test fixtures aligned). Verify no characters carry the legacy field shapes. Delete the in-render migration code. RDE-1's harness then snapshots a *clean* `applyDerivedMerits` whose body is rules-only.

## Boundaries & Constraints

**Always:**
- The migration script reproduces the in-render behaviour exactly. Each block is a discrete function in the script (`stripLegacyDerivedMerits`, `renameUpToCp`, `clearMciGrantedBy`, `backfillFtGrantedBy`, `dedupMandragoraGarden`, `renameLegacyFightingStyles`, `autoMapMciTierGrants`).
- The script supports `--dry-run` and `--apply` flags following the `server/scripts/cleanup-stale-sessions.js` pattern.
- The script logs every mutation: `character _id, field changed, before, after`.
- The script is idempotent. Re-running after a successful run produces zero mutations.
- Once verified, the in-render code (lines 22-119) is deleted in a single commit. No `// removed` comments. No backwards-compat shims.

**Ask First:**
- Whether to run the script against `tm_suite` (production) immediately or batch with the RDE-1 PR. Recommendation: run against `tm_suite_test` first, verify no drift, then run against production in a quiet window before RDE-1 lands.

**Never:**
- Do not touch any rule-application code (lines 121-426). Out of scope.
- Do not introduce a feature flag to gate the legacy migration. The whole point is to remove it.
- Do not migrate rule families in this story.

## I/O & Edge-Case Matrix

| Block | Trigger | What it does | Migration script behaviour |
|---|---|---|---|
| Strip derived merits | `m.derived === true` on any merit | Removes the merit | Same; logs each removed merit |
| `up` → `cp` rename | Any merit has `m.up` field | Adds `m.up` to `m.cp`, deletes `m.up` | Same; idempotent because `up` is deleted |
| MCI `granted_by` clear | Merit has `granted_by === 'Mystery Cult Initiation'` or `'MCI'` | Deletes `granted_by` | Same |
| FT `granted_by` backfill | Has merit `Fucking Thief` with `qualifier`; another merit named after the qualifier with no `granted_by` | Stamps `granted_by: 'Fucking Thief'` on the matched merit | Same; idempotent because second run finds the field set |
| FT `free` clear | Merit `granted_by === 'Fucking Thief'` with non-zero `free` | Sets `free = 0` | Same |
| Legacy `benefit_grants` → `tier_grants` on MCI | MCI merit has `benefit_grants` and no `tier_grants` | Builds `tier_grants` from `benefit_grants` | Same; idempotent because `tier_grants` is set after |
| MCI tier auto-map | MCI merit lacks `tier_grants`, has child merits with `free_mci > 0` | Greedy budget-based tier assignment | Same |
| Mandragora Garden dedup | Multiple bloodline merits with name 'Mandragora Garden' | Keeps first, removes rest | Same |
| Fighting-style rename | (any in legacy block) | Rename old style names to current canonical | Same |

## Code Map

- `public/js/editor/mci.js:22-119` — the source. Each block is the source of truth for its migration.
- `server/scripts/cleanup-stale-sessions.js` — script pattern (dry-run/apply, MongoDB connection, logging).
- `server/db.js` — `getCollection('characters')` for the script.
- `server/tests/helpers/test-app.js` — verifies the test DB after a script run.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/migrate-legacy-character-fields.js` (new) — port each block from `mci.js:22-119` as a discrete function. Iterate every character, apply each function, log mutations. `--dry-run` prints what would change; `--apply` writes.
- [ ] Run `node server/scripts/migrate-legacy-character-fields.js --dry-run` against `tm_suite_test` and `tm_suite`. Capture output. Review for unexpected mutations.
- [ ] Run `--apply` against both DBs in sequence (test first, production after manual review).
- [ ] Re-run `--dry-run`. Expect zero mutations (idempotency check).
- [ ] Delete `mci.js:22-119` in a separate commit titled `feat(rde-0): remove in-render legacy migration cruft`. The function body now starts with rule logic at the line currently 121.
- [ ] Verify `npx playwright test` (existing tests) still passes against the cleaned codebase.
- [ ] Verify `cd server && npx vitest run` still passes.

**Acceptance Criteria:**
- Given the script ran with `--apply`, when re-run with `--dry-run`, then output is "0 mutations".
- Given the in-render block has been deleted, when an admin sheet renders for any production character, then the visual output matches the pre-cleanup render byte-for-byte (verified via three-character spot check).
- Given the script's log file, when reviewed, then every mutation has a corresponding character + field + before + after entry.
- Given the test suite, when full Vitest + Playwright runs against the cleaned codebase, then both pass.

## Verification

**Commands:**
- `node server/scripts/migrate-legacy-character-fields.js --dry-run` — expected: lists all pending mutations.
- `node server/scripts/migrate-legacy-character-fields.js --apply` — expected: applies + logs.
- `node server/scripts/migrate-legacy-character-fields.js --dry-run` (post-apply) — expected: "0 mutations".
- `cd server && npx vitest run` — expected: full suite green.
- `npx playwright test` — expected: full suite green.

**Manual checks:**
- Open admin sheet for three production characters known to carry legacy data (any with old `up` field, any with MCI `granted_by` artifacts, any with multiple Mandragora Garden entries). Pre-cleanup screenshot vs post-cleanup screenshot match.

## Design Notes

This story unblocks RDE-1 by removing the migration logic from the function under test. RDE-1's snapshot harness then captures a function whose every line is a rule application — clean signal, no migration noise. If audit triage in RDE-1 finds bugs in the migration logic, those bugs are fixed in this script (not the rule engine), preserving the separation of concerns established by ADR-001.

The script lives under `server/scripts/` not `server/lib/` because it's not part of the running application. It's a maintenance tool. Once production has been migrated and one game cycle has passed without regression, the script itself can be archived (kept in repo for reference, removed from active scripts directory).
