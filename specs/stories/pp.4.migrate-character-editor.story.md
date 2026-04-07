# Story PP.4: Migrate Consumers — Character Editor

## Status: Draft

## Story

**As an** ST using the character editor,
**I want** merit dropdowns, prereq warnings, and power details to come from the API-cached rules data,
**so that** the editor reflects the live rules database without hardcoded JS imports.

## Acceptance Criteria

1. Merit dropdown in character editor populated from `getRulesByCategory('merit')` instead of `MERITS_DB`
2. Merit prerequisite warnings use the new `meetsPrereq` engine from PP-3
3. Discipline power details (pool, cost, effect) read from rules cache via `getRuleByKey()`
4. No imports of `merits-db-data.js` remain in editor modules
5. No imports of `devotions-db.js` remain in editor modules
6. `buildMeritOptions()` uses `category` field filtering instead of hardcoded exclusion sets
7. Existing editor functionality unchanged — all merit add/edit/remove operations work identically

## Tasks / Subtasks

- [ ] Task 1: Migrate editor/merits.js (AC: 1, 4, 6)
  - [ ] Replace `import { MERITS_DB }` with `import { getRulesByCategory, getRuleByKey }` from `data/loader.js`
  - [ ] Update `buildMeritOptions()`: replace `MERITS_DB` iteration with `getRulesByCategory('merit')`, filter by `rule.category === 'merit'` instead of hardcoded exclusion sets (`excluded`, `domainNames`, `influenceNames`)
  - [ ] Update `meritLookup()` to use `getRuleByKey(name.toLowerCase().replace(/\s+/g, '-'))` 
  - [ ] Update `meritFixedRating()` to use `rule.rating_range`
  - [ ] Remove all `MERITS_DB` references

- [ ] Task 2: Migrate editor/sheet.js (AC: 2, 3, 4, 5)
  - [ ] Replace `import { MERITS_DB }` and `import { DEVOTIONS_DB }` with rules cache imports
  - [ ] Update `_prereqWarn()` to use `meetsPrereq` and `prereqLabel` from `data/prereq.js`
  - [ ] Update devotion rendering to read power details from rules cache
  - [ ] Update `shRenderMeritRow()` merit lookup to use rules cache
  - [ ] Remove `MAN_DB` import if present (manoeuvre lookups)

- [ ] Task 3: Migrate editor/edit.js (AC: 4, 5)
  - [ ] Replace `import { MERITS_DB }` and `import { DEVOTIONS_DB }` with rules cache imports
  - [ ] Update devotion add/edit functions to lookup from rules cache
  - [ ] Update merit edit functions that reference `MERITS_DB` for validation

- [ ] Task 4: Migrate editor/mci.js (AC: 4)
  - [ ] Replace `import { MERITS_DB }` with rules cache import
  - [ ] Update MCI benefit grant lookups to use rules cache

- [ ] Task 5: Migrate editor/domain.js (AC: 4)
  - [ ] Replace any `MERITS_DB` references with rules cache lookups
  - [ ] Verify domain merit calculations still work

- [ ] Task 6: Verification (AC: 7)
  - [ ] Open admin panel, select a character, enter edit mode
  - [ ] Verify merit dropdown populates correctly with prereq filtering
  - [ ] Verify adding a merit works
  - [ ] Verify prereq warning badges appear correctly
  - [ ] Verify devotion section renders with correct details
  - [ ] Verify MCI benefit grants display correctly

## Dev Notes

### Files to modify
- `public/js/editor/merits.js` — primary: `MERITS_DB` import, `buildMeritOptions()`, `meritLookup()`, `meritQualifies()` (already removed in PP-3)
- `public/js/editor/sheet.js` — `MERITS_DB`, `DEVOTIONS_DB`, `MAN_DB` imports, `_prereqWarn()`, merit/devotion rendering
- `public/js/editor/edit.js` — `MERITS_DB`, `DEVOTIONS_DB` imports, merit/devotion edit handlers
- `public/js/editor/mci.js` — `MERITS_DB` import, MCI benefit lookups
- `public/js/editor/domain.js` — possible `MERITS_DB` references
[Source: grep results from conversation]

### Key function signatures changing
- `buildMeritOptions(c, currentName)` — same signature, internal data source changes
- `meritLookup(name)` — now uses `getRuleByKey(slugify(name))`
- `_prereqWarn(c, meritName, m)` — prereq check changes to structured tree
[Source: public/js/editor/merits.js:227-252, public/js/editor/sheet.js:21-28]

### Rules cache access pattern
```js
import { getRulesByCategory, getRuleByKey } from '../data/loader.js';
const allMerits = getRulesByCategory('merit');
const rule = getRuleByKey('air-of-menace');
```

### Testing

- Verify all merit dropdown entries match previous MERITS_DB content
- Verify prereq filtering produces same results
- Verify discipline power tooltips/details render correctly
- Test with characters that have complex MCI/PT standing merits

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
