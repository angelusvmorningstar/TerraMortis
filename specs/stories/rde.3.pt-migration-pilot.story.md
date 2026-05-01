---
title: 'Professional Training migration pilot — proves parallel-write contract on a self-contained family'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.0.legacy-migration-cleanup.story.md
  - specs/stories/rde.1.test-harness.story.md
  - specs/stories/rde.2.schema-and-api.story.md
  - specs/design/rules-engine-adversarial-revision.md
---

## Intent

**Problem:** Per ADR-001 the rule engine migrates families one at a time under a parallel-write contract. Professional Training is the chosen pilot because it is a *self-contained* family: three dot-tier grants, asset-skill array dependency, two ephemeral set fields, plus auto-creation of Contacts with `free_pt: 2`. PT exercises the phase-2 (unconditional grants) and phase-4 (skill bonus, 9-Again) paths. It does not exercise phase-3 (cross-character) or phase-5 (status floors); those validations are owned by RDE-12 (Safe Word) and RDE-13 (OTS). PT validates that the contract holds for the simple case, which is a precondition for the harder cases.

**Approach:** Seed PT's rules into the new typed collections. Add a runtime evaluator that reads from the collections and applies grants identically to the legacy code path. Run both paths in tests; assert character snapshots are deep-equal across the harness's PT scenarios. Once green, audit triage is complete, and a recovery runbook is written, flip the production path to the evaluator and delete the PT block from `mci.js` (post-RDE-0 line numbering — the block currently at 184-216) in a separate commit.

## Boundaries & Constraints

**Always:**
- Parallel-write is **test-only scaffolding**. Production runs whichever path is currently designated source of truth (legacy at start, evaluator after flip). No long-lived feature flag in production code.
- The evaluator must produce side-effects identical to the legacy block down to set membership and free_pt amounts. The harness's normalised deep-equal is the contract.
- Evaluator reads merits via `m.rating` (effective). Reads skills via `getSkillObj(c, skill)` and respects existing nine-again/bonus mechanics. Reads attributes via `getAttrEffective` if any phase-3 condition is added later (PT does not reference attributes today).
- Three rules go into the new collections for PT: `rule_grant` (dot 1: 2 free Contacts), `rule_nine_again` (dot 2: asset skills), `rule_skill_bonus` (dot 4: chosen asset skill +1 capped at 5).
- The seed runs idempotently — re-running does not create duplicates. Use a stable composite key for upsert.
- Evaluator code lives under `public/js/editor/rule_engine/` and inherits the negative-grep + positive-contract enforcement defined in ADR-001 §Effective-rating contract.
- The flip is a separate commit from the evaluator introduction. The flip commit's diff is *only* the swap-in of the evaluator call and the deletion of the legacy block. This makes revert surgical.
- A **recovery runbook** lives at `specs/runbooks/rde-3-pt-flip-recovery.md` and is a precondition for flip. The runbook describes: which collections to drop, which `free_*` fields to clear via update-many, and what code revert restores. The runbook is exercised against `tm_suite_test` (a test of the runbook itself) before flip lands.

**Ask First:**
- Whether the seed lives in `server/scripts/seed-rules-pt.js` (one-shot pattern) or in a generic `seed-rules.js` that takes a family argument. Default to one-shot scripts per family that get archived post-flip.
- Whether `dot4_skill` (the user-chosen asset skill) is captured on the merit instance or on the rule doc. The merit instance is the right answer (per-character data); the rule doc encodes "PT dot 4 grants +1 to the character's chosen asset skill", not which skill.
- Whether the dev should run the runbook against `tm_suite_test` immediately or batch with the flip PR. Default: run before opening the flip PR; attach output as evidence.

**Never:**
- Do not delete the legacy PT block until after the flip step has landed in a separate commit and the runbook has been exercised.
- Do not migrate other rule families in this story.
- Do not add new production code paths conditional on a feature flag. The evaluator either is or isn't the source of truth.
- Do not introduce a self-grant (PT granting `free_pt` to itself). The schema rejects it; the evaluator must not attempt it.

## I/O & Edge-Case Matrix

| Scenario | Legacy applies | Evaluator must apply identically |
|---|---|---|
| PT rating 1 | `free_pt: 2` on Contacts (auto-create if absent, identified by `(name, granted_by, qualifier)` triple) | same |
| PT rating 2, asset_skills: [Brawl, Stealth] | adds Brawl + Stealth to `_pt_nine_again_skills` | same |
| PT rating 4, dot4_skill: Brawl | adds Brawl to `_pt_dot4_bonus_skills` | same |
| PT rating 5, dot4_skill set | dot 4 grant fires; rating > threshold doesn't double-count | same |
| Two PT merits on same character (multi-purchase) | each contributes its own asset skills + dot4_skill | same |
| PT rating 4 with Brawl `dots: 4, bonus: 1` | dot4 bonus fires, but `skTotal` returns 5 (cap), not 6 | evaluator must respect the cap via existing `skTotal` accessor |
| PT rating 0 / no PT merit | no grants | same |
| Idempotency: run `applyDerivedMerits` twice in succession | no duplicate Contacts auto-created (triple stable) | same |
| Bonus dots on Contacts (`cp: 1, free_pt: 2`) | rating = 3, render shows correct dots | evaluator preserves the same `m.rating` post-phase-2 sync |

## Code Map

- `public/js/editor/mci.js` — legacy PT block (post-RDE-0 line numbering; the block is the one that calls `_pt_nine_again_skills.add(...)` and assigns `free_pt: 2` on Contacts). Read carefully; evaluator must match.
- `public/js/data/accessors.js:85-90` — `skTotal` cap-at-5 logic. Evaluator must defer to this.
- `server/schemas/rules/` — schemas from RDE-2. Validates seed.
- `server/tests/helpers/apply-derived-merits-snapshot.js` — RDE-1 harness. Used directly here.
- `server/tests/apply-derived-merits-harness.test.js` — RDE-1 PT scenarios. New parallel-write tests added in `pt-parallel-write.test.js` (sibling).

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-pt.js` (new) — inserts three rule docs (one per dot tier) into the appropriate collections. Idempotent. `--dry-run` / `--apply` flags following the cleanup-stale-sessions.js pattern.
- [ ] `public/js/editor/rule_engine/pt-evaluator.js` (new) — exports `applyPTRulesFromDb(c, ptRules)` that takes a character and the loaded PT rule docs, and writes the same side-effects as the legacy block. Phase-2 + phase-4 paths only; no phase-3 or phase-5.
- [ ] `public/js/editor/rule_engine/load-rules.js` (new) — fetches all rule docs once, exposes by family. Server-side bundle on character fetch is preferred (per ADR-001 §Performance posture); for v1, an explicit `loadRules()` async function is acceptable.
- [ ] `server/tests/pt-parallel-write.test.js` (new) — for each scenario in the I/O Matrix, build a fixture via the RDE-1 factory, deep-clone, run the legacy block AND the evaluator against fresh copies, normalise snapshots (sets→sorted arrays, auto-created merits keyed by triple, ignore `_id`), deep-equal. Fail if any field differs.
- [ ] Add the negative-grep contract test (`server/tests/rule_engine_grep.test.js`) and the positive-contract test (`server/tests/rule_engine_effective_contract.test.js`) per ADR-001. Both gate CI.
- [ ] **Recovery runbook.** Author `specs/runbooks/rde-3-pt-flip-recovery.md` covering: drop the seeded `rule_*` docs (precise filter), clear `free_pt` on every character via update-many, revert the flip commit. Exercise the runbook against `tm_suite_test`: seed, flip in test branch, run runbook, verify `tm_suite_test` characters render identically to pre-seed. Attach evidence to the flip PR.
- [ ] **Performance benchmark.** Render the admin character grid (30 chars) post-flip with the rule engine active in `tm_suite_test`. Capture render time. Compare to pre-flip baseline (taken before this story's evaluator wiring). Fail the story if grid render regresses by more than 50ms (per ADR-001 §Performance posture).
- [ ] **Flip step (separate commit, gated):** prerequisites — parallel-write tests green, audit triage complete (from RDE-1), runbook exercised, performance gate met, and three real production characters spot-checked. The flip commit replaces the PT block with `applyPTRulesFromDb(c, await loadRules('pt'))`. The legacy block is deleted in this commit.
- [ ] Update the harness in `apply-derived-merits-harness.test.js` to reflect that PT is now DB-backed; the same scenarios should still pass against the post-flip code path.

**Acceptance Criteria:**
- Given the seed has run against `tm_suite_test`, when `pt-parallel-write.test.js` executes, then every scenario's normalised legacy snapshot deep-equals its evaluator snapshot.
- Given the flip has happened, when `applyDerivedMerits` runs against any of the harness's PT scenarios, then results match pre-flip behaviour byte-for-byte after normalisation.
- Given a character with PT and Brawl `dots: 4, bonus: 1`, when the dot 4 grant fires, then `skTotal(c, 'Brawl')` returns 5 (not 6) due to the cap.
- Given the negative-grep test, when no `getAttrVal|skDots|getAttrBonus|skBonus|m.cp|m.xp|m.up|attributes\.X\.dots|skills\.X\.dots` matches exist in `public/js/editor/rule_engine/` without an `inherent-intentional` marker, then the contract test passes.
- Given the positive-contract test, when a fixture with `bonus > 0` on every PT-referenced trait runs, then PT's predicate fires at the effective threshold and not at inherent-only.
- Given the runbook, when exercised against `tm_suite_test`, then post-revert character renders match pre-seed renders.
- Given the performance benchmark, when the admin character grid renders post-flip, then render time is within 50ms of the pre-flip baseline.

## Verification

**Commands:**
- `cd server && npx vitest run pt-parallel-write` — expected: all scenarios deep-equal under normalisation.
- `cd server && npx vitest run rule_engine_grep` — expected: pass.
- `cd server && npx vitest run rule_engine_effective_contract` — expected: pass.
- `cd server && npx vitest run apply-derived-merits-harness` — expected: continues to pass post-flip.
- Manual: `node server/scripts/seed-rules-pt.js --dry-run` then `--apply` against `tm_suite_test`, verify, then `tm_suite`.
- Manual: exercise the runbook against `tm_suite_test`, attach console output to flip PR.

**Manual checks:**
- Open admin sheets for three PT-bearing production characters. Confirm `free_pt`, `_pt_nine_again_skills` underline indicators, and the dot4 bonus dot all render identically before and after flip.

## Design Notes

PT is the *self-contained* pilot. Choosing PT validates the contract on a clean case; choosing Safe Word or OTS as the pilot would have conflated three problems (the contract, cross-character resolution, and status floors). RDE-12 (Safe Word) explicitly tests phase-3, and RDE-13 (OTS) explicitly tests phase-5. ADR-001 §Implementation plan lists the order. The dev does not need to validate every phase here.

The flip-as-separate-commit discipline matters. Reverting a "feat: introduce PT evaluator and flip" commit either re-introduces the evaluator-but-not-flipped state (if the revert preserves the new files) or destroys the evaluator entirely. A separate "feat: flip PT to evaluator" commit can be cleanly reverted; the evaluator stays available for re-flip after fix.

The runbook is the reason the parallel-write contract is not a feature flag. Feature flags accumulate; runbooks are exercised once per family and archived. The flip commit message references the runbook path so future maintainers can find it.
