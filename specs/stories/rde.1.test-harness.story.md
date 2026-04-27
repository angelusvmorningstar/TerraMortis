---
title: 'Test harness for applyDerivedMerits — captures every observable side-effect'
type: 'test'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
---

## Intent

**Problem:** `public/js/editor/mci.js applyDerivedMerits` is the source of truth for ten-plus rule families that affect every character sheet, and it has zero automated test coverage. Per ADR-001 the rules engine migration uses a parallel-write contract: legacy code path and new evaluator must produce equal character snapshots. That contract is impossible to enforce without a snapshot harness. This story builds the harness so every subsequent migration story has a regression net waiting for it.

**Approach:** Add a Vitest test file that runs `applyDerivedMerits` against curated fixture characters and asserts a snapshot of every observable side-effect (`free_*` deltas on merits, `_pt_*` / `_mci_*` / `_ohm_*` ephemeral sets, `_grant_pools` array, `_*_free_specs` arrays, `_ots_*` numbers, auto-created merits, bloodline-applied specs). Build a fixture factory that constructs characters with bonus dots already on the targeted trait, so future migrations cannot regress to inherent-only reads (the persistent bug class).

## Boundaries & Constraints

**Always:**
- Snapshot all ephemeral fields written by `applyDerivedMerits`: `_pt_nine_again_skills`, `_pt_dot4_bonus_skills`, `_mci_dot3_skills`, `_ohm_nine_again_skills`, `_grant_pools`, `_mci_free_specs`, `_bloodline_free_specs`, `_ots_covenant_bonus`, `_ots_free_dots`. Sets are serialised to sorted arrays for stable comparison.
- Snapshot all `free_*` fields on every merit: `free`, `free_bloodline`, `free_pet`, `free_mci`, `free_vm`, `free_lk`, `free_ohm`, `free_inv`, `free_pt`, `free_mdb`, `free_sw`. Plus `m.rating` post-sync.
- Fixture factory must produce a character with at least one targeted trait carrying `dots > 0` AND a bonus source (e.g. Strength `dots: 2, bonus: 1`; Brawl `dots: 2, bonus: 1`; merit with `cp: 2, free_bloodline: 1`).
- Snapshot output is deterministic (sorted keys, sorted set members) so deep-equal works.
- Test file lives under `server/tests/` per existing convention even though the function under test is client-side; this allows the same harness to wrap future server-side rule evaluators.

**Ask First:**
- Whether snapshot fixtures should live in committed JSON files or be built inline in test factories. Factory recommended for now; commit fixtures only if they grow past one or two pages.

**Never:**
- Do not modify `applyDerivedMerits` in this story. Capture-only.
- Do not introduce snapshot files for character data that could go stale silently — assertions are computed inline.
- Do not depend on real character data from `tm_suite`. Fixtures are synthesised in code.

## I/O & Edge-Case Matrix

| Scenario | Input fixture | Snapshot must include |
|---|---|---|
| Plain vampire, no merits | minimal char with attributes/skills only | empty `_pt_*`, empty `_mci_*`, no `_grant_pools` |
| Character with PT rating 4, asset skills set | merit `Professional Training` with rating 4, asset_skills, dot4_skill | `_pt_nine_again_skills` populated, `_pt_dot4_bonus_skills` populated, Contacts merit auto-created with `free_pt: 2` |
| Character with MCI rating 5, mixed tier choices | MCI with `dot1_choice='speciality'`, `dot3_choice='skill'`, `dot5_choice='advantage'` | `_mci_free_specs` has dot1 entry, `_mci_dot3_skills` has dot3, `_grant_pools` has MCI pool with correct amount |
| Character with bonus dots on targeted trait | Strength `dots:2, bonus:1`, PT references Strength-derived attribute | rules that read effective Strength see 3, not 2 |
| Character with bloodline grant | Daeva (or whichever has `BLOODLINE_GRANTS`) | bloodline merit auto-created with `free_bloodline: 1`, spec pushed onto skill, `_bloodline_free_specs` populated |
| Character with OHM pact | `c.powers` includes OHM pact with skills + sphere | Friends in High Places auto-created, Contacts/Resources/chosen Allies have `free_ohm: 1`, `_ohm_nine_again_skills` populated |
| Character with K-9 fighting style | `fighting_styles` has K-9 with rating ≥ 1 | Retainer (Dog) auto-created with `free_pet: 1`, `granted_by: 'K-9'` |

## Code Map

- `public/js/editor/mci.js:18-427` — `applyDerivedMerits`. Read-only for this story.
- `public/js/data/accessors.js` — effective vs inherent accessors; fixture factory must understand the schema shape.
- `public/js/data/constants.js` — `BLOODLINE_GRANTS`, `CLAN_DISCS`, `BLOODLINE_DISCS` for fixture building.
- `server/tests/helpers/test-app.js` — existing test scaffolding; new file follows same import patterns.
- `server/vitest.config.js` — runs `setupFiles: ['./tests/helpers/setup-env.js']`; harness inherits this.

## Tasks & Acceptance

**Execution:**
- [ ] `server/tests/helpers/apply-derived-merits-snapshot.js` (new) — exports `snapshotCharacter(c)` that returns a deterministic plain object covering every ephemeral field and all `free_*` deltas. Sorted keys, sorted set-to-array. Plus `buildFixtureCharacter(overrides)` that returns a minimal-valid character ready for `applyDerivedMerits`, with helpers for attaching merits, fighting styles, pacts, and traits-with-bonus-dots.
- [ ] `server/tests/apply-derived-merits-harness.test.js` (new) — Vitest cases covering each scenario in the I/O Matrix. Each test imports `applyDerivedMerits` (from `public/js/editor/mci.js` via relative import or a thin wrapper), runs it against a fixture, calls `snapshotCharacter`, asserts deep-equal to inline expected.
- [ ] Resolve client-side import path for `applyDerivedMerits`. Options: (a) add `"type": "module"` aware path alias, (b) thin server-side re-export, (c) symlink. Choose the lowest-friction option that does not require build tooling.
- [ ] Document the fixture pattern in a top-of-file comment so RDE-3+ migration stories can copy it without rediscovering.

**Acceptance Criteria:**
- Given a fresh fixture character with no merits, when `applyDerivedMerits` runs, then the snapshot is empty of all rule-derived fields.
- Given a fixture with PT rating 4 and asset skills set, when the harness runs, then the snapshot shows Contacts auto-created with `free_pt: 2`, `_pt_dot4_bonus_skills` includes the chosen skill, and `_pt_nine_again_skills` includes all asset skills.
- Given any rule fixture targeting a trait, when the trait carries `dots > 0` AND a bonus component, then the rule's effect fires at the effective threshold (not the inherent-only one).
- Given the harness file, when `npx vitest run apply-derived-merits-harness` runs, then all scenarios pass.

## Verification

**Commands:**
- `cd server && npx vitest run apply-derived-merits-harness` — expected: all scenarios pass.

**Manual checks:**
- Open the test file. Each scenario reads as a self-contained example: build fixture → run → assert snapshot. A future contributor adding a new rule family can copy any one scenario as a template.

## Design Notes

The cross-boundary import (server tests calling client code) is unusual but justified: `applyDerivedMerits` will continue to exist on the client during the parallel-write window, and the harness must run the same code that ships to the browser. A thin server-side wrapper that re-exports the function is the cleanest option — keeps test imports consistent with existing patterns and avoids any build-tool gymnastics.

The fixture factory pattern matters more than any individual scenario. RDE-3 onward will copy it. Make the factory ergonomic: `buildFixtureCharacter().withPT({rating: 4, assetSkills: ['Brawl', 'Stealth']}).withTrait('Strength', {dots: 2, bonus: 1})`.
