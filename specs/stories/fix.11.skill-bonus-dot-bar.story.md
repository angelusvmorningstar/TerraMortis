# Story Fix.11: Skill Bonus Dot Bar — Remove Fr Box, Add Visual Bonus Bar

## Status: done

## Story

**As an** ST editing a character's skills,
**I want** each skill row to show a bonus dot bar below the skill (like attributes do) instead of a separate "Fr" input box,
**so that** bonus dots are visually clear and the edit panel matches the attribute pattern.

## Background

### Current state

The skill edit panel in `shRenderSheet()` (`public/js/editor/sheet.js` ~line 301) renders:

```
Fr | CP | XP  [total]
```

`Fr` is a numeric input for `skill.free` — free dots granted by merit mechanics (PT, MCI). This matches the attribute edit panel pattern of having a `Fr` input.

### Attribute pattern (for reference)

Attributes have a visual bonus dot bar rendered inline with the dot pip row, showing bonus dots as open circles after the filled dots. The attribute edit panel does **not** have a `Fr` input — the `bonus` field is edited in the attribute panel directly (`shDotsWithBonus`), with the bonus count shown in the pip display.

### Desired state for skills

Skills should mirror attributes:
- Remove the `Fr` input box from the `sk-bd-panel`
- Add a bonus dot bar below the skill dot row, showing `bonus` dots as open circles after the filled dots (same pattern as `shDotsWithBonus` in view mode)
- The `free` field is still read and factored into the total — it is just not directly editable via a box, same as Fix.10 for disciplines

The `bonus` field on a skill object (`sk.bonus`) holds display-only bonus dots (from PT dot4, MCI dot3, etc.). These are already derived and set by `applyDerivedMerits()`. The bonus bar is a visual display of `sk.bonus`; it does not need an edit input because bonus dots are auto-derived.

The `free` field holds free dots from CP-equivalent grants. These should remain read-only (not shown as a numeric input) for the same reasons as disciplines — they come from grant mechanics, not direct ST entry.

### Dot bar format

The bonus dot bar should use the same rendering as attributes:
- filled dots (`●`) for purchased dots
- open circles (`○`) for bonus dots
- in the context of a skill, `d` filled + `bn + ptBn + mciBn` open

This is already computed in `shDotsWithBonus(d, bn + ptBn + mciBn)` and displayed in `dotStr` on the skill's dot span. The bar should be added as a separate `<div class="sh-attr-bonus-bar">` (or equivalent) below or alongside the existing dot display, styled consistently with the attribute bonus bar.

## Acceptance Criteria

1. The `Fr` numeric input is removed from every skill's `sk-bd-panel` edit row
2. A bonus dot bar is displayed showing `sk.bonus` (plus derived ptBn + mciBn) as open circles after the filled dots
3. The bonus bar is only shown when `bonus > 0` (no empty bar rendered for skills with no bonus)
4. The `free` field value is still included in the dot total displayed in `sk-bd-panel` — it is read from the object and counted, just not editable via a box
5. The `has-free-dots` CSS class highlight on the skill row remains when `free > 0`
6. CP and XP inputs remain unchanged
7. No regression in skill dot display, specialisation rendering, or XP calculation

## Tasks / Subtasks

- [ ] Task 1: Remove Fr input from skill edit panel
  - [ ] In `sheet.js` ~line 301, in the `sk-bd-panel` string, find:
    ```html
    <div class="bd-grp"><span class="bd-lbl" style="color:var(--gold2)">Fr</span> <input class="attr-bd-input" style="color:var(--gold2)" type="number" min="0" value="' + (cr.free || 0) + '" onchange="shEditSkillPt(\'' + sE + '\',\'free\',+this.value)"></div>
    ```
  - [ ] Remove that `bd-grp` block. Leave CP and XP blocks unchanged.
  - [ ] Ensure `cr.free` is still included in the `sb` base calculation (`sb = (cr.cp || 0) + (cr.free || 0)`)

- [ ] Task 2: Add bonus dot bar to skill edit rows
  - [ ] After the skill name/dot row (the `sh-skill-row` div), add a bonus dot bar `<div>` that renders when `(bn + ptBn + mciBn) > 0`
  - [ ] Use `shDotsWithBonus(d, bn + ptBn + mciBn)` — already computed as `dotStr` — or build a dedicated bar using the same open-circle pattern as the attribute bonus bar in view mode
  - [ ] Style consistently with the attribute bonus bar: small, gold-tinted open circles, visually subordinate to the main dot row
  - [ ] Read `shRenderSheet()` attribute section for reference on the exact CSS class used for attribute bonus bars

- [ ] Task 3: Verify view mode is unaffected
  - [ ] Confirm the non-editMode branch of the skill loop is not changed

## Dev Notes

- `shEditSkillPt` in `edit.js` handles `'free'` writes — leave that handler intact.
- In the edit row, `bn` is `sk.bonus` from `getSkillObj(c, s)` — already read on line ~297.
- The `dotStr` variable already incorporates `bn + ptBn + mciBn` via `shDotsWithBonus`. The bonus bar can reuse this or render separately.
- Manual check: Professional Training characters (Anichka, Ivana, etc.) should show bonus open circles on their asset skills.

---

## Dev Agent Record

### Implementation Plan
_To be filled by dev agent_

### Debug Log
_To be filled by dev agent_

### Completion Notes
_To be filled by dev agent_

## File List
_To be filled by dev agent_

## Change Log
_To be filled by dev agent_
