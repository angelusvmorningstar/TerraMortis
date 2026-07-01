# Code review — DT Story tab (player-facing) phablet friendliness

**Date:** 2026-06-21
**Author:** Angelus (via Claude)
**Scope:** Player-facing DT Story tab (`public/js/tabs/story-tab.js` + governing CSS), focus on phablet (large phone / small tablet) rendering. Triggered by recent churn on this surface: #907, #914, #916, #922.

---

## Summary

The Story tab's responsive skeleton is sound. `.story-split` correctly collapses to a single column below 900px (`public/css/suite.css:1832-1844`), so on a phablet in portrait the Chronicle / Documents panes stack rather than cram.

The antipattern is **inside** the report, in the merit summary ledger that the recent commits have been building up. One finding is the real problem; two others are minor / edge.

---

## Finding 1 (primary antipattern) — `.merit-summary-row` fixed-width flex columns, no wrap

**File:** `public/css/components.css:4558-4582`

```css
.merit-summary-row          { display: flex; gap: 8px; align-items: baseline; }
.merit-summary-merit        { flex-shrink: 0; width: 130px; }
.merit-summary-action-type  { flex-shrink: 0; width: 90px; }
.merit-summary-text         { flex: 1; }
```

A desktop-table layout forced into a flex row with **no `flex-wrap`** and two non-shrinking fixed columns. On a phablet/phone the maths is hostile:

- 130 + 90 + 2×8px gaps = **236px** consumed before the outcome text gets a single pixel.
- The row sits inside `.story-narrative` padding (16px each side, `suite.css:1801`). On a 412px-wide Pixel that leaves `.merit-summary-text` roughly **130px wide** — the ST outcome renders as a tall, one-or-two-words-per-line ribbon next to two short labels. Worse at 360px.
- `align-items: baseline` + `flex:1` with default `min-width:auto` also risks horizontal overflow on a long unbreakable token.

**Why it surfaced now:** #907 (2026-06-19) added `.merit-summary-description` *inside* `.merit-summary-text`, so the already-pinched column now stacks description **and** outcome. The narrow-column problem predates #907 (DTP-4 introduced the ledger) but #907 made the cost visible by adding more content into the squeezed column. **No media query anywhere** relaxes this layout — the only other matches are the separate admin-side `.dt-merit-summary-*` classes.

### Recommended fix

Stack the row below the existing tablet breakpoint (codebase convention is 600 / 768 / 900; 600px matches the other phablet-portrait collapses):

```css
@media (max-width: 600px) {
  .merit-summary-row { flex-direction: column; gap: 2px; align-items: stretch; }
  .merit-summary-merit,
  .merit-summary-action-type { width: auto; }
}
```

Alternative (more robust across the whole phablet band): drop the fixed `width`s for `min-width` + `flex-wrap: wrap` so the text column can claim the full row width when there isn't room beside the labels.

Recommendation: the **stacked breakpoint** — merit/action labels read better above the outcome than wrapped beside it.

---

## Finding 2 (minor) — doubled horizontal padding starves card content

`.story-narrative` has `padding: 16px` (`suite.css:1801`) and the `.proj-card`s injected inside it add `margin: 12px 16px 20px` (`components.css:4427`). That is **32px of gutter each side** on phone/phablet portrait — ~64px of a 360–412px viewport spent on whitespace before any card content. Not broken, but worth trimming the card's horizontal margin (e.g. to 0 inside the already-padded narrative, or via a `max-width:600px` override) so feeding/project cards reclaim their width.

---

## Finding 3 (edge) — the 900px cliff

The single→two-column flip is a hard jump at exactly 900px with nothing between. A landscape phablet that reports ~915px wide (some Pixels) flips to two 1fr columns on a screen that's still narrow, cramming Chronicle + Documents. Portrait phablets and small tablets (≤900) are unaffected. If we want to be safe, bump the two-column breakpoint to ~1024px so only genuine tablet-landscape / desktop gets the split. Lower priority than Finding 1.

---

## What's fine (no action)

- `.story-split`, `.tab-split`, `.status-split` all collapse correctly below their breakpoints — the recent work did not regress the pane skeleton.
- `.proj-card-header`, `.proj-card-pool`, rumours list all wrap / shrink acceptably.
- The flag form (`.story-section-flag-*`) is full-width block layout — phablet-safe.

---

## Bottom line

The single change that matters for "phablet-friendly" is **Finding 1** — it's the recently-grown surface and the only one that materially degrades on a real phablet. Findings 2 and 3 are polish.
