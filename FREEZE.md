# Freeze in effect

The Terra Mortis Suite is in an architectural-reset freeze as of **2026-05-01**.

**No feature work merges to `dev` or `main` during freeze.**

## Permitted during freeze

- **Hotfixes** per the strict definition in [`specs/architectural-reset-charter.md`](specs/architectural-reset-charter.md) Part 2.
- **Errata corrections** per the errata lane in the same charter (content-only fixes to existing reference data — no schema-shape changes).
- **Audit work** (Phase 1) per Part 1 of the charter.
- **Documentation and convention authoring** as it emerges from audit findings.

## The five-item gate

Every proposed merge during freeze must pass all five items in the Freeze Rules checklist (charter Part 2):

1. Is this a hotfix or errata correction per the strict definitions? If no, reject.
2. Does it add a schema field, collection, or helper module? If yes, reject.
3. Does it touch the layer currently being refactored in Phase 3? If yes, reject unless coordinated.
4. Has the diff been reviewed by the other developer? If no, hold.
5. Is there a one-line rationale tying it to freeze-permitted work? If no, reject.

## When the freeze lifts

The freeze lifts when **all** resumption criteria in the charter Part 3 are demonstrably met. Not dated. Not partial.

## Read first

Full context, audit methodology, and resumption criteria are in [`specs/architectural-reset-charter.md`](specs/architectural-reset-charter.md). Read it before proposing any merge during freeze.
