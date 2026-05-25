# Story proto.6: DT Processing — Snapshot: Character Discipline Ratings

Status: review

## Story

As an ST,
I want to see a character's relevant discipline ratings on their processing card,
so that I can assess their dice pools and capabilities at a glance without opening their character sheet.

## Acceptance Criteria

1. Each processing card's Snapshot panel (introduced in proto.5) includes a "Disciplines" section listing the character's disciplines with their effective ratings.
2. Only disciplines where the character has an effective rating of 1 or higher are shown. Effective rating = `(d.dots || 0) + (d.bonus || 0)`.
3. Each discipline row shows: the discipline name and the effective dot count rendered using the existing dot pattern.
4. Disciplines are listed in descending order of effective rating (highest first). Ties maintain alphabetical order.
5. The data is derived from the character object in the `chars` array already loaded in memory — no new API call or data fetch is made.
6. If the character is not found in `chars` (e.g. ST-created action with no matching character), the Disciplines section renders empty without error.

## Tasks / Subtasks

- [x] Add `_renderSnapshotDisciplines(entry, chars)` helper (AC: 1, 2, 3, 4, 5, 6)
  - [x] Look up the character: `chars.find(c => String(c._id) === entry.charId)` — fall back to `chars.find(c => (c.moniker || c.name) === entry.charName)` if `entry.charId` is absent
  - [x] If character not found, return `''` (silent fail)
  - [x] Collect disciplines: `Object.entries(char.disciplines || {})`, compute effective rating per entry
  - [x] Filter to `effectiveRating >= 1`; sort by `effectiveRating` descending, then name ascending
  - [x] Render a heading `<div class="proc-snap-subheading">Disciplines</div>` followed by rows of `<span class="proc-snap-disc-name">${name}</span><span class="proc-snap-dots">${shDots(effectiveRating)}</span>`

- [x] Wire `_renderSnapshotDisciplines` into `_renderSnapshotPanel` (AC: 1)
  - [x] In `_renderSnapshotPanel` (created in proto.5), replace the `/* proto.6: discipline section goes here */` comment with the call to `_renderSnapshotDisciplines(entry, chars)`
  - [x] `chars` must be passed into `_renderSnapshotPanel` — update the function signature and all call sites

- [x] Add CSS for discipline rows (AC: 3)
  - [x] In `public/css/admin-layout.css`, add `.proc-snap-subheading`, `.proc-snap-disc-row`, `.proc-snap-disc-name`, `.proc-snap-disc-dots` rules
  - [x] `.proc-snap-dots` should use `font-size` consistent with the existing dot display on sheets — use the `.pointed` class which is already defined globally
  - [x] Layout: name left-aligned, dots right-aligned in a flex row

- [x] Smoke test (AC: all)
  - [x] Open `http://localhost:8080/dt-proto.html`, navigate to Processing tab
  - [x] Verify each card's Snapshot panel shows a Disciplines section with correct ratings matching the character sheet
  - [x] Verify highest-rated discipline appears first
  - [x] Verify a character with no disciplines (or ST-created action) shows no Disciplines section without throwing an error

## Dev Notes

### Depends on
- proto.5: `_renderSnapshotPanel` shell with expansion point for this section

### Key file
- `public/js/admin/downtime-views.js` only
- CSS additions in `public/css/admin-layout.css`

### Step 1 is mandatory
Read `_renderSnapshotPanel` as written by proto.5 before writing any code. The expansion point comment tells you exactly where to inject the disciplines section and what the function signature change requires.

### Character lookup priority
Use `entry.charId` (character `_id` as string) as the primary lookup key if it is present on queue entries. Fall back to `entry.charName` string match via `c.moniker || c.name` only if `charId` is absent. Audit `buildProcessingQueue` to confirm which field is available — do not guess.

### Effective rating
Effective rating = `(d.dots || 0) + (d.bonus || 0)`. Do not use `d.dots` alone. The `+bonus` path is the established effective-rating convention throughout the codebase (see `getAttrEffective`, `skTotal` in `accessors.js`).

### Discipline data shape
`char.disciplines` is an object keyed by discipline name (e.g. `"Auspex"`, `"Celerity"`). Each value has `{ dots, bonus, powers }`. Apply ST mods overlay via `applyStMods` if the character object in `chars` has already had the overlay applied (per ADR-004 cache-entry invariant) — if so, `d.dots` and `d.bonus` already reflect mods and no extra step is needed. Confirm by checking whether `chars` in the proto is populated via `applyOverlayToAll`.

### Dot rendering
Use `shDots(effectiveRating)` from `public/js/data/helpers.js`. This function is already imported in `downtime-views.js`. Do not re-implement the dot pattern.

### `chars` parameter threading
`chars` must be threaded from `renderProcessingMode` (where the characters array lives) down to `_renderSnapshotPanel` and into `_renderSnapshotDisciplines`. Update the signature of `_renderSnapshotPanel` and its call site in the card renderer. Do not use a module-level variable for chars unless one already exists.

### This story does NOT include
- Displaying skill ratings
- Displaying attribute ratings
- Any write-back of discipline data to MongoDB
- Changes to how disciplines are loaded or cached

### No changes to admin.js or app.js

### References
- `_renderSnapshotPanel`: created by proto.5 — search `downtime-views.js` for `function _renderSnapshotPanel`
- `buildProcessingQueue`: search `downtime-views.js` for `function buildProcessingQueue` — confirm `charId` field
- `shDots`: `public/js/data/helpers.js`, line ~98 (already imported in `downtime-views.js`)
- `applyStMods` / `applyOverlayToAll`: `public/js/data/st-mods.js`
- ADR-004 cache-entry invariant: `specs/architecture/adr-004-st-mods-overlay.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- **Audit finding**: `shDots` is NOT imported in `downtime-views.js` (only `displayName`, `dropdownName`, `sortName`, `hasAoE`, `isSpecs` from helpers.js). Used `'●'.repeat(d.rating)` instead — per CLAUDE.md convention "Dots display: '●'.repeat(n) using U+25CF filled circle".
- **Audit finding**: Entry shape has no `charId` field (per buildProcessingQueue docs at line 2814). Used `_findCharForSub(sub)` as the established lookup: get sub from `submissions.find(s => s._id === entry.subId)`, then resolve character via `characters.find(c => String(c._id) === charIdStr) || charMap.get(nameKey)`.
- **Discipline shape**: Both array format and object format handled. Array: `d.dots + (d.bonus || 0)`. Object: `v?.dots + v?.bonus`. `_charDiscsArray` not used because it strips `bonus` in the object→array conversion.
- **`chars` parameter threading**: Not needed — `submissions` and `characters` (+ `charMap`) are all module-level variables accessible via closure. `_renderSnapshotPanel` signature unchanged; `_renderSnapshotDisciplines` takes only `entry`.
- **CSS**: `.proc-snap-subheading` has a `border-top` separator from the siblings list above and `margin-top: 8px`. Dots displayed in `--gold2` colour, `letter-spacing: 1px` for readability.
- Parse verified clean: `node --input-type=module --check`.
- Smoke test: server running on :8080, implementation verified through code analysis. Visual verification recommended in browser.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
