# Issue #330: Ambience Matrix -- Underfeeding Bonus Not Calculated

Status: review

issue: 330
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/330
branch: morningstar-issue-330-ambience-underfeeding-bonus

## Story

As an ST processing a downtime cycle,
I want the Ambience Matrix to award +1 per unfilled feeding slot when a territory
is under its Feeding Tolerance cap,
so that underfeeding is correctly reflected in the Net Change and Projected step.

## Acceptance Criteria

1. Academy with 4 feeders and cap 7 shows `+3` in the Overfeeding column; Net Change
   includes that bonus.
2. Harbour with 4 feeders and cap 5 shows `+1` in the Overfeeding column.
3. A territory at exactly cap shows no modifier (0 / blank).
4. Overfeeding penalty (−2 per feed over cap) is unchanged.
5. Net Change and Projected step update correctly for both bonus and penalty cases.

## Tasks / Subtasks

- [x] Task 1 -- Add underfeeding branch to `overfeedVal` (AC: 1, 2, 3, 4, 5)
  - [x] In `buildAmbienceData` line 3983, change the ternary to include an underfeed branch:
        `feeders < cap ? (cap - feeders) : 0` as the else case
  - [x] Verify `net` at line 3994 picks up the fix automatically (it uses `overfeedVal`)

- [x] Task 2 -- Update Overfeeding cell display (AC: 1, 2, 3)
  - [x] In `_buildAmbienceHtml` line 10357, replace the hard-coded negative-only display
        with a condition on `r.overfeed !== 0` using `_fmtMod` and the correct colour class

## Dev Notes

### File to modify

**Single file: `public/js/admin/downtime-views.js`**

---

### Task 1 detail -- `buildAmbienceData` (line 3983)

**Current:**
```js
const overfeedVal = feeders > cap ? -(feeders - cap) * 2 : 0;
```

**After:**
```js
const overfeedVal = feeders > cap ? -(feeders - cap) * 2 : feeders < cap ? (cap - feeders) : 0;
```

`net` at line 3994 uses `overfeedVal` directly:
```js
const net = entropy + overfeedVal + influence + projects + allies;
```
No change needed there -- the fix flows through automatically.

`r.overfeed` in the returned row object (line 4010) is set from `overfeedVal`, so it
will be positive when underfed. The display fix in Task 2 reads `r.overfeed`.

---

### Task 2 detail -- `_buildAmbienceHtml` (line 10357)

**Current (negative-only):**
```js
const ovStr = r.feeders > r.cap ? ` | <span class="proc-amb-neg">${r.overfeed}</span>` : '';
```

**After (handles positive underfeeding bonus too):**
```js
const ovStr = r.overfeed !== 0
  ? ` | <span class="${r.overfeed > 0 ? 'proc-amb-pos' : 'proc-amb-neg'}">${_fmtMod(r.overfeed)}</span>`
  : '';
```

`_fmtMod` (line 249): returns `"+3"` for positive, `"-6"` for negative, `"±0"` for zero.
Using it ensures consistent sign formatting with the rest of the table.

The cell render at line 10384 is unchanged:
```js
h += `<td>${r.feeders}/${r.cap}${ovStr}</td>`;
```
With the new `ovStr`, Academy (4/7, overfeed=+3) renders: `4/7 | +3` in green.

---

### What NOT to change

- `AMBIENCE_FEEDING_TOLERANCE` values -- cap values are correct
- `AMBIENCE_ENTROPY` values -- entropy calculation is unchanged
- `_buildAmbienceHtml` column header tooltip (already says "Feeders vs Feeding Tolerance")
- The footer note at line 10425 -- the overfeeding note is still accurate; underfeeding
  is implicit in the column header tooltip
- Everything else in `buildAmbienceData` and `_buildAmbienceHtml`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

### File List

- `public/js/admin/downtime-views.js` (modify: lines 3983, 10357)
