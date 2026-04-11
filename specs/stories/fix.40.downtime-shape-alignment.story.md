# Story fix.40: Downtime Submission Shape Alignment

## Status: Approved

## Story

**As an** ST reviewing downtime submissions in the admin panel,
**I want** CSV-imported submissions to populate the same `responses` object as player portal submissions,
**so that** the admin panel renders court, project, sphere, and feeding data consistently regardless of ingestion path.

## Background

The downtime system has two ingestion paths that produce incompatible document shapes:

1. **Player portal form** (`downtime-form.js`) writes flat key-value pairs into `responses` (e.g. `responses.travel`, `responses.project_1_action`)
2. **CSV import** (`downtime/parser.js` + `downtime/db.js upsertCycle`) writes nested structures into `_raw` (e.g. `_raw.narrative.travel_description`, `_raw.projects[0].action_type`)

The admin panel has two rendering paths:
- `renderPlayerResponses(s)` reads from `s.responses` — works for form submissions, empty for CSV imports
- `renderProjectsPanel(s, raw)` reads from `s._raw.projects` — works for CSV imports, empty for form submissions

Result: court data from CSV never displays, project data uses different field names per path, and sphere/contact/retainer/sorcery sections have the same divergence.

Full mapping specification: `specs/guidance/downtime-shape-alignment.md`

## Dependencies

None. This is independent of the PP epic.

## Acceptance Criteria

1. CSV import populates `doc.responses` with flat-key fields matching the player portal format
2. `_raw` is preserved unchanged as archival backup alongside `responses`
3. Court data (travel, recount, correspondence, trust, harm, aspirations) from CSV renders in the admin panel identically to form-submitted data
4. Project data from CSV appears in both `renderPlayerResponses` (summary) and `renderProjectsPanel` (detailed roll workflow)
5. Sphere action data from CSV populates `responses.sphere_N_*` fields
6. Contact, retainer, and sorcery data from CSV populates `responses.contact_N_*`, `responses.retainer_N_*`, `responses.sorcery_N_*` fields
7. Feeding method from CSV is normalised to the form's enum values (seduction, stalking, force, etc.) and stored in `responses._feed_method`
8. Territory feeding grid from CSV is normalised to the form's key/value format and stored as JSON in `responses.feeding_territories`
9. Character names in `rp_shoutout` are resolved to `_id` strings where possible
10. CSV pool expressions stored in `responses.project_N_pool_expr` (free text — not decomposed into attr/skill/disc)
11. Action types normalised via existing `normaliseActionType()` into `responses.project_N_action`
12. `renderProjectsPanel` falls back to constructing project data from `responses.project_N_*` fields when `_raw.projects` is absent
13. Historical submissions are NOT migrated — only new imports get `responses` populated
14. Player portal form continues to work unchanged
15. The downtime submission schema (`downtime_submission.schema.js`) requires no changes

## Tasks / Subtasks

- [ ] Task 1: Create `mapRawToResponses()` in `public/js/downtime/db.js` (AC: 1, 2, 3, 5, 6, 7, 8, 9, 10, 11)
  - [ ] Add function `mapRawToResponses(parsed, characters)` that takes a parsed CSV submission object and optional characters array for name→ID resolution
  - [ ] Map court/narrative fields:
    - `parsed.narrative.travel_description` → `responses.travel`
    - `parsed.narrative.game_recount` → `responses.game_recount`
    - `parsed.narrative.standout_rp` → `responses.rp_shoutout` (resolve names to IDs via fuzzy match against `characters`)
    - `parsed.narrative.ic_correspondence` → `responses.correspondence`
    - `parsed.narrative.most_trusted_pc` → `responses.trust`
    - `parsed.narrative.actively_harming_pc` → `responses.harm`
    - `parsed.narrative.aspirations` → `responses.aspirations`
  - [ ] Map regency fields:
    - `parsed.regency.is_regent` → `responses._gate_is_regent` ("yes"/"no")
    - `parsed.regency.territory` → `responses.regent_territory`
    - `parsed.regency.regency_action` → `responses.regency_action`
  - [ ] Map feeding fields:
    - `parsed.feeding.method` → `responses._feed_method` (normalise via new `normaliseFeedMethod()` helper)
    - `parsed.feeding.territories` → `responses.feeding_territories` (normalise territory names to slug keys, status values to enum, JSON stringify)
  - [ ] Map project fields (iterate `parsed.projects`, index 0-3):
    - `projects[i].action_type` → `responses.project_{i+1}_action`
    - `projects[i].project_name` → `responses.project_{i+1}_title`
    - `projects[i].desired_outcome` → `responses.project_{i+1}_outcome`
    - `projects[i].detail` → `responses.project_{i+1}_description`
    - `projects[i].primary_pool.expression` → `responses.project_{i+1}_pool_expr` (free text)
    - `projects[i].secondary_pool.expression` → `responses.project_{i+1}_pool2_expr` (free text)
    - `projects[i].characters` → `responses.project_{i+1}_cast` (JSON stringify)
    - `projects[i].merits` → `responses.project_{i+1}_merits`
    - `projects[i].xp_spend` → `responses.project_{i+1}_xp`
  - [ ] Map sphere actions (iterate `parsed.sphere_actions`, index 0-4):
    - `sphere_actions[i].merit_type` → `responses.sphere_{i+1}_merit`
    - `sphere_actions[i].action_type` → `responses.sphere_{i+1}_action`
    - `sphere_actions[i].desired_outcome` → `responses.sphere_{i+1}_outcome`
    - `sphere_actions[i].description` → `responses.sphere_{i+1}_description`
  - [ ] Map contact actions (iterate `parsed.contact_actions.requests`, index 0-N):
    - `requests[i]` → `responses.contact_{i+1}_request`
  - [ ] Map retainer actions (iterate `parsed.retainer_actions.actions`, index 0-N):
    - `actions[i]` → `responses.retainer_{i+1}_task`
  - [ ] Map sorcery:
    - `parsed.ritual_casting.casting` → `responses.sorcery_1_rite`
  - [ ] Map meta fields:
    - `parsed.meta.xp_spend` → `responses.xp_spend`
    - `parsed.meta.lore_questions` → `responses.lore_request`
    - `parsed.meta.st_notes` → `responses.vamping`
    - `parsed.meta.form_comments` → `responses.form_feedback`
  - [ ] Return the `responses` object (caller merges onto `doc`)

- [ ] Task 2: Wire `mapRawToResponses` into `upsertCycle` (AC: 1, 2)
  - [ ] In `upsertCycle()` after building `doc` (line ~90-100), call `mapRawToResponses(parsed, characters)` and set `doc.responses = result`
  - [ ] Pass the characters array (if available from the import UI context) for name→ID resolution in shoutout picks
  - [ ] Preserve `doc._raw = parsed` unchanged (archival)

- [ ] Task 3: Create normalisation helpers (AC: 7, 8)
  - [ ] Add `normaliseFeedMethod(rawText)` in `public/js/downtime/db.js` or `parser.js`:
    - "seduction" / "seduced" → "seduction"
    - "stalking" / "stalked" / "hunted" → "stalking"
    - "force" / "by force" / "attacked" → "force"
    - Default: "other" (keep raw text in `responses.feeding_description`)
  - [ ] Add `normaliseTerritoryGrid(rawTerritories)`:
    - Territory name → slug key mapping (e.g. "The Academy" → "the_academy")
    - Status value → enum mapping (e.g. "Resident" → "resident", "Poaching" → "poach", "Feeding" → "feed", "Not feeding here" → "none")
    - Return JSON string matching the form's format

- [ ] Task 4: Update `renderProjectsPanel` fallback (AC: 4, 12)
  - [ ] In `public/js/admin/downtime-views.js` `renderProjectsPanel(s, raw, char)`:
    - When `raw?.projects` is absent or empty, construct a project array from `s.responses.project_N_*` fields
    - Build objects: `{ action_type, project_name, desired_outcome, detail, pool_expr, characters, merits, xp_spend }` from the flat keys
    - Iterate N = 1-4, skip if `responses.project_N_action` is empty
    - Use these constructed objects for the rest of the render/roll workflow
  - [ ] This allows CSV-imported submissions (which now have `responses`) to render in the projects panel even without `_raw.projects`

- [ ] Task 5: Verification (AC: 3, 4, 5, 6, 13, 14, 15)
  - [ ] Import a test CSV → verify court section renders in admin panel
  - [ ] Import a test CSV → verify projects show in both Player Submission panel and Projects panel
  - [ ] Submit via player form → verify same panels show the same data (regression)
  - [ ] Import then re-submit via form → verify form data overwrites CSV data cleanly
  - [ ] Verify `_raw` is preserved unchanged after mapping
  - [ ] Verify sphere, contact, retainer, sorcery sections render from CSV data
  - [ ] Verify feeding territory grid renders from CSV data
  - [ ] Verify schema validation still passes (no changes to schema)

## Dev Notes

### Full field mapping reference

See `specs/guidance/downtime-shape-alignment.md` for the complete mapping table. The guidance document is the authoritative specification — this story implements it.

### Key files

| File | Change |
|------|--------|
| `public/js/downtime/db.js` | Add `mapRawToResponses()`, `normaliseFeedMethod()`, wire into `upsertCycle` |
| `public/js/downtime/parser.js` | May need minor additions for `normaliseTerritoryGrid()` if territory name mapping isn't already there |
| `public/js/admin/downtime-views.js` | `renderProjectsPanel` fallback from `responses` when `_raw.projects` absent |

### What this story does NOT change

- **Player portal form** (`downtime-form.js`) — already writes the correct shape, no changes
- **Historical submissions** — existing CSV imports keep empty `responses`; only new imports get populated
- **`_raw` object** — preserved unchanged as archival backup
- **Downtime submission schema** (`downtime_submission.schema.js`) — already defines all flat keys, no changes needed
- **`renderPlayerResponses()`** — already reads from `responses` correctly; once CSV populates `responses`, it just works

### CSV pool expressions

CSV pool data is free-text (e.g. "Presence 4 + Intimidation 4 + Spec(Veiled threat) 1 = 9"). This cannot be cleanly decomposed into attr/skill/disc components. Store as `responses.project_N_pool_expr` — the ST uses the text as reference when manually building the pool in the admin UI.

### Character name resolution for shoutout picks

The form stores `rp_shoutout` as a JSON array of `_id` strings. CSV has free-text names. The mapper should attempt fuzzy resolution via `displayName()` / `sortName()` / `moniker` / `name` matching. Unresolved names are stored as-is — the rendering code already handles non-ID strings by falling back to display.

### Testing

- Import a CSV → verify court section (travel, recount, correspondence) appears in admin panel
- Import a CSV → verify projects show in both Player Submission panel and Projects panel
- Submit via player form → verify same panels show the same data (regression)
- Import then re-submit via form → verify form data overwrites CSV data cleanly
- Verify `_raw` preserved unchanged after mapping
- Verify sphere/contact/retainer/sorcery sections render from CSV data
- Verify feeding territory grid renders correctly from CSV import
- Verify feeding method normalisation (e.g. "seduced" → "seduction")

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Bob (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
