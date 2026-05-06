---
id: dt-form.18
task: 18
issue: 74
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/74
epic: epic-dt-form-mvp-redesign
status: Ready for Dev
priority: high
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q2)
---

# Story dt-form.18 — Personal Story reduced to Touchstone-or-Correspondence binary (BOTH modes)

As a player in either MINIMAL or ADVANCED mode,
I should see Personal Story as a tight binary choice (Touchstone OR Correspondence) with one text input,
So that the section captures the narrative the cycle needs without the maximalist NPC-name + interaction-note shape.

## Context

**Scope clarification 2026-05-06 (Piatra HALT-DAR turn):** the reduction applies to BOTH MINIMAL and ADVANCED streams, not just MINIMAL. The earlier draft of this story positioned ADVANCED as keeping the existing rich UI; that has been overridden. Personal Story is now uniformly the Touchstone-or-Correspondence binary across both modes.

ADR-003 §Q2 calls Personal Story for reduction in MINIMAL: "Reduced to binary Touchstone-or-Correspondence with one text input." This story extends that reduction to ADVANCED as well — the existing free-text NPC fields per issue #24 are removed from the form entirely.

### Files in scope

- `public/js/tabs/downtime-form.js` — the `personal_story` section render path (`renderPersonalStorySection(saved)` around `:1741+`); collapse to the binary in BOTH branches; remove the existing rich UI (NPC name dropdown + interaction note)
- `public/js/data/dt-completeness.js` — `isMinimalComplete()` updated to recognise the new binary shape (lenient: legacy `_npc_*` + `_note` shape also passes per HALT-DAR-A option 2)
- Banner-list missing-piece labels at `dt-completeness.js:120` + `:131` — update copy to reflect the new shape

### Files NOT in scope

- Submission schema (the new fields fit under existing `responses` keys via `additionalProperties: true`; no schema delta)
- The relationships graph / NPC register itself — unchanged. Players who want to relate to a specific NPC can do so through the relationships tab; Personal Story no longer carries that signal.
- Issue #24's underlying free-text NPC fields — REMOVED from the form. Legacy data on existing submissions is silent-leave (no real users have submitted; only dev/ST testers).

## Acceptance Criteria

**Given** a player in EITHER MINIMAL or ADVANCED mode
**When** the Personal Story section renders
**Then** they see one radio group (Touchstone | Correspondence) and one text input scoped to the chosen radio (placeholder text adapts: "Describe the touchstone moment..." vs "Describe the correspondence...").

**Given** the player picks Touchstone (or Correspondence) and fills the text input
**When** `isMinimalComplete()` is evaluated
**Then** Personal Story passes its rule (chosen radio + non-empty text).

**Given** legacy submission data has the old Personal Story shape (`personal_story_npc_name`, `personal_story_note`, etc.)
**When** `isMinimalComplete()` is evaluated
**Then** the rule still passes via the lenient legacy-fallback check (`hasLegacyWho && hasLegacyWhat`). HALT-DAR-A locked option 2 (lenient): either-shape-passes. Legacy data is not migrated, just tolerated as a separate satisfaction path.

**Given** the existing rich Personal Story UI (NPC dropdown + interaction note)
**When** this story ships
**Then** the rich UI is GONE from the form. The collect path no longer reads or writes `personal_story_npc_id`, `personal_story_npc_name`, `personal_story_note`. Existing legacy data sits in `responses` untouched (silent-leave).

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

- [ ] `renderPersonalStorySection` renders the Touchstone-or-Correspondence binary in BOTH modes
- [ ] Existing rich UI (NPC dropdown + interaction note) removed from the form
- [ ] Collect path writes only `personal_story_kind` + `personal_story_text`; no longer writes legacy `_npc_*` / `_note`
- [ ] `isMinimalComplete()` lenient gate per HALT-DAR-A option 2
- [ ] Banner-list missing-piece labels updated to reflect new shape
- [ ] PR opened into `dev` with `Closes #74`

## Dependencies

- **Upstream**: #17 (lifecycle + `_mode` plumbing — though the per-mode UI branch is now obsolete for this section)
- **Downstream**: none direct
