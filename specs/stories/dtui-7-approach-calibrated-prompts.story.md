---
id: dtui.7
epic: dtui
status: ready-for-dev
priority: high
depends_on: [dtui.4]
---

# Story DTUI-7: Approach field calibrated prompts per action type

As a player writing the narrative for an action,
I want the Approach textarea label to be a character-voice question calibrated to that action,
So that the prompt feels like roleplay, not a survey.

---

## Context

The existing "Description" textarea in each project action block is renamed "Approach" and given a per-action prompt as the placeholder/helper text. The field key (`project_N_description`) and collected data remain unchanged for backward compatibility.

The `description` field is rendered at the tail of the action field loop in `renderProjectSlots()`, around lines 3038-3044. This story updates:
1. The `<label>` text from "Description" to "Approach"
2. The `<textarea>` placeholder from a generic prompt to a per-action calibrated question

A new constant `ACTION_APPROACH_PROMPTS` is added to `downtime-data.js`.

### Per-action Approach prompts (from `specs/ux-design-downtime-form.md`)

| Action | Prompt |
|---|---|
| `ambience_increase` | *"How do you go about improving the ambience of this territory in narrative terms."* |
| `ambience_decrease` | *"How do you go about degrading the ambience of this territory in narrative terms."* |
| `attack` | *"How do you attempt to destroy or undermine this target in narrative terms."* |
| `hide_protect` | *"How do you go about securing and hiding this target in narrative terms."* |
| `investigate` | *"How does your character pursue this investigation in narrative terms."* |
| `patrol_scout` | *"How does your character observe or patrol this territory in narrative terms."* |
| `misc` | *"Describe your approach to this action in narrative terms."* |
| `maintenance` | *"Describe how your character maintains this relationship or organisation in narrative terms."* |

Note: `xp_spend` has no description/approach field (ACTION_FIELDS only contains `xp_picker`). No prompt needed.

---

## Files in scope

- `public/js/tabs/downtime-data.js` — add `ACTION_APPROACH_PROMPTS` constant and export it
- `public/js/tabs/downtime-form.js` — import `ACTION_APPROACH_PROMPTS`; update the `description` field render to use "Approach" label and per-action placeholder

---

## Out of scope

- Allies action blocks — Allies do NOT have an Approach field (per UX spec); no prompt renders in `renderSphereFields()` for the description field in Allies
- Changing the saved field key (`project_N_description` stays as-is)
- Changing which actions show the Approach field — that's still controlled by `ACTION_FIELDS`

---

## Acceptance Criteria

### AC1 — Field labelled "Approach"

**Given** a player selects any action type that includes a description/approach field (Attack, Investigate, etc.),
**When** the field renders,
**Then** the `<label>` reads "Approach", not "Description".

### AC2 — Placeholder is per-action calibrated prompt

**Given** a player selects "Investigate" and the Approach textarea is empty,
**When** they view the field,
**Then** the textarea placeholder reads: *"How does your character pursue this investigation in narrative terms."*

### AC3 — Prompt updates on action change

**Given** a player switches from "Attack" to "Patrol/Scout",
**When** the re-render fires,
**Then** the Approach placeholder updates to the Patrol/Scout prompt.

### AC4 — Existing text preserved on action change

**Given** a player has typed approach text for one action, then changes to another action that also has an Approach field,
**When** the re-render fires,
**Then** the typed text is preserved (reads from `saved[project_${n}_description]`).

### AC5 — No Approach field in XP Spend

**Given** a player selects "XP Spend",
**When** the pane renders,
**Then** no "Approach" textarea is present.

---

## Implementation Notes

### New constant in downtime-data.js

Add after `ACTION_DESCRIPTIONS` (or alongside it in the same area):

```javascript
export const ACTION_APPROACH_PROMPTS = {
  'ambience_increase': 'How do you go about improving the ambience of this territory in narrative terms.',
  'ambience_decrease': 'How do you go about degrading the ambience of this territory in narrative terms.',
  'attack': 'How do you attempt to destroy or undermine this target in narrative terms.',
  'hide_protect': 'How do you go about securing and hiding this target in narrative terms.',
  'investigate': 'How does your character pursue this investigation in narrative terms.',
  'patrol_scout': 'How does your character observe or patrol this territory in narrative terms.',
  'misc': 'Describe your approach to this action in narrative terms.',
  'maintenance': 'Describe how your character maintains this relationship or organisation in narrative terms.',
};
```

### Update description field render in downtime-form.js

Find the `description` field render block in `renderProjectSlots()` (approximately lines 3038-3044). It currently looks something like:

```javascript
if (fields.includes('description')) {
  const desc = saved[`project_${n}_description`] || '';
  h += '<div class="qf-field">';
  h += `<label class="qf-label" for="dt-proj-${n}-desc">Description</label>`;
  h += `<textarea id="dt-proj-${n}-desc" class="qf-textarea" rows="4" data-proj-description="${n}" placeholder="Describe your approach...">${esc(desc)}</textarea>`;
  h += '</div>';
}
```

Update to:

```javascript
if (fields.includes('description')) {
  const desc = saved[`project_${n}_description`] || '';
  const prompt = ACTION_APPROACH_PROMPTS[actionVal] || 'Describe your approach in narrative terms.';
  h += '<div class="qf-field">';
  h += `<label class="qf-label" for="dt-proj-${n}-desc">Approach</label>`;
  h += `<textarea id="dt-proj-${n}-desc" class="qf-textarea" rows="4" data-proj-description="${n}" placeholder="${esc(prompt)}">${esc(desc)}</textarea>`;
  h += '</div>';
}
```

The `data-proj-description` attribute, field ID, and saved key are all preserved for backward compatibility.

### Allies blocks

In `renderSphereFields()` (line 4446), the `description` field also renders for some Allies actions (e.g. `patrol_scout`, `grow`, `misc`). Per the UX spec, Allies blocks do NOT show an Approach field. The simplest approach: leave Allies description renders unchanged (still labelled "Description") OR label them "Notes" since the Allies block has no Approach field in the spec. This story does NOT touch `renderSphereFields()` — that is covered by dtui-15.

---

## Files Expected to Change

- `public/js/tabs/downtime-data.js` — add `ACTION_APPROACH_PROMPTS` constant (~10 lines) and export
- `public/js/tabs/downtime-form.js` — import + update `description` field render block (~5 lines changed)

---

## Definition of Done

- AC1–AC5 verified
- All eight action types with Approach field show calibrated prompts
- XP Spend shows no Approach field
- Label reads "Approach" in all project blocks
- No regression in Allies description field (Allies untouched by this story)
- `specs/stories/sprint-status.yaml` updated: dtui-7 → review

---

## Compliance

- CC5 — British English, no em-dashes: all prompt copy uses "organisation" not "organization"; prompts are plain sentences without em-dashes

---

## Dependencies and Ordering

- **Depends on:** dtui-4 (action block shell; ACTION_FIELDS structure)
- Can be implemented concurrently with dtui-5, dtui-6, dtui-8, dtui-9

---

## Dev Agent Record

### Agent Model Used

(to be filled at implementation time)

### Completion Notes

(to be filled when implemented)

### File List

(to be filled when implemented)

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-7 story drafted; ready-for-dev. |
