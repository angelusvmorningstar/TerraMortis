# Story feat-19: Regency View — Regent/Lieutenant Deduplication in Feeding Rights

Status: review

## Story

As a Regent player,
I want the feeding rights panel to not duplicate my regent and lieutenant slots as dropdowns,
so that I don't have to manage a confusing duplication where slot 1 and 2 are always pre-filled with positions already shown above.

## Acceptance Criteria

1. The Regent row and Lieutenant row at the top of the Regency view are the sole display for those positions — no feeding right dropdown exists for slot 1 or slot 2.
2. Feeding right dropdowns start at position 3 (labelled "Feeding Right 3") and run up to the territory's feeding rights cap.
3. The number of selectable feeding right slots is `cap - 2` (regent + lieutenant always occupy slots 1 and 2). If there is no lieutenant, slots available = `cap - 1`.
4. The over-capacity highlight logic still works: any filled slot beyond the cap is highlighted with `dt-over-cap`.
5. When saving, the `feeding_rights` array posted to the API contains only the additional character IDs — it does NOT include `regent_id` or `lieutenant_id`.
6. When loading, saved feeding_rights values are applied starting at the first additional slot (slot 3). Any ID in feeding_rights matching `regent_id` or `lieutenant_id` is silently skipped (handles legacy data).
7. The dropdown character list for additional slots does not need to exclude the regent or lieutenant — the player can grant a regent or lieutenant an additional slot if they wish.

## Tasks / Subtasks

- [x] Task 1 — Update `renderRegencyTab` render function (AC: 1, 2, 3, 4)
  - [x] Remove the feeding right 1 and 2 dropdown slots from the loop
  - [x] Change loop to start at `i = 3` and run to `cap` (inclusive), producing `cap - 2` slots
  - [x] If no lieutenant (`!ri.lieutenantId`): start at `i = 2`, producing `cap - 1` slots
  - [x] Labels remain "Feeding Right 3", "Feeding Right 4" etc. (position-based numbering)
  - [x] Over-cap logic: slot at position `i` is over-cap when `i > cap` — remove the `+ 2` offset since loop now starts at the correct position
  - [x] Element IDs: keep `reg-slot-${i}` keyed by position number for consistency

- [x] Task 2 — Update `saveRegency` to exclude regent/lieutenant from array (AC: 5)
  - [x] Loop from `i = 3` (or `i = 2` if no lieutenant) up to `MAX_FEEDING_POSITION`, stopping at first missing element
  - [x] Push `el.value` only for elements that exist and have a value
  - [x] Do not manually add regent_id or lieutenant_id to the array

- [x] Task 3 — Update load / value assignment to skip legacy regent/lieutenant IDs (AC: 6)
  - [x] Filter rawFeedingRights to exclude regent_id and lieutenant_id before populating slots
  - [x] Use `additionalRights[i - loopStart]` to map filtered array to correct slot positions

- [x] Task 4 — Update `FEEDING_SLOTS` constant (AC: 2, 3)
  - [x] Replaced `FEEDING_SLOTS = 10` with `MAX_FEEDING_POSITION = 12` (max position index including regent+lt)
  - [x] All loops (render, save, confirm, getResidencyList) use `loopStart` derived from whether lieutenant exists
  - [x] Lieutenant row hidden entirely from display when no lieutenant assigned

## Dev Notes

### Key File

**`public/js/player/regency-tab.js`** — this is the only file that needs changes. All logic is self-contained here.

### Implementation Notes

- `loopStart = ltId ? 3 : 2` — computed in each function that needs it from `ri.lieutenantId`
- `additionalRights` — filtered array excluding regent_id and lieutenant_id, used for pre-populating slots on load
- `loopEnd = Math.max(cap, loopStart + additionalRights.length - 1)` in render — shows all existing data even if over-cap
- Save/confirm/getResidencyList all use `break` when `document.getElementById(`reg-slot-${i}`)` returns null, preventing over-scan
- Lieutenant row is hidden (not rendered) when `ltId` is falsy — cleaner than showing "— None —" as a locked row
- `MAX_FEEDING_POSITION = 12` replaces `FEEDING_SLOTS = 10`; the old constant added 2 mentally; new constant is the actual max position number

### Project Conventions

- British English throughout
- No em-dashes
- HTML built as string `h +=` pattern
- `esc()` for all user-facing strings
- `displayName(c)` for character names

### References

- Render function: `public/js/player/regency-tab.js`
- Territory schema: `server/schemas/territory.schema.js`
- AMBIENCE_CAP: `public/js/player/downtime-data.js`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- All four tasks implemented in a single pass on `public/js/player/regency-tab.js`
- No API or schema changes required
- Legacy data handled by filtering regent_id and lieutenant_id from rawFeedingRights on load

### File List

- public/js/player/regency-tab.js
