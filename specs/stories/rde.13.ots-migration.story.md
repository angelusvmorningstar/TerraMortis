---
title: 'Oath of the Scapegoat migration — covenant-status floor and free style dots'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** Oath of the Scapegoat (pact) does two things per OTS dot: contributes a covenant-status floor (`_ots_covenant_bonus`) and grants 2 free fighting-style dots per OTS dot (`_ots_free_dots`). User allocates the free dots into styles via `free_ots` field on each style.

**Approach:** Two rules. (a) `rule_derived_stat_modifier` with `target_stat: 'covenant_status'`, `mode: 'rating'` (or floor semantic — see Ask First). (b) `rule_grant` with `grant_type: 'pool'`, `pool_targets: 'fighting_styles'`, `amount_basis: 'rating_of_source_x2'`. Evaluator reads both rules, sets `_ots_covenant_bonus` and `_ots_free_dots`, clears stale `free_ots` on styles when pact absent.

## Boundaries & Constraints

**Always:**
- Pact rating computed as `(cp + xp)` per existing line 372 — pacts don't have `free_*` fields.
- Stale `free_ots` cleanup on absent pact preserved (line 376-379).
- `_ots_covenant_bonus` and `_ots_free_dots` retain their names and shapes for backwards compatibility with anywhere they're read.

**Ask First:**
- Whether covenant-status floor should be modelled as a `derived_stat_modifier` with a `floor_target: 'covenant_status'` field, or as a dedicated `rule_status_floor` collection. Default: extend `rule_derived_stat_modifier` with a `mode: 'floor'` value to keep the catalogue at six collections.

**Never:**
- Do not change OTS pact mechanics. Out of scope.
- Do not auto-allocate `free_ots` into styles. User manages allocation.

## I/O & Edge-Case Matrix

| OTS state | Expected |
|---|---|
| OTS pact rating 2 | `_ots_covenant_bonus: 2`, `_ots_free_dots: 4` |
| OTS pact absent | `_ots_covenant_bonus: 0`, `_ots_free_dots: 0`, all `free_ots` on styles cleared |
| OTS rating 0 | same as absent |

## Code Map

- `public/js/editor/mci.js:368-379` — legacy OTS block.
- Anywhere `_ots_covenant_bonus` is read (covenant-status calculation) — confirm scope; do not break consumers.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-ots.js` — two rule docs.
- [ ] `public/js/editor/rule_engine/ots-evaluator.js` — replaces legacy.
- [ ] `server/tests/ots-parallel-write.test.js` — I/O Matrix. Deep-equal.
- [ ] Flip: replace `mci.js:368-379`.

**Acceptance Criteria:**
- Given an OTS pact rating 2 character, when evaluator runs, then `_ots_covenant_bonus: 2`, `_ots_free_dots: 4`.
- Given OTS pact removed, when evaluator runs, then all `free_ots` on fighting styles are cleared.

## Verification

**Commands:**
- `cd server && npx vitest run ots-parallel-write` — green.

**Manual checks:**
- Spot-check an OTS-bearing character; covenant status and free style dots render identical pre/post flip.
