---
title: 'Professional Training migration pilot — proves parallel-write contract'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.1.test-harness.story.md
  - specs/stories/rde.2.schema-and-api.story.md
---

## Intent

**Problem:** Professional Training is the most structurally complex rule family in `applyDerivedMerits` (three dot-tier grants, asset-skill array dependency, two ephemeral set fields, plus auto-creation of Contacts with `free_pt: 2`). Per ADR-001 it's the pilot for the parallel-write migration contract: if PT migrates cleanly, the pattern is proven for the remaining ten-plus families.

**Approach:** Seed PT's rules into the new typed collections. Add a runtime evaluator function that reads from the collections and applies grants identically to the legacy code path. Run both paths in tests; assert character snapshots are deep-equal across the harness's PT scenarios. Once green, flip the production path to the evaluator and delete the PT block from `mci.js:184-216`.

## Boundaries & Constraints

**Always:**
- Parallel-write is **test-only scaffolding**. Production runs whichever path is currently designated source of truth (legacy at start, evaluator after flip). No long-lived feature flag in production code.
- The evaluator must produce side-effects identical to the legacy block down to set membership and free_pt amounts. The harness's deep-equal is the contract.
- Evaluator reads merits via `m.rating` (effective). Reads skills via `getSkillObj(c, skill)` and respects existing nine-again/bonus mechanics.
- Three rules go into `rule_grant` for PT (dot 1: 2 free Contacts), `rule_nine_again` (dot 2: asset skills), `rule_skill_bonus` (dot 4: chosen asset skill +1 capped at 5).
- The seed runs idempotently — re-running does not create duplicates. Use `_id` known per rule or a stable composite key for upsert.

**Ask First:**
- Whether the seed lives in `server/scripts/seed-rules-pt.js` (one-shot pattern) or in a generic `seed-rules.js` that takes a family argument. Answer chosen per RDE-1's design discussion if it surfaced one; otherwise default to one-shot scripts per family that get deleted post-flip.
- Whether `dot4_skill` (the user-chosen asset skill) is captured on the merit instance or on the rule doc. The merit instance is the right answer (per-character data), but confirm before implementing if any ambiguity emerges.

**Never:**
- Do not delete the legacy PT block until after the flip step. The block stays alongside the evaluator during parallel-write.
- Do not migrate other rule families in this story.
- Do not add new production code paths conditional on a feature flag. The evaluator either is or isn't the source of truth.

## I/O & Edge-Case Matrix

| Scenario | Legacy applies | Evaluator must apply identically |
|---|---|---|
| PT rating 1 | `free_pt: 2` on Contacts (auto-create if absent) | same |
| PT rating 2, asset_skills: [Brawl, Stealth] | adds Brawl + Stealth to `_pt_nine_again_skills` | same |
| PT rating 4, dot4_skill: Brawl | adds Brawl to `_pt_dot4_bonus_skills` | same |
| PT rating 5, dot4_skill set | dot 4 grant fires; rating > threshold doesn't double-count | same |
| Two PT merits on same character (multi-purchase) | each contributes its own asset skills + dot4_skill | same |
| PT rating 4 with Brawl `dots: 4, bonus: 1` | dot4 bonus fires, but `skTotal` returns 5 (cap), not 6 | evaluator must respect the cap via existing `skTotal` accessor |
| PT rating 0 / no PT merit | no grants | same |

## Code Map

- `public/js/editor/mci.js:184-216` — legacy PT block. Read carefully; evaluator must match.
- `public/js/data/accessors.js:85-90` — `skTotal` cap-at-5 logic. Evaluator must defer to this.
- `server/schemas/rules/` — schemas from RDE-2. Validates seed.
- `server/tests/helpers/apply-derived-merits-snapshot.js` — RDE-1 harness. Used directly here.
- `server/tests/apply-derived-merits-harness.test.js` — RDE-1 PT scenarios. New parallel-write tests added here or in a sibling file.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-pt.js` (new) — inserts three rule docs (one per dot tier) into the appropriate collections. Idempotent. `--dry-run` / `--apply` flags following the cleanup-stale-sessions.js pattern.
- [ ] `public/js/editor/rule_engine/pt-evaluator.js` (new) — exports `applyPTRulesFromDb(c, ptRules)` that takes a character and the loaded PT rule docs, and writes the same side-effects as the legacy block.
- [ ] `public/js/editor/rule_engine/load-rules.js` (new) — fetches all rule docs once (cached per render), exposes by family. Used by the evaluator.
- [ ] `server/tests/pt-parallel-write.test.js` (new) — for each scenario in the I/O Matrix, build a fixture, run the legacy block AND the evaluator against fresh copies, snapshot both, deep-equal. Fail if any field differs.
- [ ] Add a contract test (Grep-based or static-analysis) that fails CI if `public/js/editor/rule_engine/**/*.js` references `getAttrVal`, `skDots`, or `m.cp` / `m.xp` directly without a `// inherent-intentional: <reason>` marker comment.
- [ ] Flip step (gated on parallel-write tests being green and a manual three-character spot-check): replace the PT block at `mci.js:184-216` with `applyPTRulesFromDb(c, await loadPTRules())`. Delete the legacy block.
- [ ] Update the harness in `apply-derived-merits-harness.test.js` to reflect that PT is now DB-backed; the same scenarios should still pass.

**Acceptance Criteria:**
- Given the seed has run against `tm_suite_test`, when `pt-parallel-write.test.js` executes, then every scenario's legacy snapshot deep-equals its evaluator snapshot.
- Given the flip has happened, when `applyDerivedMerits` runs against any of the harness's PT scenarios, then results are identical to pre-flip behaviour.
- Given a character with PT and Brawl `dots: 4, bonus: 1`, when the dot 4 grant fires, then `skTotal(c, 'Brawl')` returns 5 (not 6) due to the cap.
- Given a Grep over `public/js/editor/rule_engine/`, when no `getAttrVal\|skDots\b` matches exist without an `inherent-intentional` marker, then the contract test passes.

## Verification

**Commands:**
- `cd server && npx vitest run pt-parallel-write` — expected: all scenarios deep-equal.
- `cd server && npx vitest run apply-derived-merits-harness` — expected: continues to pass post-flip.
- Manual: `node server/scripts/seed-rules-pt.js --dry-run` then `--apply` against `tm_suite`.

**Manual checks:**
- Open an admin sheet for one PT-bearing character (e.g. anyone with PT in production). Confirm `free_pt`, `_pt_nine_again_skills` underline indicators, and the dot4 bonus dot all render identically before and after flip.
