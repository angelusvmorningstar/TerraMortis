---
title: 'Test harness for applyDerivedMerits — captures every observable side-effect'
type: 'test'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.0.legacy-migration-cleanup.story.md
  - specs/design/rules-engine-adversarial-revision.md
---

## Intent

**Problem:** `public/js/editor/mci.js applyDerivedMerits` is the source of truth for ten-plus rule families that affect every character sheet, and it has zero automated test coverage. Per ADR-001 the rules engine migration uses a parallel-write contract: legacy code path and new evaluator must produce equal character snapshots. That contract is impossible to enforce without a snapshot harness. This story builds the harness so every subsequent migration story has a regression net waiting for it.

**Approach:** Add a Vitest test file that runs `applyDerivedMerits` against curated fixture characters and asserts a snapshot of every observable side-effect (`free_*` deltas on merits, `_pt_*` / `_mci_*` / `_ohm_*` ephemeral sets, `_grant_pools` array, `_*_free_specs` arrays, `_ots_*` numbers, auto-created merits, bloodline-applied specs). Build a fixture factory that constructs characters with bonus dots already on the targeted trait, so future migrations cannot regress to inherent-only reads (the persistent bug class). Triage the bonus-dot audit's findings before snapshotting so today's bugs aren't locked in as the contract.

**Dependency:** RDE-0 must land first. The harness snapshots `applyDerivedMerits` *after* legacy migration cruft has been excised. Snapshotting before RDE-0 would capture migration behaviour as if it were rule behaviour, locking us into running it forever.

## Boundaries & Constraints

**Always:**
- Snapshot all ephemeral fields written by `applyDerivedMerits`: `_pt_nine_again_skills`, `_pt_dot4_bonus_skills`, `_mci_dot3_skills`, `_ohm_nine_again_skills`, `_grant_pools`, `_mci_free_specs`, `_bloodline_free_specs`, `_ots_covenant_bonus`, `_ots_free_dots`. Sets are normalised to sorted arrays for stable comparison.
- Snapshot all `free_*` fields on every merit: `free`, `free_bloodline`, `free_pet`, `free_mci`, `free_vm`, `free_lk`, `free_ohm`, `free_inv`, `free_pt`, `free_mdb`, `free_sw`. Plus `m.rating` post-sync.
- The harness deep-clones every fixture character before invoking `applyDerivedMerits`. Legacy code mutates in place; fixtures must not bleed mutation between test cases.
- Auto-created merits are compared by the `(name, granted_by, qualifier)` triple, not by `_id`. The harness's normalisation strips ephemeral `_id` differences. (See ADR-001 §Auto-created merit lifecycle.)
- Fixture factory must produce a character with at least one targeted trait carrying `dots > 0` AND a bonus source (e.g. Strength `dots: 2, bonus: 1`; Brawl `dots: 2, bonus: 1`; merit with `cp: 2, free_bloodline: 1`).
- Fixture factory supports multi-character `allChars` setups for cross-character families. `buildFixturePair({lead, partner})` returns two characters with optional pact references between them.
- Snapshot output is deterministic (sorted keys, sorted set members, normalised auto-created merits) so deep-equal works.
- Test file lives under `server/tests/` per existing convention even though the function under test is client-side; this allows the same harness to wrap future server-side rule evaluators.
- **Audit-finding triage table** (see §Audit triage) is committed alongside the harness. Every finding from the bonus-dot audit is classified `fix-before-snapshot` or `preserve-as-bug-for-bug` with rationale. `fix-before-snapshot` items land as separate commits before this harness's snapshots are captured.

**Ask First:**
- Whether snapshot fixtures should live in committed JSON files or be built inline in test factories. Factory recommended for now; commit fixtures only if they grow past one or two pages.
- Whether the audit triage decisions need explicit user sign-off per finding before snapshot capture. Default: list findings + classification, request user review of the table, proceed once approved.

**Never:**
- Do not modify `applyDerivedMerits` rule logic in this story. RDE-0 has already excised migration cruft; this story is capture-only over what remains.
- Do not introduce snapshot files for character data that could go stale silently — assertions are computed inline.
- Do not depend on real character data from `tm_suite`. Fixtures are synthesised in code.

## Audit triage

The bonus-dot audit (in-conversation, 2026-04-28) found behaviours in `applyDerivedMerits` that warrant explicit classification before snapshotting. Two labels:

- **fix-before-snapshot**: bug. Fix lands as a discrete commit; snapshot captures corrected behaviour.
- **preserve-as-bug-for-bug**: legacy quirk preserved through migration. Documented in the per-family migration story under "Known preservations". Removal proposed by a follow-up story, not silently during migration.

The triage table below is part of this story's deliverable. Each row links to the audit transcript line and a rationale. **The dev should not start writing snapshots until the triage table is reviewed and approved.**

| Audit finding | Code location | Classification | Rationale | Owner |
|---|---|---|---|---|
| (populate from the 2026-04-28 audit transcript) | `mci.js:LINE` | TBD | TBD | TBD |
| ... | ... | ... | ... | ... |

If the audit transcript is not at hand, the dev opens the in-conversation audit log, transcribes findings into this table, and pings the user before proceeding.

## I/O & Edge-Case Matrix

| Scenario | Input fixture | Snapshot must include |
|---|---|---|
| Plain vampire, no merits | minimal char with attributes/skills only | empty `_pt_*`, empty `_mci_*`, no `_grant_pools` |
| Character with PT rating 4, asset skills set | merit `Professional Training` with rating 4, asset_skills, dot4_skill | `_pt_nine_again_skills` populated, `_pt_dot4_bonus_skills` populated, Contacts merit auto-created with `free_pt: 2` |
| Character with MCI rating 5, mixed tier choices | MCI with `dot1_choice='speciality'`, `dot3_choice='skill'`, `dot5_choice='advantage'` | `_mci_free_specs` has dot1 entry, `_mci_dot3_skills` has dot3, `_grant_pools` has MCI pool with correct amount |
| Character with bonus dots on targeted trait | Strength `dots:2, bonus:1`, PT references Strength-derived attribute | rules that read effective Strength see 3, not 2 |
| Character with bloodline grant | Daeva (or whichever has `BLOODLINE_GRANTS`) | bloodline merit auto-created with `free_bloodline: 1`, spec pushed onto skill, `_bloodline_free_specs` populated |
| Character with OHM pact | `c.powers` includes OHM pact with skills + sphere | Friends in High Places auto-created (with stable `(name, granted_by, qualifier)` triple), Contacts/Resources/chosen Allies have `free_ohm: 1`, `_ohm_nine_again_skills` populated |
| Character with K-9 fighting style | `fighting_styles` has K-9 with rating ≥ 1 | Retainer (Dog) auto-created with `free_pet: 1`, `granted_by: 'K-9'`, stable triple |
| Multi-character: Safe Word pact between two chars | `buildFixturePair({lead, partner})` with SW pact | each character's `free_sw` reflects partner's pact-relevant merits |
| Multi-character: MDB-via-partner | pair with Mentor merit on partner | lead's MDB grants reflect partner's mentor rating |
| Same-source dedup | two `rule_grant`-equivalent code branches that would grant the same target | snapshot shows single grant, not double |
| Auto-created merit identity stability | run `applyDerivedMerits` twice in succession | second run does not duplicate FHP / Retainer / bloodline merits; `(name, granted_by, qualifier)` triple is stable |

## Code Map

- `public/js/editor/mci.js` — `applyDerivedMerits`, post-RDE-0 (rule logic only). Read-only for this story.
- `public/js/data/accessors.js` — effective vs inherent accessors; fixture factory must understand the schema shape.
- `public/js/data/constants.js` — `BLOODLINE_GRANTS`, `CLAN_DISCS`, `BLOODLINE_DISCS` for fixture building.
- `server/tests/helpers/test-app.js` — existing test scaffolding; new file follows same import patterns.
- `server/vitest.config.js` — runs `setupFiles: ['./tests/helpers/setup-env.js']`; harness inherits this.

## Tasks & Acceptance

**Execution:**
- [ ] **Audit triage step.** Populate the triage table above with every finding from the 2026-04-28 audit. Assign each to `fix-before-snapshot` or `preserve-as-bug-for-bug` with one-sentence rationale. Pause for user review before proceeding.
- [ ] Land any `fix-before-snapshot` corrections as separate commits.
- [ ] `server/tests/helpers/apply-derived-merits-snapshot.js` (new) — exports `snapshotCharacter(c)` returning a deterministic plain object covering every ephemeral field and all `free_*` deltas. Sorted keys, sorted set-to-array, auto-created merits keyed by `(name, granted_by, qualifier)` triple (strip `_id`). Plus `buildFixtureCharacter(overrides)` and `buildFixturePair({lead, partner})` factories.
- [ ] `server/tests/apply-derived-merits-harness.test.js` (new) — Vitest cases covering each scenario in the I/O Matrix. Each test deep-clones the fixture, imports `applyDerivedMerits` via a thin server-side re-export of the client function, runs it, calls `snapshotCharacter`, asserts deep-equal to inline expected.
- [ ] Resolve client-side import path for `applyDerivedMerits`. Add a thin server-side re-export at `server/lib/rule_engine/_legacy-bridge.js` that re-imports the client module. This is the only file outside `server/tests/` permitted to touch client code; it carries an `// inherent-intentional: legacy bridge for parallel-write only` marker and is removed after the final family migrates.
- [ ] Document the fixture pattern in a top-of-file comment so RDE-3+ migration stories can copy it without rediscovering. Include the deep-clone, normalisation, and auto-created-merit-triple conventions explicitly.
- [ ] Add a regression test that calls `applyDerivedMerits` twice on the same fixture and asserts the second-run snapshot equals the first (idempotency / no duplicate auto-created merits).

**Acceptance Criteria:**
- Given the audit triage table is populated and approved, when `fix-before-snapshot` items are landed, then the harness's snapshots reflect corrected behaviour, not legacy bugs.
- Given a fresh fixture character with no merits, when `applyDerivedMerits` runs, then the snapshot is empty of all rule-derived fields.
- Given a fixture with PT rating 4 and asset skills set, when the harness runs, then the snapshot shows Contacts auto-created with `free_pt: 2`, `_pt_dot4_bonus_skills` includes the chosen skill, and `_pt_nine_again_skills` includes all asset skills.
- Given any rule fixture targeting a trait, when the trait carries `dots > 0` AND a bonus component, then the rule's effect fires at the effective threshold (not the inherent-only one).
- Given a multi-character fixture pair, when `applyDerivedMerits` runs against the lead, then partner-dependent grants reflect partner state correctly.
- Given the harness runs `applyDerivedMerits` twice in succession on the same fixture, when snapshots are compared, then they are deep-equal (no merit duplication, no ephemeral leak).
- Given the harness file, when `npx vitest run apply-derived-merits-harness` runs, then all scenarios pass.

## Verification

**Commands:**
- `cd server && npx vitest run apply-derived-merits-harness` — expected: all scenarios pass.
- `cd server && npx vitest run` — expected: full suite remains green.

**Manual checks:**
- Open the test file. Each scenario reads as a self-contained example: build fixture → deep-clone → run → assert normalised snapshot. A future contributor adding a new rule family can copy any one scenario as a template.
- Triage table reviewed and signed off by the user before snapshot capture.

## Design Notes

The cross-boundary import (server tests calling client code) is unusual but justified: `applyDerivedMerits` will continue to exist on the client during the parallel-write window, and the harness must run the same code that ships to the browser. A thin server-side bridge that re-exports the function is the cleanest option — keeps test imports consistent with existing patterns and avoids any build-tool gymnastics. The bridge is the *only* permitted exception to the rule-engine grep contract; it carries the marker comment and is removed when the final family migrates.

The fixture factory pattern matters more than any individual scenario. RDE-3 onward will copy it. Make the factory ergonomic: `buildFixtureCharacter().withPT({rating: 4, assetSkills: ['Brawl', 'Stealth']}).withTrait('Strength', {dots: 2, bonus: 1})`. Pair-fixture chaining: `buildFixturePair().withSafeWordPactBetween('lead', 'partner')`.

Normalisation of auto-created merits by triple instead of `_id` matters: the new evaluators in RDE-3+ may construct merits with fresh `_id`s while the legacy path may preserve `_id` from a previous render. The harness must not flag this as a difference; ADR-001 declares the triple to be the identity.
