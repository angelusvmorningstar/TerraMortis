---
id: dtr.4
epic: dt-restructure
status: review
priority: low
depends_on: [dtr.2, dtr.3]
---

# Story DTR-4: Rename Court Section to "Court: Last Game Session"

As a player,
I want the Court section to be named in a way that reflects what it's actually about,
So that the form's information architecture is self-explanatory.

---

## Context

After DTR-2 (Correspondence moved out) and DTR-3 (Aspirations moved out), the Court section is just the game recount + trust/harm/shoutouts. "Court: Politics and Correspondence" is no longer accurate. Rename to "Court: Last Game Session".

---

## Acceptance Criteria

**Given** the player opens the DT form
**When** the Court section header renders
**Then** the title reads "Court: Last Game Session"
**And** "Politics and Correspondence" appears nowhere

---

## Implementation Notes

- Pure copy change. One string in `public/js/tabs/downtime-form.js` (Court section heading).
- Search for any admin-side labels referencing the old name (ST processing UI, narrative summary headers) and update for consistency.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js`
- (possibly) `public/js/admin/downtime-views.js`, `public/js/admin/downtime-story.js`
