---
issue: 815
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/815
branch: piatra/issue-815-harbour-influence-discrepancy
---

# Story 815: Harbour influence "−0" display bug and diagnostic logging

**Story ID:** fix.815
**Status:** To Do
**Date:** 2026-07-03
**Issue:** [#815](https://github.com/angelusvmorningstar/TerraMortis/issues/815)
**Branch:** `piatra/issue-815-harbour-influence-discrepancy`

---

## User Story

As an ST reviewing the Ambience table after a downtime cycle,
I want the influence/projects/allies contribution columns to suppress a spurious "−0"
negative span when no negative contributions exist,
so that the display correctly reads "0" rather than "−0" for territories with only positive
or zero contributions.

---

## Background

### Investigation summary (SM-resolved 2026-07-03)

Issue #815 was opened with three reported numbers that did not reconcile:

- Harbour Influence column showed **+17**
- ST expected **+19**
- Raw MongoDB positive sum was **13**

SM traced the DT3 cycle (`_id 69e955c784bbfc821bed2810`, 29 submissions) against prod.
Seven submissions contribute to Harbour `influence_spend` via OID-keyed objects:

| Character | Delta |
|---|---|
| Yusuf Kalusicj | +1 |
| Reed Justice | +3 |
| Ludica Lachramore | +2 |
| Xavier Boussade | +1 |
| Wan Yelong | +6 |
| Jack Fallow | -1 |
| Macheath | -2 |

**Totals:** +13 positive / 3 negative / net +10.

`_gatherInfluence` was simulated byte-for-byte against prod data and produces exactly
+13 / 3 / net +10. Only three writes to `infPos`/`infNeg` exist inside the function
(lines 3914 legacy-array, 3921 positive, 3922 negative). No other code path contributes to
the influence column.

**The +17 / +19 gap is not reproducible against current data and is SM-closed.**

- `_gatherInfluence` reads only `sub.responses.influence_spend`.
- No `ambience_override` or `ambience_delta` field exists on the DT3 cycle document.
- `confirmed_ambience` is the closed-out final state, not a per-source contribution.
- Submissions are scoped to DT3 only (`getSubmissionsForCycle(cycleId)` at line 1300 —
  no cross-cycle leak).

Most likely explanation: the ST observed a stale render or a state that was subsequently
corrected in the data. If the discrepancy resurfaces in a future cycle, the new
`console.debug` diagnostic (Change 2 below) enables direct tracing without a MongoDB
round-trip.

### The "−0" rendering bug is real and actionable

`public/js/admin/downtime-views.js` line 11906:

```js
const infDisplay = `<span class="proc-amb-pos">+${r.inf_pos}</span> | <span class="proc-amb-neg">-${r.inf_neg}</span> | <span class="${infNetClass}">${infNetStr}</span>`;
```

When `r.inf_neg === 0` this renders literally as "−0" in a red `proc-amb-neg` span.
The same pattern appears at line 11910 (`proj_neg`) and line 11914 (`allies_neg`).

The issue's acceptance criteria explicitly call out this bug:
"Negative influence contributions render as their actual value, not '−0'."

The fix pattern already exists in the same function: the `overfeed` column at lines
11900-11902 uses a conditional that only emits the negative span when the value is
non-zero:

```js
const ovStr = r.overfeed !== 0
  ? ` | <span class="${r.overfeed > 0 ? 'proc-amb-pos' : 'proc-amb-neg'}">${_fmtMod(r.overfeed)}</span>`
  : '';
```

Apply the same shape to all three affected columns.

---

## Acceptance Criteria

- [ ] **AC1 (issue verbatim — +17/+19 gap):** The source of the +17 vs +19 vs 13 gap is
      identified. **SM-resolved:** code produces the correct total (+13 pos / 3 neg / net
      +10). Gap not reproducible against current data. No data correction or code change
      required for the aggregation path. Closing as investigated.
- [ ] **AC2 (issue verbatim — negative display):** Negative influence contributions render
      as their actual value, not "−0". The `proc-amb-neg` span for influence, projects, and
      allies is suppressed when the negative total is zero; a plain `0` (or neutral display)
      is shown instead.
- [ ] **AC3 (diagnostic):** `_gatherInfluence` emits a `console.debug` line at the end of
      the accumulation loop so that future ST reports can be traced with DevTools open
      without a MongoDB round-trip.
- [ ] **AC4 (Vitest mirror-test):** A static-analysis test at
      `server/tests/fix.815.harbour-influence-negzero.test.js` asserts the naked
      `-${r.inf_neg}` pattern is absent from `downtime-views.js` and that the `console.debug`
      diagnostic is present in `_gatherInfluence`.

---

## Design

### Change 1 — Fix "−0" rendering on influence / projects / allies columns

**File:** `public/js/admin/downtime-views.js`

**Current behaviour (three affected lines):**

Line 11906 (influence):
```js
const infDisplay = `<span class="proc-amb-pos">+${r.inf_pos}</span> | <span class="proc-amb-neg">-${r.inf_neg}</span> | <span class="${infNetClass}">${infNetStr}</span>`;
```

Line 11910 (projects):
```js
const projDisplay = `<span class="proc-amb-pos">+${r.proj_pos}</span> | <span class="proc-amb-neg">-${r.proj_neg}</span> | <span class="${projNetClass}">${projNetStr}</span>`;
```

Line 11914 (allies):
```js
const alliesDisplay = `<span class="proc-amb-pos">+${r.allies_pos}</span> | <span class="proc-amb-neg">-${r.allies_neg}</span> | <span class="${alliesNetClass}">${alliesNetStr}</span>`;
```

**Replacement — apply the `overfeed` conditional pattern to each:**

```js
// influence (replaces line 11906)
const infNegStr = r.inf_neg > 0 ? ` | <span class="proc-amb-neg">-${r.inf_neg}</span>` : ' | 0';
const infDisplay = `<span class="proc-amb-pos">+${r.inf_pos}</span>${infNegStr} | <span class="${infNetClass}">${infNetStr}</span>`;

// projects (replaces line 11910)
const projNegStr = r.proj_neg > 0 ? ` | <span class="proc-amb-neg">-${r.proj_neg}</span>` : ' | 0';
const projDisplay = `<span class="proc-amb-pos">+${r.proj_pos}</span>${projNegStr} | <span class="${projNetClass}">${projNetStr}</span>`;

// allies (replaces line 11914)
const alliesNegStr = r.allies_neg > 0 ? ` | <span class="proc-amb-neg">-${r.allies_neg}</span>` : ' | 0';
const alliesDisplay = `<span class="proc-amb-pos">+${r.allies_pos}</span>${alliesNegStr} | <span class="${alliesNetClass}">${alliesNetStr}</span>`;
```

Dev may choose an alternative display for the zero-negative case (e.g. omitting the "| 0"
entirely, or using a muted span) as long as the `proc-amb-neg` span is not emitted when
the value is zero. Whatever form is chosen must be consistent across all three columns.
The Vitest test asserts on the absence of the naked `-${r.inf_neg}` pattern, not on the
exact replacement text.

### Change 2 — `console.debug` diagnostic in `_gatherInfluence`

**File:** `public/js/admin/downtime-views.js`

**Location:** after the accumulator loop (line 3925), before the `return` on line 3926.

**Add:**

```js
console.debug('[ambience:influence] per-territory totals:', { infPos, infNeg });
```

`console.debug` is used rather than `console.log` — it is invisible at the default DevTools
log level (Info) but visible when the ST sets the filter to Verbose. No output noise for
normal users.

### Change 3 — PR body documents the investigation

The PR body must include:

- The raw DT3 contribution table (verbatim from this story's Background).
- A statement that `_gatherInfluence` produces the correct total (+13 / 3 / net +10).
- A statement that the +17 gap is not reproducible against current data.
- An ask: if the ST re-observes a discrepancy in a future cycle, file a fresh issue and
  attach the DevTools console output with the `[ambience:influence]` debug line visible.

---

## Files to Change

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Lines 11906, 11910, 11914: suppress "−0" negative span via conditional |
| `public/js/admin/downtime-views.js` | After line 3925 (end of `_gatherInfluence` loop): add `console.debug` diagnostic |
| `server/tests/fix.815.harbour-influence-negzero.test.js` | New Vitest static-analysis mirror-test |

No schema changes. No API route changes. No CSS changes. No data corrections.

---

## Testing

Write `server/tests/fix.815.harbour-influence-negzero.test.js` as a Vitest static-analysis
mirror-test. The test reads the source file via `fs.readFileSync` using the `REPO_ROOT`
pattern (i.e. `new URL('../../public/js/admin/downtime-views.js', import.meta.url)`).

No DOM harness, no browser module imports. The render is client-side HTML string
concatenation; behaviour is only verifiable visually. The test asserts on source text.

### Test cases

**Suite 1: "−0" pattern is absent**

- Assert that the source does NOT match `/proc-amb-neg">\-\$\{r\.inf_neg\}/` (the naked
  `-${r.inf_neg}` inside a `proc-amb-neg` span). Regex match must fail.
- Assert that the source does NOT match the equivalent patterns for `proj_neg` and
  `allies_neg`.

**Suite 2: conditional guard is present**

- Assert that the source DOES match a guard for `inf_neg` in the neighbourhood of the
  influence display line, e.g. `inf_neg > 0` or `inf_neg !== 0`. The test may use a
  looser regex checking that the string `inf_neg > 0` or `inf_neg !== 0` appears within
  a reasonable character window of the `infDisplay` assignment. A top-level
  `/inf_neg(?:\s*!==\s*0|\s*>\s*0)/` match on the full source is sufficient.

**Suite 3: `console.debug` diagnostic is present**

- Assert that the source matches
  `/console\.debug\(\s*'\[ambience:influence\]/` inside the `_gatherInfluence` function.
  A top-level source match is sufficient — the function is the only place this string
  would appear.

---

## Pre-flight

Branch `piatra/issue-815-harbour-influence-discrepancy` is already created off `dev`.
Before starting:

```bash
git log HEAD..origin/dev --oneline
```

Merge any outstanding `dev` commits before making changes.

---

## Dev Agent Record

_(To be completed by dev agent on implementation.)_

### Files Changed

### Completion Notes
