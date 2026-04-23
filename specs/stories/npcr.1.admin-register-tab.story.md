---
id: npcr.1
epic: npcr
status: ready-for-dev
priority: high
depends_on: []
---

# Story NPCR-1: Admin NPC Register tab baseline

As an ST,
I want a first-class NPC Register tab in admin.html,
So that I can manage NPCs from a proper home rather than a collapsible panel inside the Downtime tab.

---

## Context

Today the NPC admin UI is a collapsible "NPC Register" panel embedded in the Downtime admin tab (`public/js/admin/downtime-views.js` around line 7729). It handles basic CRUD plus the `is_correspondent` toggle from DTOSL.1 but has no search, no filters, and no first-class home. This story lifts it to its own sidebar tab and adds the search + filter-chip affordances that subsequent NPCR stories extend.

Existing `npcs` collection is preserved. No new collection in this story.

---

## Acceptance Criteria

**Given** I am ST **When** I open admin.html **Then** an "NPC Register" item appears in the sidebar.

**Given** I click the NPC Register item **Then** a list + right-side detail pane loads, consistent with existing admin surfaces.

**Given** the list loads **Then** NPCs are sorted alphabetically with badges for Correspondent, ST-suggested count, and Flagged count.

**Given** I click a row **Then** the detail pane shows name, description, status, notes, st_notes, is_correspondent toggle, st_suggested_for (read-only chips for now), created_by, timestamps.

**Given** I click "Add NPC" **Then** a blank detail pane opens with Save enabled. **And** saving creates an `npcs` row with status='active' by default.

**Given** I edit and save **Then** PUT `/api/npcs/:id` fires. **And** save failures display visibly (no silent failure).

**Given** I click Retire **Then** status='archived' and the NPC leaves the default view.

**Given** a search box is present **When** I type **Then** the list filters case-insensitively across name + description.

**Given** filter chips (Pending, Flagged, Correspondents, Suggested) **When** I click a chip **Then** the list filters accordingly.

**Given** I am not ST **Then** the tab is not in the sidebar.

---

## Implementation Notes

- Extracts `renderNpcs`, `renderNpcCard`, `renderNpcForm` from `public/js/admin/downtime-views.js` into new module `public/js/admin/npc-register.js`
- Existing embedded panel in Downtime tab is removed (data stays in same `npcs` collection; only UI entry point moves)
- Filter chip row uses existing `.qf-btn` / chip patterns
- Flagged chip count depends on NPCR.3 shipping; until then, chip is hidden or shows 0
- `st_suggested_for` chip edit surface is out of scope here (lands with DTOSL.3 once admin linked-chars UI is built, likely as part of NPCR.2's edge editor)

---

## Files Expected to Change

- `public/js/admin/npc-register.js` (new)
- `public/js/admin/downtime-views.js` (remove embedded NPC panel)
- `public/js/admin.js` (sidebar wiring, lazy-init flag)
- `admin.html` (sidebar entry)
- `public/css/components.css` (if new styles needed)

---

## Definition of Done

Per epic-npcr.md shared DoD:
- All ACs verified in-browser against local dev server
- Sidebar item appears; tab loads; list renders; search filters; chips filter; CRUD round-trips
- Existing NPC records still editable with all DTOSL fields
- Old embedded panel removed cleanly (no dead code, no dead CSS)
- AC-by-AC completion note (done / deferred / skipped with evidence)
- Quinn verification pass
