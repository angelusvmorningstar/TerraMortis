# Story feature.61: Project Panel — Roll Card, Toggle Suite, and Dice Display

## Status: done

## Story

**As an** ST processing project and ambience actions,
**I want** a roll card in the right sidebar with 9-Again/8-Again toggles and individual dice display,
**so that** I can roll from the panel, control die explosion rules, and read each die result clearly.

## Background

Feature.59 gave the project panel a right sidebar with Rote toggle and Validation Status, and a roll button in the left column. Five improvements are needed:

1. The roll button and results belong in the right sidebar under Validation Status — not in the left column.
2. The pool expression total should annotate "(9-Again)" when the selected skill auto-qualifies.
3. The 9-Again toggle is currently buried in the left column builder meta; it should sit in the sidebar with Rote. 8-Again is not exposed at all.
4. After validating, the sidebar should note which of Rote / 9-Again / 8-Again were active.
5. Roll results show only a success count. Individual die values (with `!` for exploded dice) are more useful — e.g. `[1, 3, 5, 8, 10!, 9!, 4, 5] 7 Successes`.

## Acceptance Criteria

1. Right sidebar has a Roll card below Validation Status: Roll/Re-roll button (only when status is `validated` or a roll exists) + formatted dice result when a roll exists.
2. Dice result format: `[v1, v2!, v3, ...]` where `!` marks dice that exploded (caused a chain), followed by success count — e.g. `[1, 3, 5, 8, 10!, 9!, 4, 5] 7 Successes`.
3. Roll modal is opened with `showRollModal` using `again` derived from the sidebar 8-Again/9-Again checkboxes (`8-Again → 8`, `9-Again → 9`, otherwise `10`).
4. The pool total display (`proc-pool-total`) appends ` (9-Again)` when the selected skill auto-has 9-again.
5. Left column builder meta for project entries shows only spec toggles (no 9-again section); 9-Again auto-detects on skill change and syncs the sidebar checkbox.
6. Right sidebar toggles row contains: Rote Action, 9-Again, 8-Again — all as checkboxes.
7. Below the committed pool (when status is `validated`), show a notation line of active flags — e.g. `Rote · 9-Again`.
8. Rote changes on project entries are saved via `saveEntryReview` (to `rev.rote`) not to `st_review.feeding_rote`.
9. Roll button removed from the left column for project entries.

## Tasks / Subtasks

- [x] Task 1: Dice formatting helper
  - [x] Import `parseDiceString` from `../downtime/roller.js`
  - [x] Add `_formatDiceString(diceString)` — parses chains, marks non-last-in-chain values with `!`, returns `[v1, v2!, ...]` string

- [x] Task 2: Pool total "(9-Again)" annotation
  - [x] Add `nineAgain = false` param to `_poolTotalDisplay`; append ` (9-Again)` when true
  - [x] Add `data-nine-again` attribute to `proc-pool-total` element at render time
  - [x] `_updatePoolTotal` reads `data-nine-again` from the element and passes to `_poolTotalDisplay`

- [x] Task 3: Project pool builder — move 9-again to sidebar
  - [x] Compute `_pnA = skNineAgain(char, preSkill)` before `initTotalStr`, pass it in
  - [x] Set `data-nine-again` attribute on `proc-pool-total` at initial render
  - [x] Remove 9-again label/toggle from builder meta for project entries (spec toggles only)

- [x] Task 4: `_updateFeedBuilderMeta` — project path
  - [x] For project entries: skip 9-again rendering in meta
  - [x] Sync auto-detected `nineA` to sidebar `.proc-proj-9a` checkbox and pool total `data-nine-again`
  - [x] Call `_updatePoolTotal` after syncing

- [x] Task 5: `_renderProjRightPanel` changes
  - [x] Read `isRote` from `rev.rote` (not from `projects_resolved[idx].rote` separately)
  - [x] Add 9-Again and 8-Again checkboxes to toggles row
  - [x] Add validation notation below committed pool (only when `poolStatus === 'validated'`)
  - [x] Add Roll card section after Validation Status

- [x] Task 6: Fix `proc-pool-rote` handler for project entries
  - [x] When `entry.source === 'project'`, use `saveEntryReview(entry, { rote: cb.checked })` instead of `st_review.feeding_rote`

- [x] Task 7: New sidebar toggle handlers
  - [x] `proc-proj-9a` change → `saveEntryReview({ nine_again })`, update `data-nine-again` + pool total in-place, re-render
  - [x] `proc-proj-8a` change → `saveEntryReview({ eight_again })`, re-render

- [x] Task 8: Replace `proc-action-roll-btn` for project entries with `proc-proj-roll-btn`
  - [x] Remove roll button from left column for project entries (left of player feedback)
  - [x] Add new `proc-proj-roll-btn` handler: reads sidebar checkbox states for `again`/`rote`, uses `showRollModal`, saves result via `saveEntryReview`

- [x] Task 9: Update validation button handler for project entries
  - [x] At validation time, also read and save `rote`, `eight_again` from sidebar checkboxes

- [x] Task 10: CSS
  - [x] `.proc-proj-roll-card` — same panel style as validation section
  - [x] `.proc-proj-roll-result` — dimmed small text for dice result line
  - [x] `.proc-proj-val-notation` — gold-tinted small notation text

## Dev Notes

### Dice format
`rollPool` stores `dice_string` as `[chain1,chain2,...]` where each chain is `v1>v2>...` (raw 0–9 where 0 = face 10). `parseDiceString` from `roller.js` splits this into arrays of arrays. In `_formatDiceString`, iterate each chain: every value except the last gets `!` (it caused an explosion).

### 9-Again sync flow
`_updateFeedBuilderMeta` fires when skill select changes. For project entries, after computing `nineA = skNineAgain(char, skill)`:
1. Set `.proc-proj-9a[data-proc-key="${key}"]` checked state
2. Set `proc-pool-total[data-proc-key="${key}"]` data-nine-again attribute
3. Call `_updatePoolTotal(container, key)` to refresh pool expression text

### again derivation for roll
```javascript
const eightAgain = rightPanel?.querySelector('.proc-proj-8a')?.checked || false;
const nineAgain  = rightPanel?.querySelector('.proc-proj-9a')?.checked || false;
const again = eightAgain ? 8 : nineAgain ? 9 : 10;
```
8-Again takes precedence over 9-Again.

### Rote storage fix
`proc-pool-rote` handler saves to `st_review.feeding_rote` for all sources currently. For project entries, `saveEntryReview(entry, { rote: cb.checked })` writes to `projects_resolved[idx].rote` instead. `_renderProjRightPanel` should read `rev.rote` directly.

### Roll card visibility
Show the Roll button when `poolStatus === 'validated'` OR a roll already exists (re-roll path). Show result block when `rev.roll` exists.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | All logic changes |
| `public/css/admin-layout.css` | `.proc-proj-roll-card`, `.proc-proj-roll-result`, `.proc-proj-val-notation` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-13 | 1.0 | Initial draft | Angelus |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- Rote storage fixed: project entries now save `rev.rote` via `saveEntryReview` instead of `st_review.feeding_rote`
- `parseDiceString` import merged with existing `rollPool`/`showRollModal` imports
- `_updateFeedBuilderMeta` now has a project-specific path that skips the 9-again meta section and syncs to the sidebar checkbox instead

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.61.project-roll-card-and-dice-display.story.md`
