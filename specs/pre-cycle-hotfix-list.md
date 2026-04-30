# Pre-Cycle Stabilisation Hotfix List

**Status:** Starter — to be triaged with Peter before cycle launch
**Date:** 2026-05-01
**Cycle:** Imminent DT cycle (date TBC)

## Purpose

Submission-blocker triage list for the imminent DT cycle. Approved by Angelus and Peter before any code lands. The list is the single source of truth for what's permitted to ship during the pre-cycle stabilisation pass within the freeze.

## Definition of submission-blocker

A bug that:

- Prevents a player from submitting a complete DT, OR
- Causes ST to be unable to process a submitted DT, OR
- Causes data corruption on save.

UX papercuts, contrast issues, label clarity, and tab ordering are **not** submission-blockers. They're real problems and they go in the post-refactor backlog. They do not delay or expand the pre-cycle pass.

## Process

1. Each item below is marked **Pending triage** until Angelus and Peter classify it.
2. Classification: `Blocker` (must fix before cycle), `Possible blocker` (investigate, then classify), or `Defer` (post-refactor backlog).
3. Each Blocker gets an owner (Angelus or Peter) and an estimated touch surface.
4. Cycle launch only proceeds when every Blocker is shipped to `main` and every other item is Defer or out-of-scope.

## Items raised by Peter, 2026-04-30 Discord

| # | Issue | Source | Classification |
|---|---|---|---|
| 1 | Hysteresis bug: territory residency markers vanish after button interaction | Peter (DT feeding flow) | Pending triage |
| 2 | Support Assets > Allies click dismisses panel and reverts to Solo | Peter (DT support flow) | Pending triage |
| 3 | Joint-action toggle stickiness — can't return to solo after auto-save | Peter (DT joint-action flow) | Pending triage |
| 4 | Selecting a feeding method locks disciplines for the second feeding action (unintended) | Peter (DT feeding flow) | Pending triage |
| 5 | Rote feed copy says "must use same territory type as main feed; Barrens locks both" — wrong per current rule | Peter (DT feeding copy) | Pending triage |
| 6 | Contacts dots not rendering on character sheet | Peter (sheet renderer) | Pending triage |
| 7 | XP calc misbehaving on a sheet (specifics to confirm) | Peter (XP derivation) | Pending triage |
| 8 | Player-selection chips have poor contrast on standout-moments selection | Peter (already flagged before round) | Pending triage |
| 9 | Action tabs scroll off-screen by the time players reach the bottom — silent missed-action risk | Peter (DT action tabs) | Pending triage |
| 10 | Feeding Rights tab order — currently after Territory Influence, logically should be before | Peter (DT tab order) | Pending triage |

## Possible blockers — require investigation

(Populate during triage. Anything Angelus or Peter discovers while reviewing #1–10 that's adjacent.)

## Out of scope for pre-cycle pass

These are real but defer to post-refactor:

| Issue | Reason |
|---|---|
| Player-selection button array → autocomplete redesign | UX redesign, structural |
| "Single roll vs dual roll" label rewrite | Copy improvement, not blocker |
| Persistent action rail / sticky tab state badges | UX restructure |
| Tooltip / info-icon coverage on unfamiliar mechanics | UX expansion |
| Phone/mobile optimisation | Charter-level: desktop-first holds |

## Sign-off

- [ ] Angelus reviewed and classified
- [ ] Peter reviewed and classified
- [ ] Blocker list locked
- [ ] All Blockers shipped to `main`
- [ ] Cycle launch authorised
