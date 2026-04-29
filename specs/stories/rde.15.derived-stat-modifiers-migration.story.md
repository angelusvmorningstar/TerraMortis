---
title: 'Derived stat modifiers migration — Giant, Fleet of Foot, Defensive Combat'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
recommended_model: 'opus — derived-stat modifier evaluator delegated from calcSize/calcSpeed/calcDefence; legacy inline merit lookups deleted post-flip'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** Three merits affect derived stats via inline lookups in `calcSize`, `calcSpeed`, `calcDefence` (`public/js/data/accessors.js:143-165`). Giant adds +1 Size. Fleet of Foot adds its rating to Speed. Defensive Combat replaces Athletics with the chosen skill (qualifier) in the Defence formula. All three are hardcoded merit name lookups; per ADR-001 they must be ST-editable.

**Approach:** Three `rule_derived_stat_modifier` docs. Evaluator function consulted by `calcSize`, `calcSpeed`, `calcDefence`. Legacy inline merit lookups are removed; the calc functions delegate to the evaluator with `target_stat` parameter.

## Boundaries & Constraints

**Always:**
- Calc functions retain their public API: `calcSize(c) → number`, `calcSpeed(c) → number`, `calcDefence(c) → number`. Internals refactored.
- `mode: 'flat'` for Giant (+1 fixed). `mode: 'rating'` for Fleet of Foot (adds merit rating). `mode: 'skill_swap'` for Defensive Combat with `swap_from: 'Athletics'`, `swap_to: <merit qualifier>`.
- Effective rating used wherever a merit's rating contributes (Fleet of Foot's rating includes `free_*`).

**Ask First:**
- Whether `skill_swap` should support fully arbitrary swaps, or only Athletics swaps for Defensive Combat. Default: arbitrary, since the user wants no rule structurally locked. Editor surfaces both `swap_from` and `swap_to` as text fields.

**Never:**
- Do not introduce a skill-swap rule for any other calc beyond Defence in this story; if a future merit wants to swap a skill in Speed or Health, that's a new rule doc the ST adds, not a code change.

## I/O & Edge-Case Matrix

| Merit | Effect on calc |
|---|---|
| Giant present | `calcSize` returns 6 instead of 5 |
| Fleet of Foot rating 2 | `calcSpeed` includes +2 from FoF |
| Defensive Combat with qualifier 'Brawl' | `calcDefence` uses Brawl skill instead of Athletics |
| No special merits | base calcs unchanged |
| Multiple modifier rules of same `target_stat: 'size'` (e.g. ST adds homebrew "Towering" merit) | sum applied |

## Code Map

- `public/js/data/accessors.js:143-165` — `calcSize`, `calcSpeed`, `calcDefence`.
- `public/js/editor/rule_engine/` — pattern.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-derived-stat-modifiers.js` — three docs.
- [ ] Refactor `calcSize`, `calcSpeed`, `calcDefence` to consult `rule_derived_stat_modifier` collection. Cache per render.
- [ ] `server/tests/derived-stat-modifiers-parallel-write.test.js` — I/O Matrix.
- [ ] Flip: delete inline merit lookups.

**Acceptance Criteria:**
- Given a Giant character, when `calcSize(c)` is called, then result is 6.
- Given a Fleet of Foot rating 2 character, when `calcSpeed(c)` is called, then result includes +2 from FoF.
- Given a Defensive Combat character with qualifier 'Brawl', when `calcDefence(c)` is called, then Brawl skill is used in place of Athletics.
- Given an ST adds a homebrew "Towering" rule with `target_stat: 'size'`, `mode: 'flat'`, `flat_amount: 1`, then a Towering+Giant character has `calcSize: 7`.

## Verification

**Commands:**
- `cd server && npx vitest run derived-stat-modifiers-parallel-write` — green.

**Manual checks:**
- Spot-check Giant, Fleet of Foot, and Defensive Combat characters; sheets identical pre/post flip.
- Add a homebrew Towering rule via the editor, verify Giant+Towering character's Size goes to 7. Remove afterwards.

## Final consequence

This is the last family migration. Once green and flipped, `applyDerivedMerits` and the `accessors.js` calc functions read entirely from the rules engine. The `mci.js` file's per-family branches are gone. ADR-001's goal is met: every hardcoded character-affecting rule is now ST-editable from the admin Engine panel.
