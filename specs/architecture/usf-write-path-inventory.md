# USF Write-Path Inventory (generated)

Source: ADR-007 D7 (`specs/architecture/adr-007-unified-suite-topology.md`), Rev 4.

**GENERATED FILE — do not hand-edit.** Regenerate with
`python3 specs/qa/harness/write-path-inventory.py`, and verify in review with
`--check` (non-zero exit means the write-site set changed, which is the D7
escalation trigger). The generator carries the method limits; read its docstring
before trusting an absence.

**Contract (D7, unchanged):** any PR that adds, removes or reshapes an entry here
is a red-flag review, escalated to the Architect, regardless of diff size.

## Characters

25 frontend write sites.

| Method | Endpoint | Site | Module has importers |
|---|---|---|---|
| `PUT` | `/api/characters/:id` | `public/js/admin.js:730` | 8 |
| `DELETE` | `/api/characters/:id` | `public/js/admin.js:836` | 8 |
| `POST` | `/api/characters` | `public/js/admin.js:945` | 8 |
| `PUT` | `/api/characters/:id` | `public/js/admin.js:1001` | 8 |
| `PUT` | `/api/characters/:id` | `public/js/admin.js:1020` | 8 |
| `PUT` | `/api/characters/:id` | `public/js/admin.js:1226` | 8 |
| `PUT` | `/api/characters/:id` | `public/js/admin/city-views.js:669` | 3 |
| `PUT` | `/api/characters/:id` | `public/js/admin/city-views.js:679` | 3 |
| `PUT` | `/api/characters/:id` | `public/js/admin/data-portability.js:514` | 1 |
| `POST` | `/api/characters` | `public/js/admin/data-portability.js:515` | 1 |
| `POST` | `/api/characters` | `public/js/admin/data-portability.js:993` | 1 |
| `PUT` | `/api/characters/:id` | `public/js/admin/data-portability.js:999` | 1 |
| `PATCH` | `/api/characters/:id` | `public/js/admin/downtime-story.js:4081` | 4 |
| `PUT` | `/api/characters/:id` | `public/js/admin/downtime-views.js:1122` | 9 |
| `PATCH` | `/api/characters/:id/st_mods_suppressed` | `public/js/admin/st-mods-panel.js:376` | 3 |
| `PUT` | `/api/characters/:id` | `public/js/editor/edit.js:250` | 6 |
| `PUT` | `/api/characters/:id` | `public/js/editor/edit.js:279` | 6 |
| `PUT` | `/api/characters/:id` | `public/js/editor/edit.js:330` | 6 |
| `POST` | `/api/characters/:id` | `public/js/editor/edit.js:1093` | 6 |
| `DELETE` | `/api/characters/:id` | `public/js/editor/edit.js:1111` | 6 |
| `PUT` | `/api/characters/:id` | `public/js/suite/status.js:244` | 4 |
| `PATCH` | `/api/characters/:id/safe_place_locations` | `public/js/tabs/downtime-form.js:1301` | 9 |
| `PATCH` | `/api/characters/:id/carthian_pull` | `public/js/tabs/downtime-form.js:4774` | 9 |
| `PATCH` | `/api/characters/:id/player_prefs` | `public/js/tabs/ordeals-view.js:324` | 1 |
| `POST` | `/api/characters/wizard` | `public/js/tabs/wizard.js:656` | **none — investigate** |

## Downtime submissions

22 frontend write sites.

| Method | Endpoint | Site | Module has importers |
|---|---|---|---|
| `PUT` | `/api/downtime_submissions/:id` | `public/js/admin/data-portability.js:544` | 1 |
| `POST` | `/api/downtime_submissions` | `public/js/admin/data-portability.js:545` | 1 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/admin/downtime-story.js:369` | 4 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/admin/downtime-story.js:3713` | 4 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/admin/downtime-story.js:3800` | 4 |
| `PATCH` | `/api/downtime_submissions/:id/section-flag/:id` | `public/js/admin/downtime-story.js:4646` | 4 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/downtime/db.js:188` | 5 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/downtime/db.js:230` | 5 |
| `POST` | `/api/downtime_submissions` | `public/js/downtime/db.js:233` | 5 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/downtime/db.js:416` | 5 |
| `POST` | `/api/downtime_submissions` | `public/js/tabs/downtime-form.js:1177` | 9 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/tabs/downtime-form.js:1189` | 9 |
| `POST` | `/api/downtime_submissions` | `public/js/tabs/downtime-form.js:1273` | 9 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/tabs/downtime-form.js:1282` | 9 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/tabs/feeding-tab.js:885` | 2 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/tabs/feeding-tab.js:905` | 2 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/tabs/feeding-tab.js:996` | 2 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/tabs/feeding-tab.js:1035` | 2 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/tabs/feeding-tab.js:1075` | 2 |
| `PUT` | `/api/downtime_submissions/:id` | `public/js/tabs/story-tab.js:1054` | 4 |
| `POST` | `/api/downtime_submissions/:id/section-flag` | `public/js/tabs/story-tab.js:1139` | 4 |
| `PATCH` | `/api/downtime_submissions/:id/section-flag/:id` | `public/js/tabs/story-tab.js:1168` | 4 |

## Write shapes

Three distinct shapes exist. D7 Rev 3 and earlier described only the first.

1. **Whole-document save.** `buildSaveBody(c)` into `PUT /api/characters/:id`,
   plus create and delete. ST-driven, from `admin.js`.
2. **PATCH sub-resource.** Narrow slices written without `buildSaveBody`:
   `carthian_pull`, `safe_place_locations`, `player_prefs`, `st_mods_suppressed`.
3. **Shared helper.** `public/js/downtime/db.js` (`updateSubmission` and friends)
   is the common downtime write path; admin views route through it.

**Players write to their own character.** Three of the PATCH sub-resource routes
carry no `requireRole` and instead do an in-handler ownership check (see
`server/routes/characters.js:611-614` for `carthian_pull`). The earlier inventory
implied that STs write characters and players write submissions; that is false.
