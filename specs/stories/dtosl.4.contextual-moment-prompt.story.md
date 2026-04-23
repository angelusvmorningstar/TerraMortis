---
id: dtosl.4
epic: dt-off-screen-life
status: review
priority: medium
depends_on: [dtosl.2]
---

# Story DTOSL-4: Contextual "What Kind of Moment?" Prompt

As a player,
I want the moment-writing prompt to change label based on whether I picked Correspondence, Touchstone, or Other,
So that the form nudges me toward the right kind of narrative content for the choice I made.

---

## Context

After DTOSL-2 ships the three-way choice, the "What Kind of Moment do you want?" textarea should rephrase itself based on the selection. Letter vs. interaction vs. open-ended prompts elicit different content from the player and reduce "blank page" friction.

---

## Acceptance Criteria

**Given** the player has picked Correspondence in the DTOSL-2 selector
**When** the moment prompt renders
**Then** the label reads "Your letter" (or similar)
**And** the textarea placeholder is "Write the letter you're sending this cycle…"

**Given** the player has picked Touchstone
**When** the moment prompt renders
**Then** the label reads "Your moment with them"
**And** the placeholder is "How do you want to interact with them?"

**Given** the player has picked Other
**When** the moment prompt renders
**Then** the label reads "What do you want to do?"
**And** the placeholder is "Describe the off-screen moment…"

**Given** the player changes their choice after typing
**When** the new prompt renders
**Then** the existing textarea content is preserved (no clearing)
**And** only the label and placeholder change

**Given** the player submits
**Then** the textarea content persists to `responses.osl_moment`

---

## Implementation Notes

- Add `responses.osl_moment: { type: 'string' }` to `server/schemas/downtime_submission.schema.js`.
- Rendering in `public/js/tabs/downtime-form.js`:
  - Listen for DTOSL-2's choice change event
  - Swap label + placeholder based on `responses.osl_choice`
  - Preserve textarea value across swaps
- Placeholder strings live in a small local map for easy i18n-ready structure:
  ```js
  const OSL_PROMPTS = {
    correspondence: { label: 'Your letter', placeholder: 'Write the letter you\'re sending this cycle…' },
    touchstone:     { label: 'Your moment with them', placeholder: 'How do you want to interact with them?' },
    other:          { label: 'What do you want to do?', placeholder: 'Describe the off-screen moment…' },
  };
  ```

---

## Files Expected to Change

- `server/schemas/downtime_submission.schema.js`
- `public/js/tabs/downtime-form.js`
