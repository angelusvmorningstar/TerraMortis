# Story feature.76: Extract Duplicated Action-Type Row (D1)

## Status: ready-for-dev

## Story

**As a** developer maintaining the DT Processing tab,
**I want** the action-type recategorisation block extracted into a single shared function,
**so that** changes to action-type UI only need to be made in one place.

## Background

The action-type dropdown + character target selectors (investigate → character dropdown, attack → character dropdown + merit dropdown) are written identically in two places inside `renderActionPanel`:
1. The project block (~line 5761–5821)
2. The merit block (~line 5824–5920)

Same HTML, same selectors, same data source (`characters`, `ACTION_TYPE_LABELS`). This is the most glaring duplication in the file — approximately 80 lines repeated. This story extracts them into a single shared function used by both blocks.

---

## Acceptance Criteria

1. A new function `_renderActionTypeRow(entry, rev, char)` exists in `downtime-views.js`.
2. The function renders: action-type dropdown + conditional target selectors (investigate: character dropdown; attack: character dropdown + merit dropdown; ambience/other: territory pills or nothing).
3. The project block calls `_renderActionTypeRow(entry, rev, projChar)`.
4. The merit block calls `_renderActionTypeRow(entry, rev, meritEntChar)`.
5. Rendered HTML and saved field names are identical to the current implementation — no functional change.
6. Event handlers for `proc-recat-select`, `proc-inv-char-sel`, `proc-attack-char-sel`, `proc-attack-merit-sel`, `proc-prot-merit-sel` continue to work unchanged (they are in the event delegation layer, not inside this function).

---

## Tasks / Subtasks

- [ ] Task 1: Write `_renderActionTypeRow(entry, rev, char)`
  - [ ] Copy the project block's recat row as the basis
  - [ ] Replace hardcoded `projChar` / `meritEntChar` references with `char` parameter
  - [ ] Handle all action-type branches: investigate, attack, ambience_increase/decrease, hide_protect, all others
  - [ ] Territory pills: call `_renderInlineTerrPills` as before, using `entry.subId` and appropriate context key

- [ ] Task 2: Replace project block recat row
  - [ ] Call `_renderActionTypeRow(entry, rev, projChar)` in place of the duplicated block

- [ ] Task 3: Replace merit block recat row
  - [ ] Call `_renderActionTypeRow(entry, rev, meritEntChar)` in place of the duplicated block

- [ ] Task 4: Manual verification
  - [ ] Open a project action with action type investigate — confirm target dropdown renders
  - [ ] Open a merit action with action type attack — confirm target + merit dropdowns render
  - [ ] Change action type on both — confirm the correct sub-selectors appear/disappear
  - [ ] Confirm all saves still work

---

## Dev Notes

### Context key difference

Project uses `String(entry.actionIdx)` as territory context key.
Merit uses `allies_${entry.actionIdx}` as territory context key.
Pass the context key as a parameter or derive from `entry.source` inside the function.

### Function signature suggestion

```js
function _renderActionTypeRow(entry, rev, char) { ... }
```

The `entry.source` ('project' | 'merit') can be used inside to derive the correct territory context key and sub-select visibility.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add `_renderActionTypeRow`; remove duplicate blocks |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
