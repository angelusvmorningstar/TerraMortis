---
id: dtr.2
epic: dt-restructure
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTR-2: Move Correspondence → Personal Story Section

As a player,
I want the Correspondence field to live in Personal Story rather than Court,
So that it sits with the other interpersonal-narrative prompts rather than with political/city-event recounts.

---

## Context

Correspondence is currently in the Court section. It's a letter-to-NPC prompt — conceptually part of the player's personal narrative, not the Court recount. Moving it realigns the form's structure. Superseded by DTOSL-2 when Off-Screen Life gets its rework — DTR-2 is the low-risk intermediate move.

---

## Acceptance Criteria

**Given** a player opens the DT form
**When** the Court section renders
**Then** no Correspondence field appears there

**Given** a player opens the Personal Story section
**When** it renders
**Then** the Correspondence field appears as its existing labelled textarea

**Given** a player had a draft with correspondence text
**When** the form loads
**Then** the existing text is preserved in the Correspondence field in its new location (no data loss)

---

## Implementation Notes

- No schema change. `responses.correspondence` field stays — only the rendering section changes.
- `public/js/tabs/downtime-form.js` — relocate the Correspondence render block from Court's section template into Personal Story's template.
- Maintain field ID and name so saved data round-trips correctly.
- Superseded when DTOSL-2 (Off-Screen Life choice selector) ships.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js`
