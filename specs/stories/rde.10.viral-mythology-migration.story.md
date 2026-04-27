---
title: 'Viral Mythology migration — Allies pool with half-dot bonus mechanic'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
  - specs/stories/rde.8.invested-lorekeeper-migration.story.md
---

## Intent

**Problem:** Viral Mythology (CotC merit) doubles Allies and Herd purchases and surfaces the bonus as half-dots (per memory `[Viral Mythology](reference_viral_mythology.md)`). Distinct enough from Invested/Lorekeeper to warrant its own story: VM has the half-dot rendering quirk and Allies-only target.

**Approach:** One `rule_grant` doc with `grant_type: 'pool'`, `pool_targets: ['Allies']`, `amount_basis` referencing VM's own pool computation (`vmAlliesPool(c)`). Evaluator pushes a `_grant_pools` entry with `category: 'vm'`. Half-dot rendering convention stays in display code (it's a sheet-render concern, not a rule).

## Boundaries & Constraints

**Always:**
- VM's half-dot rendering convention stays in `public/js/editor/sheet.js` (or wherever it lives). Out of scope for rule migration.
- `vmAlliesPool(c)` formula in `public/js/editor/domain.js` migrates into the evaluator (the rule's `amount_basis` resolves via that function).
- Allies-only target preserved.

**Never:**
- Do not change the half-dot display semantics. UX-affecting changes belong in a separate spec.
- Do not generalise to support Herd if current rule is Allies-only; preserve existing scope.

## I/O & Edge-Case Matrix

| VM state | Allies merit state | Expected |
|---|---|---|
| VM rating 2 | Allies (Police) rating 2 | `_grant_pools` has VM entry with computed amount |
| VM 0 / absent | — | no VM pool |
| VM rating 5 | multiple Allies merits | pool entry shows aggregated total per existing `vmAlliesPool` formula |

## Code Map

- `public/js/editor/mci.js:218-229` — legacy VM block.
- `public/js/editor/domain.js` — `hasViralMythology`, `vmAlliesPool`.
- `public/js/editor/rule_engine/pool-evaluator.js` — pattern from RDE-8.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-vm.js` — one `rule_grant` doc.
- [ ] Extend `pool-evaluator.js` from RDE-8 to handle VM, OR create `vm-evaluator.js` if VM's half-dot semantics require it. Default: extend the generic pool evaluator.
- [ ] `server/tests/vm-parallel-write.test.js` — I/O Matrix. Deep-equal.
- [ ] Flip: replace `mci.js:218-229`.

**Acceptance Criteria:**
- Given a character with VM ≥ 1, when evaluator runs, then `_grant_pools` contains the VM entry per legacy formula.
- Given parallel-write test, when run, then snapshots deep-equal.

## Verification

**Commands:**
- `cd server && npx vitest run vm-parallel-write` — green.

**Manual checks:**
- Spot-check a VM-bearing character (if any in production); verify Allies pool rendering identical pre/post flip.
