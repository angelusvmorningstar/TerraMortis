# Story fix.33: Granted Merits Showing False Prerequisite Warnings

## Status: done

## Story

**As an** ST,
**I want** merits that were granted by another mechanic to never show prerequisite warnings,
**so that** auto-granted merits don't clutter the sheet with false errors.

## Background

`_prereqWarn(m, c)` in `sheet.js` checks whether a merit's prerequisites are met and renders a red warning if not. It had a hardcoded bypass only for merits where `m.granted_by === 'Fucking Thief'` — the one case where this had come up previously.

After OHM (Old Harpy Merit) was implemented as granting Friends in High Places automatically, the OHM-granted FHP showed a false "Prerequisites not met: Invictus Status 1" warning — because the character had OHM but not the Invictus Status merit purchased directly. The prereq check was correct in isolation but wrong in context: a granted merit inherits its donor's legitimacy.

## Fix

Changed the bypass from a name-specific check to a general `granted_by` check:

```js
// Before
if (m && m.granted_by === 'Fucking Thief') return '';

// After
if (m && m.granted_by) return '';
```

This covers all present and future auto-granted merits (OHM → FHP, Bloodline grants, MCI grants, VM grants, etc.) without needing individual case statements.

## Files Changed

- `public/js/editor/sheet.js` — `_prereqWarn`: bypass all merits with `granted_by` set

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story authored + implemented | Claude (SM) |
