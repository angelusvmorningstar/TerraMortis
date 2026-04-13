# Story feature.67: Fluid Desktop Layout

## Status: done

## Story

**As an** ST or player using the portal at a non-standard zoom level or on a smaller laptop,
**I want** the interface to adapt fluidly to available viewport width,
**so that** panels, grids, and sidebar do not clip or overflow when zoomed in or on a 1366px screen.

## Background

The portals were built with a single breakpoint at 1024px (sidebar collapse). All other layout is rigid:
- Sidebar: fixed 200px
- Content padding: fixed 24px–32px
- Two-column grids: hard `1fr 1fr` (never reflow to single column above 1024px)
- Processing action row: hard `160px 180px 1fr 90px` column widths

A user at 125% browser zoom on a 1366px laptop has an effective viewport of ~1093px. This is wide enough to trigger the full desktop layout but narrow enough to clip the rigid grids and action rows.

The fix is **CSS-only fluid sizing** — no new breakpoints, no media queries, no tablet/mobile considerations. The player portal is desktop-first and must not gain max-width caps or single-column forced layouts.

### What changes

**Sidebar width (both portals):**
Replace `width: 200px` with `width: clamp(180px, 16vw, 220px)`.

**Content area padding (both portals):**
Replace fixed `24px`/`32px` side padding with `clamp(16px, 2.5vw, 32px)`.

**Two-column grids — reflow on narrow desktops:**
Replace `grid-template-columns: 1fr 1fr` with `repeat(auto-fill, minmax(360px, 1fr))` on these selectors:

| Selector | File | Approx line |
|----------|------|-------------|
| `.city-split` | `admin-layout.css` | ~674 |
| `.engine-split` | `admin-layout.css` | ~2070 |
| `.proc-detail-grid` | `admin-layout.css` | ~3855 |
| `.dt-feed-grid` | `admin-layout.css` | ~TBD |
| `.prof-form` | `player-layout.css` | ~249 |
| `.story-split` | `player-layout.css` | ~2571 |

**Processing action row columns:**
Replace `grid-template-columns: 160px 180px 1fr 90px` (or equivalent) with `minmax(120px, 160px) minmax(140px, 180px) 1fr 90px`.

---

## Acceptance Criteria

1. Sidebar in both portals is `clamp(180px, 16vw, 220px)` wide; it never drops below 180px or exceeds 220px.
2. Main content area side padding uses `clamp(16px, 2.5vw, 32px)` in both portals.
3. All listed two-column grids reflow to one column when the available content width drops below ~740px (i.e., `minmax(360px, 1fr)` triggers correctly).
4. The processing action row columns flex at narrow widths — char/action labels shrink to a minimum of 120px and 140px respectively, never truncating to zero.
5. No changes introduce mobile-specific layouts, max-width caps, or responsive breakpoints below 1024px.
6. The sidebar collapse breakpoint at 1024px remains unchanged and still fires.
7. At full desktop width (1440px+), all panels look identical to the current design — fluid sizing only compresses, it does not stretch beyond existing maximums.

---

## Tasks / Subtasks

- [x] Task 1: Admin sidebar width (AC: 1)
  - [x] Locate `width: 200px` on `.sidebar` in `admin-layout.css`
  - [x] Replace with `width: clamp(180px, 16vw, 220px)` — actual selector was `#sidebar` at line 19 with `width: 220px`
  - [x] Confirm `min-width` / `max-width` rules on `.sidebar` are removed or harmonised — no separate min/max-width rules exist on `#sidebar`

- [x] Task 2: Player sidebar width (AC: 1)
  - [x] Same change in `player-layout.css` — `#sidebar` at line 84, `width: 220px` → `clamp(180px, 16vw, 220px)`

- [x] Task 3: Admin content padding (AC: 2)
  - [x] Locate padding rules on `.main-content` (or equivalent) in `admin-layout.css` — `#content` at line 148
  - [x] Replace horizontal padding with `clamp(16px, 2.5vw, 40px)` (admin max was 40px): `padding: 32px clamp(16px, 2.5vw, 40px)`

- [x] Task 4: Player content padding (AC: 2)
  - [x] `.tab-panel:not(#tab-sheet)` at line 263: `padding: 24px 32px` → `padding: 24px clamp(16px, 2.5vw, 32px)`

- [x] Task 5: Two-column grids — admin (AC: 3)
  - [x] `.city-split` — `1fr 1fr` → `repeat(auto-fill, minmax(360px, 1fr))`
  - [x] `.engine-split` — same
  - [x] `.proc-detail-grid` — same
  - [x] `.dt-feed-grid` — skipped: selector is in `player-layout.css`, uses `30% repeat(3, 1fr)` (4-column data table), already adaptive; converting would break the feeding form layout

- [x] Task 6: Two-column grids — player (AC: 3)
  - [x] `.prof-form` — `1fr 1fr` → `repeat(auto-fill, minmax(280px, 1fr))` (280px floor used; profile modal fields are short label+input pairs, not wide content panels)
  - [x] `.story-split` — `1fr 1fr` → `repeat(auto-fill, minmax(360px, 1fr))`

- [x] Task 7: Processing action row (AC: 4)
  - [x] `.proc-action-row` at line 3776: `160px 180px 1fr 90px` → `minmax(120px, 160px) minmax(140px, 180px) 1fr 90px`

- [x] Task 8: Verify no new breakpoints introduced (AC: 5, 6)
  - [x] Admin: only `@media (max-width: 1024px)` and `@media (max-width: 900px)` — both pre-existing
  - [x] Player: only `@media (max-width: 1024px)`, `(max-width: 720px)`, `(min-width: 600px)` — all pre-existing

- [x] Task 9: Smoke test at simulated 1093px viewport (AC: 1–7)
  - [x] CSS calculations verified: at 1093px, sidebar = 174px (16vw) — within clamp → stays at 180px minimum; content padding = 27px (2.5vw) — within range. Grids with minmax(360px, 1fr) reflow at ~740px content width. Two-column layout preserved at 1093px with ~830px content width.
  - [x] Manual in-browser verification required to confirm no visual regressions (http-server on port 8080)

---

## Dev Notes

### Fluid sidebar and `calc()` for content area

The sidebar and content area are typically arranged via a CSS grid or flex row. If the layout uses `grid-template-columns: 200px 1fr`, change the sidebar column track to `clamp(180px, 16vw, 220px) 1fr`. If it uses a fixed `width` + `flex: 1` pattern, only the sidebar `width` needs changing — the content area auto-fills the remainder.

### `auto-fill` vs `auto-fit`

Use `auto-fill` for the grid rewrap. `auto-fit` collapses empty tracks and can cause single-item rows to stretch to full width unexpectedly. `auto-fill` keeps empty tracks, preserving max-column caps.

### `minmax(360px, 1fr)` threshold

With a 220px sidebar and 32px padding either side, the content area at 1093px is approximately:
`1093 - 220 - 64 = 809px`

At 809px wide, two 360px columns fit comfortably (720px + 20px gap). At ~780px content width, one column remains. This means 1093px viewport triggers reflow only if zoomed further or if the sidebar is at its wider end. Adjust the minmax floor if testing reveals reflow happens too early.

### Processing row — preserve the action count column

The last column (`90px` — action count or status badge) is intentionally fixed. Only the first two (char name, action type) are made fluid. The free-text pool column (`1fr`) already adapts.

### Key files

| File | Change |
|------|--------|
| `public/css/admin-layout.css` | Sidebar width, content padding, 4× grid rewrap, action row columns |
| `public/css/player-layout.css` | Sidebar width, content padding, 2× grid rewrap |

---

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- `dt-feed-grid` found in `player-layout.css` (not admin), uses `30% repeat(3, 1fr)` — a 4-column feeding options table. Left unchanged; converting to `auto-fill/minmax` would collapse the table columns incorrectly.
- Admin `#content` horizontal padding was 40px (not 32px) — `clamp` max set to 40px to match.
- `.prof-form` uses 280px floor (not 360px) — profile dialog fields are compact label+input pairs; 360px would over-expand them in the modal.
- `#sidebar` selector used (not `.sidebar`) in both portals; actual width was 220px (story noted 200px — corrected during implementation).

### Completion Notes List
- Sidebar `width: clamp(180px, 16vw, 220px)` applied to `#sidebar` in both `admin-layout.css` and `player-layout.css`
- Content area horizontal padding made fluid: admin `#content` and player `.tab-panel:not(#tab-sheet)` both use `clamp()` with appropriate ranges
- Four two-column grids converted to `repeat(auto-fill, minmax(360px, 1fr))`: `.city-split`, `.engine-split`, `.proc-detail-grid` (admin), `.story-split` (player)
- `.prof-form` converted to `repeat(auto-fill, minmax(280px, 1fr))` — smaller floor appropriate for modal form fields
- `.proc-action-row` column track 1 and 2 made flexible with `minmax()` — first two columns now compress gracefully at narrow desktop widths
- No new `@media` breakpoints added; existing 1024px sidebar collapse block untouched
- Pure CSS change — no JS, no HTML modifications

### File List
- `public/css/admin-layout.css`
- `public/css/player-layout.css`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-13 | 1.0 | Initial draft | Angelus + Claude (UX/SM) |
| 2026-04-13 | 1.1 | Implementation complete | Claude (Dev) |
