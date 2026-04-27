---
id: dtsr.10
epic: dtsr
status: ready-for-dev
priority: low
depends_on: []
---

# Story DTSR-10: Increase narrative textarea min-height for comfortable authoring

As a Storyteller authoring downtime narratives in the DT Story tab,
I should see narrative textareas tall enough to comfortably write a paragraph or two without immediate scrolling — roughly 8 to 10 visible lines as a starting size — across all section types,
So that drafting prose feels like writing in a document rather than squeezing into a single-line input that demands constant resizing.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform). Folded in from `specs/deferred-work.md` "DT Story UX 2026-04-17":

> **DTS1.10** — DT Story narrative textarea min-height increase (taller textarea for comfortable writing; ~6-8 rows or ~120px min)

The current state in `public/css/admin-layout.css:6750-6768`:

```css
.dt-story-response-ta {
  /* ... */
  min-height: 160px;          /* base — ~6-7 rows */
}
.dt-story-section[data-section="letter_from_home"] .dt-story-response-ta,
.dt-story-section[data-section="touchstone"] .dt-story-response-ta,
.dt-story-section[data-section="territory_reports"] .dt-story-response-ta {
  min-height: 200px;          /* heavy-prose sections — ~8 rows */
}
```

Two issues:
1. The 160px base is **too short** for sections that produce paragraph-sized prose (project responses, merit responses, the new story_moment in DTSR-2, the new feeding_narrative in DTSR-7).
2. Section-specific overrides exist only for three keys (`letter_from_home`, `touchstone`, `territory_reports`) and have not been extended as new prose sections were added.

DTSR-10 raises the base min-height so every narrative textarea reads as a writing surface, and consolidates or removes the section-specific overrides so the rules are uniform.

### Files in scope

- `public/css/admin-layout.css` — `.dt-story-response-ta` rule and the section-specific overrides at lines 6750-6768.
- (Optional) Any other narrative textarea class in the DT Story tab that uses different sizing — verify and align.

### Out of scope

- Player-side textareas (DT form `qf-section` textareas, etc.) — different surface, different ergonomics; out of scope.
- Modal-context textareas (revision note textareas, etc.) — those are deliberately compact (`rows="2"`) and remain so.
- ST Notes thread textarea (`.proc-note-textarea` in DT Processing) — different surface, deliberately compact; out of scope.
- Auto-grow / auto-resize behaviour on textareas. v1 stays with simple `min-height` + `resize: vertical`. Auto-grow could be a follow-up if STs find resize manual labour.
- Changing `resize: vertical` to `auto` or `both` — keep `vertical` so STs don't accidentally shrink width.
- Mobile / narrow-viewport tweaks. The DT Story tab is desktop-first per memory `feedback_player_desktop.md` (and the broader admin app convention).
- Renaming the class. Stays as `.dt-story-response-ta`.

---

## Acceptance Criteria

### Base size

**Given** a narrative textarea using `.dt-story-response-ta`
**Then** its `min-height` is raised from the current 160px to **240px** (or whatever value gives a comfortable 8-10 visible lines at the existing line-height of 1.6 and font-size of 13px). Tune the exact pixel value at implementation; the principle is "comfortable for authoring a multi-paragraph narrative without immediate scroll".

**Given** the textarea renders empty
**Then** it visibly takes up a writing-comfortable amount of vertical space — the ST sees an inviting surface, not a one-liner.

### Section overrides

**Given** the section-specific overrides for letter_from_home, touchstone, and territory_reports
**Then** they are either:
- **Consolidated** into the base rule (so all narrative textareas share the same generous height), OR
- **Bumped** further (to e.g. 280-320px) for sections that consistently demand longer prose. Choose at implementation; the simpler answer (consolidate) is preferred unless visual review shows the heavy-prose sections genuinely need more room.

### New section coverage

**Given** the textareas introduced by DTSR-2 (`story_moment`) and DTSR-7 (`feeding_narrative`)
**Then** they inherit the new generous base height by virtue of using the `.dt-story-response-ta` class. No section-specific override is required for them.

### Resize behaviour preserved

**Given** an ST drags the textarea's resize handle
**Then** they can still expand it vertically (`resize: vertical` is preserved).
**And** they cannot shrink it below the new min-height (this is the point of the bump).

### Visual

**Given** the new height applies
**Then** the textarea does not visually overwhelm the section card; the action row (Save Draft / Mark Complete / Needs Revision) remains visible and ergonomic.
**And** the section card's overall height grows proportionally — no broken layouts, no overlapping elements, no regressions in adjacent panels.

### No regressions

**Given** the DT Story tab in any state (active cycle, no submissions, multiple submissions)
**When** sections render
**Then** all existing functionality (save, mark complete, copy context, revision flow) continues to work unchanged.

---

## Implementation Notes

### Suggested change

```css
.dt-story-response-ta {
  background: var(--surf);
  border: 1px solid var(--bdr2);
  border-radius: 4px;
  box-sizing: border-box;
  color: var(--txt);
  font-family: var(--ft);
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 8px;
  min-height: 240px;          /* was 160px — comfortable ~10 rows */
  padding: 8px 10px;
  resize: vertical;
  width: 100%;
}
.dt-story-response-ta:focus { border-color: var(--gold2); outline: none; }

/* Heavy-prose sections — keep slightly taller for two-paragraph drafts */
.dt-story-section[data-section="letter_from_home"] .dt-story-response-ta,
.dt-story-section[data-section="touchstone"] .dt-story-response-ta,
.dt-story-section[data-section="territory_reports"] .dt-story-response-ta,
.dt-story-section[data-section="story_moment"] .dt-story-response-ta {
  min-height: 280px;
}
```

The `story_moment` selector is added so DTSR-2's consolidated section gets the heavy-prose treatment. If the implementer prefers full consolidation (one rule, no overrides), drop the section-specific block entirely and bump the base to 280px.

### Visual review

After the CSS change, open the DT Story tab on a real submission and visually verify:
- Story Moment textarea reads as a writing surface (not a strip).
- Project Reports cards' textareas read similarly.
- Action row is still on screen without scrolling on a typical desktop viewport (e.g. 1080p height).
- No clipped / hidden affordances.

If the new heights make the section card feel oversized for a sparse submission (e.g. a Touchstone narrative that only needs a sentence), accept that — the bigger surface is a deliberate invitation to write more.

### Verify other narrative textareas

Grep for `<textarea` and `.story` / `narrative` class fragments in:
- `public/js/admin/downtime-story.js`
- `public/js/admin/downtime-views.js`

If any narrative textarea uses a class other than `.dt-story-response-ta` (e.g. a one-off inline style), assess whether it should be folded into the same rule. If it's deliberately compact (revision note, ST quick-notes), leave it alone. If it's prose-sized but lacks the canonical class, add the class.

### No tests required

CSS-only change. Manual visual verification is sufficient.

---

## Files Expected to Change

- `public/css/admin-layout.css` — `.dt-story-response-ta` min-height bump; section-specific overrides updated or consolidated.

No JS, no schema, no API changes.

---

## Definition of Done

- All AC verified.
- Manual visual smoke test on the DT Story tab: every section's textarea reads as a comfortable writing surface.
- Action rows remain visible and ergonomic on a typical desktop viewport.
- Resize still works; min-height enforced.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-10-narrative-textarea-min-height: backlog → ready-for-dev → in-progress → review` as work proceeds.
- `specs/deferred-work.md` already marks "DT Story — taller narrative textarea" as folded into DTSR-10. No further deferred-work entry update needed when this story merges.

---

## Dependencies and ordering

- No upstream dependencies. Independent of every other story.
- Pairs naturally with DTSR-2 (story_moment) and DTSR-7 (feeding_narrative); if both ship before DTSR-10, both inherit the new heights automatically. If DTSR-10 ships first, both new sections will inherit when they land.
