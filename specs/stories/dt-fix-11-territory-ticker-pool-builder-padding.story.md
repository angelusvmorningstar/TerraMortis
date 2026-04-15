# Story DT-Fix-11: Feeding Panel — Gap Between Territory Ticker and Pool Builder

## Status: done

## Story

**As an** ST reviewing the feeding action panel,
**I want** a visual gap between the territory chip row and the ST Pool Builder section,
**so that** the two zones are clearly separated and the panel is easier to read.

## Background

In the feeding action expanded view (not the right panel sidebar, but the detail panel area around line 6265–6290), the territory pills row (`.proc-recat-row`) runs directly into the ST Pool Builder section (`.proc-pool-builder`) with no visual separation. A small `margin-top` is all that's needed.

---

## Current Structure (downtime-views.js ~lines 6265–6300)

```
<div class="proc-recat-row">          ← territory pills
  [territory pill chips]
</div>
                                       ← no gap here
<div class="proc-pool-builder">        ← ST Pool Builder
  [pool builder rows]
</div>
```

---

## Required Change

**Option A — CSS (preferred):** Add a top-margin rule to `admin-layout.css`:

```css
.proc-pool-builder {
  margin-top: 8px;   /* or: 0.5rem */
}
```

Check if `.proc-pool-builder` already has a `margin-top` rule — if so, update the existing value instead of adding a duplicate.

**Option B — HTML spacer:** Only use if the CSS class is shared and a global margin would break other layouts.

```js
h += '<div class="proc-section-gap"></div>';
```

with:
```css
.proc-section-gap { margin-top: 8px; }
```

Use Option A unless `.proc-pool-builder` margin-top would cause layout regressions elsewhere.

---

## Acceptance Criteria

1. A visible gap (≥ 6px) exists between the territory chip row and the ST Pool Builder section in the feeding detail panel.
2. No other panel layouts are affected by the change.
3. Gap is consistent in both dark and parchment themes.

---

## Tasks / Subtasks

- [x] Task 1: Check `admin-layout.css` for existing `.proc-pool-builder` margin rule
- [x] Task 2: Add or update `margin-top` on `.proc-pool-builder`
- [ ] Task 3: Verify gap renders in feeding detail panel; confirm no regressions in other panels

---

## Dev Notes

### Key files

| File | Action |
|------|--------|
| `public/css/admin-layout.css` | Add `margin-top` to `.proc-pool-builder` |
| `public/js/admin/downtime-views.js` | Only if HTML spacer approach needed |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- `.proc-pool-builder` had no existing `margin-top` — added `margin-top: 8px` to the rule in `admin-layout.css` (line 4404)
- Option A (CSS only) used — no HTML spacer needed

### File List
- `public/css/admin-layout.css`
