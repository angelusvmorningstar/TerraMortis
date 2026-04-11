# Story Fix.14: Remove Generic Free Dot Bucket

## Status: done

## Story

**As an** ST managing characters,
**I want** the generic `free` dot field removed from attributes, skills, disciplines, merits, and fighting styles,
**so that** all dot allocations are traceable to a named source (CP, XP, or a specific named pool) and the false-positive audit warnings are eliminated.

## Background

The schema currently carries a generic `free` field on every allocatable object. It originated from the Excel import pipeline, where "free" dots (base attribute dots, leftover import deltas, ST overrides) were stored in one unnamed bucket. This causes two problems:

1. **False audit alerts**: Theme disciplines that were removed from the UI still have `free > 0` in MongoDB, triggering the `free_dots_used` warning for many characters. The alert is real but the dots are ghosts — orphaned data from removed disciplines, not deliberate allocations.
2. **No audit trail**: Generic `free` dots have no named source. They could be anything.

### What to keep

- `bonus` on attributes and skills — the separate bonus-dot ticker, shown in the sheet sidebar and used for bonus-dice calculations. This is not `free` and must not be touched.
- Named grant pools on merits: `free_mci`, `free_vm`, `free_lk`, `free_pt`, `free_ohm`, `free_inv`, `free_mdb`. These have named sources and stay.
- `free_mci` and `free_ots` on fighting styles — named pools, stay.
- `p.free` on rite power objects — this is a **boolean flag** meaning "this rite costs no XP", not a dot bucket. Completely separate. Do not touch.

### What to remove

| Object type | Field | Why it exists today | Action |
|---|---|---|---|
| `c.attributes[a].free` | Base dots (1 per attr + 1 clan-favoured) | Always derivable from `clan_attribute`; never legitimately above baseline | Remove from schema; derive inline |
| `c.skills[s].free` | Legacy import artifact | Should be 0; any real bonus is in `bonus` | Zero in migration; remove from code |
| `c.disciplines[d].free` | Legacy import + theme remnants | Should be 0; theme disciplines still have orphaned values in live DB | Zero in migration; remove from code |
| `c.merits[].free` | Manual ST override via `Fr` input box | No named source; legitimate grants should use named pools | Remove `Fr` input and field; zero in migration |
| `c.fighting_styles[].free` | Legacy import | No named source; legitimate dots should be CP | Zero in migration; remove from code |
| K-9/Falconry Retainer `m.free = 1` (`mci.js:178`) | Set by `applyDerivedMerits` each render | Legitimate grant but uses wrong field — no named source | Convert to `free_retainer: 1`; add to merit total calculations |
| Excel merge `ao/so/dObj/merit.free = pts.free` (`excel-merge.js:64,77,90,182`) | Import tool copies `free` column from Excel | Source of all legacy `free` data | Stop writing `free`; map to `cp` instead |

### What is NOT in scope

- `p.free` on rite power objects — boolean flag meaning "rite costs no XP". Completely different semantic from the dot bucket. Do not touch.
- Fix.19 covers `edit-domain.js:121` (Fucking Thief `free: 1`).
- Fix.15 covers bloodline grant `free: 1` → `free_bloodline`.

### Seed data note

`data/chars_v2.json` is clean for all types except Charlie Ballsack, who has `free` values on three fighting styles (`Light Weapons +2`, `Strength Performance +4`, `Weapon and Shield +2`). These 8 dots represent legitimate earned style dots that were imported into the wrong field. They must be moved to `cp` on those entries before the `free` field is removed, or Charlie loses 8 style dots.

### Attribute base-dot derivation

Attributes currently store their base dots in `free` (1 per attribute, 2 for clan-favoured). The edit and render code already has the derivation available:

```js
const baseDots = 1 + (c.clan_attribute === attrKey ? 1 : 0);
const attrBase = (ao.cp || 0) + baseDots;
```

Every occurrence of `(ao.cp || 0) + (ao.free || 0)` in `sheet.js` and `edit.js` should be replaced with this derived form. The stored `free` field on attributes becomes redundant and is dropped.

## Acceptance Criteria

1. No character has the `free_dots_used` audit warning — the gate is removed entirely
2. The `Fr` input box is removed from the merit breakdown row (`meritBdRow` in `xp.js`)
3. The `Fr` input box is removed from the fighting-style breakdown row in `sheet.js`
4. Attribute, skill, discipline, and fighting-style totals render correctly without any `free` field contribution
5. Named merit pools (`MCI`, `VM`, `LK`, `OHM`, `INV`, `PT`, `MDB`) still display and save correctly
6. The `bonus` field on attributes/skills is unaffected
7. Charlie Ballsack's style dot totals are preserved (dots moved to `cp`)
8. Rite `p.free` boolean is unaffected
9. K-9/Falconry Retainer shows `free_retainer: 1` in its breakdown (named, not generic)
10. Excel merge tool no longer writes to `free` fields on import

## Tasks / Subtasks

### Task 1: Fix Charlie Ballsack's style dots in chars_v2.json

- [ ] In `data/chars_v2.json`, find Charlie Ballsack's `fighting_styles` entries
- [ ] For each entry with `free > 0`, add that value to `cp` (or set `cp` if absent) and set `free: 0`
  - Light Weapons: `cp += 2`
  - Strength Performance: `cp += 4`
  - Weapon and Shield: `cp += 2`

### Task 2: Remove `Fr` input from merit breakdown (`xp.js`)

- [ ] In `public/js/editor/xp.js`, in `meritBdRow` (~line 200):
  - Remove `fr` from the destructured line: `const cp = ..., fr = mc.free || 0, ...`
  - Remove `fr` from the `total` sum: `const total = cp + xp + fmci + ...` (drop `fr +`)
  - Remove the `freeMark` variable and its use in the row class
  - Remove the `Fr` `<div class="bd-grp">` block (line ~211)

### Task 3: Remove `Fr` input from fighting-style breakdown (`sheet.js`)

- [ ] In `public/js/editor/sheet.js`, in the fighting-style merit breakdown render (~line 1162–1167):
  - Remove the `Fr` `bd-grp` block for `fs.free`
  - Remove `(fs.free || 0)` from the `dots` total calculation
  - Remove `(fs.free || 0) > 0` from the `has-free-dots` class check
- [ ] Also remove `fs.free` from the fighting-merit breakdown render (~line 1190–1198)

### Task 4: Remove `free` from attribute calculations (`sheet.js`, `edit.js`)

- [ ] In `public/js/editor/sheet.js`, in the attribute render block (~line 246):
  - Remove `free: ao.free || 0` from the `cr` object
  - Change `ab = baseDots + (cr.cp || 0)` — already correct; just verify `cr.free` is not used in the total
  - Remove `aFreeMark` / `has-free-dots` logic that checks `cr.free - baseDots`
- [ ] In `public/js/editor/edit.js`, in the attribute edit handlers (~lines 307, 323, 359, 362):
  - Remove the `ao.free = ...` assignments
  - Replace `const attrBase = (ao.cp || 0) + ao.free` with `const attrBase = (ao.cp || 0) + 1 + (c.clan_attribute === attr ? 1 : 0)`

### Task 5: Remove `free` from skill calculations (`sheet.js`, `edit.js`)

- [ ] In `public/js/editor/sheet.js`, in the skill render block (~line 298–300):
  - Remove `free: so.free || 0` from `cr`
  - Change `sb = (cr.cp || 0) + (cr.free || 0)` to `sb = cr.cp || 0`
  - Remove `skFreeMark` / `has-free-dots` check on `cr.free`
- [ ] In `public/js/editor/edit.js`, skill edit handlers (~line 473, 487):
  - Remove `so.free = 0` init
  - Change `const skBase = (so.cp || 0) + (so.free || 0)` to `const skBase = so.cp || 0`

### Task 6: Remove `free` from discipline calculations (`sheet.js`, `edit.js`)

- [ ] In `public/js/editor/sheet.js`, discipline render block (~line 364):
  - Remove `free: dObj.free || 0` from `cr`
  - Change `db2 = (cr.cp || 0) + (cr.free || 0)` to `db2 = cr.cp || 0`
  - Remove `freeMark` check on `cr.free`
- [ ] In `public/js/editor/edit.js`, discipline edit handler (~line 399):
  - Change `const discBase = (cr.cp || 0) + (cr.free || 0)` to `const discBase = cr.cp || 0`

### Task 7: Remove generic `free` from merit calculations (`edit.js`, `xp.js`)

- [ ] In `public/js/editor/edit.js`, merit rating calculations (~lines 701, 727, 749, 774):
  - Remove `(m.free || 0)` from every merit rating expression
  - On line ~749: `const poolUsed = getPoolUsed(c, m.name) - (m.free || 0)` → remove the subtracted term
- [ ] In `public/js/editor/xp.js`, `meritRating` function (~line 186):
  - Remove `(m.free || 0)` from the sum

### Task 8: Remove `free_dots_used` audit gate (`audit.js`)

- [ ] In `public/js/data/audit.js`, remove the entire free-dots block (~lines 232–271):
  - Delete the `const freeItems = []` block and all its loops
  - Delete the `if (freeItems.length)` push
- [ ] Also remove the now-unused `_validDiscs` guard that was added for this check, IF it is not used elsewhere in the file (check — it IS also used for discipline CP at line 101, so keep it)

### Task 9: Write a targeted MongoDB migration script

- [ ] Create `server/migrations/zero-free-fields.js` (ES module, not a full re-seed):
  ```js
  // Zero all generic 'free' fields on attributes, skills, disciplines,
  // merits (but NOT free_mci / free_vm / free_lk etc.), and fighting_styles.
  // Run once: node server/migrations/zero-free-fields.js
  ```
  - For each character in MongoDB: iterate attributes, skills, disciplines, merits (skip those with `granted_by`), fighting_styles and set `free: 0` (or `$unset` the field)
  - Note: the script must NOT touch `free_mci`, `free_vm`, `free_lk`, `free_pt`, `free_ohm`, `free_inv`, `free_mdb`, `free_ots`
  - Note: `p.free` on powers (rites) is a boolean; do NOT zero it

### Task 10: Update chars_v2.json to strip attribute free fields

- [ ] Remove or zero `free` from all attribute objects in `data/chars_v2.json` (they are `1` or `2` throughout; the code will derive these values)

### Task 11: Convert K-9/Falconry Retainer grant to `free_retainer` (`mci.js`)

- [ ] In `public/js/editor/mci.js`, K-9/Falconry block (~lines 153–172):
  - Change the clear step from `m.free = 0` to `m.free_retainer = 0; m.free = 0`
  - Change the grant step from `m.free = 1` to `m.free_retainer = 1`
- [ ] Add `free_retainer` to `meritBdRow` in `xp.js` — same pattern as other named pools (display-only, no editable input)
- [ ] Add `free_retainer` to all merit total expressions in `sheet.js` and `edit.js` that currently sum `free_mci + free_vm + ...`

### Task 12: Stop writing `free` in Excel merge tool (`excel-merge.js`)

- [ ] In `public/js/admin/excel-merge.js`, at lines ~64, 77, 90, 182:
  - Remove `ao.free = pts.free` / `so.free = pts.free` / `dObj.free = pts.free` / `merit.free = pts.free`
  - Map the value to `cp` instead: `ao.cp = (ao.cp || 0) + (pts.free || 0)` etc.
  - This ensures any dots the Excel sheet had in the "free" column are treated as CP on import going forward

### Task 13: Plug gaps identified in architectural review

- [ ] `public/js/editor/mci.js` line ~168: The K-9/Falconry style detection check includes `(fs.free||0)` — after migration this is 0, but legacy DB data where only `fs.free > 0` (no `cp`) will silently lose the Retainer grant. **Task 9's migration script must move `fs.free` to `fs.cp` for ALL fighting styles across all characters, not just Charlie Ballsack's three entries.**
- [ ] `public/js/editor/edit-domain.js` line ~391 (`shAddStyle`): when a new fighting style is added the initialiser pushes `{ ..., free: 0, ... }`. Remove `free: 0` from this object — the field should not be initialised at all after Fix.14.
- [ ] `public/js/editor/edit-domain.js` line ~438 (`shAddPick`): `totalDots` sum includes `(fs.free||0)`. Remove this dead term.
- [ ] `public/js/editor/mci.js` `getPoolUsed` function (~line 394): after `m.free` is zeroed everywhere this function always returns 0, breaking the merit pool over-spend guard at `edit.js` line ~749. Either delete `getPoolUsed` (if `getMCIPoolUsed` supersedes it) or update it to sum `free_mci` instead. Confirm whether `edit.js` line 749's over-spend cap can simply be removed or must be rewritten against `getMCIPoolUsed`.

## Dev Notes

- `p.free` on rite power objects is a **boolean**, not a dot count. Do not modify it.
- `bonus` on attributes/skills is separate from `free`. Do not modify it.
- Named merit pools (`free_mci`, `free_vm`, `free_lk`, `free_pt`, `free_ohm`, `free_inv`, `free_mdb`) are NOT being removed.
- After this change, `meritRating(m)` should return `(m.cp || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.xp || 0)` — or fall back to `m.rating` if no inline fields present.
- The migration script must be run by the user (`node server/migrations/zero-free-fields.js`) after deploying the code change. Run code deploy first, migration second, so the app never tries to display removed `Fr` inputs on stale live data.
- Fix.14 must come AFTER Fix.15 — the dev implementing Fix.14 must retain `(m.free_bloodline || 0)` in all merit total expressions (added by Fix.15). Do NOT remove free_bloodline when removing free.
- The migration script (Task 9) must move ALL `fs.free > 0` fighting style dots to `cp`, not just Charlie Ballsack's entries.
- Drop `(pt.free || 0)` from the Fix.17 PT sync code when implementing — by the time Fix.14 runs, pt.free is always 0 anyway.

---

## Dev Agent Record

### Implementation Plan
_To be filled by dev agent_

### Debug Log
_To be filled by dev agent_

### Completion Notes
_To be filled by dev agent_

## File List
_To be filled by dev agent_

## Change Log
_To be filled by dev agent_
