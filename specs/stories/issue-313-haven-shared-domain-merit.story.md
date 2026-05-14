# Issue #313: Haven should be a shareable Domain merit like Safe Place

Status: review

issue: 313
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/313
branch: morningstar-issue-313-haven-shared-domain-merit

## Story

As an ST editing characters in the admin sheet editor,
I want Haven to show the shared partner UI (partner chips + "+ Add shared partner..." dropdown),
so that coterie members who co-own a Haven can be tracked the same way Safe Place co-ownership is tracked.

## Acceptance Criteria

1. Haven is removed from `_noShare` in `sheet.js:962`.
2. Partner chips and `+ Add shared partner...` dropdown render for Haven in the ST editor (identical to Safe Place / Mandragora Garden treatment).
3. Adding a partner to a Haven entry populates `shared_with` on both characters and saves correctly via the existing `shAddDomainPartner` flow.
4. Removing a partner from a shared Haven removes them from `shared_with` on both sides via the existing `shRemoveDomainPartner` flow.
5. The `attached_to` (Safe Place) relationship is preserved -- Haven can be both attached to a Safe Place and shared with partners.
6. Pool display "My dots / Total" correctly reflects partner contributions when Haven is shared (see Dev Notes for formula).
7. Export (`export-character.js`) and print (`print.js`) output correctly reflect shared Haven via the existing `is_shared` / `shared_with` pass-through.
8. The explanatory comment at `sheet.js:960-961` is updated to reflect the new behaviour.

## Tasks / Subtasks

- [x] Task 1 -- Remove Haven from `_noShare` (AC: 1, 2, 3, 4)
  - [x] In `public/js/editor/sheet.js:962`, change `['Herd', 'Feeding Grounds', 'Haven']` to `['Herd', 'Feeding Grounds']`
  - [x] Update the comment at lines 960-961 to remove the Haven exclusion rationale (see Dev Notes for replacement text)

- [x] Task 2 -- Fix Total display for shared Haven (AC: 6)
  - [x] In `sheet.js` near line 928, update `_capTotalDots` so that when `parts.length > 0` for a capped merit, the total reflects partner contributions up to the Safe Place cap (see Dev Notes for formula)

- [x] Task 3 -- Verify add/remove partner flows (AC: 3, 4, 5)
  - [x] Confirm `shAddDomainPartner` in `edit-domain.js:356-400` handles Haven without Haven-specific exclusions (it uses `m.name` and `m.qualifier` generically -- should work as-is)
  - [x] Confirm `shRemoveDomainPartner` in `edit-domain.js:401-440` handles Haven symmetrically
  - [x] Confirm `attached_to` field is preserved through add/remove partner operations

- [x] Task 4 -- Manual browser verification (AC: 1-8)
  - [x] Open admin sheet editor on a character with Haven attached to a Safe Place
  - [x] Verify `+ Add shared partner...` dropdown appears
  - [x] Add a second character as a partner; verify chips appear on both characters' Haven rows
  - [x] Verify Total dots update correctly to reflect partner contributions (capped at SP rating)
  - [x] Remove partner; verify chips disappear on both sides
  - [x] Verify Safe Place sharing is unaffected

## Dev Notes

### The One-Line Fix and Where It Lives

`public/js/editor/sheet.js:962`

```js
// BEFORE
const _noShare = ['Herd', 'Feeding Grounds', 'Haven'];

// AFTER
const _noShare = ['Herd', 'Feeding Grounds'];
```

Update the comment at lines 954-961. Replace:
```
// Haven still excluded — its shared treatment is via the Safe Place
// it attaches to, NOT a direct shared quality on the Haven itself.
```
With:
```
// Haven is now also shareable (issue #313) — direct partner sharing
// on the Haven instance, semantically identical to Mandragora Garden.
```

### Why the Add/Remove Partner Flows Need No Changes

`shAddDomainPartner` (edit-domain.js:356) and `shRemoveDomainPartner` (edit-domain.js:401) key by `(m.name, m.qualifier)`. Haven has no qualifier, so it matches generically. The partner mirroring loop is already name-agnostic. No Haven-specific exclusions exist in these functions.

### Total Display -- Pool Calculation for Shared Haven (AC: 6)

This is the trickier part. Understand the data flow before changing anything:

**Line 911 in sheet.js:**
```js
eT = domMeritTotal(c, m.name)
```
`domMeritTotal(c, 'Haven')` (domain.js:149-173):
- Sums own + partner dots, capped at 5.
- `own = domMeritContribSingle(c, m)` = cp + free + xp for this char's Haven.
- `partnerTotal` = sum of `domMeritShareable(p, 'Haven')` for each partner in `m.shared_with`.
- Returns `min(5, own + partnerTotal)`.

So `eT` already includes partner contributions for Haven when shared.

**Line 926-928 in sheet.js -- the cap display path:**
```js
const _capEff = _isCapped ? meritEffectiveRating(c, m) : null;
const _capStored = _isCapped ? ((m.cp || 0) + (m.xp || 0) + meritFreeSum(m)) : null;
const _capTotalDots = _isCapped ? shDotsMixed(Math.min(_capEff, _dPurch), Math.max(0, (_capStored || 0) - Math.min(_capEff, _dPurch))) : _totalDots;
```

`meritEffectiveRating(c, m)` for Haven (domain.js:247-250):
```js
if (CAP_DOMAIN.has(m.name)) {
  const stored = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
  return Math.min(stored, _havenCap(c, m));  // _havenCap = effective SP rating
}
```
This uses **only this char's own stored dots** -- does NOT add partner contributions. So `_capEff` underrepresents the true total when Haven is shared.

**Fix: when `parts.length > 0`, derive the SP cap directly from the attached Safe Place and use `min(eT, spCap)` as the effective total.**

The attached SP's effective rating is available via:
```js
const _spM = m.attached_to
  ? (c.merits || []).find(sp => sp.category === 'domain' && sp.name === 'Safe Place' && domKey(sp) === m.attached_to)
  : null;
const _spCap = _spM ? meritEffectiveRating(c, _spM) : 0;
```

Note: `meritEffectiveRating(c, _spM)` for a Safe Place (which is MULTI_INSTANCE_DOMAIN, not CAP_DOMAIN) returns `domMeritTotalSingle(c, _spM)` -- the SP instance's effective total including its own partners. This is identical to what `_havenCap(c, m)` computes internally (domain.js:86).

**Revised `_capTotalDots` formula:**
```js
const _capTotalDots = _isCapped
  ? (() => {
      if (parts.length > 0 && _spCap > 0) {
        const _sharedEff = Math.min(eT, _spCap);
        return shDotsMixed(Math.min(_sharedEff, _dPurch), Math.max(0, _sharedEff - Math.min(_sharedEff, _dPurch)));
      }
      return shDotsMixed(Math.min(_capEff, _dPurch), Math.max(0, (_capStored || 0) - Math.min(_capEff, _dPurch)));
    })()
  : _totalDots;
```

Or more concisely (inline IIFE avoided):
```js
const _capBase = (_isCapped && parts.length > 0 && _spCap > 0)
  ? Math.min(eT, _spCap)
  : _capEff;
const _capTotalDots = _isCapped
  ? shDotsMixed(Math.min(_capBase, _dPurch), Math.max(0, _capBase - Math.min(_capBase, _dPurch)))
  : _totalDots;
```

Place `_spM` / `_spCap` computation immediately after `_capStored` (line 927) since it's only needed when `_isCapped`.

### Export / Print -- No Changes Needed (AC: 7)

`export-character.js:212`: `shared_with: m.shared_with || []` passes through all merits generically.
`export-character.js:213`: `is_shared: isShared` -- check what `isShared` resolves to for domain merits (search for its declaration in export-character.js; it should evaluate based on `shared_with.length > 0`).
`print.js:39`: `if (m.is_shared && m.effective_rating > m.own_dots) suffix = '...'` -- generic, works for Haven once export passes the correct values.

Verify but do not change these files unless a test reveals the `is_shared` flag is not set correctly for domain merits.

### Precedent: Mandragora Garden (Issue #160, 2026-05-08)

Mandragora Garden was removed from `_noShare` in commit for issue #160. That change was pure `_noShare` removal -- the `_capTotalDots` formula was not updated for MG at that time. This story corrects the total display for both shared capped merits (Haven and MG benefit from the same fix) if the display path is shared. Verify whether the `_capTotalDots` block affects MG too -- if so, the fix improves MG's Total display at the same time, which is desirable but should be noted in the commit.

### The Open Question (Low Priority)

Issue body asks: "Should a Haven with `shared_with` but no `attached_to` be valid?" Answer: yes, treat it as valid (contributes 0 dots until linked, exactly as the existing unattached Haven behaviour -- the existing `dom-cap-warn` already handles this). No schema change needed.

### Project Structure Notes

- Only file that needs an edit: `public/js/editor/sheet.js` (lines 928, 962, 960-961 comment).
- No changes to `edit-domain.js`, `domain.js`, `export-character.js`, or `print.js` unless testing reveals a gap.
- No server-side changes; `shared_with` is already persisted as a plain array field by the existing save path.

### References

- [`public/js/editor/sheet.js:911`](public/js/editor/sheet.js) -- `eT = domMeritTotal(c, m.name)`
- [`public/js/editor/sheet.js:925-928`](public/js/editor/sheet.js) -- `_isCapped`, `_capEff`, `_capTotalDots` block
- [`public/js/editor/sheet.js:962-964`](public/js/editor/sheet.js) -- `_noShare` gate + partner chips + dropdown
- [`public/js/editor/domain.js:17-18`](public/js/editor/domain.js) -- `CAP_DOMAIN` set (Haven, Mandragora Garden) -- do NOT change
- [`public/js/editor/domain.js:80-87`](public/js/editor/domain.js) -- `_havenCap` private function
- [`public/js/editor/domain.js:244-267`](public/js/editor/domain.js) -- `meritEffectiveRating` (CAP_DOMAIN path)
- [`public/js/editor/domain.js:149-174`](public/js/editor/domain.js) -- `domMeritTotal` (sums partners for singleton types)
- [`public/js/editor/edit-domain.js:356-440`](public/js/editor/edit-domain.js) -- `shAddDomainPartner` / `shRemoveDomainPartner`
- [Issue #160](https://github.com/angelusvmorningstar/TerraMortis/issues/160) -- Mandragora Garden precedent

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Removed `'Haven'` from `_noShare` in `sheet.js` (was `['Herd', 'Feeding Grounds', 'Haven']`, now `['Herd', 'Feeding Grounds']`). Partner chips and dropdown now render for Haven.
- Added `_spM` / `_spCap` / `_capSharedEff` variables to `sheet.js` Total display block. When Haven has partners and an attached SP, Total uses `min(eT, spCap)` which correctly sums own + partner dots up to the Safe Place cap. Unshared Haven behavior (over-cap hollow dots) is unchanged.
- Fixed pre-existing bug in `export-character.js:213`: `is_shared: isShared` referenced an undeclared variable (always `undefined`). Replaced with `(m.shared_with || []).length > 0`. This fix applies to all shared domain merits (Safe Place, Mandragora Garden, Haven).
- `edit-domain.js` `shAddDomainPartner` / `shRemoveDomainPartner` confirmed name-agnostic -- no Haven-specific exclusions. `attached_to` untouched by both functions (AC 5 confirmed by code inspection).
- Both modified files parse clean (`node --input-type=module --check`).
- Task 4 (browser verification) is left for the ST to perform manually per project convention (no test framework).

### File List

- `public/js/editor/sheet.js`
- `public/js/editor/export-character.js`
- `tests/issue-313-haven-shared-domain-merit.spec.js`
