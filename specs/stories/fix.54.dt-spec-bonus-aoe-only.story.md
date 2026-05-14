# Story fix.54: DT spec bonus — remove nine-again from predicate; AoE only

**Story ID:** fix.54
**Epic:** Fixes
**Issue:** 267
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/267
**Branch:** morningstar-issue-267-dt-spec-bonus-aoe-only
**Status:** review
**Date:** 2026-05-12

---

## User Story

As an ST or player seeing spec bonuses in the DT form or processing panel, I want the displayed die bonus to reflect the actual rules — +1 for any spec, +2 only with Area of Expertise — so that a character with Professional Training's nine-again does not incorrectly show or apply +2.

---

## Background

Nine-again is a reroll-threshold mechanic (re-roll dice that show 9+), not a bonus-die mechanic. It has no effect on the flat +1 die added by a Specialisation. Only Area of Expertise (a Merit, `hasAoE()`) upgrades that to +2.

The predicate `(skNineAgain(c, skill) || hasAoE(c, spec)) ? 2 : 1` appears across eight sites in three files. Each instance must become `hasAoE(c, spec) ? 2 : 1`.

`dice-engine.js:89–94` (`specBonusFor`) is already correct — AoE only. No change needed there.

Supersedes issue #207 (which proposed `skNineAgain || hasAoE` as the canonical predicate — that direction was incorrect).

---

## Acceptance Criteria

- [ ] A character with nine-again on a skill (via PT) and no Area of Expertise sees spec chip `+1` and pool includes `+1 <spec>`
- [ ] A character with Area of Expertise matching the spec sees `+2` in chip and pool
- [ ] A character with both nine-again AND Area of Expertise sees `+2` (AoE wins; nine-again does not double-count)
- [ ] All eight affected sites updated — no remaining `skNineAgain` in spec-bonus expressions
- [ ] `skNineAgain` removed from imports in `downtime-form.js` and `feeding-tab.js` (no longer used there after fix)
- [ ] `nineAgain` parameter removed from `_augmentPoolWithSpecs` signature and both callers updated
- [ ] `dice-engine.js` untouched — already correct

---

## Implementation

### File 1: `public/js/tabs/downtime-form.js`

**Import (line 21) — remove `skNineAgain`:**
```js
// CURRENT:
import { calcVitaeMax, skTotal, skNineAgain, riteCost, skillAcqPoolStr, getAttrEffective, getAttrTotal, discDots } from '../data/accessors.js';
// CHANGE TO:
import { calcVitaeMax, skTotal, riteCost, skillAcqPoolStr, getAttrEffective, getAttrTotal, discDots } from '../data/accessors.js';
```

**Site 1 — line 591-592 (project pool inline):**
```js
// CURRENT:
const specBonus = validSpec
  ? ((skNineAgain(currentChar, skillName) || hasAoE(currentChar, specName)) ? 2 : 1)
  : 0;
// CHANGE TO:
const specBonus = validSpec ? (hasAoE(currentChar, specName) ? 2 : 1) : 0;
```

**Site 2 — lines 3791-3792 (saved project pool):**
```js
// CURRENT:
const na = skNineAgain(currentChar, savedSkill);
total += (na || hasAoE(currentChar, savedSpec)) ? 2 : 1;
// CHANGE TO:
total += hasAoE(currentChar, savedSpec) ? 2 : 1;
```
(Remove the `const na` line entirely.)

**Site 3 — lines 3844-3845 (spec chip label in project pool):**
```js
// CURRENT:
const na = skNineAgain(currentChar, savedSkill);
const bonus = (na || hasAoE(currentChar, sp)) ? 2 : 1;
// CHANGE TO:
const bonus = hasAoE(currentChar, sp) ? 2 : 1;
```
(Remove the `const na` line entirely.)

**Site 4 — lines 4849-4850 (acquisition pool recalc):**
```js
// CURRENT:
const na = skNineAgain(currentChar, skillEl.value);
total += (na || hasAoE(currentChar, specEl.value)) ? 2 : 1;
// CHANGE TO:
total += hasAoE(currentChar, specEl.value) ? 2 : 1;
```
(Remove the `const na` line entirely.)

---

### File 2: `public/js/tabs/feeding-tab.js`

**Import (line 14) — remove `skNineAgain`:**
```js
// CURRENT:
import { getAttrEffective as getAttrVal, skDots, skTotal, skSpecStr, skNineAgain, calcVitaeMax } from '../data/accessors.js';
// CHANGE TO:
import { getAttrEffective as getAttrVal, skDots, skTotal, skSpecStr, calcVitaeMax } from '../data/accessors.js';
```

**Site 5 — lines 430-431 (feeding tab pool):**
```js
// CURRENT:
const na = bestS ? skNineAgain(c, bestS) : false;
const specBonus = specName && bestSpecs.includes(specName) ? ((na || hasAoE(c, specName)) ? 2 : 1) : 0;
// CHANGE TO:
const specBonus = specName && bestSpecs.includes(specName) ? (hasAoE(c, specName) ? 2 : 1) : 0;
```
(Remove the `const na` line entirely.)

---

### File 3: `public/js/admin/downtime-views.js`

**Site 6 — `_augmentPoolWithSpecs` (lines 747-755):**

Remove the `nineAgain` parameter. It was only used for the spec bonus.

```js
// CURRENT:
function _augmentPoolWithSpecs(poolValidated, activeSpecs, char, nineAgain) {
  if (!poolValidated || !activeSpecs.length) return poolValidated;
  const eqIdx = poolValidated.lastIndexOf('=');
  if (eqIdx === -1) return poolValidated;
  const base     = poolValidated.slice(0, eqIdx).trim();
  const tot      = parseInt(poolValidated.slice(eqIdx + 1).trim()) || 0;
  const specTotal = activeSpecs.reduce((s, sp) => s + ((nineAgain || (char && hasAoE(char, sp))) ? 2 : 1), 0);
  const specLabel = activeSpecs.map(sp => `${sp} +${(nineAgain || (char && hasAoE(char, sp))) ? 2 : 1}`).join(', ');
  return `${base} + ${specLabel} = ${tot + specTotal}`;
}

// CHANGE TO:
function _augmentPoolWithSpecs(poolValidated, activeSpecs, char) {
  if (!poolValidated || !activeSpecs.length) return poolValidated;
  const eqIdx = poolValidated.lastIndexOf('=');
  if (eqIdx === -1) return poolValidated;
  const base     = poolValidated.slice(0, eqIdx).trim();
  const tot      = parseInt(poolValidated.slice(eqIdx + 1).trim()) || 0;
  const specTotal = activeSpecs.reduce((s, sp) => s + (char && hasAoE(char, sp) ? 2 : 1), 0);
  const specLabel = activeSpecs.map(sp => `${sp} +${char && hasAoE(char, sp) ? 2 : 1}`).join(', ');
  return `${base} + ${specLabel} = ${tot + specTotal}`;
}
```

**Callers of `_augmentPoolWithSpecs` — drop 4th arg (lines 7164 and 7412):**
```js
// CURRENT (both lines):
_augmentPoolWithSpecs(poolValidated, rev.active_feed_specs || [], char, nineAgainState)
_augmentPoolWithSpecs(poolValidated, rev.active_feed_specs || [], char, nineAgainStateFeed)
// CHANGE TO (both):
_augmentPoolWithSpecs(poolValidated, rev.active_feed_specs || [], char)
```

**Site 7 — line 954 (feeding pool builder):**
```js
// CURRENT:
specBonus = (sk.nine_again || hasAoE(char, playerSpec)) ? 2 : 1;
// CHANGE TO:
specBonus = hasAoE(char, playerSpec) ? 2 : 1;
```
Also remove the stale comment above it (line 946: "// Spec bonus: +2 if Area-of-Expertise / nine-again") and update to: `// Spec bonus: +2 with Area of Expertise; +1 otherwise`

**Site 8 — lines 5210-5211 (feed spec accumulator):**
```js
// CURRENT:
const skillNa = char && skillSel ? skNineAgain(char, skillSel.value) : false;
const specBonus = activeFeedSpecs.reduce((sum, sp) => sum + ((skillNa || (char && hasAoE(char, sp))) ? 2 : 1), 0);
// CHANGE TO:
const specBonus = activeFeedSpecs.reduce((sum, sp) => sum + (char && hasAoE(char, sp) ? 2 : 1), 0);
```
(Remove the `const skillNa` line entirely. `skNineAgain` import in `downtime-views.js` stays — still used at lines 732, 6585, 8284, 10803 for roll nine-again logic.)

---

## Verification

```
grep -n "skNineAgain" public/js/tabs/downtime-form.js
grep -n "skNineAgain" public/js/tabs/feeding-tab.js
```
Expected: zero matches in both (import removed, no usages remain).

```
grep -n "nineAgain\|nine_again" public/js/admin/downtime-views.js | grep -i "spec\|bonus"
```
Expected: zero matches (no nine-again in spec bonus paths).

```
grep -n "_augmentPoolWithSpecs" public/js/admin/downtime-views.js
```
Expected: definition (3 args) + 2 callers (3 args each).

**Manual smoke test:**
1. Open a character with PT-granted nine-again, no Area of Expertise — DT form project pool and spec chip shows `+1`
2. Open a character with Area of Expertise (matching spec) — chip shows `+2`
3. Admin processing panel spec display matches for both cases

---

## Scope Notes

- **In scope**: Remove `skNineAgain` from spec-bonus predicates at all eight sites; clean up unused `na`/`skillNa` variables and imports
- **Out of scope**: How nine-again is applied to dice rolls (correct behaviour, untouched); `dice-engine.js` (already correct); any change to `_resolveNineAgain()` logic
- **Do not touch**: `downtime-views.js` lines 732, 6585, 8284, 10803 — these use `skNineAgain` for roll-modifier logic, not spec bonus
