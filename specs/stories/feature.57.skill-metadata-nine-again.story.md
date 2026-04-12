# Story feature.57: Skill Metadata — 9-Again and Specialisations in Pool Builders

## Status: done

## Story

**As an** ST building dice pools for feeding and personal projects,
**I want** to see whether the selected skill has 9-again and which specialisations the character has,
**so that** I can apply the correct exploding threshold and grant spec bonuses automatically.

## Background

VtR 2e: 9-again means any die showing 9 or 10 explodes (re-rolls). An asset skill (flagged `nine_again: true` on the character's skill object) automatically gets 9-again — no manual toggle needed. Each relevant specialisation adds +1 die to the pool.

Example: Conrad uses Wits + Stealth. Stealth is an asset skill (`nine_again: true`). He has the Stalking specialisation. The pool builder should auto-badge "9-Again", and show a Stalking toggle (+1 dice).

This story adds skill metadata to:
1. **Project pool builder** (`poolBuilderUI` / `renderProjectsPanel`)
2. **Feeding processing panel** (`_renderFeedRightPanel` / `renderActionPanel`)

## Acceptance Criteria

1. When a skill is selected in the project pool builder (`pen.skill` is set), a skill metadata block renders below the pool builder showing:
   - 9-again badge (green, `dt-pool-9a-auto`) if `skNineAgain(char, skill)` — auto-detected, not toggleable
   - Each spec from `skSpecs(char, skill)` as a checkbox toggle (`dt-spec-toggle`)
2. Each toggled spec adds +1 to the dice pool size passed to the roll (not to the pool expression modifier). Tracked in `_proj_pending[i].spec_bonus` = count of checked specs.
3. Project roll button passes `again: (pen.nine_again ? 9 : 10)` and `size: pool.total + (pen.spec_bonus || 0)` to `showRollModal`.
4. For the feeding processing panel (`_renderFeedRightPanel`), when `pool_validated` is set, parse the skill from the expression and show:
   - 9-again badge if `skNineAgain(char, skill)`
   - Spec toggles (same visual treatment)
5. Feeding spec toggles persist as `rev.pool_mod_spec` (a number) via `saveEntryReview`. Feeding roll adds `rev.pool_mod_spec` to `diceCount` and uses `again: 9` if `rev.nine_again`.
6. `rev.nine_again` is auto-set to `true` when the pool is validated (`saveEntryReview({ nine_again: true/false, ... })`).
7. `skNineAgain` and `skSpecs` imported from `../data/accessors.js` (already exported there).

## Tasks / Subtasks

- [x] Task 1: Import `skNineAgain`, `skSpecs` in `downtime-views.js` (AC: 7)
  - [x] Add to existing `../data/accessors.js` import line

- [x] Task 2: Project pool builder skill metadata (AC: 1–3)
  - [x] Add `skillMetaUI(char, skillName, subId, idxField, idxVal, pen)` helper
  - [x] Call `skillMetaUI` at end of `poolBuilderUI` before closing `</div>`
  - [x] Store `pen.nine_again = skNineAgain(char, pen.skill)` in the proj-sel change handler; reset active_specs/spec_bonus
  - [x] Add `.dt-spec-toggle` change handler: toggle active_specs, recompute spec_bonus, re-render
  - [x] Project roll: passes `size: pool.total + spec_bonus` and `again: nineAgain ? 9 : 10`

- [x] Task 3: Feeding pool skill metadata (AC: 4–6)
  - [x] `_renderFeedRightPanel`: after committed pool, parse skill via `_parsePoolExpr`, render 9-again badge + `.dt-feed-spec-toggle` checkboxes
  - [x] `renderProcessingMode`: `.dt-feed-spec-toggle` change handler updates `active_feed_specs + pool_mod_spec` via `saveEntryReview`
  - [x] `proc-val-btn` validated handler: auto-detects `nine_again` from skill and saves with pool_validated
  - [x] `proc-feed-roll-btn`: adds `pool_mod_spec` to diceCount; uses `again: 9` if `review.nine_again`

- [x] Task 4: CSS (AC: 1, 4)
  - [x] `.dt-skill-meta`, `.dt-pool-9a-auto`, `.dt-spec-toggle-lbl` added

## Dev Notes

### `_parsePoolExpr` for feeding skill detection

`_parsePoolExpr(poolValidated, ALL_ATTRS, ALL_SKILLS, charDiscsArray)` already exists in `downtime-views.js` and returns `{ attr, skill, disc, modifier }`.

### spec_bonus in project pool display

The `pool.expression` string from `buildGenericPool` won't include spec bonus. The pool display still shows the base expression. The spec bonus is listed separately in the `skillMetaUI` (the +1 labels). The roll modal's pool size reflects the addition silently — this is acceptable for now.

### When to auto-set `rev.nine_again` for feeding

Auto-set when the pool status changes to `validated`. In the `.proc-val-btn` click handler where `saveEntryReview` is called, additionally read `nineAgain` from `skNineAgain(char, parsedSkill)` and include it in the patch.

### Backward compatibility

`rev.pool_mod_spec` and `rev.nine_again` default to `0` / `false` when absent — no migration needed.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Import `skNineAgain`, `skSpecs`; `skillMetaUI`; project + feeding metadata rendering; event handlers |
| `public/css/admin-layout.css` | `.dt-skill-meta`, `.dt-pool-9a-auto`, `.dt-spec-toggle-lbl` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft | Amelia (claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- `skNineAgain` and `skSpecs` added to `accessors.js` import
- `skillMetaUI` helper renders 9-again badge + spec toggle checkboxes; called at end of `poolBuilderUI`
- Project pool: skill change handler stores `nine_again` + resets `active_specs`/`spec_bonus`; `.dt-spec-toggle` handler updates both
- Project roll: `size = pool.total + spec_bonus`, `again = nine_again ? 9 : 10`
- Feeding: `_renderFeedRightPanel` parses skill from `poolValidated`, renders metadata using inline logic (same visual classes)
- `.dt-feed-spec-toggle` handler saves `active_feed_specs` + `pool_mod_spec` via `saveEntryReview`
- Validation handler auto-sets `nine_again` by parsing validated pool expression
- `proc-feed-roll-btn`: `diceCount += pool_mod_spec`, `again = nine_again ? 9 : 10`

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.57.skill-metadata-nine-again.story.md`
