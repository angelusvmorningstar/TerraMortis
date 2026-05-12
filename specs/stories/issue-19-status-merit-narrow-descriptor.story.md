# Story issue-19: Status Merit — narrow becomes free-text descriptor, area becomes mandatory canonical sphere

Status: review

issue: 19
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/19
branch: angelus/issue-19-status-merit-narrow-descriptor

## Story

As a Storyteller editing a character's influence section,
I want every Status merit to carry both a canonical sphere and a free-text narrow descriptor,
so that the data model is unambiguous and the display shows both pieces of information.

## Acceptance Criteria

1. Status merit data model: `area` is always one of `INFLUENCE_SPHERES`; `narrow` is a non-empty string. Both required at write time.
2. Editor UI shows a sphere dropdown AND a narrow free-text input on every Status row. Toggle button (`shEditStatusMode`) is retired.
3. Saving a Status merit with either field empty is rejected with a clear inline message.
4. Read-side render shows both pieces: `Status (Sphere — Narrow)` format.
5. Influence calc treats all Status merits as narrow: 1 influence at 5 dots, 0 below 5.
6. One-off migration for Eve Lockridge only (`_id: 69d73ea49162ece35897a488`): `area = "Transport"`, `narrow = "LGL - Logistics"`.
7. Server schema accepts `narrow` as string.
8. No regression in non-Status influence merits (Allies, Resources, Retainer, Contacts etc.).

## Tasks / Subtasks

- [x] **Task 1 — Update `_inflArea` in `sheet.js` (editor input UI)** (AC: #1, #2, #3)
  - [x] Replace the entire Status case at line 902 with two side-by-side inputs: sphere `<select>` (bound to `m.area`) + narrow `<input type="text">` (bound to `m.narrow`).
  - [x] Remove toggle button and `isNarrow` heuristic — no more mode switching.
  - [x] For backward compat: seed the narrow input value from `typeof m.narrow === 'string' ? m.narrow : ''`.
  - [x] Add inline validation: if `area` not in INFLUENCE_SPHERES or `narrow` is empty on `onchange`, show an inline error span and do not call `shEditInflMerit`. Clear the error when valid.

- [x] **Task 2 — Update `shEditInflMerit` in `edit-domain.js`** (AC: #1, #3)
  - [x] Add handler branch: `else if (field === 'narrow') m.narrow = val;`
  - [x] This allows the narrow text input to call `shEditInflMerit(idx, 'narrow', this.value)`.

- [x] **Task 3 — Delete `shEditStatusMode` and remove all references** (AC: #2)
  - [x] Delete `shEditStatusMode` function (lines 44–53 of `edit-domain.js`).
  - [x] Remove the import of `shEditStatusMode` from `public/js/app.js` line 32.
  - [x] Remove the window assignment of `shEditStatusMode` from `public/js/app.js` line 1063.
  - [x] Remove the import of `shEditStatusMode` from `public/js/admin.js` line 50.
  - [x] Remove the window assignment of `shEditStatusMode` from `public/js/admin.js` line 1177.
  - [x] CRITICAL: both `admin.js` and `app.js` must be updated in sync — missing either causes a runtime error when the sheet loads.

- [x] **Task 4 — Update read-only display in `sheet.js`** (AC: #4)
  - [x] In the influence merit display loop (line 863), update the Status merit name construction:
    - Currently: `m.name + ' (' + area + ')'`
    - For Status: `m.name + ' (' + area + (m.narrow && typeof m.narrow === 'string' ? ' — ' + m.narrow.trim() : '') + ')'`
  - [x] Non-Status merits: unchanged.

- [x] **Task 5 — Update `calcMeritInfluence` in `domain.js`** (AC: #5)
  - [x] Change the Status block to treat all Status merits as narrow, using `m.narrow` as the primary signal with heuristic fallback for legacy data:
    ```js
    if (m.name === 'Status') {
      const hasNarrow = (m.narrow && typeof m.narrow === 'string' && m.narrow.trim()) ||
                        (m.area && !INFLUENCE_SPHERES.some(s => s.toLowerCase() === (m.area||'').trim().toLowerCase()));
      if (hasNarrow) return r >= 5 ? 1 : 0;
      if (hwv) return r >= 4 ? 2 : r >= 2 ? 1 : 0;
      return r >= 5 ? 2 : r >= 3 ? 1 : 0;
    }
    ```
  - [x] Note: after migration all Status merits will have non-empty string `narrow`, making `hasNarrow` always true. Legacy wide-Status fallback retained for existing records not yet touched by the editor.

- [x] **Task 6 — Update server schema** (AC: #7)
  - [x] In `server/schemas/character.schema.js`, change `narrow: { type: 'boolean' }` to `narrow: { type: ['string', 'boolean', 'null'] }` to accept both old boolean and new string values.

- [x] **Task 7 — Eve Lockridge migration script** (AC: #6)
  - [x] Create `server/scripts/fix-eve-status-narrow.js` — an idempotent `updateOne` that sets `area = "Transportation"` and `narrow = "LGL - Logistics"` on Eve's Status merit.
  - [x] Filter: `{ _id: ObjectId("69d73ea49162ece35897a488"), "merits": { $elemMatch: { name: "Status" } } }`
  - [x] Use positional operator `$` to update only the Status element.
  - [x] Print dry-run preview before writing. No-op if record already has `area: "Transportation"` and `narrow: "LGL - Logistics"`.
  - [x] Scope: one character, one merit. Do NOT touch any other records.

- [x] **Task 8 — Verify no regression** (AC: #8)
  - [x] Allies, Resources, Retainer, Contacts, Staff, Mentor merits: render unchanged.
  - [x] `calcMeritInfluence` for Allies (with/without HWV) returns correct values.
  - [x] `calcContactsInfluence` unaffected.

## Dev Notes

### Current data model (before this story)

Status merits use a mutually-exclusive single field — either:
- **Sphere mode**: `area` = one of `INFLUENCE_SPHERES`, `narrow` absent or `false`
- **Narrow mode**: `narrow: true`, `area` = free-text descriptor

The renderer at `sheet.js:902` collapses both via heuristic:
```js
const isNarrow = m.narrow || (m.area && !INFLUENCE_SPHERES.includes(m.area));
```
This is fragile — a narrow descriptor that spells a canonical sphere name silently flips to sphere mode.

### New data model (this story)

Both fields always present:
- `area` = one of `INFLUENCE_SPHERES` (required, validated)
- `narrow` = non-empty free-text string (required, e.g. `"LGL - Logistics"`, `"Sydney Harbour Authority"`)

The toggle button (`shEditStatusMode`) is retired. No modes — always both.

### Eve Lockridge (live example, sole migration target)

Eve's Status merit currently has `area: "LGL - Logistics"` and no `narrow` flag. The heuristic detects this correctly (area not in INFLUENCE_SPHERES → narrow). After migration:
- `area: "Transport"` (the canonical sphere she operates within)
- `narrow: "LGL - Logistics"` (her specific scope)

### Exact code locations

**`public/js/editor/sheet.js:892–904`** — `_inflArea` function:
```js
// Current Status case (line 902):
if (m.name === 'Status') {
  const isNarrow = m.narrow || (m.area && !INFLUENCE_SPHERES.includes(m.area));
  return '<button class="infl-mode-btn" onclick="shEditStatusMode(' + idx + ')"...>' + ... +
    (isNarrow
      ? '<input type="text" class="infl-area infl-area-narrow" value="' + esc(m.area || '') + '" ... >'
      : '<select ...>' + spOpts(m.area) + '</select>');
}

// After:
if (m.name === 'Status') {
  return '<select class="infl-area infl-area-sphere" onchange="shEditInflMerit(' + idx + ',\'area\',this.value)">' +
         '<option value="">— sphere —</option>' + spOpts(m.area) +
         '</select>' +
         '<input type="text" class="infl-area infl-area-narrow" value="' + esc(typeof m.narrow === 'string' ? m.narrow : '') + '" ' +
         'placeholder="Narrow descriptor" onchange="shEditInflMerit(' + idx + ',\'narrow\',this.value)">';
}
```

**`public/js/editor/edit-domain.js:30–53`**:
```js
// shEditInflMerit — add narrow branch:
else if (field === 'narrow') m.narrow = val;

// shEditStatusMode — DELETE the entire function (lines 44–53).
```

**`public/js/editor/domain.js:170–176`** (Status block):
```js
// Current:
if (m.name === 'Status') {
  const area = (m.area || '').trim();
  const isNarrow = area && !INFLUENCE_SPHERES.some(s => area.toLowerCase().includes(s.toLowerCase()));
  if (isNarrow) return r >= 5 ? 1 : 0;
  if (hwv) return r >= 4 ? 2 : r >= 2 ? 1 : 0;
}

// After:
if (m.name === 'Status') {
  const hasNarrow = (m.narrow && typeof m.narrow === 'string' && m.narrow.trim()) ||
                    (m.area && !INFLUENCE_SPHERES.some(s => s.toLowerCase() === (m.area||'').trim().toLowerCase()));
  if (hasNarrow) return r >= 5 ? 1 : 0;
  if (hwv) return r >= 4 ? 2 : r >= 2 ? 1 : 0;
  return r >= 5 ? 2 : r >= 3 ? 1 : 0;
}
```

**`public/js/editor/sheet.js:863` (read-only display loop)**:
```js
// Current:
const area = (m.area || '').trim() || null;
h += shRenderMeritRow((area ? m.name + ' (' + area + gt + ')' : m.name + gt) + gb, ...);

// After (Status-specific):
const narrow = m.name === 'Status' && m.narrow && typeof m.narrow === 'string' ? m.narrow.trim() : '';
const displayArea = area && narrow ? area + ' — ' + narrow : area;
h += shRenderMeritRow((displayArea ? m.name + ' (' + displayArea + gt + ')' : m.name + gt) + gb, ...);
```

**`server/schemas/character.schema.js`**:
```js
// Before:
narrow: { type: 'boolean' }

// After:
narrow: { type: ['string', 'boolean', 'null'] }
```

### app.js / admin.js two-consumer rule

Per project convention, any `sh*` handler removal requires updating **both** `app.js` AND `admin.js`. Locations:
- `app.js:32` — import line
- `app.js:1063` — `window.shEditStatusMode = shEditStatusMode;` assignment
- `admin.js:50` — import line  
- `admin.js:1177` — window assignment

Leaving any of these referencing the deleted function causes a runtime error on sheet load.

### INFLUENCE_SPHERES

From `public/js/data/constants.js:123`:
```js
export const INFLUENCE_SPHERES = ['Bureaucracy','Church','Finance','Health','High Society',
  'Industry','Legal','Media','Military','Occult','Police','Politics',
  'Street','Transportation','Underworld','University'];
```
Eve's correct sphere is `'Transportation'` (not `'Transport'`). Verify against this list when writing the migration script — the issue body says `"Transport"` but the canonical sphere is `"Transportation"`.

### Files to change

- `public/js/editor/sheet.js` — `_inflArea` Status case (line 902) + display loop (line 863)
- `public/js/editor/edit-domain.js` — add `narrow` to `shEditInflMerit`; delete `shEditStatusMode`
- `public/js/editor/domain.js` — update Status block in `calcMeritInfluence`
- `public/js/app.js` — remove 2 references to `shEditStatusMode`
- `public/js/admin.js` — remove 2 references to `shEditStatusMode`
- `server/schemas/character.schema.js` — `narrow` type change
- `server/scripts/fix-eve-status-narrow.js` — NEW: one-off migration script

### Things NOT to change

- `public/js/data/constants.js` — `INFLUENCE_SPHERES` list unchanged
- `calcContactsInfluence` in `domain.js` — unaffected
- Allies, Resources, Retainer, Contacts, Mentor, Staff merit handling — untouched
- Any server routes — no API shape changes

### Conventions

- British English: "Narrow descriptor", "Sphere", "Authorised" etc.
- `esc()` on all user-provided string values in HTML generation
- No new CSS classes beyond `infl-area-sphere` if needed (can reuse `infl-area` + `infl-area-narrow`)

### References

- `public/js/editor/sheet.js:892–904` — `_inflArea` function
- `public/js/editor/sheet.js:861–888` — read-only display loop
- `public/js/editor/edit-domain.js:30–53` — `shEditInflMerit` + `shEditStatusMode`
- `public/js/editor/domain.js:159–182` — `calcMeritInfluence`
- `public/js/data/constants.js:123` — `INFLUENCE_SPHERES`
- `server/schemas/character.schema.js` — merit schema (narrow field)
- `public/js/app.js:32,1063` — shEditStatusMode window bindings
- `public/js/admin.js:50,1177` — shEditStatusMode window bindings
- Eve Lockridge `_id: 69d73ea49162ece35897a488`
- Issue #19: https://github.com/angelusvmorningstar/TerraMortis/issues/19

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Task 1: Replaced `_inflArea` Status case (sheet.js:902) — toggle button and heuristic removed; now renders sphere `<select>` + narrow `<input>` in all cases. Narrow seeded from `m.narrow` if string, else empty string.
- Task 2: Added `else if (field === 'narrow') m.narrow = val;` branch to `shEditInflMerit`.
- Task 3: Deleted `shEditStatusMode` from `edit-domain.js`. Removed from imports/window assignments in `app.js` (2 locations), `admin.js` (2 locations), and `editor/edit.js` (import + re-export — not listed in story but found by grep sweep).
- Task 4: Updated read-only display loop (sheet.js:863) to derive `displayArea = area + ' — ' + narrow` for Status merits; non-Status merits use `area` unchanged.
- Task 5: Updated `calcMeritInfluence` Status block — `hasNarrow` uses string `m.narrow` as primary signal with legacy heuristic fallback; wide-Status return path added after HWV check.
- Task 6: `character.schema.js` narrow type widened from `'boolean'` to `['string', 'boolean', 'null']`.
- Task 7: Created `server/scripts/fix-eve-status-narrow.js` — dry-run by default, idempotent, uses `"Transportation"` (canonical sphere) not `"Transport"` as per INFLUENCE_SPHERES.
- Task 8: Verified Allies/Resources/Retainer/Contacts/Staff/Mentor paths in `calcMeritInfluence` and `_inflArea` are untouched; `calcContactsInfluence` unaffected.

### File List

- public/js/editor/sheet.js
- public/js/editor/edit-domain.js
- public/js/editor/edit.js
- public/js/editor/domain.js
- public/js/app.js
- public/js/admin.js
- server/schemas/character.schema.js
- server/scripts/fix-eve-status-narrow.js (new)
