---
title: 'ADR-001 + RDE Epic — Adversarial Revision Summary'
audience: 'Angelus + his Claude agent (and any future maintainer landing the RDE epic)'
branch: 'adversary'
date: '2026-04-28'
author: 'Winston (Architect, Piatra side)'
status: 'awaiting Angelus review'
---

# Rules Engine — Adversarial Revision Summary

## TL;DR

Two parallel adversarial reviews of `specs/architecture/adr-001-rules-engine-schema.md` (rev 1) returned a `yes-with-changes` verdict with three blockers, several should-fixes, and a handful of nice-to-haves. The blockers were structural (evaluation-order semantics undefined, snapshot harness would lock in known bugs, `rule_grant + grant_type:'speciality'` was Option A in disguise). On the `adversary` branch all blockers and most should-fixes are now resolved in the ADR and the affected story files. This doc summarises what changed, why, what's still open, and what Angelus's agent should re-read before picking up RDE work.

**Files changed on `adversary`:**

- `specs/architecture/adr-001-rules-engine-schema.md` — rev 2. Substantial rewrite preserving the original decision direction (Option B) but tightening semantics.
- `specs/stories/rde.0.legacy-migration-cleanup.story.md` — **new**. Excises one-shot data-migration cruft from `applyDerivedMerits` before the rule engine work starts.
- `specs/stories/rde.1.test-harness.story.md` — revised. Adds audit-finding triage gate, deep-clone discipline, multi-character fixtures, normalisation-by-triple for auto-created merits, idempotency regression test.
- `specs/stories/rde.2.schema-and-api.story.md` — revised. Eight collections (added `rule_speciality_grant`, `rule_status_floor`). Cyclic-reference rejection added at schema layer. Tier-budget length check at API.
- `specs/stories/rde.3.pt-migration-pilot.story.md` — revised. PT repositioned as the *self-contained* pilot (not "the messiest"). Recovery runbook and performance benchmark added as flip prerequisites. Flip is a separate commit.

**Files NOT touched (need re-read against rev 2 ADR before being picked up):**

- `specs/stories/rde.4.rules-data-shell-and-pt-editor.story.md` — left rail count goes from 6 to 8 (or, per Sally's dissent recorded in the ADR, grouped into 3 sections). Editor must show orphaned-merit warnings (lifecycle change).
- `specs/stories/rde.5.mci-migration.story.md` through `rde.15.derived-stat-modifiers-migration.story.md` — phase membership and the parallel-write contract changed. Per-family stories should be re-validated against ADR rev 2 §Evaluation order and §Parallel-write migration contract before development.

## Why this revision exists

The original ADR was strong overall — Option B was the right call, the effective-rating vocabulary lock was a genuine improvement, and the parallel-write idea is the right migration shape. But two structural questions were either silent or smuggled past:

1. **Evaluation order across collections was undefined.** Today's `applyDerivedMerits` has implicit ordering encoded in line position (clear → MCI sync → PT → MDB → K-9/Falconry → PT pools → VM → OHM → Safe Word → Invested → MDB apply → Lorekeeper → OTS → Bloodline → final rating sync, line 420). Several rules read state written by earlier rules — MDB at line 343 explicitly reads `cp + free_mci + free_vm + free_lk + free_ohm + free_inv + free_pt`. Splitting families into typed collections without naming the order would make this implicit dependency a per-implementation choice, which is exactly how silent regressions creep in.

2. **`rule_grant` with `grant_type: 'speciality'` was Option A in disguise.** Option B's whole reason for existing is "one collection, one shape, one editor screen." Smuggling specialities (which have `{skill, spec}` shape) into `rule_grant` (which has `{target, amount}` shape) under a discriminator field undermines that. The reviewer noticed; the revision splits them.

Plus a smaller cluster of issues: snapshot fixtures locking in audit-found bugs, performance claims unbacked by measurement, rollback being theoretical, the grep contract being porous.

## What changed in the ADR (rev 1 → rev 2)

### Added: §Evaluation order and stacking

Five-phase model. Phase membership is fixed; within-phase ordering is free. Phases:

1. **Clear ephemerals** — reset `_*` and `free_*`.
2. **Unconditional grants and pool building** — `rule_grant`, `rule_speciality_grant`, `rule_tier_budget`. Auto-created merits inserted here. Phase-2 evaluators may not read each other's output.
3. **Cross-character resolution** — Safe Word, MDB-via-partner. Reads partner state post-phase-2.
4. **Discipline and derived modifiers** — `rule_disc_attr`, `rule_derived_stat_modifier`. Reads effective trait values.
5. **Final rating sync and status floors** — recompute `m.rating`. Run `rule_status_floor`.

Stacking semantics pinned: different `source`s sum (per the existing `free_*` convention); same source + same tier dedupes; speciality grants are a set not a multiset.

### Added: §Trait-reference primitive

Rule docs reference traits by `{kind, name}` where `kind ∈ {attribute, skill, merit, discipline, derived_stat}`. Each kind specifies which accessor the resolver uses (`getAttrEffective`, `skTotal`, `m.rating` post-sync, `getDiscDots`, the matching `accessors.js` calc). Manual `bonus` overrides are visible to evaluators (intentional — matches present-day sheet behaviour). Mandragora Garden is opaque to the rule engine until a dedicated story migrates it.

Cyclic-reference prevention: a rule whose target merit is also its source is rejected at the API layer (Ajv schema check). Self-grants (PT granting `free_pt` to itself) are unconstructable.

### Changed: catalogue grew from six to eight collections

Added `rule_speciality_grant` (split from `rule_grant`) and `rule_status_floor` (split from `rule_derived_stat_modifier`, addresses the OTS deferred-decision). Each new collection has its own shape; no smuggled discriminators.

### Added: §Auto-created merit lifecycle

`(name, granted_by, qualifier)` is the stable identity triple for FHP/Retainer/bloodline merits across rule edits. Rule edits do not rename in-DB merits (orphan warning surfaced in editor). Renaming an auto-created merit's name in code requires a paired one-shot script. Idempotent re-render: a render that finds the existing triple does not push a duplicate.

### Strengthened: §Parallel-write migration contract

- Deep-clone every fixture before each path runs (legacy mutates in place; bleeding into the evaluator's input would falsely pass deep-equal).
- Snapshot normalisation: `Set` → sorted `Array`; auto-created merits compared by triple, not `_id`; in-place vs new-object handled by the harness's `snapshotCharacter` extracting plain objects.
- Multi-character fixtures (`allChars`) for Safe Word and MDB-via-partner.
- Audit triage gate: every bonus-dot-audit finding is classified `fix-before-snapshot` (correct first) or `preserve-as-bug-for-bug` (documented preservation). RDE-1 owns the table.
- Recovery runbook per family (which collections to drop, which `free_*` to clear, what to revert). Exercised against `tm_suite_test` before flip lands.
- Flip is a *separate commit* from evaluator introduction. Revert is surgical.

### Strengthened: §Effective-rating contract enforcement

- Negative grep expanded: catches direct property reads (`m.cp`, `m.xp`, `m.up`, `c.attributes.X.dots`, `c.skills.X.dots`) plus indirect destructuring patterns. Word-boundary aware.
- Positive contract test: a fixture with `bonus > 0` on every rule-referenced trait runs every rule's predicate, asserts each fires at the effective threshold.
- Test-directory exclusion explicit. Production-equivalent test files opt-in via marker comment.

### Bounded: §Performance posture

The original "<500 docs, cached per request" claim was unbacked. Rev 2 specifies:

- Server-side bundle: API returns a single `rules` payload alongside character fetch. One round-trip, not eight.
- Client cache: payload cached until rule-doc-save signal. Sheet re-renders during editing read from cache.
- Measurement gate: RDE-3 includes a benchmark against the 30-character admin grid. Render-time regression > 50ms vs pre-flip baseline fails the story.

### Reframed: Option C rejection

Original rejection cited "six-plus weeks to design and test the DSL" as a strawman. Rev 2 rejects Option C honestly: the actual rule grammar required (trait reference + tier predicate + grant payload) is small enough that per-family structs cover it; an interpreter's parser/evaluator/error-UX surface area doesn't pay back on a one-developer cadence.

### Added: §Recorded dissents

Sally on editor IA for eight collections (resolved: three sidebar groups, not eight). Quinn on snapshot bug-locking (resolved: triage gate). Amelia on PT pilot scope (resolved: phase-3 and phase-5 validation owned by RDE-12 and RDE-13). Captures real disagreement instead of papering over it.

### Added: RDE-0

Pulls one-shot data-migration cruft out of `applyDerivedMerits` (lines 22-119) into `server/scripts/migrate-legacy-character-fields.js`. Run once, delete in-render code, RDE-1 onward operates on a clean function. This is the single biggest architectural improvement that wasn't in rev 1: the rule engine's body becomes *only rules*.

## Open design questions for Angelus

Things rev 2 does not decide. Each is small enough to settle in a follow-up message; flagged here so they don't get lost.

1. **Audit-triage table content.** RDE-1's triage table is empty pending the bonus-dot audit transcript. The dev (or Angelus) needs to populate it from the in-conversation audit log of 2026-04-28. Each row needs a fix-before / preserve classification with rationale. Suggest: Angelus's Claude agent has the audit transcript closer to hand; have it populate the table and submit for sign-off before RDE-1 starts capturing.

2. **`rule_status_floor` shape.** Defined at a sketch level (target_status_kind, target_status_name, floor_value). OTS specifically grants both a covenant-status floor *and* a free-style-dots multiplier. The latter is `rule_derived_stat_modifier` (mode: 'rating'). Confirm this split before RDE-13 starts.

3. **`getDiscDots` accessor.** The trait-reference primitive references a `getDiscDots(c, name)` effective accessor that does not yet exist in `accessors.js` (today disciplines are read directly off `c.disciplines`). Before any rule references a discipline rating, this accessor must be added. Suggested location: alongside `getAttrEffective` in `accessors.js`. Probably one-line PR; flag for inclusion in RDE-2 or RDE-14 (whichever comes first).

4. **Performance baseline capture.** The 50ms regression gate in RDE-3 needs a *baseline* to compare against. Suggest: capture grid-render timing on `tm_suite_test` *before* RDE-3 lands its evaluator (i.e. after RDE-0/1/2). Commit the baseline number to the story.

5. **Mandragora Garden migration scheduling.** ADR rev 2 declares MG opaque to the rule engine. A future migration story for MG is "allowed but not scheduled". Decide whether to schedule it post-RDE-15 or leave indefinitely.

6. **Editor IA — Sally's grouping.** Three sidebar sections ({Grants, Modifiers, Tables}) accommodate eight collections. Confirm the grouping before RDE-4 lands the editor shell. Suggested mapping: Grants = {rule_grant, rule_speciality_grant, rule_skill_bonus, rule_nine_again}; Modifiers = {rule_disc_attr, rule_derived_stat_modifier, rule_status_floor}; Tables = {rule_tier_budget}.

7. **Cross-character fixture ergonomics.** The RDE-1 factory provides `buildFixturePair`. Safe Word's pact references between characters are nontrivial — how is the pact stored on the character today, and does the factory mirror that shape? Worth a 5-minute look at the SW data shape on a real production character before RDE-1 design freezes.

## What Angelus's agent should re-read

In order:

1. **The rev-2 ADR in full.** Particularly §Evaluation order, §Trait-reference primitive, §Auto-created merit lifecycle, §Parallel-write migration contract. These were thin or absent in rev 1.
2. **RDE-0** — new. This must land before RDE-1.
3. **RDE-1 §Audit triage.** The triage table is the gating step. No snapshots until classifications are signed off.
4. **RDE-3 §Recovery runbook task.** New requirement; flip cannot land without it.
5. **RDE-2 cyclic-reference Ajv keyword.** Schema-layer rejection. Easy to miss if reading rev 1.
6. **RDE-4–RDE-15 stories** — these are pre-revision. Re-read against the new ADR. Ordering hint: RDE-12 (Safe Word) and RDE-13 (OTS) carry explicit phase-3 and phase-5 validation responsibilities; that wasn't called out in rev 1. The remaining stories may need scope tweaks but no structural changes; reading the ADR first is enough.

## Reasoning for design choice changes

For each non-trivial change in rev 2, the rationale:

| Change | Why |
|---|---|
| Five-phase evaluation order | Today's implicit ordering encodes real dependencies (MDB reads phase-2 outputs, Safe Word excludes its own free dots from circular reads). Splitting into typed collections without a phase contract makes ordering a per-implementation choice. Phases make the dependency explicit and let evaluators within a phase parallelise safely. |
| `rule_speciality_grant` split out | Specialities have `{skill, spec}` shape; merit grants have `{target, amount}` shape. Forcing both into one collection requires a discriminator, which is Option A. Option B's selling point is one shape per collection. The split honours the original decision direction. |
| `rule_status_floor` split out | Status floors are not modifiers — they're minima. A floor of 2 plus an existing rating of 3 leaves rating at 3, not 5. A modifier of +2 plus an existing rating of 3 yields 5. Different semantics, different shape. |
| Cyclic-reference rejection at schema layer | The reviewer raised the case of PT rules referencing PT rating. Allowed (read), but a self-grant is forbidden (write). Schema-layer rejection prevents a class of bug from ever being constructed by the editor UI. |
| Auto-created merit identity by triple, not _id | Multiple edge-case scenarios (rule rename, qualifier change, `_id` instability across renders) collapse into one rule: identity is `(name, granted_by, qualifier)`. Removes ambiguity from the parallel-write deep-equal. |
| Audit-triage gate on RDE-1 | Snapshot harnesses lock in current behaviour. If "current behaviour" includes audit-found bugs, the snapshot bakes them in. Triage forces an explicit classification per finding, with sign-off, before snapshots are captured. |
| Performance measurement gate | Original ADR asserted "<500 docs, cached per request" without a measurement plan. Real performance impact lives in long-lived editor sessions and the 30-character admin grid render. Gate: 50ms regression on grid render fails the story. |
| Recovery runbook per family | "Test-only scaffolding" with no feature flag means revert is the recovery path. Revert without a rule-doc cleanup leaves orphan data. Runbook = revert + drop + reset, exercised pre-flip. |
| RDE-0 data-migration carve-out | `applyDerivedMerits` carries 100 lines of one-shot migration code. Keeping it in-render means RDE-1's harness either snapshots the migration (bakes it into the rule engine forever) or has to special-case ignore it (fragile). Excise once, delete forever. |
| PT repositioned as self-contained pilot | Calling PT "the messiest family" in rev 1 was motivated reasoning. PT exercises phase 2 and phase 4 cleanly. Phase 3 (cross-character) and phase 5 (status floors) are validated by RDE-12 and RDE-13. Honest framing. |
| Flip as separate commit | Revert ergonomics. A combined "introduce + flip" commit can't be reverted to "introduced but not flipped" without surgery. Separating them gives a trivial revert path. |

## Verification this branch produces

To verify the revision is internally consistent:

```sh
git checkout adversary
diff --stat origin/Morningstar..HEAD -- specs/architecture/adr-001-rules-engine-schema.md \
                                        specs/stories/rde.0.legacy-migration-cleanup.story.md \
                                        specs/stories/rde.1.test-harness.story.md \
                                        specs/stories/rde.2.schema-and-api.story.md \
                                        specs/stories/rde.3.pt-migration-pilot.story.md \
                                        specs/design/rules-engine-adversarial-revision.md
```

No code changed. All edits are documents. Nothing is pushed; the branch lives locally on Piatra's clone.

## How to proceed from here

Suggested sequence on Angelus's side:

1. Read this summary.
2. Read the rev-2 ADR.
3. Decide on the seven open questions above (or punt any of them to follow-ups).
4. If accepted: merge `adversary` into `Morningstar` (or cherry-pick the doc commits), and let Angelus's Claude agent re-read RDE-1 and start the audit triage.
5. If you want changes to the revision: ping Piatra-side and we iterate.

If declined: the original rev-1 ADR stands. The reviews and this revision are still useful as a reference for the issues found.
