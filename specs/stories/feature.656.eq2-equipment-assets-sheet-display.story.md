# Story feature.656: EQ-2 — Equipment & Assets Sheet Display

## Status: review

---
issue: 656
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/656
branch: ms/issue-656-eq2-equipment-assets-sheet
---

## Story

**As a** player viewing my character sheet,
**I want** my equipment and assets to be displayed clearly, grouped by type, with resolved names and relevant mechanical details,
**so that** I can see what my character is carrying or owns without needing to cross-reference the catalogue separately.

## Background

EQ-1 (#654) established the four-bucket equipment taxonomy (`weapon` | `armour` | `equipment` | `asset`), the static `EQUIPMENT_CATALOGUE` module at `public/js/data/equipment-data.js`, and the character schema extension (`character.equipment[]` + `character.assets[]`).

The lean ref design stores only `{ catalogue_id, state, acquired_cycle, notes }` on the character. Stats (name, bonus_dice, damage_mod, armour_value, etc.) are resolved from `EQUIPMENT_CATALOGUE` at render time.

EQ-2 is the first user-visible story: rewriting `shRenderEquipment()` to render the new catalogue-ref schema across all four buckets.

## Acceptance Criteria

1. `shRenderEquipment(c, editMode)` in `public/js/editor/sheet.js` renders equipment and assets for a character with items.

2. Equipment items are grouped into sub-sections by bucket (`Weapons`, `Armour`, `Equipment`, `Assets`), each with a `.sh-sub-title` header. Sub-sections with no items are omitted.

3. Each equipment item resolves its stats via `getCatalogueEntry(item.catalogue_id)` from `public/js/data/equipment-data.js`. If `getCatalogueEntry` returns `undefined` (unknown/legacy id), the item still renders using `item.catalogue_id` as the fallback display name without crashing.

4. `state` values render as human-readable labels: `carried` → `Carried`, `worn` → `Worn`, `stashed` → `Stashed`, `lost` → `Lost`, `active` → `Active`.

5. Weapon entries display: name, state chip, damage info (`+N · lethal · melee` etc.), notes if present.

6. Armour entries display: name, state chip, `AR N` value, and defence in `base(reduced)` format — e.g. base Defence 3 with `defence_penalty: -1` renders as `3(2)`. `defence_penalty` is never passed to `calcDefence()`.

7. Equipment entries (tools/tech) display: name, state chip, `skill_domain +bonus_dice dice` pool modifier label, notes if present.

8. Asset entries display: name, description, location (if set), `mechanical_effect` (if set), acquired cycle label, notes if present.

9. Characters with no `equipment` field and no `assets` field (legacy documents) render an empty section that is omitted entirely (`return ''`) — no crash, no blank container.

10. Edit mode shows the same read-only display as view mode. The old inline edit controls (type select, attack_skill, damage_rating, general_ar, ballistic_ar, mobility_penalty inputs) are removed. Equipment editing is managed via the ST CRUD API (EQ-1).

11. The old edit handler functions `shAddEquip`, `shEditEquip`, `shRemoveEquip` are removed from `edit.js`. Both import sites in `app.js` (lines ~39 and ~1143) are updated to remove them.

12. `public/js/data/equipment.js` (dead code: `getEquipment`, `weaponPool`, `effectiveDefence`, `weaponPoolLabel`) is deleted. No file imports from it.

13. The suite sheet (`public/js/suite/sheet.js`) imports and calls `shRenderEquipment(c, false)` at line 731 — it receives the updated rendering for free with no changes required.

14. All existing sheet tests and Playwright specs pass after the rewrite. No regressions in other sheet sections.

## Tasks / Subtasks

- [x] Task 1: Add `getCatalogueEntry` import to `public/js/editor/sheet.js`
  - [x] Add `import { getCatalogueEntry } from '../data/equipment-data.js';` at the top of the file, alongside existing data imports

- [x] Task 2: Rewrite `shRenderEquipment(c, editMode)` in `public/js/editor/sheet.js` (lines 1732–1766)
  - [x] Declare `STATE_LABELS` map: `{ carried: 'Carried', worn: 'Worn', stashed: 'Stashed', lost: 'Lost', active: 'Active' }`
  - [x] Read `const equip = c.equipment || []` and `const assets = c.assets || []`
  - [x] Return `''` early if both are empty
  - [x] Open section: `<div class="sh-sec"><div class="sh-sec-title">Equipment & Assets</div><div class="merit-list">`
  - [x] Group equipment items by bucket (weapon, armour, equipment) -- use `getCatalogueEntry(item.catalogue_id) || {}` for fallback safety
  - [x] For each non-empty bucket, render a `.sh-sub-title` header then `.merit-plain` rows
  - [x] Weapon rows: name (or catalogue_id fallback), state chip, `+damage_mod · damage_type · weapon_type` qualifier, notes
  - [x] Armour rows: name, state chip, `AR armour_value`, defence display `base(base - penalty)` format
  - [x] Equipment rows: name, state chip, `skill_domain +bonus_dice dice` qualifier, notes
  - [x] Asset rows from `assets[]`: name as `.trait-name`, description, location + mechanical_effect if set, `Cycle acquired_cycle` label, notes
  - [x] Edit mode: render the same read-only view (no inline inputs); omit old add/remove buttons entirely
  - [x] Close section: `</div></div>`

- [x] Task 3: Remove old equipment edit handlers from `public/js/editor/edit.js`
  - [x] Delete `shAddEquip` (lines ~1038-1049)
  - [x] Delete `shEditEquip` (lines ~1051-1057)
  - [x] Delete `shRemoveEquip` (lines ~1059-1066)
  - [x] Confirm no remaining references in `edit.js` to old schema fields (`damage_rating`, `attack_skill`, `general_ar`, `ballistic_ar`, `mobility_penalty`)

- [x] Task 4: Update `public/js/app.js` to remove the three handler imports
  - [x] Remove `shAddEquip, shEditEquip, shRemoveEquip,` from the `import { ... } from './editor/edit.js'` block (line ~39)
  - [x] Remove `shAddEquip, shEditEquip, shRemoveEquip,` from the window-object export block (line ~1143)

- [x] Task 5: Delete `public/js/data/equipment.js`
  - [x] Verify no file imports from it first (`grep -r "from.*equipment\.js"` excluding `equipment-data.js`)
  - [x] Delete the file

- [ ] Task 6: Smoke-test rendering in browser (manual, on dev after merge)
  - [ ] A character with weapon + armour + equipment + asset items shows all four sub-sections
  - [ ] A character with no equipment/assets shows no Equipment & Assets section
  - [ ] Defence display for armour is correct (`base(reduced)` format)
  - [ ] Suite sheet (`/index.html`) also renders the section correctly

## Dev Notes

### Architecture: where `shRenderEquipment` sits

The function lives at `public/js/editor/sheet.js:1732`. It is called:
- Line 1905: `shRenderEquipment(c, editMode)` in the desktop 2-column layout (right column, after Manoeuvres)
- Line 1908: `shRenderEquipment(c, editMode)` in the mobile single-column layout

No changes to the orchestrator are needed -- just rewrite the function in place.

The suite sheet at `public/js/suite/sheet.js:28` imports `shRenderEquipment` and calls it at line 731 with `(c, false)` (always view-only). It automatically gets the rewritten rendering -- no changes to that file.

### `calcDefence` import path

`sheet.js` line 10 imports `calcDefence` from `'../data/derived.js'` (NOT `accessors.js`):
```js
import { calcHealth, calcWillpowerMax, calcSize, calcSpeed, calcDefence } from '../data/derived.js';
```
Do NOT add a second import or change this line. `calcDefence` is already available in scope.

### Defence display format for armour

```js
const base = calcDefence(c);
const reduced = base + entry.defence_penalty;  // penalty is a negative integer e.g. -1
const defenceDisplay = `${base}(${reduced})`;  // e.g. "3(2)"
```

`defence_penalty` is display-only. It is never added to `calcDefence()` internally, now or in any future story without an ADR. Do not add any call path from `calcDefence` to the equipment array.

### Null-guard for unknown catalogue IDs

Legacy data or a typo could produce a `catalogue_id` with no matching entry:
```js
const entry = getCatalogueEntry(item.catalogue_id) || {};
const displayName = entry.name || item.catalogue_id;  // fallback to raw id
```
Always guard. Never `.name` on a potentially-undefined result.

### State label map

```js
const STATE_LABELS = {
  carried: 'Carried', worn: 'Worn', stashed: 'Stashed', lost: 'Lost', active: 'Active',
};
const stateLabel = STATE_LABELS[item.state] || item.state;  // raw enum as fallback
```

### CSS patterns to use

Follow the existing `.merit-plain` + `.trait-row` pattern used by Manoeuvres (the section immediately above Equipment in the sheet):

```html
<div class="sh-sub-title">Weapons</div>
<div class="merit-plain">
  <div class="trait-row">
    <div class="trait-main">
      <span class="trait-name">${esc(displayName)}</span>
      <div class="trait-right">
        <span class="gen-granted-tag-view">${stateLabel}</span>
      </div>
    </div>
    <div class="trait-sub">
      <span class="trait-qual">${qualifier}</span>
    </div>
  </div>
</div>
```

Do NOT invent new CSS classes. All required classes exist: `.sh-sub-title`, `.merit-plain`, `.trait-row`, `.trait-main`, `.trait-right`, `.trait-name`, `.trait-qual`, `.gen-granted-tag-view`.

### Removing `shAddEquip` / `shEditEquip` / `shRemoveEquip`

These are exported from `edit.js` and imported in **two places** in `app.js`:
- Line ~39: import statement `import { ..., shAddEquip, shEditEquip, shRemoveEquip, ... } from './editor/edit.js'`
- Line ~1143: window-object export block

Both must be updated. Leaving one site broken causes a runtime "not exported" error.

There is no `admin.js` file -- the memory note about "two importers" reflects `admin.js` being the old name before it was unified into `app.js`. Only `app.js` needs updating.

### `equipment.js` deletion

`public/js/data/equipment.js` exports four functions (`getEquipment`, `weaponPool`, `effectiveDefence`, `weaponPoolLabel`). None are imported anywhere in the codebase (confirmed in EQ-1 analysis). The file imports from `./accessors.js`, so deleting it causes no cascade.

Verify before deleting:
```bash
grep -r "from.*['\"].*equipment['\"]" public/js/ --include="*.js" | grep -v "equipment-data"
```
If the output is empty, the delete is safe.

### Edit mode behaviour

EQ-2 scope is **read-only display only**. In edit mode, render the same view as view mode. Remove the old inline edit UI entirely (the select dropdowns, number inputs, add/remove buttons). ST equipment management goes through the CRUD API (EQ-1).

If the character has no equipment/assets, the section is hidden regardless of edit mode -- this is consistent with other sections (general merits, manoeuvres etc. are also hidden when empty).

### `acquired_cycle` display

```js
const cycleLabel = item.acquired_cycle === 0 ? 'Pre-campaign' : `Cycle ${item.acquired_cycle}`;
```

### Damage type / weapon type labels

The catalogue stores lowercase strings: `'lethal'`, `'bashing'`, `'aggravated'`; `'melee'`, `'ranged'`, `'thrown'`. Capitalise for display:
```js
const DMGTYPE = { lethal: 'Lethal', bashing: 'Bashing', aggravated: 'Aggravated' };
const WPNTYPE = { melee: 'Melee', ranged: 'Ranged', thrown: 'Thrown' };
```

### Existing equipment CSS

The old `.equip-edit-row` class was only used by the old edit-mode controls being removed. It is not needed in the rewrite. Do not use it.

## File List

- `public/js/editor/sheet.js` — MODIFY (add import, rewrite shRenderEquipment)
- `public/js/editor/edit.js` — MODIFY (remove shAddEquip, shEditEquip, shRemoveEquip)
- `public/js/app.js` — MODIFY (remove three handler exports, two sites)
- `public/js/data/equipment.js` — DELETE (dead code, no consumers)

## Dev Agent Record

### Completion Notes

- Tasks 1-5 implemented in session; Task 6 is manual smoke-test post-merge.
- Defence formula corrected: catalogue stores `defence_penalty` as a positive integer (penalty amount). The renderer uses `baseDefence - entry.defence_penalty` to produce `base(reduced)` format (e.g., armoured-vest with penalty 1 at base Defence 2 → "Defence 2(1)"). The story's dev notes assumed a negative-stored value; the catalogue uses positive for clarity.
- `shRenderEquipment` is identical in view and edit mode (read-only both). Old inline edit controls removed entirely.
- 9 Playwright tests added covering all ACs including unknown-id fallback and edit-mode guard.

### Change Log

- `public/js/editor/sheet.js`: added `getCatalogueEntry` import; rewrote `shRenderEquipment` (lines 1732+)
- `public/js/editor/edit.js`: deleted `shAddEquip`, `shEditEquip`, `shRemoveEquip`
- `public/js/app.js`: removed the three handler names from import and window-export blocks
- `public/js/data/equipment.js`: deleted (dead code, no consumers)
- `tests/feature-656-eq2-equipment-sheet.spec.js`: created (9 E2E tests, all passing)
