---
id: dtr.1
epic: dt-restructure
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTR-1: Court — Structured 3–5 Highlight Fields for Game Recount

As a player,
I want to capture each in-character game highlight in its own numbered field rather than one big text blob,
So that STs can parse and act on individual highlights without splitting a paragraph.

---

## Context

The Court section prompt asks for 3–5 highlights from the last game. Currently this is a single free-text box (`game_recount`). Players write paragraphs, then STs have to eyeball where one highlight ends and another begins. Structured fields give us clean per-highlight data capture.

---

## Acceptance Criteria

**Given** a player opens the DT form's Court section
**When** the Game Recount area renders
**Then** three input fields are shown (Highlight 1, Highlight 2, Highlight 3)
**And** the prompt text above them says "3–5 in-character highlights from the last game."

**Given** all three of the first rows contain non-empty text
**When** the player finishes typing in field 3 (blur or input event)
**Then** a 4th field appears

**Given** fields 1–4 all contain text
**When** the player finishes typing in field 4
**Then** a 5th field appears

**Given** fields 1–5 are shown
**Then** no further field appears (hard cap at 5)

**Given** a field is cleared
**Then** any trailing empty fields beyond the minimum (3) are hidden on next render

**Given** the player submits
**Then** each filled highlight is persisted to its own schema key (`game_recount_1` … `game_recount_5`)

---

## Implementation Notes

- Schema: deprecate `responses.game_recount` (keep for backwards-compat read). Add `responses.game_recount_1` through `responses.game_recount_5` (`type: 'string'`) to `server/schemas/downtime_submission.schema.js`.
- Read-side compat: if a legacy submission has `game_recount` but no numbered keys, split by newline or render all into field 1 with a note. Keep it simple — don't try to auto-split.
- Rendering: `public/js/tabs/downtime-form.js` — in the Court section, replace the single textarea with a dynamic list. Use an existing expandable-fields pattern if one exists (e.g., contacts, retainers) rather than inventing a new one.
- Styling: align with existing `.qf-input` / `.qf-textarea` classes. No new CSS tokens.

---

## Files Expected to Change

- `server/schemas/downtime_submission.schema.js`
- `public/js/tabs/downtime-form.js`
