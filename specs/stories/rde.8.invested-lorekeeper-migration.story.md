---
title: 'Invested + Lorekeeper migration — Status-pool grant pattern'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
recommended_model: 'opus — pool semantics across two merits with different amount_basis sources; partner-merit references'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** Two merits with the same shape: a Status-driven pool of free dots that the user allocates across a fixed list of target merit names. **Invested** (Invictus): pool size = Invictus Status dots, targets Herd / Mentor / Resources / Retainer. **Lorekeeper**: pool size = function of merit rating, targets Herd / Retainer. Both surface as a `_grant_pools` entry that the editor renders for user allocation.

**Approach:** Both follow the `rule_grant` shape with `grant_type: 'pool'` and a `pool_targets` array. Pool size driven by `amount_basis: 'rating_of_partner_merit'` (Invested → Invictus Status) or `amount_basis: 'rating_of_source'` (Lorekeeper). Evaluator computes pool size and pushes a `_grant_pools` entry. Allocation logic (`free_inv`, `free_lk` on individual merits) is character data and stays as-is.

## Boundaries & Constraints

**Always:**
- Per-merit `free_inv` / `free_lk` allocations stay on the target merit instances. Character data, not rule data.
- Pool computation uses effective rating of the source/partner merit (not inherent only).
- Each pool entry in `_grant_pools` retains its existing shape: `{source, name, names, category, amount}`.
- Both rules use `grant_type: 'pool'` with a `pool_targets` field listing eligible merit names.

**Ask First:**
- Whether to use `amount_basis: 'rating_of_partner_merit'` with a `partner_merit_name` field, or to introduce a generic expression DSL. Default: explicit field, not DSL. ADR rejected DSL.

**Never:**
- Do not migrate `Mother-Daughter Bond` here (RDE-11). MDB has different semantics (free_mdb on style, not a pool).
- Do not migrate `Viral Mythology` here (RDE-10). VM is similar but Allies-only and has a half-dot bonus mechanic that warrants its own story.

## I/O & Edge-Case Matrix

| Source merit | Other state | Expected pool entry |
|---|---|---|
| Invested rating 3, Invictus Status 4 | — | `{source: 'Invested', names: ['Herd', 'Mentor', 'Resources', 'Retainer'], category: 'inv', amount: 4}` |
| Invested without Invictus Status | — | no pool (`hasInvested` returns false OR pool size 0) |
| Lorekeeper rating 3 | — | pool size per `lorekeeperPool(c)` formula |
| No source merit | — | no pool entry |

## Code Map

- `public/js/editor/mci.js:329-340` — Invested grant pool block.
- `public/js/editor/mci.js:355-366` — Lorekeeper grant pool block.
- `public/js/editor/domain.js` — `hasInvested`, `investedPool`, `hasLorekeeper`, `lorekeeperPool`. These helpers are referenced; confirm whether they stay or move into the evaluator.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-invested-lorekeeper.js` (new) — two `rule_grant` docs (one per source). Idempotent.
- [ ] `public/js/editor/rule_engine/pool-evaluator.js` (new) — generic pool evaluator, used by both Invested and Lorekeeper. Reads pool rules, computes amount via the chosen basis, pushes `_grant_pools` entry.
- [ ] `server/tests/pool-parallel-write.test.js` (new) — covers Invested + Lorekeeper I/O Matrix. Deep-equal.
- [ ] Flip: replace `mci.js:329-340` and `mci.js:355-366` with evaluator calls.
- [ ] RDE-4 editor: pool rules visible under Merit Grants with a `pool` filter or a separate sub-list. Editor exposes `pool_targets` as a multi-pick.

**Acceptance Criteria:**
- Given an Invested + Invictus Status 4 character, when the evaluator runs, then `_grant_pools` contains the Invested entry with `amount: 4`.
- Given a Lorekeeper character, when the evaluator runs, then `_grant_pools` contains the Lorekeeper entry sized per the existing formula.
- Given the parallel-write test, when run, then snapshots deep-equal across both source merits.

## Verification

**Commands:**
- `cd server && npx vitest run pool-parallel-write` — green.

**Manual checks:**
- Spot-check an Invested character; verify allocation UI continues to show the same pool size pre/post flip.
- Edit the rule's `pool_targets` to add a fifth target; verify the editor allows allocation to it on a real character.
