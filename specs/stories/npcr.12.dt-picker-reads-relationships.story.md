---
id: npcr.12
epic: npcr
status: ready-for-dev
priority: high
depends_on: [npcr.5, npcr.6, npcr.7]
---

# Story NPCR-12: DT form story-moment picker reads from relationships

As a player filling out a downtime,
I want the Personal Story: Off-Screen Life picker to show my actual relationships (from Tier 2) rather than the hardcoded three-way choice,
So that I can pick anyone my PC has a relationship with as the subject of my story moment, regardless of kind.

---

## Context

Retires DTOSL.2's three-way choice (Correspondence / Touchstone / Other) in favour of reading from the relationships graph. Legacy DT submissions (with `personal_story_choice`, `personal_story_npc_id`, `story_direction` shape) must continue to render correctly in ST Story and player report surfaces.

---

## Acceptance Criteria

**Given** I open Personal Story: Off-Screen Life in the DT form **Then** the old three-way choice buttons are removed.

**Given** the section loads **Then** a single picker labelled "Who is this moment about?" appears, populated from `GET /api/relationships/for-character/:myCharId`.

**Given** the picker lists edges **Then** entries are grouped by kind family (Lineage, Political, Mortal, Other). **And** each shows other-endpoint name + kind label (e.g. "Mammon · correspondent").

**Given** an edge has `status !== 'active'` **Then** it does NOT appear in the picker.

**Given** I have zero active relationships **Then** the picker shows an empty-state message "You have no active relationships yet. Visit the Relationships tab to create one, or submit this downtime without a story moment."

**Given** I choose to submit without selecting a relationship **Then** the field stays empty. **And** no validation error fires.

**Given** the DT submission schema already has `additionalProperties: true` on responses **Then** a new field `responses.story_moment_relationship_id: string` is documented and supported without schema blocking.

**Given** I select a relationship and submit **Then** `responses.story_moment_relationship_id` is saved with the relationship's `_id`.

**Given** legacy DT submissions have the old shape **Then** the ST Story tab and player report still render those legacy submissions without error.

**Given** the DT Story admin view reads a new submission **Then** it resolves `story_moment_relationship_id` to the edge and its endpoints, displaying name + kind.

---

## Implementation Notes

- Existing DTOSL.2 code (three-way choice + contextual dropdown) is removed; legacy field readers kept for rendering historical submissions
- Resolution at render time: admin/story surfaces fetch the relationship by id; if not found (orphan), fall back to displaying `story_moment_relationship_id` as opaque reference with an error state

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` (remove legacy three-way UI, add picker)
- `server/schemas/downtime_submission.schema.js` (document new field; schema is already `additionalProperties: true`)
- `public/js/admin/downtime-story.js` (resolve relationship_id on render)
- `public/js/tabs/story-tab.js` (player-side rendering)
- `server/tests/api-downtime-story-moment.test.js` (new)

---

## Definition of Done

- Picker populates from player's edges, grouped by kind family
- Empty-state message shown when player has no active relationships
- New submission shape saves `story_moment_relationship_id`; legacy shape still renders
- Admin DT Story resolves relationship on render
- Quinn verification pass
- `bmad-code-review` required (removes legacy code path)
