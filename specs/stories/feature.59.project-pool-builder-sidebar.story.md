# Story feature.59: Project Action Panel — ST Pool Builder + Right Sidebar

## Status: done

## Story

**As an** ST processing project and ambience actions,
**I want** a structured pool builder with the same attr/skill/disc selectors, 9-again, and specialisation toggles as the feeding panel,
**so that** I can build and validate pools consistently without free-typing expressions.

## Background

Currently, project/ambience actions show a basic two-column layout: player's submitted pool (read-only) on the left, free-text ST validated pool input on the right, with Validation Status below. This is inconsistent with the feeding panel which has a full structured pool builder.

This story replaces that layout with the full feeding-style two-column layout:
- **Left column:** player's submitted pool display + ST pool builder (attr/skill/disc + pool total + 9-again + spec toggles) + project detail fields + player feedback + ST notes
- **Right sidebar:** Dice Pool Modifiers (equipment/other only) + Success Modifier (manual ±, replaces Vitae Tally) + Rote toggle + Validation Status + committed pool display

The validation button writes `pool_validated` from the builder expression (same as feeding). The success modifier is saved as `succ_mod_manual` on the resolved project object.

## Acceptance Criteria

1. Project entries in `renderActionPanel` use a `proc-feed-layout` / `proc-feed-left` wrapper identical to feeding.
2. Left column contains: player's submitted pool (read-only), ST Pool Builder (`proc-pool-builder` with `proc-pool-attr/skill/disc`, `proc-pool-mod-val`, `proc-pool-total`), 9-again badge/toggle, spec toggles — all using the same class names and functions as feeding.
3. Right sidebar (`_renderProjRightPanel`) contains:
   - **Dice Pool Modifiers**: Equipment/Other ticker only (no Feeding Grounds, no Unskilled rows). Total row.
   - **Success Modifier**: manual ±N ticker (`proc-succmod-dec/inc`), saved as `succ_mod_manual` on the resolved project object.
   - **Rote toggle** checkbox.
   - **Validation Status**: Pending / Validated / No Roll Needed buttons + committed pool display (same as feeding right panel). Validation status removed from left column.
4. Clicking Validated reads the builder expression via `_readBuilderExpr`, auto-detects 9-again from the skill, saves `pool_validated` + `nine_again` (same path as feeding).
5. Skill change calls `_updateFeedBuilderMeta` for project entries so 9-again and specs update live.
6. `_updatePoolModTotal` already works for project entries (it looks up `.proc-feed-mod-panel[data-proc-key]`) — no change needed.
7. `proc-succmod-dec/inc` ticker is wired and saves `succ_mod_manual` on blur/click; `_updateSuccModTotal` updates the display.
8. The old free-text `proc-pool-input` and inline validation status are removed for project entries.
9. All existing project entry data (title, outcome, territory, cast, merits, previous roll, re-tag) remains in left column.

## Tasks / Subtasks

- [x] Task 1: `_renderProjRightPanel(entry, char, rev)` function
  - [x] Equipment/Other ticker panel (reuse `proc-feed-mod-panel` class, `proc-equip-mod-*` classes)
  - [x] Success Modifier panel (`proc-proj-succ-panel`, `proc-succmod-dec/inc`, `proc-succmod-val`, `proc-succmod-disp`)
  - [x] Rote toggle (same `proc-pool-rote` class)
  - [x] Validation Status section (Pending/Validated/No Roll Needed + committed pool display)

- [x] Task 2: Restructure `renderActionPanel` for project entries
  - [x] Wrap project entries in `proc-feed-layout` / `proc-feed-left`
  - [x] Add player's submitted pool display (same as feeding read-only block)
  - [x] Add ST Pool Builder block (copy feeding pool builder — same classes, same pre-populate logic)
  - [x] Move project detail fields (title, outcome, territory, cast, merits) and roll result into left column
  - [x] Remove `proc-detail-grid` and inline validation status for project entries
  - [x] Close left column, call `_renderProjRightPanel`, close `proc-feed-layout`

- [x] Task 3: Extend event handlers
  - [x] `proc-val-btn`: extend to also read builder expr + auto-detect 9-again for project entries
  - [x] `proc-pool-skill` change: call `_updateFeedBuilderMeta` for project entries (currently only feeds)
  - [x] `proc-pool-skill` change: reset `active_feed_specs` for project entries (same as feeding)
  - [x] Add `proc-succmod-dec/inc` click handlers → update display, save `succ_mod_manual`

- [x] Task 4: CSS
  - [x] `.proc-proj-succ-panel` — same visual style as `proc-feed-mod-panel`
  - [x] `.proc-proj-succ-total-val` — same as `proc-vitae-total-val`

## Dev Notes

### Key existing functions to reuse unchanged
- `_readBuilderExpr(builder)` — reads attr/skill/disc/mod from builder DOM, returns expression string
- `_updatePoolTotal(container, key)` — recomputes pool total display; already works for any entry
- `_updatePoolModTotal(container, key)` — recomputes modifier panel total + syncs to builder mod input; already works (looks up `.proc-feed-mod-panel[data-proc-key]`)
- `_updateFeedBuilderMeta(container, key)` — updates 9-again badge + spec toggles on skill change; already looks up by `data-proc-key`, works for any source
- `_charDiscsArray(char)`, `_parsePoolExpr(...)`, `_poolTotalDisplay(...)`, `_buildPoolExpr(...)` — all reusable

### Right panel class reuse
The equipment ticker in `_renderProjRightPanel` should use the same classes as feeding (`proc-feed-mod-panel`, `proc-equip-mod-dec/inc`, `proc-equip-mod-val`, `proc-equip-mod-disp`) so the existing equipment ticker event handlers fire without changes.

### Success modifier vs Vitae Tally
The Success Modifier panel is a simple ±N ticker with no auto-rows. It just stores a number (`succ_mod_manual`) that the ST can use as context when adjudicating the result. It does not feed into any automated calculation. Total display just shows the signed value.

### Committed pool display
Same pattern as feeding: if `active_feed_specs` exists on the review, append spec names to the pool expression. Uses the same `rev.active_feed_specs` field.

### Validation status options for project
```
[['pending', 'Pending'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed']]
```
(Same as the existing non-feeding inline status options for projects — sorcery keeps its own.)

### Pool builder pre-populate
Same logic as feeding: if `pool_validated` exists, parse it with `_parsePoolExpr` to restore attr/skill/disc/modifier selections. Uses `_charDiscsArray(char)` for disc options.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | `_renderProjRightPanel`; restructure project block in `renderActionPanel`; extend event handlers |
| `public/css/admin-layout.css` | `.proc-proj-succ-panel`, `.proc-proj-succ-total-val` |

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

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.59.project-pool-builder-sidebar.story.md`
