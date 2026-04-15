# Story feature.70: Sorcery Structured Controls (B2)

## Status: done

## Story

**As an** ST coding a sorcery action,
**I want** Tradition, Rite, and Targets to be hard selectors rather than free-text fields,
**so that** I can code sorcery actions quickly and accurately without typing errors.

## Background

The sorcery details card in `renderActionPanel` (isSorcery block, ~line 5924) has three free-text inputs:
- `proc-sorc-tradition-input` — saves to `rev.sorc_tradition`
- `proc-sorc-rite-input` — saves to `rev.sorc_rite_name` / `rev.rite_override`
- `proc-sorc-targets-input` — saves to `rev.sorc_targets`

All three should be hard selectors. The rite database (`_getRiteInfo`, `_getRiteLevel`) already exists in `downtime-views.js`. The character roster is available via `characters`.

---

## Acceptance Criteria

1. Tradition field is a two-option selector: `Cruac` / `Theban Sorcery`. Pre-selects from `rev.sorc_tradition ?? entry.tradition`.
2. Rite field is a dropdown populated from the existing rites data. Groups or sorts by tradition if possible. Pre-selects from `rev.sorc_rite_name ?? rev.rite_override ?? blobRite`.
3. Targets field is a multi-select of active characters from the `characters` array, sorted by `sortName`. Previously free-text values are displayed as-is in view mode; on edit, the ST selects from the roster.
4. All three fields save to the same schema paths as before — no schema change.
5. View mode for each field is unchanged in appearance.
6. The Rite dropdown updates the right-panel pool calculation when a rite is selected (the right-panel already reads `rev.rite_override` — ensure the save triggers a right-panel re-render).

---

## Tasks / Subtasks

- [ ] Task 1: Tradition selector
  - [ ] Replace `proc-sorc-tradition-input` with `<select class="proc-recat-select proc-sorc-tradition-sel">`
  - [ ] Options: `Cruac`, `Theban Sorcery`
  - [ ] Pre-select from `traditionVal`
  - [ ] Update event handler: save to `rev.sorc_tradition`

- [ ] Task 2: Rite dropdown
  - [ ] Replace `proc-sorc-rite-input` with `<select class="proc-recat-select proc-sorc-rite-sel">`
  - [ ] Populate from the rites database — inspect `_getRiteInfo` / `_getRulesDB()` to find the full rite list
  - [ ] Include a blank `— Select rite —` option
  - [ ] Pre-select from `riteVal`
  - [ ] Update event handler: save to `rev.rite_override` (and `rev.sorc_rite_name`)
  - [ ] After save, trigger right-panel re-render so pool recalculates

- [ ] Task 3: Targets multi-character select
  - [ ] Replace `proc-sorc-targets-input` with a multi-select or checkbox list of active characters
  - [ ] Sort by `sortName(c)`, exclude current character
  - [ ] Selected names joined as comma-separated string, saved to `rev.sorc_targets`
  - [ ] View mode: display comma-separated names as before

- [ ] Task 4: Manual verification
  - [ ] Open a sorcery action panel in edit mode
  - [ ] Confirm all three fields are hard selectors
  - [ ] Select a rite — confirm right-panel pool updates
  - [ ] Select targets — confirm saved value displays correctly in view mode

---

## Dev Notes

### Rite data source

```js
// Inspect _getRulesDB() or the global RITES_DB / CRUAC_DB / THEBAN_DB
// _getRiteInfo(riteName) exists and returns { attr, skill, disc, target }
// Use _getRulesDB() to get the full list for the dropdown
```

### Right-panel re-render trigger

After saving `rite_override`, call the same re-render path used by the existing rite-select in the right panel (check `proc-ritual-rite-sel` event handler for the pattern).

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Replace three inputs with selectors; update event handlers |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
