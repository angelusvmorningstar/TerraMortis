# Story PP.7: Remove Legacy Data Files

## Status: Draft

## Story

**As a** maintainer,
**I want** all hardcoded data modules removed now that the API-backed cache is the sole source,
**so that** there is no ambiguity about which data source is authoritative.

## Acceptance Criteria

1. Deleted: `public/js/data/merits-db-data.js`
2. Deleted: `public/js/data/devotions-db.js`
3. Deleted: `public/js/data/man-db-data.js`
4. Deleted: `json_data_from_js/` directory (migration source, no longer needed)
5. No remaining imports reference any deleted files
6. App functions identically from cached API data — no regressions
7. NFR-15 in `specs/epics.md` updated to reflect new architecture

## Tasks / Subtasks

- [ ] Task 1: Final import audit (AC: 5)
  - [ ] Run grep for all imports of: `merits-db-data`, `devotions-db`, `man-db-data`, `disc-data`
  - [ ] Verify zero results — if any remain, they must be migrated first (blocker)
  - [ ] Check for dynamic imports or string-based references

- [ ] Task 2: Delete data files (AC: 1, 2, 3)
  - [ ] Delete `public/js/data/merits-db-data.js`
  - [ ] Delete `public/js/data/devotions-db.js`
  - [ ] Delete `public/js/data/man-db-data.js`
  - [ ] Note: `suite/disc-data.js`, `suite/merits-db-data.js`, `suite/man-db-data.js` should already be deleted in PP-5

- [ ] Task 3: Delete migration source (AC: 4)
  - [ ] Delete `json_data_from_js/` directory and all 6 JSON files within
  - [ ] These served as the transform source for PP-1 and are no longer needed

- [ ] Task 4: Update documentation (AC: 7)
  - [ ] Update NFR-15 in `specs/epics.md` from "Reference data stored as separate importable JS modules" to "Reference data stored in `purchasable_powers` MongoDB collection, served via `/api/rules` and cached client-side"
  - [ ] Update `CLAUDE.md` if it references any deleted files

- [ ] Task 5: Smoke test (AC: 6)
  - [ ] Load admin panel — verify character editor works
  - [ ] Load player portal — verify downtime form works
  - [ ] Load suite/game app — verify dice pools and rules reference work
  - [ ] Verify no console errors referencing deleted modules

## Dev Notes

### Files to delete
```
public/js/data/merits-db-data.js    (~34 KB, 189 merits)
public/js/data/devotions-db.js      (~16 KB, 42 devotions)
public/js/data/man-db-data.js       (~53 KB, 195 manoeuvres)
json_data_from_js/constants.json
json_data_from_js/devotions_db.json
json_data_from_js/disciplines_db.json
json_data_from_js/feed_methods.json
json_data_from_js/manoeuvres_db.json
json_data_from_js/merits_db.json
```

### Files already deleted in PP-5
```
public/js/suite/disc-data.js
public/js/suite/merits-db-data.js
public/js/suite/man-db-data.js
```

### Blocker check
This story MUST NOT proceed until PP-4, PP-5, and PP-6 are all Done. Any remaining imports of these files will cause runtime errors.

### Testing

- Full app smoke test across all three entry points (admin, player, suite)
- Verify no 404s or import errors in browser console
- Verify localStorage `tm_rules_db` is the sole data source for all rule lookups

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
