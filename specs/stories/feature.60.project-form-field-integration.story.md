# Story feature.60: Project Detail Block — App Form Field Integration

## Status: draft

## Story

**As an** ST processing project and ambience actions,
**I want** the project detail block to show properly parsed, human-readable data from the app form's distinct fields,
**so that** I can read cast, merits, and description clearly without raw JSON or CSV blobs.

## Background

The player downtime form collects project data as fully structured, distinct fields:

| Field | Response key | Format |
|-------|-------------|--------|
| Title | `project_N_title` | string |
| Desired Outcome | `project_N_outcome` | string |
| Territory | `project_N_territory` | string enum |
| Description | `project_N_description` | string (narrative only) |
| Characters Involved | `project_N_cast` | JSON-stringified array of character IDs |
| Applicable Merits | `project_N_merits` | JSON-stringified array of `"Name\|qualifier"` strings |
| Primary pool | `project_N_pool_attr/skill/disc` | separate strings |

**The current problem:** The admin processing panel (`buildProcessingQueue`) maps these into entry fields, but:

1. `entry.projCast` = raw `resp[project_N_cast]` — a JSON string like `["id1","id2"]`. Character IDs are not resolved to names.
2. `entry.projMerits` = raw `resp[project_N_merits]` — a JSON string like `["Allies|Police","Status|Invictus"]`. Displayed as-is.
3. `entry.description` = `proj.detail || proj.desired_outcome` — for CSV-imported submissions `proj.detail` is a concatenated blob containing all fields as a single cell. For app-form submissions `proj.detail` is empty and `proj.desired_outcome` is the outcome (not the description).
4. The app form's `project_N_description` (narrative only) is not currently extracted into the entry object at all.
5. The ST pool builder (feature.59) pre-populates from `pool_validated` if it exists, but for first-time opens it could pre-populate from `project_N_pool_attr/skill/disc`.

**CSV note:** The blob format (`proj.detail` containing "Characters involved: X Merits & Bonuses: Y Project description: Z") is a legacy artefact of how old downtime submissions were imported from spreadsheet cells. There is no value in parsing this blob — it will naturally disappear as old cycles age out. This story only concerns app-form submissions.

## Acceptance Criteria

1. `buildProcessingQueue` extracts `project_N_description` into `entry.projDescription` (distinct from `entry.description`).
2. `entry.description` for project entries is set to `entry.projDescription || proj.desired_outcome || ''` — never the CSV blob `proj.detail`.
3. `entry.projCast` is resolved from a JSON array of character IDs to a comma-separated string of display names, using the loaded `characters` array. Falls back to the raw string if parsing fails.
4. `entry.projMerits` is parsed from a JSON array of `"Name|qualifier"` strings to a readable comma-separated list (e.g. `"Allies (Police), Status (Invictus)"`). Falls back to raw string if parsing fails.
5. The project detail block renders all five fields cleanly: Title, Desired Outcome, Characters Involved (resolved names), Merits & Bonuses (readable), Project Description.
6. The ST pool builder (feature.59) pre-populates attr/skill/disc from `project_N_pool_attr/skill/disc` on first open (when `pool_validated` is empty), in addition to the existing restore-from-expression path.

## Tasks / Subtasks

- [ ] Task 1: Extract `projDescription` in `buildProcessingQueue`
  - [ ] Read `resp[project_${slot}_description]` and store as `entry.projDescription`
  - [ ] Change `entry.description` assignment: `proj.detail` → `entry.projDescription || proj.desired_outcome || ''`

- [ ] Task 2: Resolve cast character IDs to names
  - [ ] In `buildProcessingQueue`, attempt `JSON.parse(resp[project_${slot}_cast])`
  - [ ] Map each ID to `displayName(char)` using the `characters` array
  - [ ] Store resolved string in `entry.projCast`; fall back to raw string on parse error

- [ ] Task 3: Parse merit keys to readable strings
  - [ ] In `buildProcessingQueue`, attempt `JSON.parse(resp[project_${slot}_merits])`
  - [ ] Map each `"Name|qualifier"` to `"Name (qualifier)"` — omit qualifier part if empty
  - [ ] Store joined string in `entry.projMerits`; fall back to raw string on parse error

- [ ] Task 4: Pool builder pre-population from form fields (AC 6)
  - [ ] In the project pool builder block in `renderActionPanel`, if `poolValidated` is empty, read `resp[project_${slot}_pool_attr/skill/disc]` as fallback pre-selections
  - [ ] This requires passing `projSub` into the builder block (already hoisted as `projSub`)

## Dev Notes

### Where `buildProcessingQueue` lives
`downtime-views.js` — search for `function buildProcessingQueue`. The project slot loop is around the line that reads `poolPlayer: proj.primary_pool?.expression || resp[\`project_${slot}_pool_expr\`]`.

### Cast resolution
`characters` is a module-level array in `downtime-views.js`. Use `characters.find(c => String(c._id) === id)` for each ID in the parsed cast array. `displayName` is imported at the top of the file.

### Merit key format
`"Allies|Police"` → split on `|` → `"Allies (Police)"`. If qualifier is empty: `"Allies"`.

### Why `proj.detail` is the CSV blob
Old submissions were imported by mapping an entire spreadsheet cell into `proj.detail`. The app form never populates `proj.detail` — it uses the distinct `project_N_*` response keys instead. So `proj.detail` being non-empty is a reliable signal that the submission is CSV-origin.

### Pool builder pre-pop
The project pool builder block in `renderActionPanel` currently parses `poolValidated` to restore selections. If `poolValidated` is empty, add a second fallback reading `projSub?.responses?.[project_${slot}_pool_attr]` etc. The slot index is `entry.projSlot` (1-indexed) stored on the entry.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | `buildProcessingQueue` project entry construction; project pool builder pre-pop |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-13 | 1.0 | Initial draft — deferred, pending old CSV cycles ageing out | Angelus |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
- `public/js/admin/downtime-views.js`
- `specs/stories/feature.60.project-form-field-integration.story.md`
