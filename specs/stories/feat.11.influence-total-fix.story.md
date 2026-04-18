# Story feat.11: Game App Influence Total Fix

**Story ID:** feat.11
**Epic:** Feature Backlog
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As an ST using the game app, I want each character's influence tracker to show the correct maximum, so that the track and breakdown reflect the actual rules-derived total (clan status + covenant status + merit thresholds + Contacts pool + MCI bonus).

---

## Background & Root Cause

`suite/sheet.js` uses **two different functions** to compute influence totals, and the one used for the tracker max is wrong.

### The wrong function — `influenceTotal(c)` (`public/js/data/accessors.js` line 113)

```js
export function influenceTotal(c) {
  return influenceMerits(c).filter(m => !m.prereq_failed).reduce((s, m) => s + (m.rating || 0), 0);
}
```

Problems:
- Sums raw `m.rating` dots — ignores the influence threshold rules (≥3→1, ≥5→2)
- Completely omits clan and covenant status contributions
- Handles Contacts wrong (raw rating per entry instead of pooled threshold)
- Misses MCI ●●●●● +1 bonus
- `prereq_failed` is never stamped in the game app (no prereq engine on load), so the filter is inert

### The correct function — `calcTotalInfluence(c)` (`public/js/editor/domain.js` line 293)

Already imported in `suite/sheet.js` at line 27. Already used correctly at line 402 for the section header `(N inf)`. Formula:

```
total = status.clan + status.covenant
      + calcMeritInfluence per influence merit   (threshold: ≥3→1, ≥5→2; HWV bonus)
      + calcContactsInfluence(c)                 (all Contacts pooled, capped at 5, threshold)
      + 1 if MCI.rating >= 5
```

### Verified ground truth

| Character | `influenceTotal` (wrong) | `calcTotalInfluence` (correct) | Expected |
|---|---|---|---|
| Alice Vunder | 18 | 10 | **10** |
| Anichka | 3 | 7 | **7** |
| Brandy LaRoux | 17 | 11 | **11** |

Alice's wrong value is high because raw Allies ratings (3 each) are summed directly instead of converted via threshold (3 → 1 inf each). Anichka's is low because her clan (2) + covenant (4) = 6 status dots are missed entirely.

### The symptom: two numbers on the same sheet

Line 195 (`maxInf`) uses `influenceTotal` → wrong. Line 402 (section header) uses `calcTotalInfluence` → correct. A character like Alice shows `18` boxes in the tracker but `(10 inf)` in the section header.

---

## Implementation Plan

### Task 1 — Fix `maxInf` (line 195)

**File:** `public/js/suite/sheet.js`

Replace:
```js
const maxInf = influenceTotal(c);
```
with:
```js
const maxInf = calcTotalInfluence(c);
```

`calcTotalInfluence` is already imported at line 27 — no import change needed.

### Task 2 — Fix tracker num update fallback (line 661)

The tracker box click handler recalculates the `N/max` label on tap. Its influence branch also uses `influenceTotal`:

```js
: influenceTotal(c);   // line 661 — wrong
```

Replace with:
```js
: calcTotalInfluence(c);
```

### Task 3 — Fix `infBreakdown` to match `calcTotalInfluence` sources (lines 238–244)

The breakdown chips below the influence track currently only show influence merits (misses status and MCI). Replace the hand-rolled loop with `influenceBreakdown(c)` — already imported at line 27 — which returns the same sources as `calcTotalInfluence`:

```js
// Returns e.g.: ["Clan Status: 1", "Covenant Status: 2", "Allies (Health): 1", "Contacts: 1", "MCI 5: 1"]
```

**Current (replace entirely):**
```js
const activeInfMerits = influenceMerits(c).filter(m => !m.prereq_failed && (m.rating || 0) > 0);
const infBreakdown = activeInfMerits.length
  ? `<div class="sh-inf-breakdown">${activeInfMerits.map(m => {
      const total = (m.rating || 0) + (m.bonus || 0);
      return `<span class="sh-inf-merit">${m.name} <span class="sh-inf-dots">${'●'.repeat(Math.min(total, 10))}</span></span>`;
    }).join('')}</div>`
  : '';
```

**Replacement:**
```js
const bdLines = influenceBreakdown(c);
const infBreakdown = bdLines.length
  ? `<div class="sh-inf-breakdown">${bdLines.map(l =>
      `<span class="sh-inf-merit">${l}</span>`
    ).join('')}</div>`
  : '';
```

The `.sh-inf-merit` chip CSS is unchanged — the text format (`"Allies (Health): 1"`) is self-describing, so the dot-repeat display is not needed.

---

## Acceptance Criteria

- [ ] Alice Vunder's influence track shows max **10** (was 18)
- [ ] Anichka's influence track shows max **7** (was 3)
- [ ] Brandy LaRoux's influence track shows max **11** (was 17)
- [ ] The tracker `N/max` label and the section header `(N inf)` show the same number for every character
- [ ] The infBreakdown chips below the tracker include clan/covenant status lines where applicable
- [ ] No regression to Vitae, Health, or Willpower trackers
- [ ] The `N/max` label on tracker box tap is also correct (Task 2)

---

## Files to Change

| File | Change |
|---|---|
| `public/js/suite/sheet.js` | Three edits: line 195 swap, line 661 swap, lines 238–244 breakdown rewrite |

**Do not touch:**
- `public/js/data/accessors.js` — `influenceTotal` is used by CSV export and legacy tracker; do not change it
- `public/js/game/tracker.js` — also uses `influenceTotal` for its own max calc; out of scope here (separate story if needed)
- Any editor files or player portal files

---

## Critical Constraints

- `calcTotalInfluence` and `influenceBreakdown` are **already imported** at `suite/sheet.js` line 27 — no import line changes required
- `influenceTotal` must remain in `accessors.js` and must not be deleted — it is used by other modules
- Do not touch the `.sh-inf-breakdown` or `.sh-inf-merit` CSS classes — only the JS that builds the HTML

---

## Reference

- Wrong function: `public/js/data/accessors.js` lines 113–115
- Correct function: `public/js/editor/domain.js` lines 293–309
- Breakdown function: `public/js/editor/domain.js` lines 315–334
- Both imports confirmed: `public/js/suite/sheet.js` line 27
- Bug lines in suite/sheet.js: 195, 238–244, 661
