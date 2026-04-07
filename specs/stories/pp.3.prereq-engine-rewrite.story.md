# Story PP.3: Prerequisite Engine Rewrite

## Status: Draft

## Story

**As a** character editor user,
**I want** prerequisites checked against structured data trees instead of regex-parsed strings,
**so that** prereq logic is reliable, composable, and maintainable.

## Acceptance Criteria

1. All existing prerequisite checks produce identical pass/fail results as the current regex engine
2. `meetsPrereq(char, prereqNode)` handles all leaf types: attribute, skill, discipline, merit, clan, bloodline, humanity, not
3. `prereqLabel(node)` produces human-readable strings with correct parenthesisation for nested `any` inside `all`
4. No regex-based prereq parsing remains in the codebase
5. All callers updated: `buildMeritOptions()`, `_prereqWarn()`, downtime XP spend filtering
6. The `meritQualifies()` function is removed from `editor/merits.js`

## Tasks / Subtasks

- [ ] Task 1: Create prereq engine module (AC: 2, 3)
  - [ ] Create `public/js/data/prereq.js`
  - [ ] Implement `meetsPrereq(char, node)`:
    - If `node` is null/undefined → return true
    - If `node.all` → return `node.all.every(n => meetsPrereq(char, n))`
    - If `node.any` → return `node.any.some(n => meetsPrereq(char, n))`
    - Leaf type `attribute`: check `getAttrVal(char, name) >= dots`
    - Leaf type `skill`: check `skDots(char, name) >= dots`
    - Leaf type `discipline`: check `(char.disciplines?.[name] || 0) >= dots`
    - Leaf type `merit`: check `char.merits.some(m => m.name === name && (!qualifier || m.qualifier === qualifier || m.area === qualifier) && (m.rating || 0) >= (dots || 1))`
    - Leaf type `clan`: check `char.clan === name`
    - Leaf type `bloodline`: check `char.bloodline === name`
    - Leaf type `humanity`: check `(char.humanity || 0) <= max`
    - Leaf type `not`: check `!char.merits.some(m => m.name === name)`
  - [ ] Implement `prereqLabel(node, nested = false)`:
    - `node.all` → map children, join with `, `
    - `node.any` → map children, join with ` or `, wrap in parens if `nested`
    - Leaf: format `name` + optional `(qualifier)` + optional ` dots`
    - `humanity` → `Humanity < max+1`
    - `not` → `No name`
  - [ ] Export both functions

- [ ] Task 2: Update editor/merits.js callers (AC: 4, 5, 6)
  - [ ] Import `meetsPrereq` from `data/prereq.js`
  - [ ] Replace `meritQualifies(c, entry.prereq || '')` calls with `meetsPrereq(c, rule.prereq)` where `rule` is the rules cache entry
  - [ ] Update `buildMeritOptions()` to use `meetsPrereq` instead of `meritQualifies`
  - [ ] Remove `meritQualifies()`, `checkSinglePrereq()`, and all regex prereq helper functions
  - [ ] Remove the `_esc` and prereq-related string parsing utilities

- [ ] Task 3: Update editor/sheet.js prereq warnings (AC: 5)
  - [ ] Update `_prereqWarn(c, meritName, m)` to use `meetsPrereq(c, rule.prereq)` and `prereqLabel(rule.prereq)` for the warning text
  - [ ] Import from `data/prereq.js`

- [ ] Task 4: Update downtime XP spend filtering (AC: 5)
  - [ ] In `player/downtime-form.js`, update `getItemsForCategory('merit')` to use `meetsPrereq` for prereq filtering
  - [ ] Replace the `meritQualifies` import

- [ ] Task 5: Verification pass (AC: 1)
  - [ ] Compare prereq results for all ~189 merits against the old engine using test characters with varied stats
  - [ ] Document any discrepancies (should be zero)
  - [ ] Verify complex cases: `"Brawl 1 or Weaponry 1"`, `"Humanity < 5"`, `"No Invictus Status"`, `"Carthian Status 1, Athletics 2 or Stealth 2"`

## Dev Notes

### Current prereq engine location
`meritQualifies(c, prereqStr)` at `public/js/editor/merits.js:214-221`. Uses comma-split for AND, ` or ` split for OR, delegates to `checkSinglePrereq()` for leaf checks.
[Source: public/js/editor/merits.js:214-221]

### Current callers of meritQualifies
- `buildMeritOptions()` in `editor/merits.js:239` — merit dropdown filtering
- `_prereqWarn()` in `editor/sheet.js:21-28` — sheet prereq warning display
- `getItemsForCategory('merit')` in `player/downtime-form.js` — XP spend grid
- `meritQualifies` is also imported in `player/downtime-form.js:20`
[Source: grep across public/js/]

### Prereq tree structure (from epic)
Leaf nodes: `{ type, name, dots?, qualifier?, max? }`
Combinators: `{ all: [...] }` and `{ any: [...] }`
Null = no prereqs.

### Accessor functions needed
- `getAttrVal(char, attrName)` from `data/accessors.js`
- `skDots(char, skillName)` from `data/accessors.js`
[Source: public/js/data/accessors.js]

### Testing

- Unit test `meetsPrereq` with mock character objects covering all leaf types
- Unit test `prereqLabel` for correct string generation including nested cases
- Integration: load all rules, run `meetsPrereq` against a test character for every entry, compare with old engine results

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-07 | 1.0 | Initial draft | Bob (SM) |

## Dev Agent Record

### Agent Model Used
_TBD_

### Debug Log References
_TBD_

### Completion Notes List
_TBD_

### File List
_TBD_

## QA Results
_Pending implementation_
