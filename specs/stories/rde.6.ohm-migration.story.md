---
title: 'Oath of the Hard Motherfucker migration — multi-target grants and 9-Again'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
recommended_model: 'opus — four distinct grant effects + pact lifecycle + auto-create / auto-remove of FHP merit'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** OHM is a pact (lives in `c.powers`, not `c.merits`) that grants four distinct effects when present: +1 free Contacts, +1 free Resources, +1 free chosen-Allies-sphere, auto-grant of Friends in High Places merit, and 9-Again on chosen skills. Per-character data: `ohm_allies_sphere` (chosen sphere) and `ohm_skills` (chosen skill list). Migration must preserve the auto-FHP behaviour AND the auto-removal when the pact disappears.

**Approach:** Seed three `rule_grant` rows (Contacts, Resources, Allies-with-character-sphere-qualifier), one `rule_grant` row with `grant_type: 'merit'` and `condition: 'pact_present'` for FHP, and one `rule_nine_again` row referencing `c.powers[].ohm_skills`. Evaluator handles the pact-present condition by checking `c.powers` for an OHM entry. Auto-removal of FHP when pact absent stays in code (it's lifecycle, not a grant rule) but is captured under a guard test.

## Boundaries & Constraints

**Always:**
- OHM lives in `c.powers` array with `category: 'pact'`, `name: 'Oath of the Hard Motherfucker'` (case-insensitive). Evaluator checks via `c.powers.find(...)`.
- `ohm_allies_sphere` matches the Allies merit by `area` field (case-insensitive, trim). The grant only fires if a matching Allies merit exists; do NOT auto-create Allies (different from FHP semantics).
- FHP auto-create uses `granted_by: 'OHM'` so it can be auto-removed when pact disappears.
- Auto-removal of OHM-granted FHP when pact absent stays in code in this story (it's a lifecycle hook, not a grant). Document the boundary clearly in the code comment.

**Ask First:**
- Whether the chosen-sphere reference uses a stable rule field or fully relies on the pact instance. Default: rule references "use pact's `ohm_allies_sphere`" via a sentinel value; evaluator resolves at apply time.

**Never:**
- Do not migrate other pacts in this story (Safe Word, Scapegoat are RDE-12 / RDE-13).
- Do not change FHP's category. It stays `general` per existing data.

## I/O & Edge-Case Matrix

| Pact present? | ohm_skills | ohm_allies_sphere | Other state | Expected |
|---|---|---|---|---|
| no | — | — | FHP exists with `granted_by: 'OHM'` | FHP removed, no grants applied |
| yes | [Brawl, Investigation] | "Police" | Allies (Police) merit exists | Contacts +1, Resources +1, Allies (Police) +1, FHP auto-created with `free_ohm: 1`, `_ohm_nine_again_skills` = {Brawl, Investigation} |
| yes | [] | "" | — | FHP auto-created, Contacts/Resources +1 each, no Allies grant, no 9-Again set |
| yes | [Brawl] | "Police" | Allies (Police) absent | Allies grant skipped silently; rest applies |

## Code Map

- `public/js/editor/mci.js:232-276` — legacy OHM block.
- `public/js/editor/rule_engine/` — RDE-3 pattern.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-ohm.js` (new) — five rule docs covering the four grants + 9-Again. Idempotent.
- [ ] `public/js/editor/rule_engine/ohm-evaluator.js` (new) — runs grants against `c`, branching on pact presence and per-character fields.
- [ ] `server/tests/ohm-parallel-write.test.js` (new) — I/O Matrix coverage, deep-equal snapshots.
- [ ] Flip: replace `mci.js:232-276` with evaluator call. Keep the auto-removal of stale FHP in code (with comment explaining why).
- [ ] RDE-4 editor populates with OHM rules under Merit Grants and 9-Again.

**Acceptance Criteria:**
- Given a character without the OHM pact who previously had FHP-via-OHM, when the evaluator runs, then FHP is removed.
- Given a character with the OHM pact and `ohm_skills: [Brawl, Investigation]`, when the evaluator runs, then `_ohm_nine_again_skills` contains both.
- Given the parallel-write test, when run, then all I/O Matrix scenarios deep-equal.

## Verification

**Commands:**
- `cd server && npx vitest run ohm-parallel-write` — green.

**Manual checks:**
- Spot-check an OHM-bearing character; verify FHP, free dots, and 9-Again render identically pre/post flip.
- Remove the OHM pact in admin, save, reload — confirm FHP-via-OHM disappears.
