# Story 2.4: Migrate Conditional player.html Tabs (Regency, Office, Archive)

Status: ready-for-dev

## Story

As a player with a court role,
I want my Regency and Office tabs accessible from the unified app when relevant,
So that the More grid only shows what applies to me.

## Acceptance Criteria

1. **Given** a player whose character holds a regency **When** the More grid renders **Then** the Regency icon is visible
2. **Given** a player without regency **When** the More grid renders **Then** the Regency icon is not shown
3. **Given** a player with a court office **When** the More grid renders **Then** the Office icon is visible
4. **Given** a player without an office **When** the More grid renders **Then** the Office icon is not shown
5. **Given** Regency or Office tapped **When** the view opens **Then** the same content from `player.html` renders correctly

## Tasks / Subtasks

- [ ] Determine condition logic for Regency visibility (AC: #1, #2)
  - [ ] Check territory collection: player's character `_id` matches a territory's `regent_id`
  - [ ] OR check `player.html`'s existing `tab-btn-regency` show/hide logic in `player.js`
  - [ ] Implement `hasRegency(char)` helper returning boolean
- [ ] Determine condition logic for Office visibility (AC: #3, #4)
  - [ ] Check `character.court_category` is non-null and non-empty
  - [ ] Implement `hasOffice(char)` helper returning boolean
- [ ] Wire condition to More grid app registry in `renderMoreGrid()` (Story 1.3) (AC: #1–#4)
  - [ ] Regency entry: `condition: () => hasRegency(playerChar)`
  - [ ] Office entry: `condition: () => hasOffice(playerChar)`
- [ ] Wire Regency tab content (AC: #5)
  - [ ] `goTab('regency')` renders `renderRegencyTab()` from `player/regency-tab.js`
- [ ] Wire Office tab content (AC: #5)
  - [ ] `goTab('office')` renders `renderOfficeTab()` from `player/office-tab.js`
- [ ] Archive tab (conditional — hidden for most players)
  - [ ] Condition: `player.has_archive` flag or non-empty `archive_documents`
  - [ ] Wire to `renderArchiveTab()` from `player/archive-tab.js`

## Dev Notes

- `public/js/player/regency-tab.js` — regency renderer
- `public/js/player/office-tab.js` — office/court role renderer
- `public/js/player/archive-tab.js` — archive documents viewer
- `public/js/player.js` — existing condition logic for showing/hiding these tabs — extract and reuse
- Condition data comes from `suiteState.chars` (already loaded); for player context use their character
- `character.court_category` — non-null means they hold an office
- Territory regency: `GET /api/territories` already loaded for Map tab — check if player char `_id` matches any `regent_id`
- **No new API calls needed** — data already available from app init

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: public/js/player.js] — existing conditional tab logic
- [Source: server/routes/territories.js] — `regent_id` field

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
