---
title: 'Oath of the Safe Word migration — bidirectional partner shared-merit mirror'
type: 'refactor'
created: '2026-04-28'
status: 'complete'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** Safe Word is a pact (lives in `c.powers`) that grants a mirrored copy of the partner's chosen `shared_merit`. Both characters must have the pact pointing at each other for the grant to fire. Resolves the partner's effective merit rating (excluding `free_sw` to prevent circular reference) and writes `free_sw` on the mirrored merit on this character.

**Approach:** One `rule_grant` doc with `grant_type: 'merit'`, `condition: 'pact_present_with_partner_confirmation'`, `amount_basis: 'rating_of_partner_merit_minus_free_sw'`. Evaluator implements the bidirectional check. Auto-removal of stale Safe-Word merits when the pact lapses stays in code (lifecycle).

## Boundaries & Constraints

**Always:**
- Bidirectional check preserved: both characters must have OSW pact pointing at each other.
- `free_sw` excluded from the partner-rating sum to prevent infinite recursion (preserves existing line 301-303 behaviour).
- Auto-create of mirrored merit with `granted_by: 'Safe Word'` preserved.
- Auto-removal when pact lapses stays in code with comment, not in evaluator.

**Ask First:**
- Whether the rule should reference `'partner_pact_confirmation'` as a generic condition value or define a Safe-Word-specific condition. Default: generic condition with documentation; Safe Word becomes a precedent for any future bidirectional pacts.

**Never:**
- Do not propagate the rating recursively beyond one hop. Existing one-hop semantics preserved.

## I/O & Edge-Case Matrix

| Char A | Char B | Expected on A |
|---|---|---|
| OSW pointing at B, shared_merit "Resources" | OSW pointing at A, B's Resources rating 4 | A's mirrored Resources merit `free_sw: 4` |
| OSW pointing at B | B has no OSW pact | no grant on A |
| OSW pointing at B | B's OSW points at someone else | no grant (mutual pointing required) |
| OSW pact removed mid-cycle | — | A's mirrored merit `free_sw: 0`, removed by cleanup hook if no other dots |

## Code Map

- `public/js/editor/mci.js:278-327` — legacy Safe Word block.
- `public/js/editor/rule_engine/` — pattern.

## Tasks & Acceptance

**Execution:**
- [x] `server/scripts/seed-rules-safe-word.js` — one `rule_grant` doc.
- [x] `public/js/editor/rule_engine/safe-word-evaluator.js` — replaces legacy. Takes `allChars` (already passed to `applyDerivedMerits`) for partner lookup.
- [x] `server/tests/safe-word-parallel-write.test.js` — I/O Matrix. Deep-equal. Test fixture with two characters.
- [x] Flip: replace `mci.js:278-327`.

**Acceptance Criteria:**
- Given two characters with mutual OSW pacts and B's Resources rating 4, when evaluator runs against A, then A's mirrored Resources `free_sw: 4`.
- Given B has no OSW pact, when evaluator runs against A, then no Safe-Word grant on A.

## Verification

**Commands:**
- `cd server && npx vitest run safe-word-parallel-write` — green.

**Manual checks:**
- Spot-check two characters with the OSW pact (if any pair exists in production); verify mirrored merit dots identical pre/post flip.
