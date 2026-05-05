---
id: issue-24
issue: 24
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/24
branch: morningstar-issue-24-story-free-text-npc
status: ready-for-dev
priority: high
depends_on: []
---

# Story #24: Story section — free-text NPC name + interaction note

As a player filling in the downtime form,
I should be able to name any NPC I can think of and describe how I want to interact with them,
So that I am not blocked from submitting a story moment by needing a pre-registered relationship.

---

## Context

The current `renderPersonalStorySection()` shows a `<select>` built from `_myRelationships`
(active edges from `/api/relationships/for-character/:id`), grouped by kind family. Players
with no registered relationships see an empty-state dead end. The replacement is two plain
free-text fields.

The submit collect at `downtime-form.js:384–392` already reads the hidden fields
`dt-personal_story_npc_id` and `dt-personal_story_npc_name`, and reads
`dt-personal_story_note` directly. The free-text change handler at line 2004 already syncs
`dt-personal_story_npc_name_free` into those hidden fields. No new submit wiring is needed.

### Files in scope

- `public/js/tabs/downtime-form.js:3747–3827` — replace `renderPersonalStorySection()`
- `public/js/tabs/downtime-form.js:2004–2013` — add `updateSectionTicks(container)` call (missing from this handler)

### Files NOT in scope

- ST admin view, relationships tab, NPC register
- Submit collect (already handles `personal_story_npc_name` + `personal_story_note`)
- Legacy renderer `_legacyRenderPersonalStorySection` — do not touch

### Key constraints

- Use `id="dt-personal_story_npc_name_free"` for the name input so the existing handler fires.
- Use `id="dt-personal_story_note"` for the note textarea so `collectResponses()` reads it directly.
- Hidden fields `dt-personal_story_npc_id` and `dt-personal_story_npc_name` must stay in the
  rendered HTML for submit compat.
- The `dt-story_moment_relationship_id` and `dt-story_moment_note` elements will no longer be
  rendered; `collectResponses()` will produce empty strings for those keys — that is fine.
- Back-compat saved-value read: `savedName` from `personal_story_npc_name`; `savedNote` from
  `personal_story_note || story_moment_note || osl_moment || correspondence`.

---

## Acceptance Criteria

**Given** a player opens the Story section of the downtime form
**When** the section renders
**Then** no relationship dropdown appears; a text input and a textarea appear instead.

**Given** the player types an NPC name and an interaction description
**When** they submit the form
**Then** `personal_story_npc_name` holds the typed name and `personal_story_note` holds the description.

**Given** both fields are blank
**When** `updateSectionTicks` runs
**Then** the section tick is not marked visible.

**Given** a saved submission with `personal_story_npc_name` set
**When** the form re-renders with that saved data
**Then** the name field is pre-populated correctly.

---

## Dev Notes

Pure renderer replacement. The existing free-text handler at line 2004 is reused; add
`updateSectionTicks(container)` at the end of that handler (currently missing, causes tick
not to update on name input).
