---
title: 'Mystery Cult Initiation migration — tier grants, choice tiers, tier budgets'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
  - specs/stories/rde.4.rules-data-shell-and-pt-editor.story.md
---

## Intent

**Problem:** MCI is the second-most complex rule family after PT. Five tier rules: dot 1 (speciality OR 1 merit dot), dot 2 (1 merit dot fixed), dot 3 (skill dot OR 2 merit dots), dot 4 (3 merit dots fixed), dot 5 (advantage OR 3 merit dots). Plus the tier-budget table `[0, 1, 1, 2, 3, 3]` that drives auto-mapping of `free_mci` allocations to tier grants. Per-character `dot1_choice / dot3_choice / dot5_choice` fields drive which branch fires.

**Approach:** Seed five `rule_grant` rows with a `condition: 'choice'` referencing the per-character choice fields, plus one `rule_skill_bonus` row for dot-3-skill choice, plus one `rule_grant` with `grant_type: 'speciality'` for dot-1-speciality choice. Tier budgets go into `rule_tier_budget` as a single doc. Evaluator reads choice fields off the merit instance, branches accordingly, and produces identical side-effects to `mci.js:130-156` and the `mciPoolTotal` function. Parallel-write tests cover all eight tier-choice combinations. Flip after green.

## Boundaries & Constraints

**Always:**
- Per-character choice fields (`dot1_choice`, `dot3_choice`, `dot5_choice`, `dot1_spec_skill`, `dot1_spec`, `dot3_skill`) stay on the MCI merit instance. They are character data, not rule data.
- Tier-budget doc has `source: 'MCI'` and `budgets: [0, 1, 1, 2, 3, 3]`. Editor surfaces these as six numeric inputs, one per tier.
- Auto-mapping logic (`mci.js:62-94` — matches free_mci by amount to tier budgets greedily) stays in code; it's a one-time data-migration helper, not a rule. It is NOT in scope for this migration.
- `tier_grants` array on the merit (user manages it manually after auto-map runs) is character data, not rule data.

**Ask First:**
- Whether bloodline-defined MCI overrides (if any exist) should live in `BLOODLINE_GRANTS` or in the rules collection. Default: bloodline lives in RDE-7.

**Never:**
- Do not migrate the `tier_grants` auto-mapping helper. Out of scope.
- Do not change MCI choice semantics (e.g. don't introduce a "dot 1: BOTH speciality and merit" option). House-rule changes are a separate spec.

## I/O & Edge-Case Matrix

| MCI rating | dot1_choice | dot3_choice | dot5_choice | Expected pool | Other side-effects |
|---|---|---|---|---|---|
| 1 | merits | — | — | 1 | — |
| 1 | speciality | — | — | 0 | `_mci_free_specs` populated from `dot1_spec_skill` + `dot1_spec` |
| 3 | merits | skill | — | 1+1+0=2 | `_mci_dot3_skills` populated with `dot3_skill` |
| 3 | merits | merits | — | 1+1+2=4 | none |
| 5 | speciality | skill | advantage | 0+1+0+3+0=4 | dot1 spec, dot3 skill, advantage chosen (advantage logic stays out of evaluator — it's a tier-grant `'advantage'` type that surfaces in MCI render) |
| 5 | merits | merits | merits | 1+1+2+3+3=10 | none |
| 0 / inactive | — | — | — | 0 | no grants |

## Code Map

- `public/js/editor/mci.js:130-155` — MCI grant pool + spec collection + dot-3 skill set logic.
- `public/js/editor/mci.js:437-446` — `mciPoolTotal` per-rating-and-choice formula.
- `public/js/editor/mci.js:16` — `MCI_TIER_BUDGETS = [0,1,1,2,3,3]` constant. Replaced by `rule_tier_budget` doc.
- `public/js/editor/rule_engine/` — pattern from RDE-3.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-mci.js` (new) — seed five tier-grant rules (one per dot tier with conditional choice support), one tier-budget doc, plus the dot-1-speciality and dot-3-skill choice rules. Idempotent. `--dry-run` / `--apply`.
- [ ] `public/js/editor/rule_engine/mci-evaluator.js` (new) — reads MCI rules + tier-budget doc, applies grants identically to legacy.
- [ ] `server/tests/mci-parallel-write.test.js` (new) — covers every row of the I/O Matrix. Legacy snapshot vs evaluator snapshot, deep-equal.
- [ ] Flip step: replace `mci.js:130-155` and the `mciPoolTotal` function call with `applyMCIRulesFromDb`. Delete legacy.
- [ ] RDE-4 editor populates: MCI rules visible under Merit Grants and Skill Bonuses. Tier-budget surfaces under Tier Budgets.

**Acceptance Criteria:**
- Given the seed has run, when `mci-parallel-write` runs, then every I/O Matrix row's snapshots deep-equal.
- Given a character with MCI 5 and choice fields set, when the evaluator runs, then `_mci_free_specs`, `_mci_dot3_skills`, and `_grant_pools` populate identically to legacy.
- Given the editor's Tier Budgets view, when an ST changes index 5 from 3 to 4, then a character with MCI 5 sees a larger pool on next render (post-save, post-page-reload).

## Verification

**Commands:**
- `cd server && npx vitest run mci-parallel-write` — expected: green.

**Manual checks:**
- Spot-check three MCI-bearing production characters before/after flip — sheet renders identical.
- Edit MCI tier-budget index 4 in the editor; verify the change propagates to a real character on next render.
