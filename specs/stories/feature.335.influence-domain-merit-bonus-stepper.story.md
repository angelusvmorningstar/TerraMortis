# Story Feature.335: Bonus Dot Stepper — Influence and Domain Merits

## Status: review

## Metadata
- issue: 335
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/335
- branch: ms/issue-335-bonus-stepper-influence-domain

---

## Story

**As an** ST editing a character's influence or domain merits,
**I want** the Bonus ▼/▲ stepper to visually update the hollow-dot display on those merit rows,
**so that** bonus dots granted via the stepper are reflected on the sheet in the same way they are for general merits.

---

## Background

### What #333 delivered

Issue #333 added the manual bonus dot stepper across the sheet editor:

1. **`meritBdRow` (xp.js)** — the Bonus ▼/▲ row was added **unconditionally** to the shared breakdown row function. Because `meritBdRow` is called inside `editMode` for ALL merit categories (general, influence, domain, standing), the stepper buttons themselves appear on every merit category after merging #333.
2. **`shAdjMeritBonus` (edit.js)** — handler that writes `m.bonus`, clamps to ≥ 0, calls `_markDirty` + `_renderSheet`. Wired to `window` in both `admin.js` and `app.js`.
3. **`merit.bonus` schema whitelist (character.schema.js)** — added to `additionalProperties` so PUT saves don't fail validation.
4. **General merit dot display (sheet.js `shRenderGeneralMerits`)** — the dot formula in both edit mode and view mode was updated to include `m.bonus` in the hollow-dot count.

### What #333 did NOT do

The dot display formulas in `shRenderInfluenceMerits` and `shRenderDomainMerits` were **not** updated to include `m.bonus`. Clicking the stepper on an influence or domain merit saves the value to the character object and re-renders, but the rendering formula doesn't read `m.bonus`, so the hollow-dot count in the name row never changes.

The result: the Bonus ▼/▲ row correctly shows "+1 / +2 / etc." in the breakdown panel, but the ●●○ dot string in the merit's header row does not update.

### Key functions NOT to touch

- `meritFreeSum(m)` — sums all `free_*` channels; does not and should not include `m.bonus` (bonus is a display override, not an earned-dot channel)
- `syncMeritRating(m)` — writes `m.rating = cp + xp + meritFreeSum(m)`; must not include `m.bonus`
- `meritEffectiveRating(c, m)` — used for pool calculations and prerequisite checks; must not include `m.bonus`
- `shAdjMeritBonus` — already correct; no changes needed
- `meritBdRow` — already correct; no changes needed
- `admin.js` / `app.js` wiring — already correct; no changes needed

---

## Branch Sync (Do First)

Before making any code changes, merge dev into the working branch. Our branch was cut from `Morningstar` which is behind origin/dev by the full #333 implementation:

```sh
git fetch origin
git merge origin/dev
```

Resolve any conflicts (unlikely — no overlapping edits). After the merge, `meritBdRow` in `xp.js` will include the Bonus row and `shAdjMeritBonus` will be live. The remaining work is the dot display fix only.

---

## Acceptance Criteria

- [x] Influence merit rows: clicking Bonus ▲ in the breakdown panel increases the hollow-dot count in the merit name row immediately (no save/reload required).
- [x] Influence merit rows: view mode (non-edit) also shows bonus dots as hollow circles after the filled inherent dots.
- [x] Domain merit rows: same as above — edit mode dot count updates immediately, view mode renders hollow bonus dots.
- [x] Bonus dots are additive with existing `free_*` derived hollow dots — no regression on rule-granted hollows.
- [x] XP totals are unchanged (verify xpSpent on the XP tab after setting a bonus).
- [x] Pool calculations and influence totals are unchanged.
- [x] Bonus persists across save and reload.

---

## Tasks

All changes are in **`public/js/editor/sheet.js`** only.

---

### Task 1 — Influence merits: edit-mode dot display

**Function:** `shRenderInfluenceMerits`, inside the `if (editMode)` block, inside `nonContacts.forEach`.

**Locate this line** (the long `const` that defines `dd` for non-Contacts influence merits):
```js
const idx = inflM.indexOf(m), inf = calcMeritInfluence(...), tOpts = buildSubCategoryMeritOptions(...), rIdx = c.merits.indexOf(m), dd = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m) + attacheBonusDots(c, m.area ? m.name + ' (' + m.area + ')' : m.name);
const _iPurch = (m.cp || 0) + (m.xp || 0);
```

**Locate the dot display span** immediately downstream (inside the `infl-edit-row` div):
```js
'<span class="infl-dots-derived">' + '●'.repeat(_iPurch) + '○'.repeat(Math.max(0, dd - _iPurch)) + '</span>'
```

**Change** the hollow-dot count to include `m.bonus`:
```js
'<span class="infl-dots-derived">' + '●'.repeat(_iPurch) + '○'.repeat(Math.max(0, dd + (m.bonus || 0) - _iPurch)) + '</span>'
```

---

### Task 2 — Influence merits: view-mode dot display

**Function:** `shRenderInfluenceMerits`, inside the `else` block (non-edit view).

**Locate this line** inside the `.forEach` for non-Contacts merits:
```js
const iPurch = (m.cp || 0) + (m.xp || 0), iBon = meritFreeSum(m) + attacheBonusDots(c, displayArea ? m.name + ' (' + displayArea + ')' : m.name);
```

**Change** `iBon` to include `m.bonus`:
```js
const iPurch = (m.cp || 0) + (m.xp || 0), iBon = meritFreeSum(m) + attacheBonusDots(c, displayArea ? m.name + ' (' + displayArea + ')' : m.name) + (m.bonus || 0);
```

---

### Task 3 — Domain merits: edit-mode dot display

**Function:** `shRenderDomainMerits`, inside the `if (editMode)` block, inside `domM.forEach`.

**Locate this line** (the long `const` that defines `dd`):
```js
const rIdx = c.merits.indexOf(m), dd = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m) + attacheBonusDots(c, m.area ? m.name + ' (' + m.area + ')' : m.name), parts = ...
```

**Locate the "My dots" dot display** in the `infl-edit-row` div:
```js
'<span class="dom-contrib-lbl">My dots: ' + '●'.repeat(_dPurch) + '○'.repeat(Math.max(0, dd - _dPurch)) + '</span>'
```

**Change** the hollow-dot count to include `m.bonus`:
```js
'<span class="dom-contrib-lbl">My dots: ' + '●'.repeat(_dPurch) + '○'.repeat(Math.max(0, dd + (m.bonus || 0) - _dPurch)) + '</span>'
```

---

### Task 4 — Domain merits: view-mode dot display

**Function:** `shRenderDomainMerits`, inside the `else` block (non-edit view), inside `domM.forEach`.

The view-mode path has three display branches — capped merits (Haven/MG), merits with existing bonuses (SSJ/Flock/FWB/Attaché), and plain merits. Update all three to include `m.bonus`.

**Step 4a** — Declare `mBon` at the top of the `domM.forEach` callback (before `_dRaw` and `_viewStored`):
```js
const mBon = m.bonus || 0;
```

**Step 4b** — Update `_dRaw` to include `mBon`:
```js
const _dRaw = (m.cp || 0) + ... + (m.xp || 0) + mBon;
```
(Add `+ mBon` at the end of the existing `_dRaw` declaration.)

**Step 4c** — Update `_viewStored` to include `mBon`:
```js
const _viewStored = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m) + mBon;
```

**Step 4d** — Add `mBon > 0` to the condition guarding `shDotsMixed`:
```js
} else if (ssjB > 0 || flockB > 0 || fwbB > 0 || attB > 0 || mBon > 0) {
```

This ensures that a plain domain merit with only a manual bonus (no SSJ/Flock/etc.) still renders the mixed dot display rather than falling through to the all-solid `shDots(de)` path. Because `_dRaw` now includes `mBon`, the formula `shDotsMixed(dPurch, Math.max(0, de - dPurch))` where `dPurch = _dRaw` naturally shows `mBon` as hollow dots (since `de = meritEffectiveRating` does not include `mBon`, the difference produces the right count).

---

## Dev Notes

### Why only `sheet.js`

The Bonus ▼/▲ stepper (in `meritBdRow`), the save handler (`shAdjMeritBonus`), the window wiring (`admin.js`, `app.js`), and the schema whitelist (`character.schema.js`) were all completed in #333. The only gap is that `shRenderInfluenceMerits` and `shRenderDomainMerits` don't read `m.bonus` when building their dot strings.

### Why `m.bonus` must NOT go into the helpers

`meritFreeSum`, `syncMeritRating`, and `meritEffectiveRating` are used by XP calculations, influence totals, pool formulas, and prereq checks. The manual bonus is a display-only ST override. Adding it to any of those helpers would silently inflate XP spent, influence totals, and pool sizes. Do not touch those functions.

### "My dots" vs "Total" in domain edit mode

Domain merits have two dot displays in edit mode: "My dots" (own contribution: `dd - _dPurch` hollow) and "Total" (`_totalDots` = solid own + hollow partners). Only "My dots" needs to include `m.bonus` — the "Total" display reflects the shared pool and should not double-count a per-character display override.

### Contacts merit (influence)

Contacts has its own separate render block (not in `nonContacts.forEach`). Its dot display shows `baseDots` filled + granted hollow. Check whether Contacts has its own dot-string line that also needs `m.bonus`. If it does, apply the same pattern: `Math.max(0, rating + (m.bonus || 0) - baseDots)`. If the existing code already uses a formula that would include it, leave it.

### Testing checklist (manual)

1. Open sheet editor for a character with at least one Influence merit (e.g., Allies) and one Domain merit (e.g., Safe Place).
2. Click Bonus ▲ on the Allies merit → breakdown panel shows "+1", dot row shows one extra ○ immediately.
3. Click ▲ again → "+2", two extra ○.
4. Click ▼ → back to "+1", one extra ○.
5. Save and reload: bonus persists.
6. Switch to view mode: Allies row shows filled ●● (purchased) + hollow ○ (bonus) side by side.
7. Repeat for a Domain merit (Safe Place, Herd, etc.).
8. Open the XP tab: `xpSpent` total is unchanged.
9. Check influence total in the Influence header: unchanged from before the bonus.
10. Open DT form: pool calculations unaffected.

---

## Dev Agent Record

### Implementation Notes

- Branch synced with `origin/dev` before any edits — `meritBdRow` (xp.js) and `shAdjMeritBonus` (edit.js) were already live from #333; no changes needed to those files.
- All 4 edits made exclusively in `public/js/editor/sheet.js`; parse check passed (`node --check`).
- Contacts merit (influence): reviewed separately per dev note. Contacts uses `baseDots` + granted hollow via `attacheBonusDots`; the stepper appears in the breakdown panel but no dot-string change was made to the Contacts header block — adding hollow dots without sphere pickers would misrepresent the rating. Left unchanged.
- Domain view mode: three branches updated. `mBon` declared at top of `domM.forEach`, added to both `_dRaw` and `_viewStored`, and `|| mBon > 0` guard added to the `shDotsMixed` condition so plain domain merits with only a manual bonus render hollow dots instead of all-solid.
- `meritFreeSum`, `syncMeritRating`, `meritEffectiveRating` — not touched. `m.bonus` remains display-only per story constraints.

### Completion Notes

All 4 tasks implemented and verified. E2E test file written covering AC1 (influence edit hollow dot increment), AC1b (two up, one down), AC3 (domain edit hollow dot increment), AC5 (influence total unchanged), AC6 (PUT payload includes bonus).

### QA Findings (addressed)

**Bug found during QA (AC4 failure):** Task 4b incorrectly added `mBon` to `_dRaw`, which is used as the filled-dot count in `shDotsMixed`. This caused `de - dPurch` to go negative (clamped to 0), so no hollow dots appeared in view mode for plain domain merits. Fixed by removing `mBon` from `_dRaw` and instead adding it to the hollow side: `shDotsMixed(dPurch, Math.max(0, de - dPurch) + mBon)`. `_viewStored` retains `mBon` as capped merits (Haven/MG) use a different formula. Added AC2 and AC4 view-mode tests which caught this regression.

## File List

- `public/js/editor/sheet.js` (Tasks 1–4)
- `tests/issue-335-influence-domain-merit-bonus-display.spec.js` (new — E2E tests for AC1/AC1b/AC3/AC5/AC6)

## Change Log

- fix(#335): include m.bonus in influence and domain merit dot display (2026-05-17)
- test(#335): E2E Playwright tests for influence/domain merit bonus dot display (2026-05-17)
- fix(#335): correct domain view-mode hollow-dot formula; mBon on hollow side not filled side (2026-05-17)
- test(#335): add AC2/AC4 view-mode tests that caught the formula regression (2026-05-17)
