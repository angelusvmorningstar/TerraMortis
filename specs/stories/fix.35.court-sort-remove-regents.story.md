# Story fix.35: Court Section — Remove Regents and Fix Sort Order

## Status: ready-for-dev

## Story

**As an** ST,
**I want** the Court section in the City tab to exclude Regents and list positions in the canonical role order,
**so that** the court view reflects the actual hierarchy and Regents are not duplicated (they appear in the Territories section already).

## Background

The Court section in `public/js/admin/city-views.js` currently renders all characters with a `court_title` field, including those whose title is `'Regent'`. Regents are already shown in the Territories section with their territory name, so including them in Court creates duplication and visual clutter.

Additionally, the current `TITLE_ORDER` array drives the sort but is incomplete and uses different label names than what appears on-screen. The desired sort order is:

1. Head of State
2. Primogen
3. Administrator
4. Socialites (Harpy)
5. Enforcers (Protector)

---

## Technical Details

**File:** `public/js/admin/city-views.js`

**Current `TITLE_ORDER`:**
```js
const TITLE_ORDER = ['Premier', 'Primogen', 'Administrator', 'Harpy', 'Protector'];
```

**Current `COURT_TITLES`:**
```js
const COURT_TITLES = ['', 'Premier', 'Primogen', 'Administrator', 'Harpy', 'Protector'];
```

The `renderCourt()` function (around line 59–107):
- Filters active characters with a `court_title` field
- Looks up regent link via `terrDocs.find(td => td.regent_id === String(c._id))`
- Renders Regent rows with territory name on the right side

**Changes required:**

1. **Filter out Regents** from the Court list. Characters whose `court_title === 'Regent'` (or whose entry is matched as a regent via `regent_id` on a territory doc) should not appear in the Court section. They belong only in the Territories section.

2. **Update `TITLE_ORDER`** to match the canonical role names and desired order:
```js
const TITLE_ORDER = ['Premier', 'Primogen', 'Administrator', 'Harpy', 'Protector'];
```
This ordering maps to the user-facing display order: Head of State (Premier), Primogen, Administrator, Socialites (Harpy), Enforcers (Protector). Confirm the actual stored values of `court_title` for each role against `COURT_TITLES` — they must match exactly.

3. **Remove Regent from `COURT_TITLES`** dropdown (if present) so STs cannot assign it from the Court edit panel. Regent assignment happens only through the Territories "Edit Regents & Lieutenants" panel.

4. **Check the `saveCourt()` function** (~lines 480–513) — ensure it does not save `court_title: 'Regent'` to any character.

---

## Acceptance Criteria

1. Characters with a Regent territory assignment do NOT appear in the Court section list.
2. Court rows are ordered: Head of State first, then Primogen, Administrator, Socialites/Harpy, Enforcers/Protector.
3. Characters without a `court_title` (or with a blank title) are not shown.
4. The Court edit dropdown does not include "Regent" as an assignable option.
5. Removing Regent from Court does not affect the Territories section — Regents still appear there with territory name.

---

## Files to Change

- `public/js/admin/city-views.js` — `renderCourt()`: filter out regent entries; update `TITLE_ORDER`; remove Regent from `COURT_TITLES`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story authored | Claude (SM) |
