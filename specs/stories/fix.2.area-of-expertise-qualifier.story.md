# Story Fix.2: Area of Expertise — Qualifier-Matched +2 Bonus

## Status: ready-for-dev

## Story

**As an** ST or player using the roll engine, downtime form, or feeding tab,
**I want** Area of Expertise to give +2 dice only on the specific specialisation named in its qualifier,
**so that** a character with AoE (Firearms) gets +2 on Firearms rolls but +1 on any other spec.

## Background

Area of Expertise (AoE) is a merit that causes one named specialisation to give +2 dice instead of the normal +1. The merit's qualifier holds the name of that specialisation.

The **editor** already handles this correctly:
- The qualifier field in the admin merit editor shows a dropdown of the character's existing specialisations (same as Interdisciplinary Specialty) -- no change needed there.
- Each spec row in the skill edit panel already shows a green "+2" badge next to the spec that matches the AoE qualifier, via `hasAoE(c, sp)` in `helpers.js`.

The **bugs** are in every place that *applies* the spec bonus to a dice pool or renders a spec chip button. All of them do a broad check -- "does this character have any AoE merit?" -- and if so give +2 on every spec, instead of checking whether the *selected* spec matches the AoE qualifier.

Affected locations:

| File | Issue |
|------|-------|
| `public/js/admin/dice-engine.js` | `getSpecBonus()` ignores `selSpec`; all spec chips rendered with the same bonus value |
| `public/js/player/downtime-form.js` | 4 separate `hasAoE` checks, none compare qualifier to the active spec |
| `public/js/player/feeding-tab.js` | `hasAoE` check does not compare qualifier to `specName` |
| `public/js/suite/roll.js` | Spec chips always show "+1" (or "+2" for nine-again) -- AoE never applied |

The correct check is already written in `public/js/data/helpers.js`:
```js
export function hasAoE(c, specName) {
  return (c.merits || []).some(m =>
    m.name === 'Area of Expertise' && m.qualifier &&
    m.qualifier.toLowerCase() === specName.toLowerCase()
  );
}
```
All fixes should use this pattern (import `hasAoE` from `helpers.js` where it is not already imported).

## Acceptance Criteria

1. In the dice engine (admin roll builder): a spec chip shows "+2" only if that spec name matches the AoE qualifier; all other chips show "+1"
2. When a spec is selected in the dice engine, the pool calculation adds +2 if that spec matches the AoE qualifier, +1 otherwise
3. In the downtime form skill-acquisition section: spec chips show "+2" only for the AoE-qualified spec
4. In the downtime form feeding sections (standard, custom): spec chips and pool totals apply +2 only for the AoE-qualified spec
5. In the player feeding tab: pool total adds +2 only when the selected spec matches the AoE qualifier
6. In the suite roll calculator (index.html): spec chips show "+2" for the AoE-qualified spec, "+1" for all others; nine-again note still shows where applicable
7. No regressions: characters without AoE still get +1 on all specs; characters with AoE get +2 on the one matching spec and +1 on all others

## Tasks / Subtasks

- [ ] Task 0: Gorgon bloodline auto-grants (AC: 7)
  - [ ] Add `BLOODLINE_GRANTS` export to `public/js/data/constants.js` after `BLOODLINE_CLANS`:
    ```js
    export const BLOODLINE_GRANTS = {
      Gorgons: {
        skill_specs: [{ skill: 'Animal Ken', spec: 'Snakes' }],
        merits: [
          { name: 'Area of Expertise', category: 'general', qualifier: 'Snakes' },
          { name: 'Interdisciplinary Specialty', category: 'general', qualifier: 'Snakes' },
        ],
      },
    };
    ```
  - [ ] Import `BLOODLINE_GRANTS` in `public/js/editor/mci.js` (add to the existing `import ... from '../data/constants.js'` — there is none yet; add a new import line)
  - [ ] In `applyDerivedMerits()`, just before the `ensureMeritSync(c)` call at the end, add a bloodline grants block:
    - Check `BLOODLINE_GRANTS[c.bloodline]`
    - For each `skill_specs` entry: if `c.skills[skill]` exists and the spec is not already in `c.skills[skill].specs`, push it
    - For each `merits` entry: if no merit with matching `name`, `qualifier`, and `granted_by === 'Bloodline'` exists, push `{ name, category, qualifier, free: 1, granted_by: 'Bloodline' }` into `c.merits`
  - [ ] Add `free_bloodline` handling: the `ensureMeritSync` rating sum at line ~360 uses named free fields; since we set `free: 1` on the merit directly, it is already included — verify rating is computed as 1

- [ ] Task 1: Fix `dice-engine.js` (AC: 1, 2)
  - [ ] In `getSpecBonus()` (~line 81): replace the broad `hasAoE` check with a qualifier-matched check against `selSpec`. Use the same pattern as `helpers.js:hasAoE()` inline (dice-engine.js does not import from helpers):
    ```js
    function getSpecBonus() {
      if (!selSpec || !selectedChar) return 0;
      const aoe = (selectedChar.merits || []).some(m =>
        m.name === 'Area of Expertise' && m.qualifier &&
        m.qualifier.toLowerCase() === selSpec.toLowerCase()
      );
      return aoe ? 2 : 1;
    }
    ```
  - [ ] In the spec chip render (~line 263): move the bonus label computation inside the `specs.map()` call so each chip independently checks whether its own spec matches the AoE qualifier, rather than calling `getSpecBonus()` which reads `selSpec` (the currently *selected* spec, not the chip's spec). Pattern:
    ```js
    const chipBonus = (selectedChar.merits || []).some(m =>
      m.name === 'Area of Expertise' && m.qualifier &&
      m.qualifier.toLowerCase() === sp.toLowerCase()
    ) ? 2 : 1;
    ```

- [ ] Task 2: Fix `downtime-form.js` — skill acquisition spec chips (~line 2428) (AC: 3)
  - [ ] The `hasAoE` at line ~2428 is used both for `specBonus` (line ~2434) and for chip labels (line ~2453). Both need per-spec qualifier matching.
  - [ ] Replace the single `hasAoE` boolean with a per-spec lookup. Import `hasAoE` from `helpers.js` if not already (check existing imports). Pattern for specBonus:
    ```js
    specBonus = hasAoE(c, selectedSpec) ? 2 : 1;
    ```
    Pattern for chip label:
    ```js
    `+${hasAoE(c, sp) ? 2 : 1}`
    ```

- [ ] Task 3: Fix `downtime-form.js` — feeding spec sections (~lines 3165, 3194, 3222, 3259) (AC: 4)
  - [ ] Standard feeding section (~line 3165): replace broad `hasAoE` check with qualifier-matched check against `feedSpecName`
  - [ ] Standard feeding spec chips (~line 3194): replace `hasAoE ? 2 : 1` with per-chip `hasAoE(c, sp) ? 2 : 1`
  - [ ] Custom feeding section (~line 3222): same fix for `hasAoECustom` and its spec chips (~line 3259)
  - [ ] Import `hasAoE` from `../data/helpers.js` in `downtime-form.js` if not already present (check line 1 imports)

- [ ] Task 4: Fix `feeding-tab.js` (~line 288) (AC: 5)
  - [ ] Replace `const hasAoE = ...some(m => m.name?.toLowerCase() === 'area of expertise')` with qualifier-matched check against the local `specName` variable
  - [ ] Pattern: `const specBonus = specName && bestSpecs.includes(specName) ? (hasAoE(c, specName) ? 2 : 1) : 0;`
  - [ ] Import `hasAoE` from `../data/helpers.js` if not already present

- [ ] Task 5: Fix `suite/roll.js` (~line 111) (AC: 6)
  - [ ] Import `hasAoE` from `../data/helpers.js` (check existing imports in roll.js)
  - [ ] In the spec chip render loop, replace the static `+1` / `+2 (9-again)` with a per-spec AoE check:
    ```js
    const aoe = hasAoE(rc, s);
    const bonusStr = na ? '2 (9-again)' : aoe ? '2 (AoE)' : '1';
    ```
  - [ ] If nine-again and AoE both apply to the same spec, show the nine-again label (it subsumes the +1→+2 upgrade)

## Dev Notes

### Architecture
- No test framework. Verify in-browser manually per task.
- British English in any new strings ("Specialisation" not "Specialization").
- `hasAoE(c, specName)` in `public/js/data/helpers.js` is the canonical implementation -- use it everywhere rather than inlining the full `merits.some(...)` check in each file. Only `dice-engine.js` is a standalone file that does not import from `helpers.js`, so inline the pattern there.

### Checking imports
Before adding an import, grep for existing `import ... from '../data/helpers.js'` in each file:
- `downtime-form.js` -- check top of file; `hasAoE` may already be imported since `formatSpecs` is imported from helpers
- `feeding-tab.js` -- check top of file
- `suite/roll.js` -- check top of file; may need adding

### Manual verification
- Open a character with AoE (Firearms) in the dice engine, add a Firearms spec and a Brawl spec; confirm Firearms chip shows +2, Brawl shows +1
- Select the Firearms spec; confirm pool total increments by 2
- Select the Brawl spec; confirm pool total increments by 1
- Open that character's downtime form; check skill acquisition spec chips show correct labels
- Check feeding spec chips in the feeding section

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
