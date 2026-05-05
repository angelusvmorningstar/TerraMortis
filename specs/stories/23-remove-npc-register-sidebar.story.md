---
id: issue-23
issue: 23
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/23
branch: morningstar-issue-23-remove-npc-sidebar
status: ready-for-dev
priority: low
depends_on: []
---

# Story #23: Remove NPC Register sidebar link while preserving data

As an ST using the admin app,
I should not see a "NPC Register" entry in the sidebar,
So that the incomplete/frozen section is not accessible from the UI while its data remains safe in MongoDB.

---

## Context

The NPC Register domain was built as part of the NPCR epic. The feature is under freeze and not ready for regular ST use. The sidebar button and section markup should be hidden, but the underlying MongoDB `npcs` collection must remain untouched so it can be re-enabled later without a data migration.

### Files in scope

- `public/admin.html:55` — sidebar `<button>` for the `npcs` domain. Remove this line.
- `public/admin.html:138–145` — `#d-npcs` section block. Comment it out (do not delete).

### Files NOT in scope

- `server/` — no route or schema changes.
- `public/js/` — no JS changes; no domain-init code to touch.
- MongoDB — no data operations.

### Key constraints

- The `#d-npcs` comment block must be a clean HTML comment so it can be re-enabled by uncommenting alone — no partial removals.
- No JS in `admin.js` references `d-npcs` for init by name at startup, so removing the markup causes no runtime errors. Verify with a browser console check after the change.
- The sidebar `data-domain="npcs"` button is the sole trigger; removing it is sufficient to block navigation.

---

## Acceptance Criteria

**Given** an ST is logged in to the admin app
**When** the sidebar renders
**Then** no "NPC Register" button appears.

**Given** the sidebar button has been removed
**When** the admin app loads
**Then** no JavaScript console errors are thrown.

**Given** the `#d-npcs` section is commented out in `admin.html`
**When** a developer wants to re-enable the NPC Register
**Then** uncommenting the block and restoring the sidebar button fully restores the feature without any additional file changes.

**Given** the HTML changes are deployed
**When** the MongoDB `npcs` collection is queried
**Then** all existing NPC documents are present and unaffected.

---

## Dev Notes

The change is two lines in one file:

1. Delete `public/admin.html:55` (the sidebar button).
2. Wrap `public/admin.html:138–145` in `<!-- ... -->`.

No JS, no server, no DB.
