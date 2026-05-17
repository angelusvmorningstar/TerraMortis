# Story Feature.333: Merit Manual Bonus Dot Stepper

## Status: done

## Metadata
- issue: 333
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/333
- branch: morningstar-issue-333-skill-merit-bonus-stepper

---

## Story

**As an** ST editing a character's merits,
**I want** each general merit row in the sheet editor to have `+○` / `−○` controls for a manual bonus field,
**so that** I can apply ad-hoc bonus dots to a merit without reaching into the database directly.

---

## Background

### What already exists

The Attributes & Skills tab (`attrs-tab.js`) already has `+○` / `−○` bonus controls for both Attributes and Skills:

- **Attributes**: `adjAttrBonus(attr, delta)` — exposed on window via `admin.js:63` and `app.js:44`
- **Skills**: `adjSkillBonus(skill, delta)` — exposed on window via `admin.js:64` and `app.js:45`

Both are fully implemented. **The Skills part of the issue is already satisfied.** No skill work is needed.

### What is missing

Merit objects in `c.merits[]` have no `bonus` field. There is no `shAdjMeritBonus()` handler. The general merits edit row (`shRenderGeneralMerits` in `sheet.js`) has no `+○` / `−○` controls.

### Design rule: `bonus` is display-only, not purchased

The new `merit.bonus` field is a manual display override. It must NOT be included in `syncMeritRating()` (which syncs `m.rating = cp + xp + meritFreeSum(m)`). Stored `rating` only reflects what was purchased or rule-granted. `bonus` dots are rendered on top of that total but do not affect XP calculations, pool calculations, or prerequisite checks.

---

## Acceptance Criteria

- [x] Each general merit row in the sheet editor edit mode has `+○` / `−○` controls; clicking increments / decrements `merit.bonus` (clamped ≥ 0) and saves.
- [x] Manual bonus dots render as hollow dots (○) after filled inherent dots on the sheet, in both edit mode and view mode.
- [x] Manual bonus dots are additive with existing rule-granted bonus dots (`meritFreeSum`) — they do not replace or interfere with derived free dots.
- [x] `merit.bonus` is NOT added to `m.rating` (that field is XP-driven only).
- [x] Changes persist: saved to the character record via the standard save path and survive a page reload.

---

## Tasks

### Task 1 — `merits.js`: Add `bonus` to default-sync helpers ✓

**File:** `public/js/editor/merits.js`

In `ensureMeritSync(c)` (line ~106), inside the `for (const m of c.merits)` loop, add one line after the existing `free_sw` guard:
```js
if (m.bonus === undefined) m.bonus = 0;
```

In `addMerit(c, merit)` (line ~124), add before `c.merits.push(merit)`:
```js
if (merit.bonus === undefined) merit.bonus = 0;
```

### Task 2 — `edit.js`: Add `shAdjMeritBonus` handler ✓

**File:** `public/js/editor/edit.js`

Add the following function after `shAdjAttrBonus` (line 572):

```js
export function shAdjMeritBonus(realIdx, delta) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  ensureMeritSync(c);
  const m = c.merits[realIdx];
  if (!m) return;
  m.bonus = Math.max(0, (m.bonus || 0) + delta);
  _markDirty();
  _renderSheet(c);
}
```

`ensureMeritSync` is already imported (line 13). No new imports needed.

### Task 3 — `sheet.js`: Update general merit dot display and controls ✓

**File:** `public/js/editor/sheet.js`, function `shRenderGeneralMerits` (line 1172)

#### 3a — Edit mode: non-granted merit row (the `else` branch, ~line 1216–1229)

The current dots span is:
```js
'<span class="infl-dots-derived">' + '●'.repeat(_gPurch) + '○'.repeat(Math.max(0, dd - _gPurch)) + '</span>'
```

`dd` is currently `(m.cp || 0) + (m.xp || 0) + meritFreeSum(m)`.

Update the dots display to include `m.bonus` open circles, and add the stepper controls after the dots span:

```js
const _bon = m.bonus || 0;
const _dispTotal = dd + _bon;
// Updated dots span
'<span class="infl-dots-derived">' + '●'.repeat(_gPurch) + '○'.repeat(Math.max(0, _dispTotal - _gPurch)) + '</span>'
// Bonus controls — append after the dots span, before the remove button
+ '<span class="dot empty" style="font-size:11px;color:var(--gdim);margin-left:4px;" onclick="shAdjMeritBonus(' + rIdx + ',1)" title="Add bonus dot">+○</span>'
+ (_bon > 0 ? '<span class="dot empty" style="font-size:11px;color:var(--gdim);" onclick="shAdjMeritBonus(' + rIdx + ',-1)" title="Remove bonus dot">&minus;○</span>' : '')
```

`rIdx` is already computed as `c.merits.indexOf(m)` in the existing line `const rIdx = c.merits.indexOf(m)`.

#### 3b — View mode: include `m.bonus` in dot total (~line 1240)

Current:
```js
const purch = (m.cp || 0) + (m.xp || 0), bon = meritFreeSum(m);
const dotH = shDotsMixed(purch, bon);
```

Change `bon` to include the manual bonus:
```js
const purch = (m.cp || 0) + (m.xp || 0), bon = meritFreeSum(m) + (m.bonus || 0);
const dotH = shDotsMixed(purch, bon);
```

### Task 4 — `admin.js`: Expose `shAdjMeritBonus` on window ✓

**File:** `public/js/admin.js`

There are two wiring blocks. Both must be updated (see [feedback_editor_handlers_two_consumers](../../memory/feedback_editor_handlers_two_consumers.md)):

**Top import block (~line 57):** Add `shAdjMeritBonus` to the named imports from `'./editor/edit.js'`:
```js
shEditMeritPt, shStepMeritRating, shEditXP, shAdjAttrBonus, shAdjMeritBonus,
```

**Bottom `Object.assign(window, {...})` block (~line 1195):** Add `shAdjMeritBonus` to the assignment:
```js
shEditMeritPt, shStepMeritRating, shEditXP, shAdjAttrBonus, shAdjMeritBonus,
```

### Task 5 — `app.js`: Expose `shAdjMeritBonus` on window ✓

**File:** `public/js/app.js`

Same two-block pattern as `admin.js`. Grep for `shAdjAttrBonus` to locate both blocks and add `shAdjMeritBonus` beside it in each.

---

## Dev Notes

### The two-editor distinction (read this before touching anything)

There are two separate editing surfaces:

| Editor | File | Attrs | Skills | Merits |
|---|---|---|---|---|
| Attrs & Skills tab | `attrs-tab.js` | `adjAttrBonus` ✓ | `adjSkillBonus` ✓ | N/A (no merits here) |
| Inline sheet editor | `sheet.js` | `shAdjAttrBonus` ✓ | no bonus stepper | **this story** |

Skills already have the `+○`/`−○` controls in the attrs-tab editor. No skill changes are needed.

### Why `bonus` must NOT go into `syncMeritRating`

`syncMeritRating` (domain.js:200) returns `cp + xp + meritFreeSum(m)` and writes it to `m.rating`. This value drives XP spend calculations, pool checks, and influence totals. The manual `bonus` is purely a visual override — an ST convenience, not a mechanical rating change. If you accidentally add `m.bonus` to `syncMeritRating`, influence totals, XP calculations, and merit prerequisite checks will all silently inflate. Do not do this.

### The `admin.js` + `app.js` two-import rule

Every sh* handler exported from `edit.js` must appear in BOTH `admin.js` and `app.js` — first in the named import at the top of the file, and again in the `Object.assign(window, {...})` block near the bottom. Missing either block means the function is undefined in that app's browser context. The existing `shAdjAttrBonus` entries show exactly where to add.

### Granted merits

Merits with `m.granted_by` render a different row (`gen-granted-row`). The bonus stepper is only added to the non-granted `else` branch. Granted merits do not get controls (they are managed by PT/MCI grant mechanics, not direct ST input).

### `meritBdRow` is NOT the right place

`meritBdRow` (xp.js:202) renders the CP/XP/MCI/VM/etc numeric inputs. The bonus controls should go in the `gen-edit-row` (the row with the merit name dropdown), not in `meritBdRow`. This matches the `+○`/`−○` span style used in attrs-tab, rather than the numeric-input style used for MCI/VM.

### Save path

`_markDirty()` + `_renderSheet(c)` is the complete save path for in-memory changes. The dirty flag triggers the standard character save on the next autosave or manual save. No special persistence logic is needed.

### Testing checklist (manual)

- Open sheet editor for a character with general merits
- Click `+○` on a merit: bonus count goes to 1, open circle appears after filled dots
- Click `+○` again: two open circles
- Click `−○`: back to one. `−○` disappears at zero (the `> 0` guard)
- Save and reload: bonus persists
- View mode (non-edit): bonus open circles render after the merit dots in the merit list
- XP totals are unchanged by adding bonus dots (verify xpSpent on the XP tab)
- PT / MCI influence merits are unaffected (no regression on existing free_* channels)

---

## Dev Agent Record

### Implementation Plan

5 surgical edits across 4 files. No new modules, no import graph changes (ensureMeritSync was already imported in edit.js). All wiring follows the two-consumer pattern established by shAdjAttrBonus.

### Debug Log

- Confirmed Skills bonus controls already implemented in attrs-tab.js — no skill work needed.
- Confirmed syncMeritRating does NOT include m.bonus (correct: bonus is display-only).
- Confirmed rIdx = c.merits.indexOf(m) already computed in the forEach loop before the edit row is built — used directly for shAdjMeritBonus calls.
- ES module syntax check (node --input-type=module --check) passed on all 5 modified files.

### Completion Notes

- merits.js: `ensureMeritSync` and `addMerit` now default `bonus: 0` on all merit objects.
- edit.js: `shAdjMeritBonus(realIdx, delta)` added after `shAdjAttrBonus`, clamps to ≥ 0, calls `_markDirty` + `_renderSheet`.
- sheet.js `shRenderGeneralMerits`: edit mode renders bonus open circles in the dot span + shows `+○` / `−○` controls (−○ only when bonus > 0); view mode includes `m.bonus` in the `bon` calculation passed to `shDotsMixed`.
- admin.js: `shAdjMeritBonus` added to top named import and bottom Object.assign block.
- app.js: `shAdjMeritBonus` added to top named import and bottom Object.assign block.

## File List

- `public/js/editor/merits.js`
- `public/js/editor/edit.js`
- `public/js/editor/sheet.js`
- `public/js/admin.js`
- `public/js/app.js`
- `tests/issue-333-merit-skill-bonus-stepper.spec.js`

## Change Log

- feat(#333): add manual bonus dot stepper to general merits (2026-05-17)
- test(#333): 9 Playwright E2E tests for merit and skill bonus stepper (2026-05-17)
