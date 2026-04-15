# Story DT-Fix-2: Herd Vitae Bug — +10 Impossible Value

## Status: done

## Story

**As an** ST reviewing feeding results,
**I want** the Herd vitae value in the vitae tally to reflect the character's actual Herd rating,
**so that** impossible values (like +10) don't mislead the ST calculating the cycle's vitae budget.

## Background

Charlie's feeding panel shows +10 Herd vitae, which is impossible — Herd maxes at 5 dots. The vitae tally derives Herd vitae from `domMeritContrib(char, 'Herd')`, which sums CP + free + XP + SSJ bonus + Flock bonus. The bug likely comes from one of these:

1. **SSJ bonus double-counted** — `ssjHerdBonus(c)` adds 1 Herd dot per MCI dot, which may already be baked into the character's stored Herd dots in some characters
2. **Herd dots stored at inflated value** — the Excel migration may have stored the post-bonus total rather than the purchased dots, so the bonus is counted twice
3. **`domMeritContrib` including a field it shouldn't** — `free_mci` or another field unexpectedly non-zero on Charlie's Herd merit entry

---

## Relevant Code

**File:** `public/js/admin/downtime-views.js`
**Function:** `_renderFeedRightPanel()` (~lines 5531–5535)

```js
const herd = (char?.merits || []).find(m => m.name === 'Herd');
const herdVitae = char
  ? (domMeritContrib(char, 'Herd') || (herd ? (herd.rating || 0) : 0))
  : null;
```

**File:** `public/js/editor/domain.js`
**Function:** `domMeritContrib()` (lines 19–24)

```js
export function domMeritContrib(c, name) {
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  const purchased = (m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + (m.xp || 0);
  return purchased + (name === 'Herd' ? ssjHerdBonus(c) + flockHerdBonus(c) : 0);
}
```

**File:** `public/js/editor/domain.js`
**Functions:** `ssjHerdBonus(c)` and `flockHerdBonus(c)` (lines ~27–55) — read these to understand what they add.

---

## Investigation Steps

1. Open Charlie's character data: `data/chars_v2.json` — find Charlie's Herd merit entry.
   - What are `cp`, `free`, `free_mci`, `xp` on the Herd merit?
   - What is `rating`?
   - Do the fields sum to 10, or does the sum only reach 10 after SSJ/Flock bonus?

2. Check `ssjHerdBonus(c)` — how many MCI dots does Charlie have, and is SSJ active?

3. Check `flockHerdBonus(c)` — does Charlie have Flock?

4. Confirm whether Charlie's Herd merit `cp`/`free`/`xp` fields already include the SSJ bonus in their stored values (data migration artefact).

---

## Likely Fix

**If bonus is double-counted** (stored dots already include SSJ): the `domMeritContrib` formula overcounts. The fix is one of:

- Cap the result at 5: `return Math.min(5, purchased + bonus)` — simple guard, but doesn't address the root
- Fix the character data so stored dots are purchased-only and bonus is applied once at render
- Add a `'Herd'`-specific branch in `domMeritContrib` that only adds the SSJ bonus if a flag indicates it hasn't been baked in

**Preferred fix:** Clamp at max Herd rating (5) as a safety measure, AND investigate whether Charlie's data needs correction.

---

## Acceptance Criteria

1. Charlie's feeding vitae tally shows a Herd value of 5 or less.
2. Characters with legitimate SSJ Herd bonuses still show the correct (bonus-inclusive) value up to 5.
3. The total vitae calculation (`autoSum`) is correct after the fix.
4. No other character's vitae tally is affected adversely.

---

## Tasks / Subtasks

- [x] Task 1: Inspect Charlie's character data — log `domMeritContrib(charlie, 'Herd')` breakdown
- [x] Task 2: Read `ssjHerdBonus` and `flockHerdBonus` implementations
- [x] Task 3: Determine root cause (double-count vs. data error)
- [x] Task 4: Apply fix (clamp + data correction if needed)
- [x] Task 5: Verify Charlie's vitae tally; verify no regression on other characters with Herd

---

## Dev Notes

### Key files

| File | Action |
|------|--------|
| `public/js/editor/domain.js` | Investigate + possibly fix `domMeritContrib` for Herd |
| `public/js/admin/downtime-views.js` | May need clamp at tally display site |
| `data/chars_v2.json` | Check Charlie's Herd merit field values |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Root cause: data error, not a code bug. Charlie's Herd merit in MongoDB had `free: 5` — the SSJ bonus was written as static free dots during the Excel migration. `domMeritContrib` then added `ssjHerdBonus(c) = 5` on top, producing 10.
- All other 8 SSJ characters had `free: 0` on Herd — Charlie was the sole exception.
- `chars_v2.json` already had the correct representation (`granted_by: "SSJ"`, no free dots).
- Fix: one-off migration script `server/patch-charlie-herd-free.js` sets `merits.N.free = 0` on Charlie's Herd via targeted `$set`. No code changes to `domain.js` or `downtime-views.js`.
- No regression risk: the dynamic `ssjHerdBonus()` calculation correctly handles the corrected data.

### File List
- `server/patch-charlie-herd-free.js`
