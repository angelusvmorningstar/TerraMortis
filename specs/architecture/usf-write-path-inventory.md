# USF Write-Path Inventory (frozen)

Source: ADR-007 D7 (`specs/architecture/adr-007-unified-suite-topology.md`).

This is the frozen inventory of the canonical persistence write sites in the frontend as of USF Phase 0. It exists so every later USF shard has a fixed contract to review against.

**Contract:** Any future USF PR that adds, removes, or reshapes an entry in this table is a red-flag review, escalated to the Architect. Story USF-0 (dereference + hygiene) touches none of these paths.

## Characters

| Operation | Endpoint | Site |
|---|---|---|
| Save (build body) | `PUT /api/characters/:id` | `public/js/admin.js:1001` |
| Save (build body) | `PUT /api/characters/:id` | `public/js/admin.js:1020` |
| Save (build body) | `PUT /api/characters/:id` | `public/js/admin.js:1226` |
| Create | `POST /api/characters` | `public/js/admin.js:945` |
| Delete | `DELETE /api/characters/:id` | `public/js/admin.js:836` |

The `PUT` sites build their payload via `buildSaveBody(c)`.

## Downtime

| Operation | Endpoint | Site |
|---|---|---|
| Submit | `POST /api/downtime_submissions` | `public/js/player/downtime-form.js:1166` |
| Update (family) | `PUT /api/downtime_submissions/:id` | `public/js/admin/feeding-tab.js` |
| Update (family) | `PUT /api/downtime_submissions/:id` | `public/js/admin/story-tab.js` |
