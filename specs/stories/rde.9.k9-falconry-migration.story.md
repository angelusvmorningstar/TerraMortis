---
title: 'K-9 + Falconry retainer auto-grant migration'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** Two fighting styles (`K-9`, `Falconry`) auto-create a Retainer merit with `area: 'Dog'` / `'Falcon'` and `free_pet: 1` when purchased at rating ≥ 1. Migration replaces the hardcoded list `_STYLE_RETAINER_GRANTS = ['K-9', 'Falconry']` and the auto-create block at `mci.js:163-182`.

**Approach:** Two `rule_grant` rows with `grant_type: 'merit'`, `target: 'Retainer'`, `target_qualifier: 'Dog'` / `'Falcon'`, `amount: 1`, `condition: 'fighting_style_present'` referencing the source style name. Evaluator iterates fighting-style rules, checks for style purchase, auto-creates the Retainer with `granted_by: <style>`.

## Boundaries & Constraints

**Always:**
- `granted_by` field on the auto-created Retainer matches the style name exactly (`K-9` / `Falconry`). Used by cleanup and by the editor to identify the source.
- Fighting style "purchase" check uses the same composite sum as legacy: `(cp + free + free_mci + free_ots + xp + up) >= 1`.
- Auto-cleanup of orphaned auto-Retainers when style is removed (line 165-167) stays in code as a lifecycle hook.

**Never:**
- Do not migrate other fighting style mechanics here. OTS is RDE-13; merit-style fighting is character data, not a grant.

## I/O & Edge-Case Matrix

| Style state | Existing Retainer | Expected |
|---|---|---|
| K-9 purchased, no Retainer (Dog) yet | — | Retainer (Dog) auto-created, `free_pet: 1`, `granted_by: 'K-9'` |
| K-9 purchased, existing Retainer (Dog) with `granted_by: 'K-9'` | already there | `free_pet` set to 1 (not stacked) |
| Falconry purchased | — | Retainer (Falcon) auto-created |
| K-9 unpurchased, existing auto-Retainer | exists | `free_pet` cleared to 0 (cleanup hook) |
| Both styles purchased | — | both Retainers auto-created |

## Code Map

- `public/js/editor/mci.js:163-182` — legacy block.
- `public/js/editor/rule_engine/` — pattern.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-style-retainers.js` — two `rule_grant` docs. Idempotent.
- [ ] `public/js/editor/rule_engine/style-retainer-evaluator.js` (new) — replaces auto-create logic. Cleanup of orphans stays in code with comment.
- [ ] `server/tests/style-retainer-parallel-write.test.js` — I/O Matrix. Deep-equal.
- [ ] Flip: replace `mci.js:163-182` (auto-create portion) with evaluator. Cleanup hook stays.
- [ ] RDE-4 editor: rules visible under Merit Grants; `condition: 'fighting_style_present'` form variant.

**Acceptance Criteria:**
- Given a character with K-9 ≥ 1 and no existing Retainer (Dog), when evaluator runs, then Retainer (Dog) auto-created with `free_pet: 1`.
- Given the same character after K-9 is removed, when evaluator runs, then `free_pet` on the auto-Retainer is 0.

## Verification

**Commands:**
- `cd server && npx vitest run style-retainer-parallel-write` — green.

**Manual checks:**
- Toggle K-9 purchase on a test character; verify Retainer (Dog) appears/clears appropriately.
