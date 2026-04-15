# Story DT-Fix-10: Clear Pool Button — Reduce Size

## Status: ready-for-dev

## Story

**As an** ST building a dice pool,
**I want** the Clear Pool button to be compact and unobtrusive,
**so that** it doesn't dominate the panel and can't be accidentally triggered.

## Background

The Clear Pool button currently uses the default `.dt-btn` class, which renders at full button size. It should be styled like the small secondary actions elsewhere in the panel (e.g. `dt-btn-sm` or equivalent icon-button style).

---

## Current Code

**File:** `public/js/admin/downtime-views.js`

Clear Pool button rendered in three places:

| Location | Function | Approx. line |
|---|---|---|
| Merit panel | `_renderMeritRightPanel()` | ~5282 |
| Project panel | `_renderProjRightPanel()` | ~5443 |
| Feeding panel | `_renderFeedRightPanel()` | ~5693 |

Current HTML (all three):
```js
h += `<button class="dt-btn proc-pool-clear-btn" data-proc-key="${esc(key)}">Clear Pool</button>`;
```

---

## Required Change

### Option A — Add `dt-btn-sm` class (preferred)

```js
h += `<button class="dt-btn dt-btn-sm proc-pool-clear-btn" data-proc-key="${esc(key)}">Clear Pool</button>`;
```

`dt-btn-sm` already exists in the design system. Check `admin-layout.css` for its definition and confirm it produces an inline-style small button.

### Option B — CSS override on `.proc-pool-clear-btn` (if dt-btn-sm is wrong shape)

In `admin-layout.css`:
```css
.proc-pool-clear-btn {
  font-size: 0.75rem;
  padding: 2px 8px;
  line-height: 1.4;
}
```

Use Option A unless `dt-btn-sm` produces wrong results.

---

## Acceptance Criteria

1. Clear Pool button is visually smaller than primary action buttons in the panel.
2. Button is still clearly readable and clickable.
3. Change is consistent across merit, project, and feeding panels (all three call sites).
4. Functionality (clearing `pool_validated`) is unchanged.

---

## Tasks / Subtasks

- [ ] Task 1: Add `dt-btn-sm` to Clear Pool button in `_renderMeritRightPanel`
- [ ] Task 2: Same in `_renderProjRightPanel`
- [ ] Task 3: Same in `_renderFeedRightPanel`
- [ ] Task 4: Verify visual result in all three panels; fall back to CSS override if needed

---

## Dev Notes

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add `dt-btn-sm` class at three Clear Pool call sites |
| `public/css/admin-layout.css` | Only if CSS override needed (Option B) |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`
