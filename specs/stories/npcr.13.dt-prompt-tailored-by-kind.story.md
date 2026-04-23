---
id: npcr.13
epic: npcr
status: ready-for-dev
priority: medium
depends_on: [npcr.12]
---

# Story NPCR-13: DT form tailors prompt by kind

As a player filling out a downtime,
I want the follow-up prompt below the picker to ask the right question based on the kind of relationship I selected,
So that the form nudges me toward story content that fits the relationship.

---

## Context

Replaces the DTOSL.4 contextual moment-prompt logic with a cleaner kind-driven mapping. Kind-to-prompt pairs live in a data module for easy expansion when new kinds are added.

---

## Acceptance Criteria

**Given** a `public/js/data/kind-prompts.js` module exists **Then** it maps each kind code to `{label, placeholder}` pairs.

**Given** I select a `kind='touchstone'` relationship **Then** the prompt swaps to label "Describe the moment of in-person contact" with a placeholder guiding what the moment should include.

**Given** `kind='correspondent'` **Then** label becomes "What did they write about?" with appropriate placeholder.

**Given** `kind='ally'` or `'coterie'` **Then** label becomes "What did you call on them for?" or similar.

**Given** `kind='rival'` or `'enemy'` **Then** label becomes "What did they do, or what did you do to them?"

**Given** `kind='family'` **Then** label becomes "What happened with your family this month?" with a placeholder encouraging mortal-world grounding.

**Given** `kind='other'` with a `custom_label` **Then** the label uses the custom_label verbatim where possible. **And** placeholder is a generic fallback.

**Given** no mapping is found for a kind (new kind added without updating the prompts module) **Then** a generic fallback is used: label "Describe this moment" with a generic placeholder.

**Given** I change my relationship selection after typing in the prompt **Then** label and placeholder swap. **And** my typed content persists (not cleared).

**Given** the existing DTOSL.4 contextual-moment-prompt logic is present **Then** it is replaced or absorbed by this kind-based mapping. **And** the legacy code path is removed cleanly.

---

## Implementation Notes

- `kind-prompts.js` shape:
  ```
  export const KIND_PROMPTS = {
    touchstone: { label: "Describe the moment of in-person contact", placeholder: "..." },
    correspondent: { label: "What did they write about?", placeholder: "..." },
    ...
    _default: { label: "Describe this moment", placeholder: "..." }
  };
  ```
- Copy tone: match existing DT form labels (encouraging, conversational, no jargon)
- Prompt text stays localStorage-persisted via the existing DTU.2 autosave pattern; only the label/placeholder swap, not the value

---

## Files Expected to Change

- `public/js/data/kind-prompts.js` (new)
- `public/js/tabs/downtime-form.js` (replace DTOSL.4 logic)
- `server/tests/data-kind-prompts.test.js` (optional light unit test)

---

## Definition of Done

- All kinds have mappings; fallback works for unmapped kinds
- Label and placeholder swap on selection change; typed content persists
- Legacy DTOSL.4 code path removed cleanly
- Quinn verification pass
