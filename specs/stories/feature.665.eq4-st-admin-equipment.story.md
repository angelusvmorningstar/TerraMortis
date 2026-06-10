# Story feature.665: EQ-4 — ST Admin UI for Assigning Equipment to Characters

## Status: done

---
issue: 665
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/665
branch: ms/issue-665-eq4-st-admin-equipment
---

## Story

**As an** ST using the character editor,
**I want** to add, update, and remove equipment and assets from a character's record,
**so that** players can see their gear on the sheet and it can influence roll calculator chips (EQ-2 and EQ-3 are already live; EQ-4 makes them visible by giving STs the management UI).

## Background

EQ-1 (#654) added `character.equipment[]` + `character.assets[]` schema and four CRUD API routes. EQ-2 (#656) renders Equipment & Assets read-only on the sheet. EQ-3 (#662) surfaces equipment dice-bonus chips in the roll calculator. No characters have any equipment data yet — EQ-4 is what actually populates the system.

The API is already implemented and tested. EQ-4 is purely a frontend story: extend the edit-mode sheet to show an inline management panel for the Equipment & Assets section.

## Acceptance Criteria

- [ ] Equipment & Assets collapsible section visible in character editor below the Merits section; edit controls appear **only when `editMode = true`**
- [ ] Existing `equipment[]` entries display resolved catalogue name, bucket, state, acquired_cycle, notes (same as EQ-2 view mode), with a Remove button in edit mode
- [ ] Add equipment: inline form with bucket select → item select (filtered by bucket) → state select → notes → Add; writes via `POST /api/characters/:id/equipment`
- [ ] Remove equipment: Remove button at index N calls `DELETE /api/characters/:id/equipment/:N`; panel updates inline without full reload
- [ ] Existing `assets[]` entries display name, description, meta (same as EQ-2 view mode), with a Remove button in edit mode
- [ ] Add asset: inline form with name, description, location, mechanical_effect, acquired_cycle, notes → Add; writes via `POST /api/characters/:id/assets`
- [ ] Remove asset: Remove button at index N calls `DELETE /api/characters/:id/assets/:N`; panel updates inline
- [ ] `acquired_cycle` input pre-fills with `state.activeCycleNum ?? 0`; ST can override
- [ ] Panel is absent on player-facing sheet (EQ-2 read-only path unchanged — `shRenderEquipment(c, false)` is unaffected)
- [ ] Legacy characters with no `equipment`/`assets` fields show an empty section with the add form visible in edit mode (no crash)

## Tasks / Subtasks

- [x] Task 1: Add `activeCycleNum` to `public/js/data/state.js`
  - [x] Add `activeCycleNum: null` to the state object (after `openExpId`)

- [x] Task 2: Populate `state.activeCycleNum` in `public/js/app.js`
  - [x] In `_loadLifecycleData()`, after `activeCycle` is resolved, add: `state.activeCycleNum = activeCycle?.game_number ?? null;`
  - [x] Import `state` at the top of app.js is already present as `editorState` — use `editorState.activeCycleNum = ...`

- [x] Task 3: Modify `shRenderEquipment(c, editMode)` in `public/js/editor/sheet.js`
  - [x] When `editMode = false`: behaviour identical to current (view-only, no change)
  - [x] When `editMode = true` AND section is empty: render the section container and both add forms (early return guard changed to `!editMode &&`)
  - [x] In edit mode, each equipment row gets an inline Remove button
  - [x] In edit mode, each asset row gets an inline Remove button
  - [x] At the bottom of the section in edit mode: inline Add Equipment form + inline Add Asset form
  - [x] `byBucket` loop now tracks original flat-array index (`idx: i`) for correct remove button indices

- [x] Task 4: Add equipment/asset handlers to `public/js/editor/edit.js`
  - [x] `shAddEquip()` — reads form DOM values, calls `apiPost`, updates `c.equipment`/`c.assets`, calls `_renderSheet(c)`
  - [x] `shRemoveEquip(idx)` — calls `apiDelete` with zero-based index, updates character, calls `_renderSheet(c)`
  - [x] `shEquipBucketFilter()` — DOM-only: re-populates `#eq-add-item` options based on `#eq-add-bucket` value; NO re-render
  - [x] `shAddAsset()` — reads form DOM values, calls `apiPost`, updates `c.equipment`/`c.assets`, calls `_renderSheet(c)`
  - [x] `shRemoveAsset(idx)` — calls `apiDelete` with zero-based index, updates character, calls `_renderSheet(c)`
  - [x] Export all five new functions; `getCatalogueByBucket` imported from `../data/equipment-data.js`

- [x] Task 5: Wire new handlers into `public/js/app.js`
  - [x] Added `shAddEquip, shRemoveEquip, shEquipBucketFilter, shAddAsset, shRemoveAsset` to the `import { ... } from './editor/edit.js'` block
  - [x] Added all five to the `window` export block

- [x] Task 6: Playwright E2E tests — `tests/feature-665-eq4-st-admin-equipment.spec.js`
  - [x] 10 tests: 10/10 passing (20.0s); EQ-1/2/3 regressions: 30/30 clean

---

## Dev Notes

### CRITICAL: DELETE routes use zero-based index, not catalogueId

The issue body incorrectly describes the DELETE route as `DELETE .../equipment/:catalogueId`. The **actual** routes are:

```
DELETE /api/characters/:id/equipment/:itemIndex   ← zero-based array position
DELETE /api/characters/:id/assets/:itemIndex      ← zero-based array position
```

Do NOT pass `catalogue_id` as the URL param. Pass the item's array index. The API comment says "Client must refresh after delete to avoid stale indices" — this is already handled by re-rendering from the API response.

### API response shape

Every mutation endpoint returns the full updated arrays:
```json
{ "equipment": [...], "assets": [...] }
```

After a successful POST or DELETE, update the in-memory character with these arrays before re-rendering:
```js
c.equipment = result.equipment;
c.assets    = result.assets;
_renderSheet(c);
```

### Async handler pattern (follow touchstone model)

Do NOT use `_markDirty()` — these write directly to the server and update local state from the response. The pattern to follow is `shTouchstoneRemove` / `shTouchstoneSaveAdd` in `edit.js`:

```js
export async function shRemoveEquip(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const charId = String(c._id);
  try {
    const result = await apiDelete('/api/characters/' + charId + '/equipment/' + idx);
    c.equipment = result.equipment;
    c.assets    = result.assets;
    _renderSheet(c);
  } catch (err) {
    console.error('[equipment] remove error:', err);
  }
}

export async function shAddEquip() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const charId = String(c._id);
  const catalogueId = document.getElementById('eq-add-item')?.value;
  const itemState   = document.getElementById('eq-add-state')?.value;
  const notes       = document.getElementById('eq-add-notes')?.value || null;
  if (!catalogueId || !itemState) return;
  const cycle = parseInt(document.getElementById('eq-add-cycle')?.value ?? '0', 10) || 0;
  try {
    const result = await apiPost('/api/characters/' + charId + '/equipment', {
      catalogue_id:   catalogueId,
      state:          itemState,
      acquired_cycle: cycle,
      notes,
    });
    c.equipment = result.equipment;
    c.assets    = result.assets;
    _renderSheet(c);
  } catch (err) {
    console.error('[equipment] add error:', err);
  }
}
```

Model `shRemoveAsset` and `shAddAsset` on the same pattern.

### `shEquipBucketFilter()` — no re-render, DOM only

This function is called by the bucket select's `onchange`. It re-populates the item dropdown without triggering a full sheet re-render:

```js
export function shEquipBucketFilter() {
  const bucket  = document.getElementById('eq-add-bucket')?.value;
  const itemSel = document.getElementById('eq-add-item');
  if (!itemSel) return;
  const entries = bucket ? getCatalogueByBucket(bucket) : [];
  itemSel.innerHTML = '<option value="">-- select item --</option>'
    + entries.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
}
```

Import `getCatalogueByBucket` in `edit.js`:
```js
import { getCatalogueByBucket } from '../data/equipment-data.js';
```

### `shRenderEquipment` edit-mode changes

Current EQ-2 implementation: `editMode` is checked but falls through to the same read-only path. EQ-4 changes this.

**Key change 1**: Early return guard. Current code:
```js
if (!equip.length && !assets.length) return '';
```
In edit mode this must NOT return early — the section still needs to render with the add forms. Change to:
```js
if (!editMode && !equip.length && !assets.length) return '';
```

**Key change 2**: Remove buttons on each item row. Add at the end of each `merit-plain` row in edit mode:
```js
const rmBtn = editMode
  ? `<button class="sk-spec-rm" style="float:right;margin-top:2px" onclick="shRemoveEquip(${idx})" title="Remove">× Remove</button>`
  : '';
```
The index `idx` is the position in the `equip` array (not the bucket sub-array). Track with a counter incremented for each item across all three buckets.

**Key change 3**: Asset remove buttons. Track asset index separately:
```js
const rmAssetBtn = editMode
  ? `<button class="sk-spec-rm" style="float:right;margin-top:2px" onclick="shRemoveAsset(${assetIdx})" title="Remove">× Remove</button>`
  : '';
```

**Key change 4**: Add forms at the bottom of the section in edit mode. After the asset rendering block, before closing `</div></div>`:

```js
if (editMode) {
  const STATES = ['carried', 'worn', 'stashed', 'active', 'lost'];
  const BUCKETS = ['weapon', 'armour', 'equipment'];
  const defaultCycle = state.activeCycleNum ?? 0;

  h += '<div class="sh-sub-title" style="margin-top:10px">Add Equipment Item</div>';
  h += '<div class="dev-add-row" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">'
    + '<select id="eq-add-bucket" class="dev-add-btn" onchange="shEquipBucketFilter()">'
    + '<option value="">Bucket…</option>'
    + BUCKETS.map(b => `<option value="${b}">${b.charAt(0).toUpperCase() + b.slice(1)}</option>`).join('')
    + '</select>'
    + '<select id="eq-add-item" class="dev-add-btn"><option value="">-- select bucket first --</option></select>'
    + '<select id="eq-add-state" class="dev-add-btn">'
    + STATES.map(s => `<option value="${s}">${STATE_LABELS[s] || s}</option>`).join('')
    + '</select>'
    + '<input id="eq-add-cycle" type="number" min="0" value="' + defaultCycle + '" style="width:60px" class="attr-bd-input" title="Acquired cycle">'
    + '<input id="eq-add-notes" type="text" placeholder="Notes (optional)" style="width:130px" class="spec-input">'
    + '<button class="sk-spec-add" onclick="shAddEquip()">Add</button>'
    + '</div>';

  h += '<div class="sh-sub-title" style="margin-top:10px">Add Asset</div>';
  h += '<div class="dev-add-row" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">'
    + '<input id="asset-add-name"  type="text" placeholder="Name*"        class="spec-input" style="width:120px">'
    + '<input id="asset-add-desc"  type="text" placeholder="Description*" class="spec-input" style="width:150px">'
    + '<input id="asset-add-loc"   type="text" placeholder="Location"     class="spec-input" style="width:100px">'
    + '<input id="asset-add-mech"  type="text" placeholder="Mech effect"  class="spec-input" style="width:120px">'
    + '<input id="asset-add-cycle" type="number" min="0" value="' + defaultCycle + '" style="width:60px" class="attr-bd-input" title="Acquired cycle">'
    + '<input id="asset-add-notes" type="text" placeholder="Notes"        class="spec-input" style="width:100px">'
    + '<button class="sk-spec-add" onclick="shAddAsset()">Add</button>'
    + '</div>';
}
```

Note: `state` is already imported in `sheet.js` (`import state from '../data/state.js'`). No new import needed for state access.

`shAddAsset()` in `edit.js`:
```js
export async function shAddAsset() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const charId = String(c._id);
  const name  = document.getElementById('asset-add-name')?.value?.trim();
  const desc  = document.getElementById('asset-add-desc')?.value?.trim();
  if (!name || !desc) return;
  const cycle = parseInt(document.getElementById('asset-add-cycle')?.value ?? '0', 10) || 0;
  try {
    const result = await apiPost('/api/characters/' + charId + '/assets', {
      name,
      description:       desc,
      location:          document.getElementById('asset-add-loc')?.value?.trim()  || null,
      mechanical_effect: document.getElementById('asset-add-mech')?.value?.trim() || null,
      acquired_cycle:    cycle,
      notes:             document.getElementById('asset-add-notes')?.value?.trim() || null,
    });
    c.equipment = result.equipment;
    c.assets    = result.assets;
    _renderSheet(c);
  } catch (err) {
    console.error('[asset] add error:', err);
  }
}
```

### Item index tracking across buckets

The `equip` array is flat. The three rendered bucket sub-sections (weapon, armour, equipment) display items from that same flat array. When building the HTML, you must track the original flat-array index for each item so the Remove button passes the correct index to `shRemoveEquip(idx)`.

Pattern — when iterating to build `byBucket`:
```js
const byBucket = { weapon: [], armour: [], equipment: [] };
for (let i = 0; i < equip.length; i++) {
  const item  = equip[i];
  const entry = getCatalogueEntry(item.catalogue_id) || {};
  const bucket = (entry.bucket && byBucket[entry.bucket]) ? entry.bucket : 'equipment';
  byBucket[bucket].push({ item, entry, idx: i });  // ← store original index
}
```

Then in the render loop:
```js
for (const { item, entry, idx } of byBucket.weapon) {
  // ... build HTML, use idx in remove button
  const rmBtn = editMode ? `<button class="sk-spec-rm" ... onclick="shRemoveEquip(${idx})">...` : '';
}
```

Asset remove buttons track array index the same way using a counter `assetIdx` in the assets loop.

### CSS — do not invent new classes

All required classes already exist in `public/css/suite.css` and/or `public/css/admin-layout.css`:
- `.sh-sub-title` — sub-section header (already used by EQ-2)
- `.merit-plain` / `.trait-row` / `.trait-main` / `.trait-right` / `.trait-name` / `.trait-qual` — row styles (EQ-2)
- `.sk-spec-rm` — small red remove button (used by spec/style remove buttons throughout editor)
- `.sk-spec-add` — small add button (used by spec add buttons)
- `.dev-add-row` / `.dev-add-btn` — add-row container + dropdown style (used by manoeuvres/styles add dropdowns)
- `.attr-bd-input` — small number input (used by attr/skill CP/XP inputs)
- `.spec-input` — small text input (used by spec add inputs)
- `.gen-granted-tag-view` — state chip (already used by EQ-2)

Do NOT add any CSS to any stylesheet.

### state.js addition

```js
const state = {
  chars: [],
  editIdx: -1,
  dirty: new Set(),
  editMode: false,
  openExpId: null,
  activeCycleNum: null,   // ← NEW: populated by app.js from lifecycle load
};
```

### app.js — activeCycleNum population

In `_loadLifecycleData()` (around line 2138), after `activeCycle` is resolved:

```js
const activeCycle = Array.isArray(cycles)
  ? cycles.find(c => c.status === 'open' || c.status === 'active') || null
  : null;
editorState.activeCycleNum = activeCycle?.game_number ?? null;  // ← NEW line
```

`editorState` is already imported at the top of `app.js` as `import editorState from './data/state.js';`.

### Import change in sheet.js

Current import (line ~1 of `shRenderEquipment` setup):
```js
import { getCatalogueEntry } from '../data/equipment-data.js';
```
Change to:
```js
import { getCatalogueEntry, getCatalogueByBucket } from '../data/equipment-data.js';
```
`getCatalogueByBucket` is already exported from `equipment-data.js` (line ~870 of that file).

`getCatalogueByBucket` is only needed in `edit.js` via `shEquipBucketFilter()`. But if the render-side uses it too (for rendering the add form), import in sheet.js. Given the add form builds the bucket dropdown from a static list of strings and the item dropdown is populated by `shEquipBucketFilter()` on demand (DOM-only), `sheet.js` does NOT need `getCatalogueByBucket`. Only `edit.js` does.

**Final import list:**
- `sheet.js`: no import change needed (uses `getCatalogueEntry` already)
- `edit.js`: add `import { getCatalogueByBucket } from '../data/equipment-data.js';`

### Player-facing sheet guard

`public/js/suite/sheet.js` calls `shRenderEquipment(c, false)` — always view mode. EQ-4 changes to `shRenderEquipment` are all gated behind `editMode`, so the suite sheet is unaffected.

---

## Playwright Test Plan (10 tests)

Test file: `tests/feature-665-eq4-st-admin-equipment.spec.js`

Boot pattern: use `bootAdmin()` helper (or equivalent ST-auth setup) — the equipment CRUD routes require `requireRole('st')`. All tests work against a character seeded with equipment data or none.

| # | AC | Test description |
|---|---|---|
| 1 | AC-1 | Equipment & Assets section visible in editor edit mode |
| 2 | AC-1 | Section not present in edit mode on player-facing suite sheet (shRenderEquipment called with false) |
| 3 | AC-2 | Existing equipment entry shows resolved name, state chip, notes |
| 4 | AC-3 | Add equipment: select bucket → item populates → select item + state → Add → row appears |
| 5 | AC-4 | Remove equipment: Remove button → item disappears from panel |
| 6 | AC-5 | Existing asset entry shows name, description, meta |
| 7 | AC-6 | Add asset: fill name+description+cycle → Add → asset row appears |
| 8 | AC-7 | Remove asset: Remove button → asset disappears |
| 9 | AC-8 | acquired_cycle input pre-fills with numeric value (>= 0) |
| 10 | AC-10 | Legacy character (no equipment/assets): section still shows add forms in edit mode, no crash |

**Important test pattern note (from EQ-3 QA findings):** Always separate `goTab` into its own `page.evaluate` call followed by `waitForSelector('#t-<tab>.active')`, never combined with `loadPool` or other calls. See `tests/helpers/unified-app.js` `goToTab` pattern.

For admin tests: use `localTestLogin()` bypass (or the equivalent `window.localTestLogin()` call in page.evaluate) to get ST auth before interacting with the editor.

---

## File List

- `public/js/data/state.js` — MODIFY (add `activeCycleNum: null`)
- `public/js/app.js` — MODIFY (set `editorState.activeCycleNum` in `_loadLifecycleData`; add 5 handler imports; add 5 window exports)
- `public/js/editor/sheet.js` — MODIFY (edit-mode guard on early return; index tracking in byBucket; remove buttons on each row; add forms in edit mode)
- `public/js/editor/edit.js` — MODIFY (add `getCatalogueByBucket` import; add `shAddEquip`, `shRemoveEquip`, `shEquipBucketFilter`, `shAddAsset`, `shRemoveAsset`)
- `tests/feature-665-eq4-st-admin-equipment.spec.js` — NEW (10 Playwright E2E tests, 10/10 passing)
- `tests/feature-656-eq2-equipment-sheet.spec.js` — MODIFY (updated AC-10 assertion to reflect EQ-4 edit mode additions)
