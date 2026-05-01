---
id: ADR-001
title: 'Editable rules engine for character-affecting hardcoded rules'
status: revised-draft
date: 2026-04-28
author: Angelus (original); revised by Winston (Architect) on adversary branch
revision: 2
supersedes: null
related:
  - specs/architecture.md (project architecture, brownfield)
  - public/js/editor/mci.js (current source of truth for rule evaluation)
  - public/js/data/accessors.js (effective vs inherent accessors)
  - specs/design/rules-engine-adversarial-revision.md (revision rationale)
---

# ADR-001 — Editable rules engine schema

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-04-28 | Initial draft. Six-collection catalogue, parallel-write migration contract, effective-rating vocabulary lock. | Angelus |
| 2 | 2026-04-28 | Adversarial review revision. Added Evaluation Order section. Added Trait-Reference Primitive. Split speciality grants and status floors into their own collections (eight total). Pinned auto-created merit lifecycle. Strengthened parallel-write contract (deep-clone, normalisation, in-place handling). Carved legacy data-migration cruft out of the rule engine into RDE-0. Strengthened grep contract with positive assertion test. Scoped performance claims to a measurement gate. | Winston (Architect) |

## Context

A bonus-dot audit (in-conversation, 2026-04-28) catalogued every rule in `public/js/editor/mci.js applyDerivedMerits` and the related accessor logic in `public/js/data/accessors.js`. The function is the source of truth for ten-plus rule families that affect every character sheet:

- Per-tier merit grants (Professional Training, Mystery Cult Initiation, Oath of the Hard Motherfucker, Lorekeeper, Invested, Viral Mythology, The Mother-Daughter Bond, Oath of the Safe Word, Bloodline grants, K-9 / Falconry retainer auto-grants, Oath of the Scapegoat).
- Skill bonuses (PT dot 4, MCI dot 3).
- 9-Again grants (PT dot 2, OHM chosen skills).
- Discipline-to-attribute mappings (Vigour → Strength, Resilience → Stamina, Celerity → Speed and Defence).
- Fixed merit effects on derived stats (Giant +1 Size, Fleet of Foot +Speed, Defensive Combat skill swap).
- Auto-created merits (Friends in High Places from OHM, Retainer (Dog/Falcon) from K-9/Falconry, bloodline merits).
- MCI tier budgets (`[0, 1, 1, 2, 3, 3]` indexed by tier).
- Free specialisation grants (MCI dot 1 speciality choice, bloodline specs).
- Status floors and pact-driven derived state (OTS covenant-status floor, OTS free-style-dots multiplier).

All currently hardcoded. Editing any of them today requires a code change, commit, push, and Render redeploy. The TM Suite is two months old, in active rules-design phase, and the user (Angelus) confirms that rule churn is part of the next year's design loop, not an occasional errata patch.

The function also carries a substantial chunk of one-shot legacy data-migration cruft (`up`→`cp` field rename, MCI `granted_by` clearing, FT backfill, MG dedup, fighting-style rename, MCI tier auto-mapping). This is **not rules** and is excised into RDE-0 (see Implementation Plan). The rule engine inherits a clean function body.

This ADR captures the schema decision for migrating these rules from code to a Mongo-backed, ST-editable representation.

## Decision drivers

1. **ST sovereignty over rules.** Every hardcoded rule that affects a character sheet must be editable from the admin Engine panel. No rule is exempt because it's "structurally specific" or "rarely changed". If it's hardcoded today, it's a candidate for migration.
2. **Effective-rating discipline.** The persistent bug class in this codebase is calculations silently ignoring bonus dots. The schema must not expose an inherent-only rating primitive to rule evaluators. Rule docs reference traits by name and trust the resolver to call effective accessors (`getAttrEffective`, `skTotal`, `m.rating` after sync).
3. **Display invariants stay.** Hollow-dot rendering (`● = inherent (cp+xp)`, `○ = derived (free_*)`) via `shDotsWithBonus` (`public/js/editor/sheet.js:507`) is unchanged. Migration is a back-end refactor; sheet visuals are out of scope.
4. **Live-game safety.** TM Suite hosts an active 30-player monthly LARP. Migration cannot regress the production sheet. Each rule family is migrated under a parallel-write contract before the legacy code path is removed. A documented data-state recovery procedure exists for every flip.
5. **Pace.** User explicitly rejected an eight-to-ten-week estimate. Realistic horizon (per Amelia's code-grounded estimate): three to four sessions for the PT pilot end-to-end, then one to two hours per subsequent rule family. The schema must support that velocity.
6. **Determinism over convenience.** Cross-collection evaluation order is part of the schema, not an implementation accident. Two ST-edited rules that interact must produce a defined outcome, every time, in every browser.

## Options considered

### A. Polymorphic single collection (`rules_engine`)

One Mongo collection. Each doc carries a `rule_type` discriminator and a polymorphic `payload` shaped per type.

- **Pros.** Single backing store. Adding a new rule type is "add a new discriminator value" with no Mongo migration. Easy to dump/restore as one corpus.
- **Cons.** Shape validation requires discriminated-union schemas in Ajv, adding dependency complexity. Every query for "all PT rules" walks past every other rule type. UI maps awkwardly: one editor screen has to render forms for every type. Mongo doesn't enforce shape per discriminator, so a malformed doc silently corrupts only one rule family but is invisible until rendered.

### B. Typed-per-family collections (`rule_grant`, `rule_skill_bonus`, etc.)

One Mongo collection per rule family. Each collection has its own JSON Schema.

- **Pros.** Each family validated independently with a flat Ajv schema (matches existing patterns in `server/schemas/`). Queries are direct: `db.rule_grant.find({source: 'PT'})` returns exactly what you want. Editor UI maps cleanly: one collection per editor screen, one form shape per screen. Adding a new family is a new collection plus a new editor view, no impact on existing families.
- **Cons.** More collections (eight per the revised catalogue). Cross-family queries (e.g. "everything affecting PT") need `Promise.all` over multiple finds. New rule shapes that don't fit existing collections require a new collection rather than just a new discriminator value.

### C. Full data-driven rule engine with a tiny DSL

Declarative expression language stored as JSON. Rule evaluator is a generic interpreter.

- **Pros.** Maximum flexibility. Any future rule shape expressible without schema migration. Storage form does not dictate editor form: editor can present forms even with DSL storage.
- **Cons.** The actual rule grammar required (trait reference + tier predicate + grant payload) is small enough that a single struct shape per family covers it without an interpreter. Option B's "more collections" cost is cosmetic; Option C's interpreter cost is real (parser tests, evaluator tests, error-reporting UX). On a project with monthly live games and a one-developer cadence, the marginal flexibility does not pay back the additional surface area.

## Decision

**Option B: Typed-per-family collections.**

The clean separation of shape per family aligns with the existing `server/schemas/` validation pattern and the proposed editor IA (one collection per left-rail entry). The "more collections" downside is cosmetic: eight Mongo collections is well within tolerance for a project that already runs `characters`, `territories`, `downtime_cycles`, `downtime_submissions`, `game_sessions`, `tracker_state`, `npcs`, `relationships`, `npc_flags`, `archive_documents`, `rules`, etc.

Option C is rejected because the rule grammar required is small enough to fit per-family structs.

Option A is rejected because the per-family Ajv schema simplicity dominates the cross-family-query convenience, and because UI legibility ("the editor screen for PT rules") is a first-class concern. **Critically, Option B is preserved by splitting heterogeneous shapes into separate collections rather than smuggling a discriminator into one.** The original draft's `rule_grant` with `grant_type: 'speciality'` was Option A in disguise; this revision splits it into a dedicated `rule_speciality_grant` collection.

### Rule type catalogue

Eight collections. Names in `snake_case` matching existing convention.

| Collection | Holds | Example sources |
|---|---|---|
| `rule_grant` | Per-tier or unconditional grants of merit dots from a source merit/oath/style. Includes auto-created merits. | PT dot 1 (2 Contacts), MCI dot-3/dot-5 merit grants, OHM (Contacts/Resources/Allies/FHP), Lorekeeper, Invested, VM, MDB, Safe Word, K-9/Falconry, Bloodline merits |
| `rule_speciality_grant` | Free skill speciality grants. Distinct shape: skill + spec text. | MCI dot 1 speciality, bloodline specs |
| `rule_skill_bonus` | +N dots to a skill, capped at 5. | PT dot 4, MCI dot 3 |
| `rule_nine_again` | 9-Again grants on skills. | PT dot 2 (asset skills), OHM (chosen skills) |
| `rule_disc_attr` | Discipline rating contributes to a target attribute or derived stat. | Vigour→Strength, Resilience→Stamina, Celerity→Speed, Celerity→Defence |
| `rule_derived_stat_modifier` | Flat or computed modifier on a derived stat from a merit's presence/rating. | Giant (+1 Size), Fleet of Foot (+rating Speed), Defensive Combat (Athletics → chosen skill in Defence calc) |
| `rule_tier_budget` | Tier-indexed budget tables. | MCI tier budgets `[0,1,1,2,3,3]`, PT pool sizes if any |
| `rule_status_floor` | Minimum status (covenant or other) imposed by a pact or oath. Distinct shape: floor value, target status name. | OTS covenant-status floor |

#### Tier budget bounds

`rule_tier_budget.budgets` arrays must satisfy: `length >= max(rating)` for every character that could carry the source merit, where index 0 is unused (kept for 1-indexed clarity). The API rejects budget arrays whose length is shorter than the source's max rating in `MERITS_DB`. Budget evaluator falls back to `0` (no grant) for out-of-range ratings; corrupt-data ratings (negative, non-integer) produce a logged warning and zero grant. Never throw at render time.

## Evaluation order and stacking

This section is non-negotiable. Migration of any rule family must conform to it.

### Phase ordering

The rule engine evaluates in five phases per character render. Evaluators within a phase may run in any order; cross-phase ordering is fixed.

1. **Clear ephemerals.** Reset `_pt_*`, `_mci_*`, `_ohm_*`, `_grant_pools`, `_*_free_specs`, `_ots_*`, all `free_*` fields on every merit. No reads.
2. **Unconditional grants and pool building.** All `rule_grant`, `rule_speciality_grant`, `rule_tier_budget` evaluators run. Auto-created merits are inserted in this phase. No phase-2 evaluator may read another phase-2 evaluator's output. All phase-2 reads use *inherent* trait values plus phase-1 cleared state.
3. **Cross-character resolution.** Evaluators that need other characters' state (Safe Word, MDB-via-partner) run here against `allChars`. They read partner merits' phase-2-applied state. They do not write to partner characters.
4. **Discipline and derived modifiers.** All `rule_disc_attr` and `rule_derived_stat_modifier` evaluators run. They read effective trait values (which now include phase-2 grants). Writes flow into `_grant_pools` or directly into derived-stat accumulators consumed by `accessors.js`.
5. **Final rating sync and status floors.** `m.rating` is recomputed by summing inherent (`cp + xp`) and every `free_*` field. `rule_status_floor` evaluators run. The character object is now stable for render.

The current `mci.js` order (clear → migrate legacy → MCI sync/pools → PT → MDB → K-9/Falconry → PT pools → VM → OHM → Safe Word → Invested → MDB apply → Lorekeeper → OTS → Bloodline → final rating sync, line 420) compresses phases 2–5 into one pass with implicit ordering. The migration pulls each family into its phase explicitly. The legacy data-migration cruft (clear-derived, `up`→`cp`, `granted_by` clearing, FT backfill, MG dedup, fighting-style rename, MCI tier auto-mapping) is excised into RDE-0 and runs as a one-shot, not on every render.

### Stacking semantics

When two `rule_grant` rows target the same merit on the same character:

- **Different `source`.** Both grants apply. The auto-created or upgraded merit's `free_*` fields each carry their source. `m.rating` sums them per the existing convention (`free_bloodline + free_pet + free_mci + ... + cp + xp`). Example: Bloodline grants Contacts +1 (`free_bloodline: 1`) and OHM grants Contacts +1 (`free_ohm: 1`); the merit ends with rating ≥ 2 from the two free dots stacking with any inherent dots.
- **Same `source` and same `tier`.** Treated as duplicate; only one grant applies. The duplicate raises a validation warning surfaced in the editor preview panel, not a render error.
- **Same `source`, different `tier`.** Both apply (this is intended, e.g. PT tier 1 and tier 4 both granting things).
- **`rule_speciality_grant` duplicates** ({skill, spec} identical, any source): deduplicated. Specs are a set, not a multiset.

### Trait-reference primitive

Rule docs reference traits by `{kind, name}`. The kind enum: `attribute`, `skill`, `merit`, `discipline`, `derived_stat`. The name is the trait's canonical string per `MERITS_DB`, `accessors.js`, etc. (Strength, Brawl, Professional Training, Vigour, Speed.) Renames in the canonical lists are breaking changes that require a paired migration of rule docs.

When a rule doc says `trait_ref >= N`:

- **Attributes.** Compares `getAttrEffective(c, name)` (inherent dots + manual bonus override + discipline-attr contributions). Manual `bonus` overrides are visible to rule evaluators; this is intentional and matches present-day sheet behaviour.
- **Skills.** Compares `skTotal(c, name)` (capped at 5). The cap is part of the comparison, not an after-thought.
- **Merits.** Compares `m.rating` post-phase-2-sync (`cp + xp + sum(free_*)`). This means phase-3-and-later rules see post-grant rating, while phase-2 rules see pre-grant rating. `Mandragora Garden` is the documented exception (line 423 in legacy code) — its `rating` is not a simple sum, and the rule engine treats MG as opaque (no rule may reference MG rating; MG-aware logic stays in legacy code post-flip until a dedicated migration story).
- **Disciplines.** Compares `getDiscDots(c, name)` (a new effective accessor, which sums inherent dots and any future discipline-affecting grants).
- **Derived stats.** Compares the result of the matching `accessors.js` calc function.

**Cyclic reference prevention.** A rule doc whose source is the same merit it references via `trait_ref` is rejected at the API layer (Ajv schema check). Example: a `rule_grant` with `source: 'Professional Training'` and a condition referencing `merit.Professional Training >= 4` is allowed (PT references its own rating). A `rule_grant` whose `target` is also `Professional Training` is rejected. Self-grants (PT grants free_pt to itself) are explicitly disallowed; the rule engine cannot construct them.

## Effective-rating contract (non-negotiable)

The schema does not expose a primitive that lets a rule evaluator accidentally read inherent-only when it wanted effective.

**Vocabulary lock:**

- Rule docs use `rating`, `effective_rating`, `dots_total`, never `dots` alone.
- A rule referencing "Strength ≥ 3" reads `getAttrEffective(c, 'Strength') >= 3`. The runtime resolver enforces this; the rule doc never says how it's computed.
- A rule referencing "PT rating ≥ 4" reads `m.rating` (already effective via phase-2 sum: `free_bloodline + free_pet + free_mci + free_vm + free_lk + free_ohm + free_inv + free_pt + free_mdb + free_sw + cp + xp`).
- Inherent-only accessors (`getAttrVal`, `skDots`, `getAttrBonus`, `skBonus`, `m.cp`, `m.xp`, `m.up`) get JSDoc warnings: `"DO NOT use for rule evaluation. Inherent only — for XP cost calc and CP audit only."`.

**Enforcement (defence in depth):**

1. **Negative grep.** A grep contract test in `server/tests/rule_engine_grep.test.js` fails CI if any file under `public/js/editor/rule_engine/` or `server/lib/rule_engine/` contains an unmarked reference to:
   - Direct accessor calls: `getAttrVal\b`, `skDots\b`, `getAttrBonus\b`, `skBonus\b`.
   - Direct property reads on inherent fields: `\.cp\b`, `\.xp\b`, `\.up\b` on a `m`/`merit`-bound variable; `\.dots\b` on a `c.attributes\.X`/`c.skills\.X` chain.
   - Word-boundary aware to catch private wrappers (e.g. `_getAttrVal` is not exempt unless the marker is present).
   - Marker syntax: `// inherent-intentional: <reason>` on the same or preceding line. Reviewer scans markers in PRs.
2. **Positive contract test.** A test in `server/tests/rule_engine_effective_contract.test.js` constructs a fixture character with `bonus > 0` (or equivalent bonus source) on every trait the rule engine references, then runs every active rule's predicate and asserts each one fires at the *effective* threshold and not at inherent-only. Adding a new rule without paired contract coverage fails CI.
3. **Test-directory exclusion.** Files under `server/tests/` and `tests/` are exempt from grep; they may need to read inherent values to construct edge-case fixtures. Test files prefixed with the comment `// rule_engine: production-equivalent` are *included* in grep (i.e. opt-in to the contract).

## Auto-created merit lifecycle

Several rules auto-create or auto-delete merits (FHP from OHM, Retainer from K-9/Falconry, bloodline merits). The lifecycle is part of the schema:

- **Identity.** Auto-created merits carry `granted_by: <source>` and `qualifier: <stable-key>`. The `(name, granted_by, qualifier)` triple is the stable identifier across rule edits. `_id` is assigned on first insert and preserved on subsequent renders.
- **Creation idempotency.** A render that finds an existing merit matching the triple does not push a new one. A render that finds the source is gone deletes the merit (only if `cp + xp + free` excluding the auto-source is zero; merits with subsequent ST modification persist).
- **Rule-edit semantics.** Renaming a `rule_grant.target` from "Friends in High Places" to "FHP" does *not* rename the in-DB merit. The rule edit produces a new identity; the old merit becomes orphaned. The editor surfaces orphaned merits in a preview panel and prompts the ST to rename / delete / merge. **Renames of auto-created merit names require a paired one-shot migration script**, not just a rule-doc edit.
- **Qualifier changes.** Same rule: `area: 'Dog'` → `'Hound'` is a rename, not a noop. Editor flags the discrepancy.

## Parallel-write migration contract

For each rule family, migration follows this contract:

1. **Capture current behaviour.** Write a Vitest fixture covering every observable side-effect of the family's existing code path (merit `free_*` deltas, ephemeral set memberships like `_pt_dot4_bonus_skills`, derived stat changes). Fixture characters must include at least one targeted trait with both `dots > 0` AND a bonus source set. Cross-character families (Safe Word, MDB-via-partner) require `allChars` fixtures with two-or-more characters.
2. **Triage audit findings.** Before snapshotting, the bonus-dot audit's findings are explicitly classified: *fix-before-snapshot* (bug correction lands as a separate commit, fixture re-captured) or *preserve-as-bug-for-bug* (legacy quirk intentionally preserved through migration; documented in the family's story under "Known preservations"). RDE-1 enumerates every audit finding and assigns each one of these labels with rationale.
3. **Write rule docs.** Insert the family's rules into the new typed collection. One rule per existing code branch.
4. **Write the new evaluator.** Add the family's evaluator function. It reads from the new collection and applies grants identically.
5. **Parallel-write assertion with normalisation.** A test runs both the legacy code path and the new evaluator against *deep-cloned copies* of each fixture character (mutation in legacy must not leak into the evaluator's input). Resulting character snapshots are normalised before deep-equal:
   - Ephemeral `Set` instances → sorted `Array`.
   - Auto-created merit identity ignored if `_id` is the only difference (the `(name, granted_by, qualifier)` triple is the comparison key).
   - In-place vs new-object: snapshot extracts a plain serialisable object via the harness's `snapshotCharacter()`. Legacy mutates input; evaluator may return a new object; the harness compares snapshots, not references.
   - Numeric float comparison uses `===` (rule engine produces only integers; floats indicate a bug).
6. **Manual sanity check.** Three real production characters known to exercise the family pass an admin-sheet-render visual check before flip.
7. **Recovery rehearsal.** Before flip, document the recovery procedure for the family: which collections to drop, which `free_*` fields to clear via update-many, what code revert restores. This is not a feature flag; it is a runbook. The RDE story is not "ready to flip" until the runbook is written.
8. **Flip.** Once parallel-write tests are green, audit triage is complete, manual sanity passes, and the runbook is written, the legacy code branch is deleted in a dedicated commit (separate from the evaluator's introduction commit, so revert is surgical).
9. **Editor UI.** The admin editor view for this family ships in the same story or the next.

The parallel-write code is **test-only scaffolding**, not a production feature flag. Production runs whichever path is currently designated source of truth (legacy at start, new evaluator after flip). Recovery is via revert-the-flip-commit and drop-or-reset rule docs per the runbook.

## Implementation plan

Stories, in order (RDE = "Rules Data Engine"):

- **RDE-0** Legacy data-migration cleanup. Excise the one-shot data-migration cruft from `applyDerivedMerits` (lines 22-119: stripped derived merits, `up`→`cp` rename, MCI `granted_by` clearing, FT backfill, MG dedup, fighting-style rename, MCI tier auto-mapping) into `server/scripts/migrate-legacy-character-fields.js`. Run the script once against `tm_suite`. Delete the in-render code. After RDE-0 the rule engine's body is *only* rules — no migration logic. RDE-1 onward depends on this.
- **RDE-1** Test harness for `applyDerivedMerits`. Snapshot helper that captures every observable side-effect (`free_*` on merits, `_pt_*`, `_mci_*`, `_grant_pools`, `_*_free_specs`, `_ots_*`). Reusable fixture builder for "character with bonus on targeted trait" and multi-character `allChars` fixtures. Audit-finding triage table. Vitest-based.
- **RDE-2** Schema design follow-up. JSON Schema files under `server/schemas/rules/` for each of the eight collections. Validation wired into the API CRUD routes for rule docs. Schema-level cyclic-reference rejection (a rule's source merit cannot be its own target). (This ADR defines the catalogue; RDE-2 pins field-level shape per collection.)
- **RDE-3** PT migration pilot. Parallel-write contract executed end-to-end. PT is a *self-contained* family: three dot-tier grants, asset skill array, two ephemeral sets, plus `free_pt`. PT validates the contract on the simple case. Cross-character validation is deferred to RDE-12 (Safe Word) and structural-floor validation to RDE-13 (OTS); neither is a precondition for RDE-3 because their phase membership is settled by this ADR. Once PT is green and flipped, the PT block in `mci.js:184-216` is deleted in a separate commit.
- **RDE-4** PT editor UI. Admin Engine sidebar entry "Rules Data". Left rail: *Merit Grants*, *Speciality Grants*, *Skill Bonuses*, *9-Again*, *Discipline → Attribute*, *Derived Stat Modifiers*, *Tier Budgets*, *Status Floors*. PT is reachable under Merit Grants. Side-panel form per rule, validation surfaced inline, house-rule note textarea, preview panel showing a real character before/after and orphan-merit warnings.
- **RDE-5+** Each remaining rule family, one story each. Use PT as the template. Order roughly by surface area: MCI, OHM, Bloodline grants, Invested, Lorekeeper, MDB, VM, K-9/Falconry, Safe Word (RDE-12, validates phase-3 cross-character contract), OTS (RDE-13, validates phase-5 status-floor contract), then the simpler discipline-attr / derived-stat-modifier / tier-budget families.

After the final family migrates, `mci.js applyDerivedMerits` is reduced to a single call into the rule engine, and the per-family branches are gone.

## Performance posture

The runtime cost of `applyDerivedMerits` increases: it now reads from eight collections per character render instead of executing in-memory branches. The cache scope and the measurement gate matter:

- **Server-side load.** When the API returns a character, it bundles a single `rules` payload (all eight collections in one response). This is a single round-trip per character fetch, not eight.
- **Client-side cache.** The `rules` payload is cached on the browser side until the editor receives a "rules updated" signal (Mongo change detection or, for v1, explicit invalidation on rule-doc save). Sheet re-renders during normal editing read from the cache; no network call.
- **Render cost.** With the rules cached, evaluator dispatch is in-memory. The catalogue is bounded (~30–80 docs at v1 coverage; **revisit if the corpus passes 500 docs**, which would imply a step change in design intent that is not anticipated).
- **Measurement gate.** RDE-3 includes a benchmark: render the admin character grid (30 chars) post-flip with the rule engine active. Fail the story if grid render time regresses by more than 50ms vs pre-flip baseline. If the gate fails, batch-load and per-render caching are revisited before further families migrate.

## Consequences

### Positive

- Every hardcoded rule becomes ST-editable through the admin UI once its family migrates.
- Rule changes no longer require a code deploy. A house-rule errata becomes a Mongo doc edit.
- Per-family Ajv schemas catch malformed rule docs at the API boundary, not at sheet render.
- The `rule_grant` collection becomes a single auditable source for "what does this character get for free, and why".
- Phase ordering is explicit, not implicit — the next maintainer reads it instead of decoding `mci.js` by archaeology.

### Negative

- The runtime cost of `applyDerivedMerits` increases (mitigated above). Mitigation is gated by a measured benchmark, not asserted.
- Bug surface shifts from "wrong code in `mci.js`" to "wrong rule docs in Mongo". Mitigation: Ajv validation, the test harness (RDE-1), Sally's preview panel (RDE-4), and the cyclic-reference schema check.
- Onboarding a new ST now requires understanding the rules collections, not just reading code comments. Mitigation: each rule doc carries a `notes` field for the *why*, surfaced in the editor.
- Rule docs become a coupling point between data and code. Renaming an auto-created merit's name in code requires a paired migration script. Documented above.

### Neutral

- The number of Mongo collections grows from six to eight in the catalogue (added: `rule_speciality_grant`, `rule_status_floor`). Acceptable.
- Some rule families have only one or two members at launch (e.g. `rule_disc_attr` has three rows). The collection-per-family choice still pays off because the shape is distinct.

## Out of scope

- Player-side rule editing. Rules collection is ST-only at the API level.
- Versioning of rule docs (audit trail of rule changes). Future ADR if needed.
- Rule import/export from CSV/JSON. Future story if STs request it.
- Cross-rule conflict detection beyond phase-2 same-source-same-tier dedup. Editor preview panel surfaces the *result* of conflicts; structural detection is deferred.
- The bonus-dot audit's coverage of `bonus` field manual stepping (`adjAttrBonus`, `adjSkillBonus`) stays as ST manual override and is not migrated to the rule engine. It's not a rule, it's an override channel. Manual `bonus` is visible to rule evaluators (per Trait-Reference Primitive) — this is intentional.
- Mandragora Garden rating. MG's `rating` is not a simple sum and the rule engine treats MG as opaque. A dedicated migration story for MG, post-RDE-15, is allowed but not scheduled.

## Recorded dissents

Captured for the record (per Decision Driver #6: determinism over implicit consensus):

- **Sally (UX) flagged** the editor IA risk of eight collections being too many sidebar entries. Mitigation accepted: editor groups them into three sections (Grants, Modifiers, Tables) in the left rail, not eight separate entries.
- **Quinn (QA) flagged** that snapshot fixtures lock in current behaviour. Resolution: RDE-1 mandates audit triage (fix-before-snapshot vs preserve-as-bug-for-bug). Accepted unanimously.
- **Amelia (Dev) flagged** that PT may be too self-contained to validate the contract for cross-character families. Resolution: RDE-12 (Safe Word) and RDE-13 (OTS) carry explicit phase-3 and phase-5 validation responsibilities. Accepted; ordering of remaining families follows.
