---
id: ADR-001
title: 'Editable rules engine for character-affecting hardcoded rules'
status: accepted
date: 2026-04-28
author: Angelus (with party-mode discussion: John PM, Winston Architect, Sally UX, Quinn QA, Bob SM, Amelia Dev)
supersedes: null
related:
  - specs/architecture.md (project architecture, brownfield)
  - public/js/editor/mci.js (current source of truth for rule evaluation)
  - public/js/data/accessors.js (effective vs inherent accessors)
---

# ADR-001 — Editable rules engine schema

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

All currently hardcoded. Editing any of them today requires a code change, commit, push, and Render redeploy. The TM Suite is two months old, in active rules-design phase, and the user (Angelus) confirms that rule churn is part of the next year's design loop, not an occasional errata patch.

This ADR captures the schema decision for migrating these rules from code to a Mongo-backed, ST-editable representation.

## Decision drivers

1. **ST sovereignty over rules.** Every hardcoded rule that affects a character sheet must be editable from the admin Engine panel. No rule is exempt because it's "structurally specific" or "rarely changed". If it's hardcoded today, it's a candidate for migration.
2. **Effective-rating discipline.** The persistent bug class in this codebase is calculations silently ignoring bonus dots. The schema must not expose an inherent-only rating primitive to rule evaluators. Rule docs reference traits by name and trust the resolver to call effective accessors (`getAttrEffective`, `skTotal`, `m.rating` after sync).
3. **Display invariants stay.** Hollow-dot rendering (`● = inherent (cp+xp)`, `○ = derived (free_*)`) via `shDotsWithBonus` (`public/js/editor/sheet.js:507`) is unchanged. Migration is a back-end refactor; sheet visuals are out of scope.
4. **Live-game safety.** TM Suite hosts an active 30-player monthly LARP. Migration cannot regress the production sheet. Each rule family is migrated under a parallel-write contract before the legacy code path is removed.
5. **Pace.** User explicitly rejected an eight-to-ten-week estimate. Realistic horizon (per Amelia's code-grounded estimate): three to four sessions for the PT pilot end-to-end, then one to two hours per subsequent rule family. The schema must support that velocity.

## Options considered

### A. Polymorphic single collection (`rules_engine`)

One Mongo collection. Each doc carries a `rule_type` discriminator and a polymorphic `payload` shaped per type.

- **Pros.** Single backing store. Adding a new rule type is "add a new discriminator value" with no Mongo migration. Easy to dump/restore as one corpus.
- **Cons.** Shape validation requires discriminated-union schemas in Ajv, adding dependency complexity. Every query for "all PT rules" walks past every other rule type. UI maps awkwardly: one editor screen has to render forms for every type. Mongo doesn't enforce shape per discriminator, so a malformed doc silently corrupts only one rule family but is invisible until rendered.

### B. Typed-per-family collections (`rule_grant`, `rule_skill_bonus`, etc.)

One Mongo collection per rule family. Each collection has its own JSON Schema.

- **Pros.** Each family validated independently with a flat Ajv schema (matches existing patterns in `server/schemas/`). Queries are direct: `db.rule_grant.find({source: 'PT'})` returns exactly what you want. Editor UI maps cleanly: one collection per editor screen, one form shape per screen. Adding a new family is a new collection plus a new editor view, no impact on existing families.
- **Cons.** More collections (six to ten). Cross-family queries (e.g. "everything affecting PT") need `Promise.all` over multiple finds. New rule shapes that don't fit existing collections require a new collection rather than just a new discriminator value.

### C. Full data-driven rule engine with a tiny DSL

Declarative expression language stored as JSON. Rule evaluator is a generic interpreter.

- **Pros.** Maximum flexibility. Any future rule shape expressible without schema migration.
- **Cons.** Six-plus weeks to design and test the DSL. High regression risk on a live game. Editor UI now needs to be a code editor, defeating the ST sovereignty goal (STs would be writing JSON-LISP, not clicking forms).

## Decision

**Option B: Typed-per-family collections.**

The clean separation of shape per family aligns with the existing `server/schemas/` validation pattern and the proposed editor IA (one collection per left-rail entry). The "more collections" downside is cosmetic: six to ten Mongo collections is well within tolerance for a project that already runs `characters`, `territories`, `downtime_cycles`, `downtime_submissions`, `game_sessions`, `tracker_state`, `npcs`, `relationships`, `npc_flags`, `archive_documents`, `rules`, etc.

Option C is rejected as scope-overshoot relative to user pace.

Option A is rejected because the per-family Ajv schema simplicity dominates the cross-family-query convenience, and because UI legibility ("the editor screen for PT rules") is a first-class concern.

### Rule type catalogue

Initial six collections. Names in `snake_case` matching existing convention.

| Collection | Holds | Example sources |
|---|---|---|
| `rule_grant` | Per-tier or unconditional grants of merit dots from a source merit/oath/style. Includes auto-created merits. | PT dot 1 (2 Contacts), MCI all tiers, OHM (Contacts/Resources/Allies/FHP), Lorekeeper, Invested, VM, MDB, Safe Word, K-9/Falconry, Bloodline merits |
| `rule_skill_bonus` | +N dots to a skill, capped at 5. | PT dot 4, MCI dot 3 |
| `rule_nine_again` | 9-Again grants on skills. | PT dot 2 (asset skills), OHM (chosen skills) |
| `rule_disc_attr` | Discipline rating contributes to a target attribute or derived stat. | Vigour→Strength, Resilience→Stamina, Celerity→Speed, Celerity→Defence |
| `rule_derived_stat_modifier` | Flat or computed modifier on a derived stat from a merit's presence/rating. | Giant (+1 Size), Fleet of Foot (+rating Speed), Defensive Combat (Athletics → chosen skill in Defence calc) |
| `rule_tier_budget` | Tier-indexed budget tables. | MCI tier budgets `[0,1,1,2,3,3]`, PT pool sizes if any |

OTS covenant-status floor and OTS free-style-dots multiplier may live in `rule_derived_stat_modifier` or a dedicated `rule_status_floor` collection. Decision deferred to OTS migration spec.

Free specialisation grants (MCI dot 1, bloodline specs) live in `rule_grant` with `grant_type: 'speciality'`; the form for that grant type collects skill plus spec text.

## Consequences

### Positive

- Every hardcoded rule becomes ST-editable through the admin UI once its family migrates.
- Rule changes no longer require a code deploy. A house-rule errata becomes a Mongo doc edit.
- Per-family Ajv schemas catch malformed rule docs at the API boundary, not at sheet render.
- The `rule_grant` collection becomes a single auditable source for "what does this character get for free, and why".

### Negative

- The runtime cost of `applyDerivedMerits` increases: it now reads from six collections per character render instead of executing in-memory branches. Mitigation: a single `rule_engine_loadAll()` call cached per request resolves this; the collections are small (estimated total <500 docs at full coverage).
- Bug surface shifts from "wrong code in `mci.js`" to "wrong rule docs in Mongo". Mitigation: Ajv validation, the test harness (below), and Sally's preview panel (in the editor UI ADR, not yet written).
- Onboarding a new ST now requires understanding the rules collections, not just reading code comments. Mitigation: each rule doc carries a `notes` field for the *why*, surfaced in the editor.

### Neutral

- The number of Mongo collections grows. Acceptable.
- Some rule families have only one or two members at launch (e.g. `rule_disc_attr` has three rows). The collection-per-family choice still pays off because the shape is distinct.

## Effective-rating contract (non-negotiable)

The schema does not expose a primitive that lets a rule evaluator accidentally read inherent-only when it wanted effective.

**Vocabulary lock:**

- Rule docs use `rating`, `effective_rating`, `dots_total`, never `dots` alone.
- A rule referencing "Strength ≥ 3" reads `getAttrEffective(c, 'Strength') >= 3`. The runtime resolver enforces this; the rule doc never says how it's computed.
- A rule referencing "PT rating ≥ 4" reads `m.rating` (already effective via `applyDerivedMerits` line 424 sum: `free_bloodline + free_pet + free_mci + free_vm + free_lk + free_ohm + free_inv + free_pt + free_mdb + free_sw + cp + xp`).
- Inherent-only accessors (`getAttrVal`, `skDots`, `m.cp`, `m.xp`) get JSDoc warnings: `"DO NOT use for rule evaluation. Inherent only — for XP cost calc and CP audit only."`.

**Enforcement:**

A Grep contract test in `server/tests/` fails CI if any file under `server/lib/rule_engine/` matches `getAttrVal\b|skDots\b` without an explicit `// inherent-intentional: <reason>` marker comment. Cheap, self-documenting, prevents AI or human regression.

## Parallel-write migration contract

For each rule family, migration follows this contract:

1. **Capture current behaviour.** Write a Vitest fixture covering every observable side-effect of the family's existing code path (merit `free_*` deltas, ephemeral set memberships like `_pt_dot4_bonus_skills`, derived stat changes). Fixture characters must include at least one targeted trait with both `dots > 0` AND a bonus source set.
2. **Write rule docs.** Insert the family's rules into the new typed collection. One rule per existing code branch.
3. **Write the new evaluator.** Add the family's evaluator function. It reads from the new collection and applies grants identically.
4. **Parallel-write assertion.** A test runs both the legacy code path and the new evaluator against each fixture character. The two resulting character snapshots are deep-equal. Fail = blocked migration.
5. **Flip.** Once parallel-write tests are green across all fixtures and a manual sanity check on three real production characters passes, the legacy code branch is deleted.
6. **Editor UI.** The admin editor view for this family ships in the same story or the next.

The parallel-write code is **test-only scaffolding**, not a production feature flag. Production runs whichever path is currently designated source of truth (legacy at start, new evaluator after flip). No long-lived dual-write code in production.

## Implementation plan

Stories, in order (RDE = "Rules Data Engine"):

- **RDE-1** Test harness for `applyDerivedMerits`. Snapshot helper that captures every observable side-effect (`free_*` on merits, `_pt_*`, `_mci_*`, `_grant_pools`, `_*_free_specs`, etc.). Reusable fixture builder for "character with bonus on targeted trait". Vitest-based.
- **RDE-2** Schema design follow-up. JSON Schema files under `server/schemas/rules/` for each of the six collections. Validation wired into the API CRUD routes for rule docs. (This ADR defines the catalogue; RDE-2 pins field-level shape per collection.)
- **RDE-3** PT migration. Parallel-write contract executed end-to-end. PT is the messiest family (three dot-tier grants, asset skill array, two ephemeral sets, plus `free_pt`). If PT migrates cleanly, the rest will. Once green and flipped, the PT block in `mci.js:184-216` is deleted.
- **RDE-4** PT editor UI. Admin Engine sidebar entry "Rules Data". Left rail: *Merit Grants*, *Skill Bonuses*, *9-Again*, *Discipline → Attribute*, *Derived Stat Modifiers*, *Tier Budgets*. PT is reachable under Merit Grants. Side-panel form per rule, validation surfaced inline, house-rule note textarea, preview panel showing a real character before/after.
- **RDE-5+** Each remaining rule family, one story each. Use PT as the template. Order roughly by surface area: MCI, OHM, Bloodline grants, Invested, Lorekeeper, MDB, VM, Safe Word, K-9/Falconry, OTS, then the simpler discipline-attr / derived-stat-modifier / tier-budget families.

After the final family migrates, `mci.js applyDerivedMerits` is reduced to a single call into the rule engine, and the per-family branches are gone.

## Out of scope

- Player-side rule editing. Rules collection is ST-only at the API level.
- Versioning of rule docs (audit trail of rule changes). Future ADR if needed.
- Rule import/export from CSV/JSON. Future story if STs request it.
- Cross-rule conflict detection (e.g. two rules granting Contacts +1 to the same character). Editor preview panel surfaces the *result* of conflicts; structural detection is deferred.
- The bonus-dot audit's coverage of `bonus` field manual stepping (`adjAttrBonus`, `adjSkillBonus`) stays as ST manual override and is not migrated to the rule engine. It's not a rule, it's an override channel.
