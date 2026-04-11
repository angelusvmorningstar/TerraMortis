# Story fix.29: Suite Dice Roller — Apply Derived Character Data

## Status: done

## Story

**As a** player using the suite dice roller,
**I want** my dice pools to include all merit-derived bonuses, PT/MCI bonus skill dots, and 9-Again effects,
**so that** my rolls match the values shown on the editor sheet without manual adjustment.

## Background

The suite game app dice roller (`public/js/game/char-pools.js` + `public/js/shared/pools.js`) builds dice pools from raw `c.skills[x].dots` and `c.attributes[x].dots` without running `applyDerivedMerits(c)` or consulting the merit/grant system. The editor sheet already computes all of these via `applyDerivedMerits(c)` in `editor/mci.js`, which sets ephemeral fields (`_pt_dot4_bonus_skills`, `_mci_dot3_skills`, `_pt_nine_again_skills`, `_ohm_nine_again_skills`). The suite roller needs to tap into the same derived data.

### What's missing

1. **PT dot-4 bonus skill dots** — stored in `c._pt_dot4_bonus_skills` (a Set) after `applyDerivedMerits` runs. `char-pools.js:78` uses `skDots + skBonus` which doesn't include this.
2. **9-Again from PT/MCI/OHM asset skills** — stored in `c._pt_nine_again_skills`, `c._mci_dot3_skills`, `c._ohm_nine_again_skills`. Not surfaced to the roller at all.
3. **Merit-derived dice bonuses** — Air of Menace (+Nightmare to Intimidation), Area of Expertise (+2 when matching spec selected), Cacophony Savvy, Indomitable, Closed Book.
4. **Discipline-derived passive bonuses** — Auspex dots to surprise resistance, Celerity to Defence (already handled by `getAttrEffective` via `discAttrBonus` — verify only).

### Current state

- `applyDerivedMerits(c)` is **not called** anywhere in the suite/game app
- `shared/pools.js:40-41` already checks `_pt_dot4_bonus_skills` and `_mci_dot3_skills` for discipline power pools — but those fields are empty because `applyDerivedMerits` never ran
- `char-pools.js:78` uses `skDots(char, sk) + skBonus(char, sk)` — misses PT/MCI bonus
- `char-pools.js` does not pass 9-Again information to the roller at all

## Acceptance Criteria

1. `applyDerivedMerits(c)` runs on every character after loading in the suite app (or at `pickChar` time), populating all ephemeral `_pt_*`, `_mci_*`, `_ohm_*` fields
2. Skill dots in the pool builder include PT dot-4 and MCI dot-3 bonus dots (use the ephemeral fields, capped at 5)
3. When a skill with 9-Again (from PT asset skills, MCI dot-3 skill, OHM asset skills, or the skill's own `nine_again` flag) is selected, the pool object includes a `nineAgain: true` flag and the roller applies it
4. The pool button UI shows a visual indicator (e.g. small "9" badge or gold border) for skills with 9-Again
5. Area of Expertise: when a specialisation is selected that matches an AoE qualifier, +2 bonus is added to the pool total and labelled in the breakdown
6. Attribute bonus dots (from `getAttrBonus`) are already included via `getAttrEffective` in `char-pools.js:81` — verify this works correctly and document
7. A "merit bonuses" section or toggle in the pool builder lists applicable conditional merits for the current skill/attribute combination. Start with:
   - Air of Menace: +Nightmare dots to Intimidation pools
   - Indomitable: +2 to Resolve-based contested rolls
   - Closed Book: bonus vs Auspex-based reads
8. The pool expression string (shown in the banner as "Pre + Itm") reflects all included bonuses with labels

## Tasks / Subtasks

- [ ] Task 1: Run applyDerivedMerits on character load (AC: 1)
  - [ ] In `public/js/app.js` `pickChar()` function (~line 130+): after character is loaded, call `applyDerivedMerits(c)`
  - [ ] Import `applyDerivedMerits` from `../editor/mci.js`
  - [ ] Verify: after this change, `c._pt_dot4_bonus_skills`, `c._mci_dot3_skills`, `c._pt_nine_again_skills`, `c._ohm_nine_again_skills` are populated as Sets on the character object
  - [ ] Note: `applyDerivedMerits` may have side-effects (it writes `free_mci` on merits). Ensure this is safe in read-only context — or create a lightweight `computeDerivedBonuses(c)` that only computes the ephemeral fields without writing grants

- [ ] Task 2: Update char-pools.js skill pool calculation (AC: 2)
  - [ ] Line 78: change from `skDots(char, sk) + skBonus(char, sk)` to include PT/MCI bonus:
    ```js
    const baseDots = skDots(char, sk);
    const ptBonus = (char._pt_dot4_bonus_skills?.has(sk) && baseDots < 5) ? 1 : 0;
    const mciBonus = (char._mci_dot3_skills?.has(sk) && baseDots < 5) ? 1 : 0;
    const skD = Math.min(baseDots + skBonus(char, sk) + ptBonus + mciBonus, 5);
    ```
  - [ ] Same pattern already exists in `shared/pools.js:40-42` — keep consistent

- [ ] Task 3: Add 9-Again to pool objects (AC: 3, 4)
  - [ ] In `char-pools.js`, when building each skill pool, check:
    - `skNineAgain(char, sk)` (stored on skill object)
    - `char._pt_nine_again_skills?.has(sk)`
    - `char._mci_dot3_skills?.has(sk)` (MCI dot-3 grants 9-Again to its skill)
    - `char._ohm_nine_again_skills?.has(sk)`
  - [ ] If any is true, add `nineAgain: true` to the pool object pushed to `_pools`
  - [ ] Update `poolBtn()` to show a visual 9-Again indicator (e.g. `<span class="gcp-9a">9</span>` badge)
  - [ ] Ensure `loadPool()` in `roll.js` reads the `nineAgain` flag and enables it on the roll (existing roll engine already supports 9-Again via `state.NINE_AGAIN`)

- [ ] Task 4: Area of Expertise +2 bonus (AC: 5)
  - [ ] In the pool builder flow (when a spec is tapped/selected), check if `hasAoE(char)` is true (already imported in `roll.js`)
  - [ ] If the selected spec matches the character's AoE qualifier, add +2 to pool total
  - [ ] `hasAoE(char)` returns the qualifier string or false — match against the selected specialisation text
  - [ ] Show in pool breakdown as "AoE +2"
  - [ ] Note: the current spec selection flow in `roll.js:114` already checks `na` and `aoe` — extend this path

- [ ] Task 5: Conditional merit bonuses (AC: 7, 8)
  - [ ] Create a helper `getMeritPoolBonuses(char, skill, attr)` in `char-pools.js` or a new utility:
    - **Air of Menace**: if character has the merit AND skill is "Intimidation", bonus = Nightmare discipline dots
    - **Indomitable**: if skill involves contested Resolve roll (Resolve is the attr), bonus = Indomitable rating
    - **Closed Book**: if being contested by Auspex, bonus = Closed Book rating (may need a toggle since it's situational)
  - [ ] Each bonus returns `{ name, value, conditional }` — conditional bonuses show as toggleable, always-on bonuses auto-include
  - [ ] Render conditional bonuses as toggle chips below the pool button (or in a dropdown on tap-hold)
  - [ ] Update the pool banner text to include active merit bonuses (e.g. "Pre + Itm + AoM(3)")

- [ ] Task 6: Verify attribute bonuses (AC: 6)
  - [ ] Confirm `getAttrEffective(char, attr)` in `char-pools.js:81` already returns `dots + bonus + discAttrBonus`
  - [ ] Verify `discAttrBonus` handles Vigour (Strength), Resilience (Stamina), etc.
  - [ ] No code change expected — just verification. Add a comment if confirmed working.

## Dev Notes

### applyDerivedMerits side-effects

`applyDerivedMerits(c)` in `editor/mci.js` does two things:
1. Computes ephemeral bonus fields (`_pt_*`, `_mci_*`, `_ohm_*`) — **needed**
2. Writes `free_mci`, `free_pt`, `free_vm`, etc. on merit objects — **only needed for editor**

If the side-effects are problematic in the suite (read-only context), extract a lightweight `computeDerivedBonuses(c)` that only does step 1. Alternatively, since the suite loads characters from the API (already saved state), the grant pool writes are idempotent and harmless — they'd just recompute what's already there.

### Pool object shape (extended)

```js
{
  total: 8,
  label: 'Intimidation',
  attr: 'Presence', attrV: 4,
  skill: 'Intimidation', skillV: 4,
  nineAgain: true,          // NEW
  meritBonuses: [           // NEW
    { name: 'Air of Menace', value: 3, conditional: false }
  ],
  resistance: null, pi: null
}
```

### 9-Again in the roll engine

`roll.js` already has `state.NINE_AGAIN` (boolean). When a pool is loaded with `nineAgain: true`, set `state.NINE_AGAIN = true`. The `rollPool()` function in `shared/dice.js` already consumes this flag.

### Key files

- `public/js/app.js` — character load, pickChar() (~line 130)
- `public/js/game/char-pools.js` — pool builder, skill/disc buttons
- `public/js/shared/pools.js` — discipline power pool resolution (already has PT/MCI logic)
- `public/js/suite/roll.js` — roll UI, spec selection, dice engine wiring
- `public/js/editor/mci.js` — `applyDerivedMerits(c)` source
- `public/js/data/accessors.js` — `skDots`, `skBonus`, `getAttrEffective`, `skNineAgain`

### Not in scope

- Discipline power activation costs (Vitae spend)
- Contested roll automation
- Rewriting the dice math engine
- Full merit catalogue (only Air of Menace, Indomitable, Closed Book for now)

### Testing

- Load a character with PT dot-4 (e.g. has Professional Training ●●●●) — verify the asset skill pool is 1 higher than raw dots
- Load a character with MCI dot-3 skill — verify +1 dot in pool
- Load a character with PT asset skills — verify 9-Again badge appears on those skill buttons
- Verify Area of Expertise +2 when matching spec is selected
- Verify Air of Menace adds Nightmare dots to Intimidation pool
- Verify pool banner text includes bonus labels
- Verify discipline power pools still work (regression — shared/pools.js already had the logic)
- Verify a character with NO bonuses shows identical pools to before

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Bob (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
