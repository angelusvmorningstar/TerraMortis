# Story fix.657: Ranking ballot — phablet responsive reflow

## Status: review

---
issue: 657
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/657
branch: ms/issue-657-ranking-phablet-reflow
---

## Story

**As a** player on a phablet (roughly 480-680px viewport),
**I want** the clan and covenant ranking ballot to stack vertically rather than shrink side-by-side,
**so that** the five ordinal dropdowns are wide enough to read and tap comfortably.

## Background

The ranking ballot (introduced in #624) renders clan and covenant slot columns as a two-column
flex row via `.status-ranking-grid { display: flex; }`. No `@media` breakpoint exists for any
`.status-ranking-*` or `.rank-*` class. On phablet widths the two columns compress to roughly
half the screen width each, making the `<select>` elements illegible and hard to tap.

The fix is a CSS-only addition — one `@media (max-width: 768px)` block appended to the
existing ranking CSS block in `public/css/suite.css` (currently lines 2242–2414).

The `768px` threshold is chosen for consistency with the project's established tablet breakpoint
(used at lines 1224, 1383, 1638 in suite.css). No JS changes. No new classes.

## Acceptance Criteria

1. At viewport width ≤ 768px, `.status-ranking-grid` changes to `flex-direction: column` — clan
   column stacks above covenant column, each running full width.

2. At viewport width ≤ 768px, the right-side `border-right` divider on `.status-ranking-col` is
   suppressed (was a vertical divider between the two side-by-side columns; looks wrong when stacked).

3. At viewport width ≥ 769px, the two-column layout is unchanged.

4. The `.status-ranking-actions` bar (Save button + message) remains usable at phablet widths —
   no overflow, button fully visible and tappable.

5. The ST aggregate view (`.rank-org-section`, `.rank-pills`, `.rank-member-list`) shows no
   overflow or horizontal scroll at ≤ 768px. These sections are already columnar — the audit
   just confirms nothing needs changing.

6. No other existing layout at ≤ 768px is broken. The new block is scoped entirely to
   `.status-ranking-grid` and `.status-ranking-col` — no side-effects on other components.

## Tasks

- [x] Task 1: Audit ST aggregate classes at ≤ 768px for overflow risk
  - Read `.rank-org-section`, `.rank-pills`, `.rank-member-row` in `public/css/suite.css` lines 2340–2370
  - Confirm `.rank-pills` already has `flex-wrap: wrap` (it does — no change needed)
  - Confirm `.rank-member-row` uses `justify-content: space-between` with `gap: 8px` (fine at narrow)
  - If any class would overflow at 480px, note it for inclusion in the breakpoint block

- [x] Task 2: Add responsive block to `public/css/suite.css`
  - Insert **immediately after** the existing `/* ── #624 Clan/Covenant ranking ballot ── */`
    block (after line 2414, before the Ordeals block at line 2416)
  - The block:
    ```css
    @media (max-width: 768px) {
      .status-ranking-grid { flex-direction: column; }
      .status-ranking-col  { border-right: none; }
    }
    ```
  - If the aggregate audit (Task 1) found overflow issues, add those selectors here too

- [ ] Task 3: Smoke-verify in browser at ≤ 768px
  - Open `public/ranking-preview.html` (standalone preview page) at 680px viewport
  - Confirm clan column appears above covenant column, each full width
  - Confirm selects are readable and not clipped
  - Confirm the two-column layout is restored at ≥ 769px

## Dev Notes

### Files to change
- `public/css/suite.css` — append `@media (max-width: 768px)` block after line 2414. **No other file changes.**

### Files to read before starting
- `public/css/suite.css` lines 2242–2414 — the full ranking CSS block being extended
- `public/ranking-preview.html` — standalone preview; use this to verify the change locally at
  `npx http-server public -p 8080` → `localhost:8080/ranking-preview.html`

### Classes involved (player ballot)
| Class | Current layout | Needed at ≤ 768px |
|---|---|---|
| `.status-ranking-grid` | `display: flex` (row) | `flex-direction: column` |
| `.status-ranking-col` | `flex: 1; border-right: 1px solid var(--bdr)` | `border-right: none` |
| `.status-ranking-col:last-child` | `border-right: none` | unchanged (already none) |
| `.status-ranking-actions` | `display: flex; gap: 12px` | unchanged (already handles narrow) |

### Classes involved (ST aggregate) — likely no change needed
| Class | Current layout | Verdict |
|---|---|---|
| `.rank-org-section` | `padding: 14px; border-bottom` (column, not flex-row) | OK |
| `.rank-pills` | `display: flex; flex-wrap: wrap; gap: 6px` | wraps naturally |
| `.rank-member-row` | `display: flex; justify-content: space-between` | OK |

### No JS changes
`public/js/tabs/status-ranking.js` is not touched. The HTML it generates uses `data-rank` and
`data-slot` attributes for save/duplicate-guard wiring — purely JS concerns, unaffected by CSS layout.

### Breakpoint precedence in suite.css
The new block sits within the same file as existing `@media (max-width: 768px)` blocks at lines
1224, 1383, 1638. There is no specificity conflict — the selectors are new and don't appear in
any other block. No need for `!important`.

### No Playwright test required
This is a visual CSS-only layout change. The acceptance criteria can only be verified by
resizing the viewport in a real browser. Playwright is not set up for pixel-level visual
regression in this project.

## Dev Agent Record

### Implementation Notes

- Task 1 (audit): Confirmed `.rank-pills` has `flex-wrap: wrap` and `.rank-member-row` uses
  `justify-content: space-between` — no aggregate overflow risk. No extra selectors needed.
- Task 2 (CSS): Inserted `@media (max-width: 768px)` block at line 2415 in `public/css/suite.css`,
  immediately after the legacy `.status-ranking-agg-pts` rule and before the Ordeals section.
  Two rules: `flex-direction: column` on `.status-ranking-grid` and `border-right: none` on
  `.status-ranking-col`. No JS changes, no new classes, no specificity conflicts.
- Task 3 (smoke): Requires manual browser verification on dev — cannot be automated.

## File List

- `public/css/suite.css` — added 3-line `@media (max-width: 768px)` block at line 2415

## Change Log

- 2026-06-09: Added phablet responsive reflow for ranking ballot — `.status-ranking-grid` stacks
  to single column at ≤ 768px via CSS-only `@media` block in `public/css/suite.css`
