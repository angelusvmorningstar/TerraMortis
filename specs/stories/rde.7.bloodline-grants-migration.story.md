---
title: 'Bloodline grants migration — auto-merits and free specs from BLOODLINE_GRANTS'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** `BLOODLINE_GRANTS` in `public/js/data/constants.js` is a hardcoded map: `{ bloodline_name: { skill_specs: [...], merits: [...] } }`. Drives auto-creation of bloodline merits with `granted_by: 'Bloodline'` and `free_bloodline: 1`, plus pushing free specs onto skills. Currently a code constant; per ADR-001, it's a rule and must be ST-editable.

**Approach:** Seed `rule_grant` rows for each bloodline's auto-merits (one row per granted merit) and `rule_grant` rows with `grant_type: 'speciality'` for each bloodline's free specs. Use `condition: 'bloodline'` with a `bloodline_name` qualifier so the evaluator matches against `c.bloodline`. Evaluator replaces `mci.js:381-417` block. Editor surfaces these under Merit Grants, filterable by source bloodline.

## Boundaries & Constraints

**Always:**
- One rule doc per granted item (merit or spec). A bloodline like Daeva that grants two merits and one spec produces three rule docs.
- Existing case-insensitive qualifier match (line 397-401) preserved by the evaluator. Duplicate cleanup behaviour preserved.
- Auto-clear of stale `free_bloodline` on ex-bloodline characters preserved (line 384). Stays in code as a lifecycle hook with a comment.
- `granted_by: 'Bloodline'` preserved on every auto-created merit so cleanup can target them.

**Ask First:**
- Whether bloodline-defined disciplines (`BLOODLINE_DISCS`) are in scope here or in a separate story. Disciplines aren't grants in the same sense — they're in-clan-list determinants. Default: out of scope here, separate story if ever needed.

**Never:**
- Do not migrate `CLAN_DISCS` or `BLOODLINE_DISCS` constants. They are clan-list determinants, used by `clanDiscList()` (`accessors.js:11`), not grants.
- Do not modify the cleanup-stale-free-bloodline lifecycle hook. Keep it in code.

## I/O & Edge-Case Matrix

| Bloodline | BLOODLINE_GRANTS entry | Expected effects |
|---|---|---|
| (none) | undefined | no auto-merits, no auto-specs |
| Daeva (or whichever) | `{skill_specs: [...], merits: [...]}` | each merit auto-created with `free_bloodline: 1`, each spec pushed onto target skill if absent |
| Character changes bloodline mid-game | previous bloodline's merits still in `c.merits` with `granted_by: 'Bloodline'` and `free_bloodline > 0` | cleanup hook clears stale `free_bloodline`; new bloodline's grants apply on next render |
| Bloodline merit qualifier case mismatch in DB | `qualifier: 'BANE'` vs grant says `'Bane'` | evaluator normalises to canonical case (preserves existing behaviour) |

## Code Map

- `public/js/data/constants.js` — `BLOODLINE_GRANTS` map.
- `public/js/editor/mci.js:381-417` — legacy bloodline grants block.
- `public/js/editor/rule_engine/` — pattern.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-bloodlines.js` (new) — reads `BLOODLINE_GRANTS`, expands to one rule doc per granted item, inserts into `rule_grant`. Idempotent. `--dry-run` / `--apply`.
- [ ] `public/js/editor/rule_engine/bloodline-evaluator.js` (new) — replaces `mci.js:381-417`. Reads bloodline rules, applies grants, preserves case-insensitive qualifier match and dedup.
- [ ] `server/tests/bloodline-parallel-write.test.js` (new) — covers each bloodline currently in `BLOODLINE_GRANTS` plus the no-bloodline and bloodline-change cases. Deep-equal.
- [ ] Flip: replace block in `mci.js:381-417` with evaluator call. Delete legacy.
- [ ] Decommission `BLOODLINE_GRANTS` constant once flip is green and tests pass. Or leave it for one cycle and delete in a follow-up — note the choice in the spec change log.
- [ ] RDE-4 editor: bloodline rules visible under Merit Grants, filterable by `source` (bloodline name).

**Acceptance Criteria:**
- Given a Daeva character (or whichever has bloodline_grants today), when the evaluator runs, then auto-merits and free specs match legacy snapshots.
- Given a character with no bloodline, when the evaluator runs, then no bloodline grants apply.
- Given a character that changed bloodline, when the evaluator runs, then stale `free_bloodline` is cleared and new grants apply.

## Verification

**Commands:**
- `cd server && npx vitest run bloodline-parallel-write` — green.

**Manual checks:**
- Spot-check a bloodline-bearing character pre/post flip — sheet identical.
- Verify the editor lets an ST add a new bloodline rule (e.g. for a homebrew bloodline) and the resulting character render reflects it.
