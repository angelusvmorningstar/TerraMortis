---
id: dt-form.18
task: 18
issue: 74
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/74
epic: epic-dt-form-mvp-redesign
status: Done
priority: high
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q2)
---

# Story dt-form.18 — Personal Story reduced to Touchstone-or-Correspondence binary (BOTH modes)

As a player in either MINIMAL or ADVANCED mode,
I should see Personal Story as a tight Touchstone-or-Correspondence binary with one OPTIONAL free-text NPC name input and one description textarea,
So that the section captures the narrative the cycle needs without the heavy NPC-picker UI, while still letting players name a person they want involved.

## Context

**Scope clarification 2026-05-06 turn 1 (Piatra HALT-DAR turn):** the reduction applies to BOTH MINIMAL and ADVANCED streams, not just MINIMAL. Personal Story is uniformly the Touchstone-or-Correspondence binary across both modes.

**Scope clarification 2026-05-06 turn 2 (Piatra NPC distinction):** "all NPC interactions are being suppressed until next release cycle." This applies to NPC PICKERS that read from the NPC database (the legacy `dt-npc-cards` driven by `currentChar.npcs`, plus the relationships graph). It does NOT apply to FREE-TEXT NPC name inputs — those are just strings the player types and are categorically different from "NPC interactions."

The locked design (option Y per the HALT-DAR turn-2 resolution):
- ✅ NPC card picker (DB-relational `dt-npc-cards` from `currentChar.npcs`) — REMOVED. Suppressed per the broader release-cycle policy.
- ✅ Free-text NPC name input — RETAINED. Optional. Stays as `personal_story_npc_name` (string the player types; no DB tie).
- ✅ Story-direction radios + interaction-note `_note` from the legacy rich UI — REMOVED. The new description textarea (`personal_story_text`) replaces the note.

ADR-003 §Q2 calls Personal Story for reduction in MINIMAL: "Reduced to binary Touchstone-or-Correspondence with one text input." This story extends that reduction to ADVANCED as well, with the free-text NPC name kept as an optional metadata field.

### Files in scope

- `public/js/tabs/downtime-form.js` — the `personal_story` section render path (`renderPersonalStorySection(saved)` at `:4417+`); collapse to the binary + optional free-text NPC name input. Remove the NPC card picker (DB-driven), the story-direction radios, and the legacy `_note` textarea. KEEP the free-text NPC name input as a typed string (NOT a picker).
- `public/js/data/dt-completeness.js` — `isMinimalComplete()` updated to recognise the new binary shape (lenient: legacy `_npc_*` + `_note` shape also passes per HALT-DAR-A option 2)
- Banner-list missing-piece labels at `dt-completeness.js:120` + `:131` — update copy to reflect the new shape

### Files NOT in scope

- Submission schema (the new fields fit under existing `responses` keys via `additionalProperties: true`; no schema delta)
- The relationships graph / NPC register itself — unchanged. Suppressed per the broader NPC-interaction policy; Personal Story doesn't reach into it any more.
- The NPC card picker (`dt-npc-cards` driven by `currentChar.npcs`) — REMOVED from the form. This is "NPC interaction" per the suppression policy.
- Legacy `personal_story_npc_id`, `personal_story_note`, `personal_story_direction` fields — REMOVED from the collect path. No UI emits them. Existing legacy data sits in `responses` untouched (silent-leave; no real users have submitted).

## Acceptance Criteria

**Given** a player in EITHER MINIMAL or ADVANCED mode
**When** the Personal Story section renders
**Then** they see three fields in order: (1) a radio group (Touchstone | Correspondence), (2) an OPTIONAL free-text NPC name input (`personal_story_npc_name`, no picker — just `<input type="text">`), and (3) a description textarea (`personal_story_text`) whose placeholder adapts to the chosen radio ("Describe the touchstone moment..." vs "Describe the correspondence...").

**Given** the player picks Touchstone (or Correspondence) and fills the description textarea
**When** `isMinimalComplete()` is evaluated
**Then** Personal Story passes its rule (`_kind` chosen + `_text` non-empty). The NPC name field is OPTIONAL — it does not affect gate satisfaction whether filled or empty.

**Given** the player fills the optional NPC name field
**When** the form persists
**Then** `responses.personal_story_npc_name` carries the typed string. No `_npc_id` is written (no picker, no DB lookup).

**Given** legacy submission data has the old Personal Story shape (`personal_story_npc_name`, `personal_story_note`, etc.)
**When** `isMinimalComplete()` is evaluated
**Then** the rule still passes via the lenient legacy-fallback check (`hasLegacyWho && hasLegacyWhat`). HALT-DAR-A locked option 2 (lenient): either-shape-passes. Legacy data is not migrated, just tolerated as a separate satisfaction path.

**Given** the existing rich Personal Story UI (NPC card picker + story-direction radios + interaction-note textarea)
**When** this story ships
**Then** the picker, the radios, and the legacy `_note` textarea are GONE from the form. Collect path no longer reads/writes `personal_story_npc_id`, `personal_story_note`, `personal_story_direction`. The free-text `personal_story_npc_name` IS retained as an optional string input. Existing legacy data sits in `responses` untouched (silent-leave).

**Given** a player switches MINIMAL → ADVANCED → MINIMAL
**When** the form re-renders
**Then** the binary radio + text values are preserved (per ADR-003 §Q1 mode-switch-preserves-data). Note: since both modes now render the same binary, the switch is visually a no-op for this section.

## Implementation Notes

### HALT-DAR-A resolution (2026-05-06)

User locked **option 2 (lenient)**: `isMinimalComplete()`'s personal_story rule passes when EITHER the new binary shape (`_kind` + `_text`) OR the legacy shape (`_npc_name` || `_npc_id`) + (`_note` || `story_moment_note` || `osl_moment` || `correspondence`) is filled. The function stays pure on `responses` — no `_mode` coupling.

Concrete check shape:
```js
const hasLegacyWho  = isNonEmptyString(responses.personal_story_npc_name)
                   || isNonEmptyString(responses.personal_story_npc_id);
const hasLegacyWhat = isNonEmptyString(responses.personal_story_note)
                   || isNonEmptyString(responses.story_moment_note)
                   || isNonEmptyString(responses.osl_moment)
                   || isNonEmptyString(responses.correspondence);
const hasMinimalKind = isNonEmptyString(responses.personal_story_kind);
const hasMinimalText = isNonEmptyString(responses.personal_story_text);
return (hasLegacyWho && hasLegacyWhat) || (hasMinimalKind && hasMinimalText);
```

### Render-path simplification

Since BOTH modes now render the binary, `renderPersonalStorySection(saved)` collapses to a single render path — no `_mode` branch needed. The earlier "wrap with `_mode === 'minimal'` branch" suggestion is obsolete given the scope expansion.

### Migration

Same decision shape as dt-form.26's A1: silent-leave. The legacy `_npc_*` + `_note` fields persist in `responses` for any existing draft, but no UI emits them anymore. The lenient gate preserves their satisfaction path so a player with only legacy data on a pre-redesign draft doesn't fail the gate just because they haven't engaged the new UI.

## Test Plan

- Static review: single render path for personal_story (no mode branch); collect-side reads only the new fields; lenient gate handles legacy data; banner-list copy updated
- Browser smoke (DEFERRED): the binary renders in both modes; round-trip mode switch is visually inert for this section; legacy in-flight drafts (if any) still pass the gate

## Definition of Done

- [x] `renderPersonalStorySection` renders Touchstone-or-Correspondence radio + optional free-text NPC name input + description textarea in BOTH modes
- [x] NPC card picker (DB-driven) removed; story-direction radios removed; legacy `_note` textarea removed
- [x] Collect path writes `personal_story_kind` + `personal_story_text` + `personal_story_npc_name` (typed string, optional); no longer writes `_npc_id` / `_note` / `_direction`
- [x] `isMinimalComplete()` lenient gate per HALT-DAR-A option 2 (`_npc_name` is OPTIONAL — its presence does not affect satisfaction; gate passes on `_kind` + `_text` alone)
- [x] Banner-list missing-piece labels updated to reflect new shape
- [x] PR opened into `dev` with `Closes #74`

## Dependencies

- **Upstream**: #17 (lifecycle + `_mode` plumbing — though the per-mode UI branch is now obsolete for this section)
- **Downstream**: none direct
