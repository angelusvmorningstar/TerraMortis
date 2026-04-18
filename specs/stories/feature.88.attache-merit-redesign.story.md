# Story feat.15: Attaché Merit Redesign

**Story ID:** feat.15
**Epic:** Feature Backlog
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As an ST editing a character in the admin editor, I want the Attaché merit to behave as a specialised 1-dot influence merit that links directly to a single Contacts, Resources, or Safe Place merit and automatically grants it bonus dots equal to the character's Effective Invictus Status — replacing the old retainer-pool mechanic entirely.

---

## Background

### Old mechanic (being removed)

The previous Attaché implementation treated each purchased Retainer as a pool source. Each retainer received a stable key (A1, A2, etc.) and the ST manually allocated free dots from that pool to child merits (`free_attache`, `retainer_source` fields on child merits). This was ST-managed, per-retainer, and complex.

### New mechanic

- Attaché is a **1-dot influence merit** (category: `influence`, prerequisite: Invictus)
- It stores a single `attached_to` field: the name of the Contacts, Resources, or Safe Place merit it links to
- It grants that merit bonus dots equal to **Effective Invictus Status** = `Math.max(c.status.covenant || 0, c._ots_covenant_bonus || 0)`
- Bonus is **auto-computed at render time** — not stored on the target merit, not ST-allocated

### Effective Invictus Status — existing inline pattern

The pattern `Math.max((c.status || {}).covenant || 0, c._ots_covenant_bonus || 0)` is used inline in six places. A named helper `effectiveInvictusStatus(c)` will replace all of them:

| File | Line | Context |
|---|---|---|
| `public/js/editor/domain.js` | 234 | Existing function (check what wraps this) |
| `public/js/editor/export-character.js` | 101 | Exported covenant status |
| `public/js/editor/sheet.js` | 1098 | Prereq check — covenant type |
| `public/js/editor/sheet.js` | 1103 | Covenant standings check |
| `public/js/editor/sheet.js` | 1544 | `_covEffective` display calc |
| `public/js/player/feeding-tab.js` | 429 | Oath of Fealty vitae pool |
| `public/js/admin/downtime-views.js` | 5433 | Oath of Fealty vitae calc |

---

## What to Remove

### 1. `domain.js` — old helpers (lines 248–262)

```js
export function hasAttache(c) { ... }        // line 248 — REMOVE
export function attachePool(c) { ... }       // line 253 — REMOVE
export function attacheUsed(c, key) { ... }  // line 259 — REMOVE
```

### 2. `mci.js` — attache_key assignment block (lines 184–196)

```js
// ── Attaché: assign stable attache_key to purchased Retainers ──
if (hasAttache(c)) {
  // ... assigns A1, A2, A3...
} else {
  // ... clears attache_key and free_attache
}
```
Remove this block entirely. Also remove `hasAttache` from the import at line 8.

### 3. `xp.js` — `showAttache` option in `meritBdRow` (lines 219–232)

```js
if (opts.showAttache) {
  // ... dropdown + number input for ST allocation
}
```
Remove this block. Also remove `fatt = mc.free_attache || 0` from the destructure at line 204, and remove `+ (m.free_attache || 0)` from the total at line 192.

### 4. `edit-domain.js` — `shEditMeritAttache` (lines 236–246)

```js
export function shEditMeritAttache(realIdx, retainerKey, dots) { ... }
```
Remove entirely. Remove its export from whatever barrel file re-exports it (check `edit.js` for re-exports).

### 5. `sheet.js` — Attaché pool variables and display (multiple locations)

**Line 146** — derived-note for `free_attache`: remove the ternary that shows "Attaché (A1): +N dots (auto)".

**Lines 653–655** (`_infl*` Attaché vars):
```js
const _inflHasAtt = hasAttache(c);
const _inflAttPool = attachePool(c);
const _inflAttKeys = ...
```
Remove these three lines and all references to them in the influence section.

**Line 659** — `+ (m.free_attache || 0)` in the `dd` calculation: remove.

**Lines 664–665** — `_attacheShow` variable and `showAttache: _attacheShow` in `meritBdRow` call: remove.

**Lines 667–669** — Attaché pool row under Retainer merits:
```js
if (m.name === 'Retainer' && _inflHasAtt && m.attache_key) {
  const _au = attacheUsed(c, m.attache_key);
  h += '<div ...>Attaché (key): used / pool dots</div>';
}
```
Remove entirely.

**Line 678** — remove `showAttache: _inflHasAtt && ... ? { keys: _inflAttKeys } : null` from Contacts `meritBdRow` call.

**Line 695** — remove `(m.free_attache || 0)` from `iBon` calculation.

**Lines 746–748** (`_dom*` Attaché vars): remove same pattern as infl.

**Line 750** — remove `(m.free_attache || 0)` from domain `dd`.

**Lines 760–761** — remove `_domAttShow` and `showAttache: _domAttShow`.

**Lines 773** — remove `(m.free_attache || 0)` from `_dRaw`.

**Lines 974–976** (`_gen*` Attaché vars): remove same pattern.

**Line 983** — remove `(m.free_attache || 0)` from general `dd`.

**Lines 1002–1003** — remove `_genAttShow` and `showAttache: _genAttShow`.

**Line 1013** — remove `(m.free_attache || 0)` from general `bon`.

**Line 15** — remove `hasAttache, attachePool, attacheUsed` from domain.js import.

---

## What to Add

### 1. New helpers in `domain.js`

Add after the existing OHM/Invested helpers (after line 262):

```js
/** Effective Invictus covenant status — includes Oath of the Scapegoat floor. */
export function effectiveInvictusStatus(c) {
  if (c.covenant !== 'Invictus') return 0;
  const st = c.status || {};
  return Math.max(st.covenant || 0, c._ots_covenant_bonus || 0);
}

/** Dots granted by an Attaché merit linked to the named target merit. */
export function attacheBonusDots(c, meritName) {
  const att = (c.merits || []).find(m => m.name === 'Attaché' && m.attached_to === meritName);
  if (!att) return 0;
  return effectiveInvictusStatus(c);
}
```

### 2. Replace inline `Math.max` pattern at all 6 call sites

Import `effectiveInvictusStatus` in each file and replace:
```js
Math.max((c.status || {}).covenant || 0, c._ots_covenant_bonus || 0)
// or
Math.max(c.status?.covenant || 0, c._ots_covenant_bonus || 0)
// or
Math.max(char.status?.covenant || 0, char._ots_covenant_bonus || 0)
```
with:
```js
effectiveInvictusStatus(c)   // or effectiveInvictusStatus(char) as appropriate
```

**Note for `sheet.js` line 1544:** The display block unpacks into `_covBase`, `_covOTSBonus`, `_covBonusDots`, `_covEffective`. Keep this unpacking — it's used for the dot display rendering (shows base vs bonus separately). Do NOT replace this with `effectiveInvictusStatus` — it serves a different (display) purpose. Only replace the simple `Math.max(...)` usages that return a single number.

### 3. Update `sheet.js` import line 15

Add `attacheBonusDots, effectiveInvictusStatus` to the domain.js import. Remove `hasAttache, attachePool, attacheUsed`.

### 4. Attaché bonus in dot totals (`sheet.js`)

Wherever `dd` or equivalent totals are computed for **Contacts, Resources, or Safe Place** merits, add `attacheBonusDots(c, m.name)`:

- Line 659 influence section: replace removed `(m.free_attache || 0)` with `attacheBonusDots(c, m.name)` for Resources and Contacts entries
- Line 678 Contacts entry: add `attacheBonusDots(c, contactsEntry.name)` to its dd
- Line 750/773 domain section: add `attacheBonusDots(c, m.name)` for Safe Place

### 5. Attaché bonus in `xp.js` dot totals

In `meritBdRow`, after removing `fatt = mc.free_attache || 0`, add a computed bonus for eligible merits. The function signature needs `c` to call `attacheBonusDots`. Check whether `c` is already passed into `meritBdRow` — if not, the caller in `sheet.js` passes `rIdx` and `m`; a third argument `c` may need adding.

**Alternative (simpler):** Since `meritBdRow` is called from `sheet.js` which has `c` in scope, pass the Attaché bonus as a new option: `opts.attachBonus = attacheBonusDots(c, m.name)` and add `+ (opts.attachBonus || 0)` to the total inside `meritBdRow`. This avoids changing the function signature.

### 6. Derived note on target merit

When rendering a Contacts/Resources/Safe Place merit in `sheet.js`, if `attacheBonusDots(c, m.name) > 0`, append a derived note:
```js
'<div class="derived-note">Attaché: +' + attacheBonusDots(c, m.name) + ' dot' + (bonus !== 1 ? 's' : '') + ' (Invictus Status ' + effectiveInvictusStatus(c) + ')</div>'
```

### 7. `attached_to` field editing for the Attaché merit itself

In `sheet.js` general merits section, when rendering an Attaché merit in edit mode, show a dropdown to select the target merit:

```js
if (m.name === 'Attaché' && editMode) {
  const eligible = (c.merits || []).filter(m2 =>
    ['Contacts', 'Resources', 'Safe Place'].includes(m2.name) ||
    (m2.category === 'influence' && ['Contacts', 'Resources'].includes(m2.name)) ||
    (m2.category === 'domain' && m2.name === 'Safe Place')
  );
  const opts = ['<option value="">(select target)</option>']
    .concat(eligible.map(m2 => `<option value="${esc(m2.name)}"${m.attached_to === m2.name ? ' selected' : ''}>${esc(m2.name)}</option>`))
    .join('');
  h += `<div class="derived-note"><select onchange="shEditField(${rIdx}, 'attached_to', this.value || null)">${opts}</select></div>`;
}
```

Use `shEditField` (or the equivalent generic merit field setter) — check `edit-domain.js` for the correct function. The `attached_to` value is just a string field on the merit object.

---

## Schema Changes

**`server/schemas/character.schema.js`** — merit object schema:

- Remove: `attache_key`, `retainer_source`, `free_attache` from allowed merit fields
- Add: `attached_to: { type: ['string', 'null'] }`

---

## Migration Script

**New file:** `server/scripts/migrate-attache-redesign.js`

```js
// Clears old Attaché retainer-pool fields from all character merits.
// Sets Attaché merit category to 'influence'.
// Run once after deploying feat.15: node server/scripts/migrate-attache-redesign.js
```

For each character:
1. For each merit in `c.merits`:
   - If `m.attache_key` exists: `$unset` it
   - If `m.retainer_source` exists: `$unset` it
   - If `m.free_attache` exists: `$unset` it
   - If `m.name === 'Attaché'` and `m.category !== 'influence'`: set `m.category = 'influence'`
2. Log: character name + count of fields cleared

Use `$unset` not `$set` for field removal.

---

## Acceptance Criteria

- [ ] Attaché appears in the influence merits section of the editor (not general merits)
- [ ] Editing an Attaché merit shows a dropdown to select the target Contacts/Resources/Safe Place merit
- [ ] The target merit shows a derived note "Attaché: +N dots (Invictus Status N)"
- [ ] Bonus dots are included in the target merit's dot display total
- [ ] For a character with Oath of the Scapegoat, the bonus uses `effectiveInvictusStatus` — not raw `status.covenant`
- [ ] Non-Invictus characters: `effectiveInvictusStatus` returns 0; Attaché grants no bonus
- [ ] Old Attaché pool rows ("Attaché (A1): 2/3 dots") are gone from the sheet
- [ ] `attache_key`, `retainer_source`, `free_attache` fields are gone from the editor UI and schema
- [ ] Migration script runs clean; reports characters updated
- [ ] No regression to MCI/PT/OHM/Invested/VM/LK dot sources
- [ ] No regression to Oath of Fealty vitae pool (still uses effective covenant status)
- [ ] No regression to clan/covenant status display in character header

---

## Files to Change

| File | Change |
|---|---|
| `public/js/editor/domain.js` | Remove `hasAttache`, `attachePool`, `attacheUsed`; add `effectiveInvictusStatus`, `attacheBonusDots` |
| `public/js/editor/mci.js` | Remove attache_key assignment block (lines 184–196); remove `hasAttache` import |
| `public/js/editor/xp.js` | Remove `showAttache` block (lines 219–232); remove `free_attache` from totals (lines 192, 204) |
| `public/js/editor/edit-domain.js` | Remove `shEditMeritAttache` (lines 236–246) |
| `public/js/editor/sheet.js` | Remove all `_*HasAtt`/`_*AttPool`/`_*AttKeys` vars and `free_attache` from `dd`; add `attacheBonusDots` to totals + derived notes; add `attached_to` dropdown for Attaché merit; update imports |
| `public/js/editor/export-character.js` | Replace inline `Math.max` at line 101 with `effectiveInvictusStatus(c)` |
| `public/js/player/feeding-tab.js` | Replace inline `Math.max` at line 429 with `effectiveInvictusStatus(char)` |
| `public/js/admin/downtime-views.js` | Replace inline `Math.max` at line 5433 with `effectiveInvictusStatus(char)` |
| `server/schemas/character.schema.js` | Remove old Attaché fields; add `attached_to` |
| `server/scripts/migrate-attache-redesign.js` | **New** — one-shot migration |

**Do not touch:**
- `sheet.js` lines 1540–1548 — `_covBase/_covOTSBonus/_covBonusDots/_covEffective` display block; keep as-is (display rendering, not a simple status lookup)
- Retainer merit display logic unrelated to Attaché
- `calcTotalInfluence` / `calcMeritInfluence` — bonus flows through dot total in `meritBdRow`, not through these functions directly

---

## Critical Constraints

- **`attached_to` is the exact merit name string** (e.g., `"Contacts (Finance)"`) — match must be exact for `attacheBonusDots` to work. The display dropdown should show merit names exactly as stored.
- **`effectiveInvictusStatus` guards on `c.covenant !== 'Invictus'`** — returns 0 for all other covenants without needing a covenant check at the call site.
- **`mci.js` line 440** also contains `free_attache` in its total — remove it there too.
- **No `free_attache` stored anywhere after this story** — bonus is purely computed at render time.
- **User runs the migration script** — do not auto-run it.
