---
id: dt-form.23
task: 23
epic: epic-dt-form-mvp-redesign
status: Draft
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
**When** the form auto-saves
**Then** `responses.regency_confirmed === true` (or equivalent persisted value); `isMinimalComplete()` for regents passes its regency rule.

**Given** the regent declines
**When** the form auto-saves
**Then** `responses.regency_confirmed === false`; `isMinimalComplete()` for regents fails its regency rule until they affirm or stop being a regent.

**Given** a non-regent character
**When** the form renders
**Then** the regency section is not rendered; `isMinimalComplete()` does not have a regency rule for them.

**Given** the regent has multiple territories (rare)
**When** the regency section renders
**Then** the section enumerates each (one confirmation per territory), or surfaces them as a single "regent of N territories" block — implementer's call based on how the live data shapes (audit during pickup).

## Implementation Notes

`is_regent` detection at `:1337` is already in place. The new UI is the confirmation interaction layered on that detection. Persistence under `responses.regency_*` keys.

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
