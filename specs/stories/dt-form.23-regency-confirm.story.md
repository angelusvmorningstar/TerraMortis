---
id: dt-form.23
task: 23
issue: 81
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/81
epic: epic-dt-form-mvp-redesign
status: Ready for Dev
priority: high
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q2)
---

# Story dt-form.23 — Regency confirmation UI

As a regent character (auto-detected from territory ownership),
I should see a confirmation UI in the regency section of the DT form,
So that my regency status for the cycle is positively affirmed (or declined) and counts toward MINIMAL completeness for regents.

## Context

ADR-003 §Q2: regency renders only if `is_regent === 'yes'` (already auto-detected at `downtime-form.js:1337`). For regents, MINIMAL completeness includes a positive regency confirmation. This story redesigns the regency confirmation interaction.

The current regency tab UI may have its own affordances; this story scopes the DT-form-context regency confirmation only.

### Files in scope

- `public/js/tabs/downtime-form.js` — the `regency` section render path (currently around `:1337+`)
- `public/js/data/dt-completeness.js` — `isMinimalComplete()` rule for regency

### Files NOT in scope

- The regency tab itself (`public/js/tabs/regency-tab.js`) — that's a separate surface
- Territory feeding-rights data (canonical at `territories.feeding_rights[]`)
- Lieutenant entitlement (decided NO in #13b — no story here on extending bonus to lieutenants)

## Acceptance Criteria

**Given** a regent character (`is_regent === 'yes'` per existing detection)
**When** the form renders in MINIMAL mode
**Then** the regency section appears with a confirmation UI: "I am acting as regent of [Territory] for this cycle" with a positive affirmation control (button or checkbox).

**Given** the regent confirms
**When** the button is clicked
**Then** the DT-form POSTs to the existing `cycle.regent_confirmations` append-only endpoint with `{territory_id, regent_char_id, rights: territory.feeding_rights}`. `_isRegencyConfirmedThisCycle()` returns true (via the existing predicate); `isMinimalComplete()` for regents passes its regency rule.

**Given** the regent has not confirmed (no entry in `cycle.regent_confirmations`)
**When** the form renders / auto-saves
**Then** the gate fails (predicate returns false on absence). `isMinimalComplete()` for regents fails its regency rule until they confirm. Per HALT-DAR resolution: explicit "decline" is reinterpreted as "absence of entry" — append-only API has no decline affordance and that's acceptable for MVP.

**Given** a non-regent character
**When** the form renders
**Then** the regency section is not rendered; `isMinimalComplete()` does not have a regency rule for them.

**Given** the regent has multiple territories (rare)
**When** the regency section renders
**Then** the section enumerates each (one confirmation per territory), or surfaces them as a single "regent of N territories" block — implementer's call based on how the live data shapes (audit during pickup).

## Implementation Notes

**Persistence shape (locked 2026-05-07 by Piatra HALT-DAR):** the brief's original `responses.regency_confirmed` shape is SUPERSEDED. Canonical store is `cycle.regent_confirmations[]` — the existing append-only system that the regency-tab and admin already consume. DT-form's confirmation button POSTs to the same endpoint as regency-tab (`server/routes/downtime.js:90-155`), with `rights[]` populated from the regent's territory's current `feeding_rights[]` (snapshot at confirmation time).

Predicate: `_isRegencyConfirmedThisCycle()` (already wired by foundation #17 in `_completenessCtx()`) reads `cycle.regent_confirmations[]` for the regent — UNCHANGED. No predicate edit needed for this story; the UI is the new piece.

**AC #3 reinterpretation:** "decline" = "absence of confirmation entry" = gate fails. The existing predicate already maps absence→false correctly. No new "false" state needed. If a regent un-confirms (rare; the API is append-only), that's a future API-extension issue.

**Multi-territory regents:** structural assumption is one regent → one territory (`findRegentTerritory()` at `helpers.js:153-168` is singular). Single-block UI is correct. Document the structural assumption in PR body.

`is_regent` detection at `:1337` is already in place. The new UI is the confirmation interaction layered on that detection.

Visual treatment: keep light. A regent section that's a wall of legalese will feel heavy in MINIMAL. The confirmation is a single sentence + button.

## Test Plan

- Static review: regent gate is intact; confirmation persists
- Browser smoke (DEFERRED): regent character sees the section; non-regent does not; confirmation flow round-trips

## Definition of Done

- [ ] Regency confirmation UI lives in the `regency` section
- [ ] `isMinimalComplete()` consults regency confirmation for regents
- [ ] Non-regents see no section (existing gate preserved)
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (lifecycle + `_mode`)
- **Downstream**: none
