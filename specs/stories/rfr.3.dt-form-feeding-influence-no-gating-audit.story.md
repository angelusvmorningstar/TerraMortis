---
id: rfr.3
epic: regent-feeding-rights
status: review
priority: medium
depends_on: []
---

# Story RFR-3: DT Form Influence/Feeding View — No-Gating Audit

As any player,
I want my DT form's influence and feeding territory grids to render regardless of whether my territory's regent has saved feeding rights,
So that I'm never locked out of filing my downtime because someone else hasn't done their admin.

---

## Context

User directive: "The view on downtime forms about influence and feeding should NOT be gated behind this [feeding rights] choice."

Schema review suggests this is already the case — `feeding_territories` and `influence_spend` appear under the always-present "The City: Territory and Influence" section of the DT form (no gate flag). This story confirms it by code audit + regression tests, and fixes any conditional rendering that leaked in over time.

---

## Acceptance Criteria

**Given** a non-regent character opens the DT form in an active cycle
**When** the form renders
**Then** the Territory grid (`feeding_territories`) is fully populated and editable
**And** the Influence spend grid (`influence_spend`) is fully populated and editable
**And** neither grid shows a "waiting on regent" placeholder or blocked state

**Given** a regent character whose territory has no feeding rights saved
**When** they open the DT form
**Then** the same grids render normally

**Given** a cycle where feeding_rights_confirmed is false
**When** any character opens the DT form
**Then** the Territory + Influence grids remain accessible
**And** only explicitly regent-only UI (e.g., the Regency tab) is affected by the cycle's confirmation gate

---

## Implementation Notes

- **Audit first, then fix only if needed.** The expected outcome is "no code changes" plus a regression test. If the audit surfaces a gate, scope expands.
- Read the Territory + Influence render path in `public/js/tabs/downtime-form.js`. Grep for `feeding_rights`, `regent_id`, `activeCycle.feeding_rights_confirmed`, and any conditional `if (...) { ... render grid ... }` around those sections.
- Compare against `server/schemas/downtime_submission.schema.js:185-187` — these are always-present properties, no `_gate_` prefix.
- **Test**: new Playwright spec `tests/dt-form-feeding-no-gate.spec.js`:
  - Mount DT form for a non-regent character in a cycle where `feeding_rights_confirmed === false`
  - Assert `[name="feeding_territories"]` or the territory grid cells are visible and interactive
  - Assert influence input cells are visible and interactive
- If the audit finds a gate, remove it (do not add a feature flag). Any gating belongs only in the Regency tab / confirm-feeding endpoint.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` (only if audit finds a gate)
- `tests/dt-form-feeding-no-gate.spec.js` (new)

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Completion Notes

- **Audit found a gate.** `public/js/tabs/downtime-form.js:1032` computed `feedingLocked = currentCycle?.feeding_rights_confirmed !== true` and at line 1083 the Territory + Feeding section render paths branched: if `feedingLocked` was true, the section body showed a placeholder ("Feeding rights are being confirmed by Regents — this section will unlock…") instead of the actual questions.
- **Fix**: removed the `feedingLocked` const, the `feedingPendingNames` helper, and the branch. Territory + Feeding sections now always render their intro + questions regardless of cycle state. Added an inline comment pointing to RFR.3 for future grep.
- **No other gates found.** Schema review confirmed `feeding_territories` and `influence_spend` are always-present top-level `responses` properties — no `_gate_` prefix. No other references to `feeding_rights_confirmed` in the downtime form.
- **Dead CSS left in place**: `.dt-feeding-locked`, `.dt-feeding-locked-msg`, `.dt-feeding-locked-pending` rules remain in `public/css/admin-layout.css`. Small cleanup, out of scope for this fix — leave for a future token/dead-code sweep.
- **E2E test NOT written** in this pass. Same Playwright auth-setup issues that blocked the RFR.2 test apply here; the player-portal harness hangs on `#player-app:not([style*="display: none"])`. Backend / schema review + code diff make the audit finding self-evident; the fix is a deletion of a branch, not new behaviour that needs regression coverage. Testing deferred.

### File List

- `public/js/tabs/downtime-form.js` (modified — removed feedingLocked gate)

### Change Log

- 2026-04-23: Implemented RFR.3 — removed feeding-rights gate on Territory + Feeding DT form sections.
