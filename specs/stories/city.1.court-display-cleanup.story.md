# Story: city.1 — Court Display Cleanup

## Status: review

## Summary

The Court display in the City view has several presentation issues: names are too large, honorifics are redundant (the court role column already conveys the title), the court detail shows clan instead of covenant, the regency annotation is noise, and the "(Protector)" epithet parenthetical is confusing.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/admin/city-views.js` | Use bare name; remove territory; show covenant; remove epithet |
| `public/css/admin-layout.css` | Add font-size to `.court-name` |

---

## Acceptance Criteria

1. `.court-name` renders at a consistent body text size (not inheriting a large parent size)
2. The name column shows bare name only — no honorific prefix (e.g. "Eve Lockridge", not "Premier Eve Lockridge")
3. The detail column shows covenant, not clan (e.g. "Ventrue" clan → show covenant instead)
4. No regency annotation in the court row (e.g. "— Regent of The Dockyards" removed)
5. The court title column never shows a parenthetical epithet — shows `court_category` only

---

## Tasks / Subtasks

- [x] Fix `.court-name` font size (AC: #1)
  - [x] Add `font-size: 14px` (or `var(--fs-body)`) to `.court-name` in `admin-layout.css:864`
- [x] Use bare name in court row (AC: #2)
  - [x] In `city-views.js:89`, replace `displayName(c)` with `c.moniker || c.name`
- [x] Show covenant instead of clan in detail (AC: #3)
  - [x] In `city-views.js:90`, replace `c.clan` with `c.covenant`
- [x] Remove regency annotation (AC: #4)
  - [x] Remove lines 84–85 (territory lookup) and `${territory}` from line 90
- [x] Remove epithet parenthetical (AC: #5)
  - [x] Remove line 86 (epithet calculation) and `${epithet}` from line 88

---

## Dev Notes

### Current renderCourt() snippet (lines 83–91)

```js
const _rt = terrDocs.find(td => td.regent_id === String(c._id));
const territory = _rt ? ' — Regent of ' + esc(_rt.name || _rt.id) : '';
const epithet = (c.court_title && c.court_title !== c.court_category) ? ` <span class="court-epithet">(${esc(c.court_title)})</span>` : '';
h += `<div class="court-row">
  <span class="court-title">${esc(c.court_category)}${epithet}</span>
  <span class="court-name">${esc(displayName(c))}</span>
  <span class="court-detail">${esc(c.clan || '')}${territory}</span>
</div>`;
```

### Target

```js
h += `<div class="court-row">
  <span class="court-title">${esc(c.court_category)}</span>
  <span class="court-name">${esc(c.moniker || c.name)}</span>
  <span class="court-detail">${esc(c.covenant || '')}</span>
</div>`;
```

### CSS fix

`.court-name` at `admin-layout.css:864` has no `font-size`. Add `font-size: 14px;`.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Removed territory lookup, epithet, and `displayName()` from court row render
- Court row now: category | moniker/name | covenant
- `.court-name` gets explicit `font-size: 14px`

### File List

- `public/css/admin-layout.css`
- `public/js/admin/city-views.js`

### Change Log

- 2026-04-23: Implemented city.1 — court display cleanup
