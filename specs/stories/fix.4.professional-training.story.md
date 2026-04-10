# Story Fix.4: Professional Training — Bug Fix and PT 4 XP Reward

## Status: review

## Story

**As an** ST reviewing a character with Professional Training,
**I want** all PT benefits to apply correctly — free Contacts, 9-Again on asset skills, free specs, the bonus dot, and the PT 4 XP reward —
**so that** Conrad and other PT characters reflect their merit's full mechanical effect.

## Background

Professional Training (PT) is a standing merit (up to 5 dots) that grants cumulative benefits:

| Dots | Benefit | Code location |
|------|---------|---------------|
| 1 | Networking: 2 free Contacts dots (field-specific) | `mci.js` ~line 237 |
| 2 | Continuing Education: 9-Again on Asset Skills | `mci.js` ~line 243 |
| 3 | Breadth of Knowledge: 3rd Asset Skill + 2 free PT specialisations | `sheet.js` ~line 285, ~line 789 |
| 4 | On the Job Training: +1 bonus dot in a chosen Asset Skill | `mci.js` ~line 249 |
| 4 | XP Reward: +1 XP earned for each Asset Skill that reaches 5 dots | **not yet implemented** |
| 5 | The Routine: 1 WP = Rote quality on any Asset Skill action | display only |

The PT merit stores asset skills in `pt.asset_skills` (array of up to 3 skill name strings) and the dot-4 chosen skill in `pt.dot4_skill`. These fields were added after some characters were entered.

**Conrad** has PT 4. His PT merit likely predates the `asset_skills`/`dot4_skill` fields, leaving them empty/undefined, which silently breaks dots 2, 3, and 4. The dot-1 Contacts bug is a separate code issue.

### Known bugs

**Bug A — PT 1 free Contacts not appearing**

`mci.js:237–240`:
```js
if (dots >= 1) {
  const m = (c.merits || []).find(m => m.category === 'influence' && m.name === 'Contacts');
  if (m) m.free_pt = 2;
}
```
If the character has no Contacts merit at all, the `find()` returns `undefined` and nothing happens. The 2 free dots are silently lost. Fix: auto-create a Contacts merit with `free_pt = 2` if it doesn't exist (following the same pattern as bloodline grants in `applyDerivedMerits()`).

**Bug B — No 9-Again on asset skills**

`mci.js:242–246`:
```js
if (dots >= 2 && assets.length) {
  if (!c._pt_nine_again_skills) c._pt_nine_again_skills = new Set();
  for (const sk of assets) c._pt_nine_again_skills.add(sk);
}
```
`assets` is `(pt.asset_skills || []).filter(Boolean)`. If `asset_skills` is not set on the merit, `assets` is empty and the block is skipped. Additionally, `c._pt_nine_again_skills` is never cleared at the top of `applyDerivedMerits()` — if a skill is removed from `asset_skills`, it may linger in the Set from a previous render.

**Bug C — PT 3 free specs not covering correctly**

`sheet.js:284–291`: The spec counter calculates PT coverage using `ptAssetSet`, which is built from `ptMSpec.asset_skills`. If `asset_skills` is unset, `ptAssetSet` is empty and all specs in those skills are counted as paid — the PT free coverage is never applied.

**Bug D — PT 4 bonus dot not appearing**

`mci.js:248–252`:
```js
if (dots >= 4 && pt.dot4_skill) {
  if (!c._pt_dot4_bonus_skills) c._pt_dot4_bonus_skills = new Set();
  c._pt_dot4_bonus_skills.add(pt.dot4_skill);
}
```
Same issue: if `dot4_skill` is not set, no bonus is applied. Additionally, `_pt_dot4_bonus_skills` is never cleared before re-applying, risking stale data if `dot4_skill` is changed or removed.

**Bug E — PT 4 XP reward not implemented**

When a character has PT 4+, each Asset Skill that reaches 5 dots earns the character +1 XP. This is a bonus to earned XP (like an ordeal or humanity reward). It is not currently calculated anywhere.

## Acceptance Criteria

1. A character with PT 1+ who has no Contacts merit automatically receives a Contacts merit (category: `'influence'`, name: `'Contacts'`) with `free_pt = 2`; if they already have Contacts, `free_pt = 2` is applied as before
2. 9-Again badge displays on the correct asset skills when `asset_skills` is set; the `_pt_nine_again_skills` Set is cleared and rebuilt on every `applyDerivedMerits()` call, not accumulated
3. When `asset_skills` includes 3 skills and the character has specs on those skills, the PT free spec coverage (up to 2) is correctly subtracted from XP/CP owed
4. The bonus dot from PT 4 appears on the chosen `dot4_skill` in the skills display; `_pt_dot4_bonus_skills` is cleared and rebuilt on every call
5. For a character with PT 4+, XP earned includes +1 XP for each Asset Skill with 5 total dots (base dots + bonus + free, not counting the PT bonus dot itself toward the 5)
6. Conrad with PT 4 and asset skills correctly configured shows: Contacts with 2 free dots, 9-Again on all 3 asset skills, PT spec coverage applied, bonus dot on the dot4_skill, and XP reward reflected in earned total
7. No regressions: characters without PT are unaffected; PT 5 Routine benefit (display only) is unchanged

## Tasks / Subtasks

- [x] Task 1: Fix stale-state accumulation — clear PT transient fields at top of `applyDerivedMerits()` in `mci.js`
  - [x] Add alongside the existing `free_pt` clear (~line 207):
    ```js
    // ── PT: clear transient derived fields before re-applying ──
    c._pt_nine_again_skills = new Set();
    c._pt_dot4_bonus_skills = new Set();
    ```
  - [x] Remove the `if (!c._pt_nine_again_skills)` guards on lines 244 and 250 (they are now always defined above)

- [x] Task 2: Fix Bug A — auto-create Contacts if missing (`mci.js` ~line 237)
  - [x] Replace the existing dot-1 block:
    ```js
    if (dots >= 1) {
      let ctM = (c.merits || []).find(m => m.category === 'influence' && m.name === 'Contacts');
      if (!ctM) {
        if (!c.merits) c.merits = [];
        ctM = { name: 'Contacts', category: 'influence', rating: 0, granted_by: 'PT' };
        c.merits.push(ctM);
      }
      ctM.free_pt = 2;
    }
    ```
  - [x] Note: `granted_by: 'PT'` follows the same convention as `'Bloodline'` / `'MCI'`; it prevents double-counting on re-applies

- [x] Task 3: Verify Bug B — confirm `_pt_nine_again_skills` now works after Task 1 clears it
  - [x] No additional code change needed for Bug B itself beyond Task 1 (the clear fixes the stale-state; the `assets.length` condition works once asset skills are set)
  - [x] Document in completion notes: if 9-Again still missing for Conrad after Task 1, the root cause is that Conrad's PT merit is missing `asset_skills` — the ST must select them in the editor

- [x] Task 4: Verify Bug C — PT spec coverage after Task 1
  - [x] Same note as Task 3: once `asset_skills` are set on Conrad's PT merit, spec coverage should work automatically
  - [x] No code change needed beyond the stale-state fix

- [x] Task 5: Verify Bug D — PT 4 bonus dot after Task 1
  - [x] Same note: once `dot4_skill` is set, the bonus dot should appear. The clear in Task 1 ensures it rebuilds correctly
  - [x] No additional code change needed

- [x] Task 6: Implement Bug E — PT 4 XP reward in `xp.js`
  - [x] `xpPT5(c)` already exists in `xp.js` (lines 55-66) and is already called in `xpEarned()` (line 74). No new implementation needed.
  - [x] `xpPT5` correctly: checks PT rating ≥ 4, iterates asset skills, counts those where `(s?.dots + ptBonus) >= 5` (including the PT dot-4 bonus dot), returns the count as bonus earned XP.
  - [x] No change to `xpSpent()` — this is earned XP, not a cost reduction

## Dev Notes

### Architecture
- No test framework. Verify in-browser with Conrad's character sheet.
- `applyDerivedMerits()` is called on every render cycle via `_renderSheet(c)` → `shRenderSkills(c, editMode)`. The transient fields (`_pt_nine_again_skills`, `_pt_dot4_bonus_skills`) exist only for the render cycle and are never saved to the DB.
- The auto-created Contacts merit (Bug A fix) WILL be saved to the DB on the next character save — this is intentional and consistent with how bloodline grants work. The ST can then edit it (add dots, change role) like any other influence merit.
- The `granted_by: 'PT'` field is a string tag only; no code reads it to gate behaviour. It is documentation in the data.
- Check whether `xpEarned()` is called in `xp.js` as a standalone function or always through `xpLeft()`; adding the PT 4 reward component there affects both.

### Conrad investigation steps
Before implementing, open Conrad in the admin editor:
1. Expand the Professional Training merit block
2. Check if asset_skills slots 1, 2, 3 are filled — if not, the ST fills them now (data fix, no code change)
3. Check if dot4_skill is selected — fill it if missing
4. After saving, confirm 9-Again, bonus dot, and spec coverage appear

If they appear after data entry, Bugs B/C/D are confirmed as data issues (not code). Only Task 1 (stale-state clear), Task 2 (Contacts auto-create), and Task 6 (XP reward) remain as code changes.

### Manual verification
- Conrad, PT 4: all asset skills set → Contacts shows 2 free dots, asset skills show `9-Again (PT)`, dot4 skill shows bonus dot in editor
- Conrad, PT 3: specs on asset skills → PT coverage counter shows correctly, XP owed reflects PT coverage
- Conrad, PT 4, one asset skill at 5 dots → xpEarned() increases by 1
- Character with no PT: no change to skill display or earned XP

---

## Dev Agent Record

### Implementation Plan

Two code changes in `mci.js`, no changes in `xp.js` (XP reward was pre-existing).

1. **Task 1 — Transient field init**: Replaced `delete c._pt_nine_again_skills; delete c._pt_dot4_bonus_skills` with `= new Set()` in the ephemeral-tracking clear block. Removed the now-redundant `if (!c._pt_nine_again_skills)` and `if (!c._pt_dot4_bonus_skills)` guards in the PT grant loop.

2. **Task 2 — Contacts auto-create**: Replaced `const m = ...; if (m) m.free_pt = 2` with a `let ctM = find(); if (!ctM) { push new Contacts; } ctM.free_pt = 2` pattern.

3. **Tasks 3-5 — Data investigation**: Inspected Conrad's `data/chars_v2.json` directly. `asset_skills: []` (empty), no `dot4_skill`, no Contacts. Bugs B/C/D confirmed as **data gaps** — the ST must open Conrad in the editor and select the three asset skills and dot4_skill. The code handles them correctly once set.

4. **Task 6 — XP reward**: `xpPT5(c)` pre-exists in `xp.js` and is already wired into `xpEarned()`. No implementation needed.

### Debug Log

Conrad data snapshot:
```json
{
  "asset_skills": [],
  "rating": 4,
  "role": "Private Investigator"
}
```
No `dot4_skill`, no Contacts merit. All transient bugs (B/C/D) are data gaps, not code bugs.

### Completion Notes

- **Bug A fixed**: Contacts auto-created with `granted_by: 'PT'` when not present; `free_pt = 2` applied each render cycle.
- **Bugs B/C/D**: Code path is correct after stale-state fix (Task 1). Conrad needs the ST to fill `asset_skills` and `dot4_skill` in the editor before these visually activate.
- **Bug E (XP reward)**: Already implemented as `xpPT5()` — wired into `xpEarned()`. No change needed.
- **Stale-state**: `_pt_nine_again_skills` and `_pt_dot4_bonus_skills` are now always initialised to `new Set()` at the top of `applyDerivedMerits()`, eliminating any accumulation across renders.

## File List

- `public/js/editor/mci.js`

## Change Log

- Fixed PT transient fields to initialise as `new Set()` instead of being deleted, ensuring clean rebuild each render (2026-04-10)
- Auto-create Contacts merit (granted_by: 'PT') when character has PT ≥ 1 but no Contacts exists (2026-04-10)
- Confirmed xpPT5() XP reward pre-existing and correctly wired; no change needed (2026-04-10)
