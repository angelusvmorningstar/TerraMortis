# Story PP.6: Migrate Consumers — Downtime and Player Portal

## Status: Draft

## Story

**As a** player submitting downtime,
**I want** the XP spend grid and merit references to come from the unified rules API,
**so that** newly added or edited powers appear automatically without code changes.

## Acceptance Criteria

1. Downtime XP spend grid items populated from rules cache via `getRulesByCategory()`
2. `getItemsForCategory()` switch statement replaced with rules-cache-driven logic
3. Feeding tab method/discipline references use rules cache where applicable
4. CSV export/import merit names resolve against rules cache
5. No imports of `devotions-db.js` or `merits-db-data.js` remain in player/downtime modules
6. Player wizard merit selection uses rules cache
7. XP log tab devotion lookups use rules cache
8. Existing downtime form functionality unchanged

## Tasks / Subtasks

- [ ] Task 1: Migrate player/downtime-form.js (AC: 1, 2, 5)
  - [ ] Replace `import { DEVOTIONS_DB }` and `import { MERITS_DB }` with rules cache imports
  - [ ] Rewrite `getItemsForCategory()` to use rules cache:
    - `'attribute'` → `getRulesByCategory('attribute')`, map to `{ value: rule.name, label: ... }`
    - `'skill'` → `getRulesByCategory('skill')`, map similarly
    - `'discipline'` → `getRulesByCategory('discipline')`, filter by character's owned/clan discs
    - `'merit'` → `getRulesByCategory('merit')`, filter by `meetsPrereq(c, rule.prereq)`
    - `'devotion'` → `getRulesByCategory('devotion')`, filter by character's discipline prereqs
    - `'rite'` → `getRulesByCategory('rite')`, filter by Cruac/Theban level
  - [ ] Update `getXpCost()` — devotion cost now comes from `rule.xp_fixed`
  - [ ] Update `parseMeritRating()` — now uses `rule.rating_range` directly
  - [ ] Remove `MERITS_DB` and `DEVOTIONS_DB` imports

- [ ] Task 2: Migrate player/feeding-tab.js (AC: 3, 5)
  - [ ] Check for any `MERITS_DB` or `DEVOTIONS_DB` imports (may not exist)
  - [ ] If present, replace with rules cache lookups
  - [ ] Verify feeding method references (these come from `downtime-data.js` FEED_METHODS — out of scope for this story, those are enum data)

- [ ] Task 3: Migrate editor/csv-format.js (AC: 4, 5)
  - [ ] Replace any `MERITS_DB` import with rules cache
  - [ ] Update merit name resolution in CSV export to use `getRuleByKey()`
  - [ ] Update CSV import merit validation to check against rules cache

- [ ] Task 4: Migrate player/wizard.js (AC: 5, 6)
  - [ ] Replace `import { MERITS_DB }` with rules cache import
  - [ ] Update wizard merit selection to use `getRulesByCategory('merit')`

- [ ] Task 5: Migrate player/xp-log-tab.js (AC: 5, 7)
  - [ ] Replace `import { DEVOTIONS_DB }` with rules cache import
  - [ ] Update devotion XP lookup to use `getRuleByKey()` with `rule.xp_fixed`

- [ ] Task 6: Verification (AC: 8)
  - [ ] Open downtime form, expand Admin section, verify XP spend grid
  - [ ] Select each category (attribute, skill, discipline, merit, devotion, rite), verify items populate
  - [ ] Verify merit items respect prerequisite filtering
  - [ ] Verify XP costs calculate correctly
  - [ ] Submit a downtime and verify data saves correctly

## Dev Notes

### Files to modify
- `public/js/player/downtime-form.js` — imports `DEVOTIONS_DB` and `MERITS_DB`, contains `getItemsForCategory()`, `getXpCost()`, `parseMeritRating()`
- `public/js/player/feeding-tab.js` — may reference MERITS_DB for merit lookups
- `public/js/editor/csv-format.js` — uses MERITS_DB for CSV merit name resolution
- `public/js/player/wizard.js` — imports MERITS_DB for wizard merit selection
- `public/js/player/xp-log-tab.js` — imports DEVOTIONS_DB for XP cost display
[Source: grep results from conversation]

### getItemsForCategory() current location
`public/js/player/downtime-form.js` around line 1710. Large switch statement generating option arrays per category. Each case accesses character data + MERITS_DB/DEVOTIONS_DB to build filtered lists.
[Source: public/js/player/downtime-form.js:1710-1806]

### XP cost source change for devotions
Currently: `DEVOTIONS_DB.find(d => d.n === item)` returns `dev.xp`
New: `getRuleByKey(slugify(item))` returns `rule.xp_fixed`
[Source: public/js/player/downtime-form.js:1701-1704]

### Testing

- Verify each XP spend category populates with correct items
- Verify merit prereq filtering matches previous behaviour
- Verify devotion XP costs display correctly
- Verify CSV export includes correct merit names
- Test with characters that have complex merit/discipline configurations

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
