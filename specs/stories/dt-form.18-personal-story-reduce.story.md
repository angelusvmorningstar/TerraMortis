---
id: dt-form.18
task: 18
epic: epic-dt-form-mvp-redesign
status: Draft
priority: high
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q2)
---

# Story dt-form.18 — Personal Story reduced to Touchstone-or-Correspondence binary

As a player on MINIMAL mode,
I should see Personal Story as a tight binary choice (Touchstone OR Correspondence) with one text input,
So that the section captures the minimum narrative the cycle needs without the maximalist current shape.

## Context

ADR-003 §Q2 calls Personal Story for reduction in MINIMAL mode: "Reduced to binary Touchstone-or-Correspondence with one text input." This story implements that reduction; ADVANCED mode still renders the full Personal Story section as it exists today.

The current Personal Story section (introduced via PR #28 / issue #24) renders an NPC-name + interaction-note pair. The reduced MINIMAL variant collapses to a single radio choice (Touchstone | Correspondence) plus one text input scoped to the chosen option.

### Files in scope

- `public/js/tabs/downtime-form.js` — the `personal_story` section render path (currently around `:1741+`, `renderPersonalStorySection(saved)`)
- `public/js/data/dt-completeness.js` — `isMinimalComplete()` updated to consume the new MINIMAL Personal Story shape

### Files NOT in scope

- The ADVANCED Personal Story section (unchanged)
- Submission schema (the new fields fit under existing `responses` keys; no schema delta)
- Issue #24's underlying free-text NPC fields — those remain available in ADVANCED

## Acceptance Criteria

**Given** a player on MINIMAL mode
**When** the Personal Story section renders
**Then** they see one radio group (Touchstone | Correspondence) and one text input scoped to the chosen radio (placeholder text adapts: "Describe the touchstone moment..." vs "Describe the correspondence...").

**Given** the player picks Touchstone and fills the text input
**When** `isMinimalComplete()` is evaluated
**Then** Personal Story passes its rule (chosen radio + non-empty text).

**Given** ADVANCED mode is active
**When** the Personal Story section renders
**Then** the full existing Personal Story UI renders unchanged (free-text NPC fields per issue #24 remain available).

**Given** a player switches MINIMAL → ADVANCED → MINIMAL
**When** the form re-renders
**Then** the MINIMAL radio + text values are preserved (per ADR-003 §Q1 mode-switch-preserves-data).

## Implementation Notes

The current `renderPersonalStorySection(saved)` already lives at `:1741+`. Wrap with a `_mode === 'minimal'` branch:
- MINIMAL → render the binary (radio + text, persisted in `responses.personal_story_kind` and `responses.personal_story_text`)
- ADVANCED → render the existing free-text NPC field shape

`isMinimalComplete()` (in `dt-completeness.js`, owned by #17) reads `personal_story_kind` and `personal_story_text` to decide; the rule passes when both are set.

## Test Plan

- Static review: branch on `_mode` is the only structural change; existing ADVANCED path untouched
- Browser smoke (DEFERRED): MINIMAL renders binary; switch to ADVANCED; switch back; values preserved

## Definition of Done

- [ ] MINIMAL Personal Story renders binary (radio + text)
- [ ] ADVANCED Personal Story renders unchanged
- [ ] `isMinimalComplete()` consults new fields
- [ ] Browser smoke: round-trip mode switching preserves data
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (lifecycle + `_mode` rendering gate)
- **Downstream**: none direct
