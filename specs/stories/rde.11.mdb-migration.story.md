---
title: 'Mother-Daughter Bond migration — partner-rating-driven free dots into chosen style'
type: 'refactor'
created: '2026-04-28'
status: 'complete'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** The Mother-Daughter Bond merit grants the character free dots into a chosen Crúac style (general merit) equal to their own Mentor rating. Per-character data: `qualifier` (chosen style name) on the MDB merit. Side-effect: `free_mdb` set on the chosen style merit.

**Approach:** One `rule_grant` doc with `grant_type: 'merit'`, `target` resolved at apply time from MDB's per-character `qualifier` field, `amount_basis: 'rating_of_partner_merit'` with `partner_merit_name: 'Mentor'`. Evaluator finds MDB on the character, resolves the target style, sets `free_mdb` to the Mentor rating.

## Boundaries & Constraints

**Always:**
- Mentor rating used is effective (post-`applyDerivedMerits` sync at line 424 sums all `free_*` + cp + xp).
- `free_mdb` cleared on all merits before re-applying (preserves existing line 161 stale-clear behaviour).
- Target style resolved from `mdbMerit.qualifier`; if absent, no grant.

**Never:**
- Do not auto-create the chosen style if absent. The user must add the style merit themselves; MDB only fills its `free_mdb`.

## I/O & Edge-Case Matrix

| State | Expected |
|---|---|
| MDB present, qualifier='Crúac of Sorrow', Mentor rating 3, style merit exists | style merit's `free_mdb` set to 3 |
| MDB present, qualifier='Crúac of Sorrow', style merit absent | no grant; `free_mdb` stays 0 (it was cleared) |
| MDB absent | all `free_mdb` cleared, no grant |
| MDB present, qualifier blank | no grant |
| Mentor merit absent | no grant |

## Code Map

- `public/js/editor/mci.js:342-353` — legacy MDB block.
- `public/js/editor/rule_engine/` — pattern.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-mdb.js` — one `rule_grant` doc.
- [ ] `public/js/editor/rule_engine/mdb-evaluator.js` — replaces legacy block.
- [ ] `server/tests/mdb-parallel-write.test.js` — I/O Matrix. Deep-equal.
- [ ] Flip: replace `mci.js:342-353`.

**Acceptance Criteria:**
- Given a character with MDB qualifier set and Mentor rating 3, when evaluator runs, then chosen style's `free_mdb` is 3.
- Given a character without MDB, when evaluator runs, then no `free_mdb` is set.

## Verification

**Commands:**
- `cd server && npx vitest run mdb-parallel-write` — green.

**Manual checks:**
- Spot-check an MDB-bearing character; verify Crúac style's free dots render identically pre/post flip.
