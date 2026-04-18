# Story feat.14: City Status Appellations

**Story ID:** feat.14
**Epic:** Feature Backlog
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As a player or ST viewing the City Status tab, I want each status bracket to display the appellation for that rank, so that the social hierarchy of the domain is communicated clearly alongside the numerical value.

---

## Appellations

| City Status | Appellation |
|---|---|
| 1 | Acknowledged |
| 2 | Recognised |
| 3 | Valued |
| 4 | Respected |
| 5 | Admired |
| 6 | Honoured |
| 7 | Revered |
| 8 | Venerated |
| 9 | Glorified |
| 10 | Exalted |

---

## Background

### Two surfaces — nearly identical structure

Both the game app and player portal have a City Status tab rendered by their respective JS files:
- **`public/js/suite/status.js`** — game app (`index.html`)
- **`public/js/player/status-tab.js`** — player portal (`player.html`)

Both files are structurally identical (the suite version was ported from the player version). Both have:
- `function cityVal(c) { return calcCityStatus(c); }`
- `function renderTierRow(val, chars, activeId, dotsFn)` — renders one bracket row

### Current `renderTierRow` structure

```js
function renderTierRow(val, chars, activeId, dotsFn) {
  let h = `<div class="status-bracket status-bracket-fixed">`;
  h += `<div class="status-bracket-head">`;
  h += `<span class="status-bracket-dots">${dotsFn(val)}</span>`;
  h += `<span class="status-bracket-val">${val}</span>`;
  h += `</div>`;
  h += `<div class="status-bracket-chips">`;
  // ... chips
```

The appellation label belongs in `status-bracket-head`, after `status-bracket-val`.

### Current visual

```
●●●○○○○○○○  3
[chip] [chip]
```

### Target visual

```
●●●○○○○○○○  3  Valued
[chip] [chip]
```

---

## Implementation Plan

### Task 1 — Define `CITY_STATUS_APPELLATIONS` constant

**File:** `public/js/data/constants.js`

Add the appellations map as an exported constant:

```js
export const CITY_STATUS_APPELLATIONS = {
  1: 'Acknowledged',
  2: 'Recognised',
  3: 'Valued',
  4: 'Respected',
  5: 'Admired',
  6: 'Honoured',
  7: 'Revered',
  8: 'Venerated',
  9: 'Glorified',
  10: 'Exalted',
};
```

Note British/Australian spelling throughout: **Recognised**, **Honoured**.

### Task 2 — Update `renderTierRow` in both status files

**Files:**
- `public/js/suite/status.js`
- `public/js/player/status-tab.js`

In each file:

1. Import `CITY_STATUS_APPELLATIONS` from `'../data/constants.js'` (add to existing import line if one exists, or add new import)

2. In `renderTierRow`, add the appellation span after `status-bracket-val`:

```js
h += `<span class="status-bracket-val">${val}</span>`;
h += `<span class="status-bracket-appellation">${CITY_STATUS_APPELLATIONS[val] || ''}</span>`;
```

The `|| ''` guard handles any edge-case value outside 1–10 gracefully.

### Task 3 — Add `.status-bracket-appellation` CSS

The appellation label should be visually subordinate to the number — same row, muted colour, smaller font, italic or spaced lettering suits the gothic register.

**Files:** `public/css/player-layout.css` and `public/css/suite.css`

Add after the existing `.status-bracket-val` rule in each file:

```css
.status-bracket-appellation { font-family: var(--fl); font-size: 11px; letter-spacing: .08em; color: var(--txt2); margin-left: 8px; text-transform: uppercase; align-self: center; }
```

Check where `.status-bracket-val` is defined in each CSS file and place the new rule immediately after it.

---

## Acceptance Criteria

- [ ] Each city status bracket row shows the appellation next to the rank number in both the game app and player portal
- [ ] Spellings are British: Recognised, Honoured (not Recognized, Honored)
- [ ] Brackets with no characters still show the appellation (the row structure doesn't change)
- [ ] The label is visually distinct from the rank number (smaller, muted)
- [ ] Clan and covenant status rows are NOT affected — appellations are city status only
- [ ] No regression to chip layout, dots display, or bracket structure

---

## Files to Change

| File | Change |
|---|---|
| `public/js/data/constants.js` | Add `CITY_STATUS_APPELLATIONS` export |
| `public/js/suite/status.js` | Import constant; add appellation span in `renderTierRow` |
| `public/js/player/status-tab.js` | Import constant; add appellation span in `renderTierRow` |
| `public/css/suite.css` | Add `.status-bracket-appellation` rule |
| `public/css/player-layout.css` | Add `.status-bracket-appellation` rule |

**Do not touch:**
- Clan status or covenant status bracket rows — appellations apply to city status only
- `renderTierRow` logic for chips, dots, or vacancy handling
- Any other render functions in either status file

---

## Critical Constraints

- **`renderTierRow` is used for ALL brackets** (city, clan, covenant) in both files — the appellation span must only render when `CITY_STATUS_APPELLATIONS[val]` exists; the `|| ''` fallback ensures an empty span (not visible) for clan/covenant rows where `val` maps to nothing. Alternatively, consider only adding the appellation in `renderCitySection` — check whether `renderTierRow` is shared with clan/covenant sections before deciding
- **British spelling**: Recognised (not Recognized), Honoured (not Honored) — matches the project's language convention throughout
- **`constants.js` already imported** in many files; adding a new export does not affect existing imports

---

## Reference

- `renderTierRow`: `public/js/suite/status.js` lines ~45–61; `public/js/player/status-tab.js` equivalent
- `renderCitySection`: `public/js/suite/status.js` lines ~66–100; `public/js/player/status-tab.js` lines ~127–165
- `status-bracket-val` CSS: search `public/css/suite.css` and `public/css/player-layout.css` for `.status-bracket-val`
- British English convention: enforced throughout codebase per CLAUDE.md
