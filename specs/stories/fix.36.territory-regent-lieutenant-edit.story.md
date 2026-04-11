# Story fix.36: Territories — Regent and Lieutenant Assignment UI

## Status: ready-for-dev

## Story

**As an** ST,
**I want** to be able to assign (and change) the Regent and Lieutenant for each territory directly from the City tab Territories section,
**so that** I can manage territory leadership without hunting for a hidden edit panel.

## Background

The Territories section in `public/js/admin/city-views.js` renders each territory card with the Regent name shown read-only. There is an "Edit Regents & Lieutenants" button at the bottom of the section that is supposed to open an edit panel.

The research shows this panel (`terr-edit-panel`) does exist and `saveTerritories()` does call `apiPost('/api/territories', { id, regent_id, lieutenant_id })`. However, the user reports there is "no way to set who the regent and lieutenant are" — suggesting the button/panel is either:
- Not visible (hidden below the fold, or CSS `display:none` not toggling)
- Rendering an empty panel (no territory rows)
- Working but the UX is not obvious enough to be discoverable

**Note:** Fix.21 established regent as single source of truth on the territory document. The `regent_id` field on the territory document is canonical.

---

## Technical Details

**File:** `public/js/admin/city-views.js`

**Relevant functions:**
- `renderTerritories()` — renders territory cards (lines ~274–352)
- `saveTerritories()` — saves regent_id + lieutenant_id to API (lines ~515–545)

**Territory document fields:**
- `regent_id` — character `_id` string of the Regent
- `lieutenant_id` — character `_id` string of the Lieutenant

**Territory card currently shows:**
- Territory name + ambience
- `Regent: [display name]` (read-only)
- Lieutenant name if set (read-only)
- Feeding rights section (expandable)

**"Edit Regents & Lieutenants" panel:**
- Button id: `terr-edit-toggle`
- Panel id: `terr-edit-panel`
- Contains per-territory dropdowns for Regent and Lieutenant
- Save calls `apiPost('/api/territories', { id, regent_id, lieutenant_id })`

**Investigation required before implementing:**
1. Test the toggle button in-browser — does the panel open?
2. Inspect whether the panel renders territory rows with populated dropdowns
3. Check if `renderTerritories()` is passing territory doc data to the edit panel correctly

**Likely fix directions (choose after investigation):**
- If the panel toggle is broken: fix the CSS toggle or JS click handler
- If the panel is empty: ensure territory docs are loaded before `renderTerritories()` is called
- If the UX is the issue: move the Regent/Lieutenant dropdowns inline into each territory card (edit-in-place pattern, matching how feeding rights work)

**Preferred UX direction:** Inline editing inside each territory card (same expand/collapse pattern as feeding rights), rather than a separate bottom panel. This matches the existing feeding rights pattern and is more discoverable.

Each expanded territory card would show:
```
Regent:    [dropdown — character list]
Lieutenant:[dropdown — character list, with "— None —" option]
[Save]
```

Saving calls `apiPost('/api/territories', { id, regent_id, lieutenant_id })` — same endpoint already used.

---

## Acceptance Criteria

1. ST can set the Regent for each territory from within the territory card.
2. ST can set the Lieutenant for each territory (or clear it to "None").
3. Changes persist after save (territory document `regent_id`/`lieutenant_id` updated).
4. Territory card immediately reflects the new Regent/Lieutenant name after save.
5. Regent name shown in the Court section (fix.35) reflects the updated value.

---

## Files to Change

- `public/js/admin/city-views.js` — investigate and fix Regent/Lieutenant edit UI; prefer inline card pattern

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story authored | Claude (SM) |
