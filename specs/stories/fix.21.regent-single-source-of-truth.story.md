# Story fix.21: Regent Assignment — Single Source of Truth

## Status: done

## Story

**As an** ST,
**I want** regent assignments to be authoritative on the territory document only,
**so that** there is no risk of conflicting data between characters and territories, and regent status is derived at runtime rather than duplicated.

## Background

Regent assignment is currently stored in two independent places:
1. **Territory document**: `regent` field (character name string) — set via the City panel
2. **Character document**: `regent_territory` field (territory name string) — set via the editor identity section or synced from the City panel save

There is no cross-validation. Multiple characters could have `regent_territory: "The North Shore"` without the system complaining. The City panel save handler (`city-views.js:524-540`) attempts to sync both, but this is fragile — direct character edits bypass it.

**Decision**: Remove `regent_territory` and `regent_lieutenant` from the character schema. Derive regent status at runtime by querying the territories collection. The territory document's `regent` and `lieutenant` fields become the single source of truth.

## Acceptance Criteria

1. `regent_territory` and `regent_lieutenant` fields removed from `character.schema.js`
2. Migration script removes both fields from all character documents in MongoDB
3. Territory documents store `regent_id` and `lieutenant_id` (character `_id` strings) instead of `regent`/`lieutenant` (name strings)
4. Player portal derives regent status at load time: query `/api/territories`, find any territory where `regent_id` matches the character's `_id`
5. Downtime form uses the derived regent territory (not a character field) for regent badge, residency grid, and submission data
6. Regency tab uses the derived territory lookup (not `c.regent_territory`)
7. City tab (player) derives regent list from territories, not from character fields
8. Admin City panel writes `regent_id`/`lieutenant_id` on the territory document (ID-based, not name strings)
9. Admin City panel save handler no longer writes `regent_territory`/`regent_lieutenant` to character documents
10. Admin editor identity section: regent territory display derived from territories API (read-only, not an editable field on the character)
11. Admin character grid/prestige views derive regent status from territories
12. Territory schema updated: `regent` → `regent_id`, `lieutenant` → `lieutenant_id` (both `string|null` storing character `_id`)
13. Zero references to `c.regent_territory` or `c.regent_lieutenant` in any JS file after migration
14. Downtime submission schema still accepts `regent_territory` as a submitted response field (historical submissions are not migrated)

## Tasks / Subtasks

- [ ] Task 1: Schema and migration (AC: 1, 2, 12)
  - [ ] Remove `regent_territory` and `regent_lieutenant` from `server/schemas/character.schema.js` properties
  - [ ] Update `server/schemas/territory.schema.js`: rename `regent` → `regent_id`, `lieutenant` → `lieutenant_id`
  - [ ] Create `server/scripts/migrate-regent-to-id.js`:
    - Connect to `tm_suite` via `MONGODB_URI`
    - Load all characters (name, moniker, _id)
    - For each territory with a `regent` name string: find matching character by `displayName` or `moniker` or `name`, replace `regent` with `regent_id` set to character `_id`, `$unset` old `regent` field. If no character matches (retired/deleted), set `regent_id: null` and log a warning. Same for `lieutenant` → `lieutenant_id`.
    - `$unset` `regent_territory` and `regent_lieutenant` from all character documents
    - Log count of territories and characters modified, plus any unresolved regent/lieutenant names
    - Idempotent (safe to run twice — skip territories that already have `regent_id`)

- [ ] Task 2: Create regent lookup utility (AC: 3, 4)
  - [ ] Create function in `public/js/data/helpers.js` or new module:
    ```js
    /** Find regent territory for a character. Returns { territory, lieutenantId } or null. */
    export function findRegentTerritory(territories, charId)
    ```
  - [ ] Match territory `regent_id` field against character `_id` (exact string match)
  - [ ] Return `{ territory: t.name, lieutenantId: t.lieutenant_id }` or `null` if not a regent
  - [ ] Cache result on the character object as `_regentTerritory` (ephemeral, not persisted — same pattern as `_gameXP`)

- [ ] Task 3: Migrate player portal (AC: 3, 4, 5, 6)
  - [ ] `public/js/player.js`: load territories at startup (one `apiGet('/api/territories')` call), derive regent status for active character using the lookup utility. Replace `activeChar.regent_territory` checks (~2 refs)
  - [ ] `public/js/player/regency-tab.js`: replace all `currentChar.regent_territory` reads (~6 refs) with `currentChar._regentTerritory` or the lookup utility; replace `currentChar.regent_lieutenant` (~1 ref)
  - [ ] `public/js/player/downtime-form.js`: replace all `currentChar.regent_territory` reads (~8 refs) with derived value; update regent badge, gate values, submission data, residency grid
  - [ ] `public/js/player/city-tab.js`: derive regent list from territories data instead of filtering characters by `c.regent_territory` (~3 refs)

- [ ] Task 4: Migrate admin views (AC: 8, 9, 10, 11)
  - [ ] `public/js/admin/city-views.js`: 
    - Remove the sync block that writes `regent_territory`/`regent_lieutenant` to characters (lines ~524-540)
    - Update territory save to write `regent_id`/`lieutenant_id` (character `_id` values) instead of `regent`/`lieutenant` (name strings)
    - Update prestige/territory displays to resolve regent names from character list by `_id`, not from territory name strings (~5 refs)
  - [ ] `public/js/editor/sheet.js`: remove `regent_territory` dropdown from identity section; show regent territory as read-only derived text (or omit if not a regent)
  - [ ] `public/js/editor/edit.js`: remove `regent_territory` from the identity edit handler (~1 ref)
  - [ ] `public/js/admin/data-portability.js`: update territory export/import to use `regent_id`/`lieutenant_id`

- [ ] Task 5: Cleanup and verification (AC: 11, 12)
  - [ ] `grep -r 'regent_territory' public/js/` returns zero results
  - [ ] `grep -r 'regent_lieutenant' public/js/` returns zero results (except possibly as a comment)
  - [ ] Verify `server/schemas/downtime_submission.schema.js` still allows `regent_territory` in submission responses (historical data)
  - [ ] Remove `regent_territory` from the character list projection in `server/routes/characters.js:94`
  - [ ] Remove `REGENT_TERRITORIES` constant import from `sheet.js` if it was only used for the regent dropdown

## Dev Notes

### Territory data shape (after migration)

```json
{
  "id": "north-shore",
  "name": "The North Shore",
  "regent_id": "67d3a503268a60765e441361",
  "lieutenant_id": "67d3a503268a60765e441362",
  "ambience": "Predatory",
  "feeding_rights": ["Angelus", "Livia"]
}
```

The `regent` and `lieutenant` fields currently store display name strings — fragile because names change. This story migrates them to `regent_id` and `lieutenant_id` storing MongoDB `_id` values. The lookup then matches by ID, not name.

### Territories API

- `GET /api/territories` — returns full array, no auth required
- Already called by the suite app at startup. Player app may need to add this call.

### Character list projection

`server/routes/characters.js:94` includes `regent_territory` in the lightweight character list projection. Remove it after migration — it won't exist on documents anymore.

### Admin City panel write path

The City panel (`city-views.js`) currently saves regent/lieutenant as name strings to the territory document via `PUT /api/territories/:id`. This changes to write `regent_id`/`lieutenant_id` as character `_id` values. The select dropdowns already use `c._id` as option values (line ~327), so the mapping is straightforward. The secondary writes to character documents are removed entirely.

### Regent lookup caching

The lookup runs once at player portal load and caches `_regentTerritory` on the character object (prefixed with `_` to indicate ephemeral/derived, same pattern as `_gameXP`). This avoids repeated territory scans. If the active character changes, re-derive.

### Scope exclusion: `feeding_rights`

The territory `feeding_rights` field also stores character name strings. Migrating that to IDs is desirable but out of scope for this story — it's a separate array with different semantics (multiple characters per territory). A follow-up story can address it.

### `REGENT_TERRITORIES` constant

Defined in `constants.js:165` and `admin.js:67`. This constant lists the 5 territory names and is used by the editor dropdown. After this story, the editor no longer has a regent dropdown, so the import in `sheet.js` can be removed. The constant itself should remain in `constants.js` — it may be used by other territory UI (e.g. admin territory grid). Only remove the import where it's no longer referenced.

### Edge case: regent of multiple territories

Theoretically a character could regent multiple territories. The lookup should return the first match (or an array if multiple). Current data has 1:1 mapping, but the code should handle it gracefully.

### Testing

- Verify player portal shows correct regent badge after migration (derived from territories)
- Verify downtime form pre-fills correct regent territory
- Verify regency tab loads correct residency data
- Verify admin City panel regent assignment still works (writes to territory only)
- Verify admin editor no longer shows regent dropdown in identity section
- Verify a character that is NOT a regent shows no regent badge
- Verify grep returns zero references to `regent_territory` on character objects
- Run migration twice to verify idempotency
- Verify migration handles a territory with a regent name that doesn't match any character (should set null + warn)
- Verify admin editor shows regent territory as read-only derived text for a regent character

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
