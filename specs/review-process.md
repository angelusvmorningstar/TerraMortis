# Review Process — Freeze Period

**Status:** v0 — owned by Angelus; Peter advises
**Owner:** Angelus
**Adviser:** Peter
**Date:** 2026-05-01
**Scope:** Active until freeze lifts (charter Part 3 resumption criteria met)

## Purpose

How the two devs review each other's work during the architectural-reset freeze. Light by design — sized to two devs working async on a hobby project under a six-day stabilisation window before the 2026-05-07 DT cycle. The five-item gate from `architectural-reset-charter.md` Part 2 is enforceable; everything below is the workflow that keeps it honest.

## The five-step rule

| Step | Rule |
|---|---|
| 1 | Every merge to `dev` during freeze cites either a `pre-cycle-hotfix-list.md` item # or a `v0.1.0-acceptance-criteria.md` criterion in the commit message. One line. |
| 2 | Author posts the commit hash + one-line summary to Discord before merging to `dev`. |
| 3 | Other dev acks or queries within ~24h. If no response in 24h *and* the change is non-controversial (see classification below), author proceeds. |
| 4 | `dev` → `main` is explicit user instruction only (existing rule, restated). No proactive merges, no auto-flow on freeze hotfixes. |
| 5 | Either dev can reject a proposed merge unilaterally on the five-item gate. The gate is enforceable, not advisory. |

## The five-item gate (restated from charter Part 2)

Every proposed merge during freeze must pass all five:

1. Is this a hotfix or errata correction per the strict definitions in charter Part 2? If no, reject.
2. Does it add a schema field, collection, or helper module? If yes, reject.
3. Does it touch the layer currently being refactored in Phase 3? If yes, reject unless coordinated.
4. Has the diff been reviewed by the other developer per Step 3 above? If no, hold.
5. Is there a one-line rationale in the commit message tying it to freeze-permitted work? If no, reject.

## Controversial vs non-controversial

A change is **non-controversial** and can proceed after 24h silence if it:

- Touches a single render site, a single endpoint, or a single isolated component.
- Fixes a documented bug from the hotfix list with clear scope.
- Corrects content in `MERITS_DB`, `DEVOTIONS_DB`, `MAN_DB`, or equivalent reference data without changing field shape (errata lane).

A change is **controversial** and must wait for explicit ack if it:

- Touches a shared helper, a canonical module, or any cross-cutting concern.
- Modifies schema-validated fields or persistence shapes (even if the schema file itself isn't touched).
- Affects an in-progress refactor's working layer.
- Spans multiple modules or surfaces (Admin, Suite, Player Portal, Game App).

When in doubt, treat as controversial. The cost of a 24h wait is less than the cost of re-doing work.

## What this process is NOT

- Not a PR-and-CI workflow. No GitHub PR, no required green build (no test framework yet).
- Not a sign-off process. There is no "approver"; there are two devs reviewing each other, with Angelus owning final call on contested calls per the freeze charter.
- Not a substitute for the charter's gates. This is the workflow that exercises the gates; it does not soften them.

## What this process IS

- A discipline scaffold for the freeze. Trustable async working when both devs aren't online at once.
- A traceability tool. Every freeze-period merge has a documented rationale tying it to `pre-cycle-hotfix-list.md` or `v0.1.0-acceptance-criteria.md`. The audit log is git history plus Discord.
- Calibrated to project scale. Two devs, hobby project, six-day window — anything heavier is ceremony for ceremony's sake.

## Post-v0.1.0

This document expires when the freeze lifts. The post-v0.1.0 stakeholder meeting (Symon's ask) is where a longer-term review process is agreed — likely with the SemVer + `CHANGELOG.md` infrastructure Peter flagged on 2026-05-01, and possibly with a lightweight PR workflow if the team grows past two devs.

## Updates

- 2026-05-01 — v0 created.
