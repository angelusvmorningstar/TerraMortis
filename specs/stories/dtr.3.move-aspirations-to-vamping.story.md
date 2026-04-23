---
id: dtr.3
epic: dt-restructure
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTR-3: Move Aspirations → Vamping Section

As a player,
I want the Aspirations field to live in the Vamping section,
So that my short/medium/long-term goals sit with the flavour/RP prompts rather than the Court recount.

---

## Context

Aspirations is currently in the Court section. It's a character-goals prompt, more naturally grouped with the Vamping (flavour/RP) section than with "what happened at last game."

---

## Acceptance Criteria

**Given** a player opens the DT form
**When** the Court section renders
**Then** no Aspirations field appears there

**Given** a player opens the Vamping section
**When** it renders
**Then** the Aspirations field appears

**Given** a player had a draft with aspirations text
**When** the form loads
**Then** the existing text is preserved in the Aspirations field in its new location (no data loss)

---

## Implementation Notes

- No schema change. `responses.aspirations` field stays — only rendering section changes.
- `public/js/tabs/downtime-form.js` — relocate the Aspirations render block from Court's section template into Vamping's.
- If DTFC-4 (aspirations structured slots) has shipped or lands concurrently, stack order: this story moves the field; DTFC-4 changes its internals. They don't conflict.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js`
