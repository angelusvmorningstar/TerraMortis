# Story Fix.15: Bloodline Grant Refactor

## Status: done

## Story

**As an** ST viewing a character with a bloodline,
**I want** bloodline-granted merits and specialisations to be correctly tracked as named bonus grants,
**so that** they display cleanly without false audit warnings, incorrect XP charges, or styling errors.

## Background

The Gorgon bloodline (the only current bloodline with grants) provides three automatic grants:

1. Skill specialisation: `Animal Ken (snakes)` — added to `c.skills['Animal Ken'].specs`
2. Merit: `Area of Expertise (snakes)` — a `general` merit
3. Merit: `Interdisciplinary Specialty (snakes)` — a `general` merit

### Current bugs

**Bug 1 — Generic `free` field on granted merits triggers red "FREE" styling**

`applyDerivedMerits` in `mci.js` line 327 creates bloodline merits with `free: 1`:
```js
c.merits.push({ name: grant.name, category: grant.category, qualifier: ..., free: 1, granted_by: 'Bloodline' });
```
`meritBdRow` in `xp.js` checks `const freeMark = (fr > 0) ? ' has-free-dots' : ''` and applies a red CSS class when `m.free > 0`. This makes the merit row display with a red border and "FREE" error badge — the same visual treatment as a data problem, not a legitimate grant.

The correct approach is to use a named field `free_bloodline: 1` (following the same pattern as `free_mci`, `free_lk`, `free_vm`, etc.) so the generic `free` field stays at 0 and no red styling is applied.

**Bug 2 — Bloodline-granted skill specialisation is counted in XP costs**

`xpSpentSkills` in `xp.js` counts all specialisations on `c.skills` and charges XP for any above the free baseline (3 base + PT/MCI exemptions). There is no exemption for bloodline-granted specs.

The fix mirrors the MCI free-spec system: `applyDerivedMerits` should populate `c._bloodline_free_specs` (a Set or array), and `xpSpentSkills` should subtract the count of matched bloodline specs from the paid-spec total.

**Bug 3 — Qualifier capitalisation is wrong**

`BLOODLINE_GRANTS` in `constants.js` stores `qualifier: 'Snakes'` (capital S) for both merits and `spec: 'Snakes'` for the skill spec. The correct convention is lowercase: `'snakes'`. Any existing character data in MongoDB will have `'Snakes'` stored; the migration cleanup should normalise this.

### Named pool architecture

The `free_bloodline` field follows the established pattern:

| Source | Named field | Example |
|---|---|---|
| MCI | `free_mci` | granted to merits from MCI pool |
| Viral Mythology | `free_vm` | bonus Allies dots |
| Lorekeeper | `free_lk` | bonus Herd/Retainer dots |
| OHM | `free_ohm` | bonus Contacts/Resources/Allies |
| Invested | `free_inv` | bonus merit dots |
| PT | `free_pt` | auto-applied Contacts dots |
| MDB | `free_mdb` | auto-applied to chosen Crúac style |
| **Bloodline** | `free_bloodline` | **new — replaces generic `free: 1`** |

`free_bloodline` is always auto-applied by `applyDerivedMerits` and is never user-editable. It should not show an editable input in `meritBdRow` — just contribute silently to the total.

## Acceptance Criteria

1. Area of Expertise (snakes) and Interdisciplinary Specialty (snakes) display with no red border, no "FREE" error styling, and no audit warning
2. The `Fr` field in the merit breakdown row shows `0` for these merits (generic `free` is no longer set)
3. The specialisation `Animal Ken (snakes)` is not counted in XP spent on specialisations
4. The qualifier reads `snakes` (lowercase) in both the merit name display and the DB
5. `meritRating` correctly returns 1 for these merits (from `free_bloodline`)
6. When Fix.14 is implemented and the `Fr` input is removed, these merits are unaffected

## Tasks / Subtasks

### Task 1: Fix qualifier capitalisation in `constants.js`

- [ ] In `public/js/data/constants.js`, change the Gorgon `BLOODLINE_GRANTS` entry:
  ```js
  // Before:
  skill_specs: [{ skill: 'Animal Ken', spec: 'Snakes' }],
  merits: [
    { name: 'Area of Expertise', category: 'general', qualifier: 'Snakes' },
    { name: 'Interdisciplinary Specialty', category: 'general', qualifier: 'Snakes' },
  ],
  // After:
  skill_specs: [{ skill: 'Animal Ken', spec: 'snakes' }],
  merits: [
    { name: 'Area of Expertise', category: 'general', qualifier: 'snakes' },
    { name: 'Interdisciplinary Specialty', category: 'general', qualifier: 'snakes' },
  ],
  ```

### Task 2: Replace `free: 1` with `free_bloodline: 1` in `applyDerivedMerits` (`mci.js`)

- [ ] In `public/js/editor/mci.js`, in the bloodline merit grant push (~line 320):
  ```js
  // Before:
  c.merits.push({ name: grant.name, category: grant.category, qualifier: grant.qualifier || null, free: 1, granted_by: 'Bloodline' });
  // After:
  c.merits.push({ name: grant.name, category: grant.category, qualifier: grant.qualifier || null, free_bloodline: 1, granted_by: 'Bloodline' });
  ```
- [ ] Also clear stale `free` on existing bloodline merits before re-applying, like other grant types do:
  ```js
  (c.merits || []).forEach(m => { if (m.granted_by === 'Bloodline') m.free = 0; });
  ```
  Add this immediately before the bloodline grant loop so old data with `free: 1` is cleaned up on every render.
- [ ] Also clear `free_bloodline` on bloodline merits unconditionally every render — mirror how PT clears `free_pt = 0` on all merits before re-applying. Add: `(c.merits || []).forEach(m => { if (m.granted_by === 'Bloodline') { m.free = 0; m.free_bloodline = 0; } });` before the grant loop, so ex-Gorgon characters with orphaned bloodline merits do not keep `free_bloodline: 1` indefinitely.

### Task 3: Track bloodline-granted specs in `applyDerivedMerits` (`mci.js`)

- [ ] In the bloodline skill_specs loop (~line 307–312), also populate `c._bloodline_free_specs`:
  ```js
  if (!c._bloodline_free_specs) c._bloodline_free_specs = [];
  for (const { skill, spec } of (bloodlineGrants.skill_specs || [])) {
    // ... existing spec push logic ...
    c._bloodline_free_specs.push({ skill, spec });
  }
  ```
- [ ] Initialise `c._bloodline_free_specs = []` in the ephemeral tracking clear block (~line 112–118), alongside `c._mci_free_specs = []`

### Task 4: Exempt bloodline specs from XP cost (`xp.js`)

- [ ] In `public/js/editor/xp.js`, in `xpSpentSkills` (~line 89–110), after the `mciFreeSpecs` calculation, add:
  ```js
  const bloodlineFreeSpecs = (c._bloodline_free_specs || []).filter(fs =>
    fs.skill && fs.spec && (c.skills || {})[fs.skill] &&
    ((c.skills[fs.skill].specs || []).includes(fs.spec))
  ).length;
  ```
  Then subtract `bloodlineFreeSpecs` from `specXP`:
  ```js
  const specXP = Math.max(0, paidSpecs - 3 - mciFreeSpecs - bloodlineFreeSpecs);
  ```

### Task 5: Add `free_bloodline` to `meritRating` (`xp.js`)

- [ ] In `public/js/editor/xp.js`, `meritRating` function (~line 186–189):
  ```js
  // Before:
  return (m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + ...
  // After:
  return (m.cp || 0) + (m.free || 0) + (m.free_bloodline || 0) + (m.free_mci || 0) + ...
  ```

### Task 6: Add `free_bloodline` to all merit total calculations (`sheet.js`, `xp.js`)

- [ ] In `public/js/editor/sheet.js`, search for all merit total expressions of the form `(m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + ...` and add `(m.free_bloodline || 0)` to each. Affected locations include:
  - `dd` calculation on line ~875 (general merits edit panel)
  - `dd` on line ~709 (influence merits)
  - `dd` on line ~690 (domain merits)
  - Any other `m.free_mci` occurrence that sums merit totals
- [ ] In `public/js/editor/xp.js`, `meritBdRow` (~line 200): add `fbl = mc.free_bloodline || 0` to the destructure and include in `total`. Do NOT add an editable input for it — it should contribute to the total silently. (The `Fr` input is for the generic `free` field only, which remains 0 for bloodline merits.)

### Task 7: Normalise existing `qualifier: 'Snakes'` in MongoDB (migration)

- [ ] Add a normalisation step to `server/migrations/zero-free-fields.js` (from Fix.14, or as a standalone script if Fix.14 hasn't been implemented yet):
  - For each character, find merits with `name` in `['Area of Expertise', 'Interdisciplinary Specialty']` and `qualifier === 'Snakes'` → set `qualifier = 'snakes'`
  - For each character, in `skills['Animal Ken'].specs`, replace `'Snakes'` with `'snakes'`

## Dev Notes

- `applyDerivedMerits` already clears stale `free` on K-9/Falconry Retainers and PT Contacts before re-applying. The bloodline cleanup (Task 2) follows the exact same pattern.
- `c._bloodline_free_specs` is ephemeral (set each render), never stored. Same pattern as `c._mci_free_specs`.
- The `meritBdRow` in `xp.js` only shows an `Fr` input for `m.free` (generic). `free_bloodline` should NOT add a new input — bloodline grants are read-only. They'll just silently add to the displayed total.
- The audit's `granted_by` exemption (audit.js line 259) already skips bloodline merits, so no change needed there.
- At the time of writing, `free: 1` is still in the DB for existing Gorgon characters. Task 2's clear step (`m.free = 0`) will fix this at render time without requiring a migration.
- Fix.15 must be implemented BEFORE Fix.14. The `meritRating` and merit total expressions will be touched by both — Fix.15 adds `free_bloodline`, Fix.14 removes `free`. Done in this order the Fix.14 dev sees both changes and handles them in one pass.
- Fix.16 depends on Fix.15's capitalisation fix and DB migration (Task 7). Both must land together or the AoE dropdown `selected` matching will break for existing characters in the transition window.

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
