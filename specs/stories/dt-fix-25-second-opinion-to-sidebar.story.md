# Story DT-Fix-25: Move Second-Opinion Toggle to Status Sidebar

## Status: ready-for-dev

## Story

**As an** ST processing a downtime cycle,
**I want** the "Flag for 2nd opinion" toggle to live inside the status sidebar (right panel),
**so that** it is easy to find and act on during processing without hunting through the left column.

## Background

DT-Fix-14 implemented the second-opinion flag toggle and placed it in the left (detail) column of `renderActionPanel`, immediately before the Player Feedback input (lines 6666-6672 in `downtime-views.js`). In the left column it renders as a faint outline link with minimal visual weight, making it easy to miss during a fast processing session.

The right-side status sidebar is the natural home for this control — STs are already focused there when setting pool status. Placing the toggle below the status button row keeps it visible and co-located with other resolution decisions.

This applies to all five action types that have a right panel (feeding, project, sorcery, merit) and to st_created / other actions that render their status section inline in the left column.

---

## Design Decisions

### 1. Target location

Add the button at the **bottom of each right-panel status section**, after the status buttons and any committed-pool display but before the section's closing `</div>`. This mirrors where a secondary action sits in other tool UIs — it is subordinate to the main status decision but shares the same visual zone.

For st_created and non-right-panel action types, the inline Validation Status block in `renderActionPanel` (lines 6630-6640) is the equivalent zone; the toggle goes immediately after the closing `</div>` of that block (i.e. after line 6639).

### 2. Button style

The button keeps its existing classes (`proc-second-opinion-btn`, `active` modifier) and existing CSS unchanged. No new CSS is required.

Full-width inside the sidebar section is the natural result of placing it inside the existing `.proc-feed-right-section proc-feed-right-validation` wrapper without further styling changes.

### 3. Remove from left column

The existing block at lines 6666-6672 in `renderActionPanel` (left column) is deleted entirely:

```js
// DELETE these 4 lines:
  // Second-opinion flag toggle
  {
    const isActive = !!rev.second_opinion;
    h += `<div class="proc-section proc-second-opinion-row">`;
    h += `<button class="proc-second-opinion-btn${isActive ? ' active' : ''}" data-proc-key="${esc(entry.key)}">${isActive ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
    h += `</div>`;
  }
```

### 4. Shared render helper (optional)

The insertion is a one-liner in every location. A helper function is not required, but the dev may extract one if they prefer:

```js
function _renderSecondOpinionBtn(key, isActive) {
  return `<button class="proc-second-opinion-btn${isActive ? ' active' : ''}" data-proc-key="${esc(key)}">${isActive ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
}
```

---

## Acceptance Criteria

1. The "Flag for 2nd opinion" / "Second Opinion" toggle appears in the right-side status sidebar for feeding, project, sorcery, and merit actions — not in the left column.
2. For st_created actions (which have no right panel), the toggle appears immediately after the inline Validation Status block in the left column.
3. The left-column second-opinion block (lines 6666-6672) is removed from `renderActionPanel`.
4. Toggle behaviour is unchanged: clicking toggles `second_opinion` on the review, re-renders, persists across reload.
5. Active state is visually unchanged: amber fill (`var(--gold2)`), dark text, "Second Opinion" label.
6. Inactive state is visually unchanged: outline, muted text, "Flag for 2nd opinion" label.
7. The amber queue-row dot badge (`proc-row-second-opinion-dot`) is unaffected.
8. No other layout or functional change is introduced.

---

## Tasks / Subtasks

- [ ] Task 1: Remove left-column second-opinion block from `renderActionPanel`
  - [ ] 1.1: In `downtime-views.js`, delete the block at lines **6666-6672** (the `// Second-opinion flag toggle` comment through the closing `}`)

- [ ] Task 2: Add toggle to `_renderFeedRightPanel` (feeding)
  - [ ] 2.1: Locate the closing `h += '</div>';` of the `proc-feed-right-validation` section (line ~5741, just before `h += '</div>'; // proc-feed-right`)
  - [ ] 2.2: Insert the button immediately before that closing `</div>`:
    ```js
    const _isSO_feed = !!rev.second_opinion;
    h += `<button class="proc-second-opinion-btn${_isSO_feed ? ' active' : ''}" data-proc-key="${esc(key)}">${_isSO_feed ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
    ```

- [ ] Task 3: Add toggle to `_renderProjRightPanel` (project)
  - [ ] 3.1: Locate the closing `h += '</div>';` of the `proc-feed-right-validation` section (line ~5484, just before the roll card)
  - [ ] 3.2: Insert the button immediately before that closing `</div>`:
    ```js
    const _isSO_proj = !!rev.second_opinion;
    h += `<button class="proc-second-opinion-btn${_isSO_proj ? ' active' : ''}" data-proc-key="${esc(key)}">${_isSO_proj ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
    ```

- [ ] Task 4: Add toggle to `_renderSorceryRightPanel` (sorcery)
  - [ ] 4.1: Locate the closing `h += '</div>';` of the `proc-feed-right-validation` section (line ~5388, immediately before `h += '</div>'; // proc-feed-right`)
  - [ ] 4.2: Insert the button immediately before that closing `</div>`:
    ```js
    const _isSO_sorc = !!rev.second_opinion;
    h += `<button class="proc-second-opinion-btn${_isSO_sorc ? ' active' : ''}" data-proc-key="${esc(key)}">${_isSO_sorc ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
    ```

- [ ] Task 5: Add toggle to `_renderMeritRightPanel` (merit)
  - [ ] 5.1: Locate the closing `h += '</div>';` of the status section (line ~5320, immediately before `h += '</div>'; // proc-feed-right`)
  - [ ] 5.2: Insert the button immediately before that closing `</div>`:
    ```js
    const _isSO_merit = !!rev.second_opinion;
    h += `<button class="proc-second-opinion-btn${_isSO_merit ? ' active' : ''}" data-proc-key="${esc(key)}">${_isSO_merit ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
    ```

- [ ] Task 6: Add toggle after inline status block in `renderActionPanel` (st_created + others)
  - [ ] 6.1: Locate the inline Validation Status block at lines **6630-6640** in `renderActionPanel` — the block guarded by `entry.source !== 'feeding' && entry.source !== 'project' && !isSorcery && entry.source !== 'merit'`
  - [ ] 6.2: Immediately after the closing `h += '</div>';` of that block (line ~6639), insert:
    ```js
    {
      const _isSO_inline = !!rev.second_opinion;
      h += `<div class="proc-section">`;
      h += `<button class="proc-second-opinion-btn${_isSO_inline ? ' active' : ''}" data-proc-key="${esc(entry.key)}">${_isSO_inline ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
      h += `</div>`;
    }
    ```
  - [ ] 6.3: Confirm this covers st_created entries (which fall through the `source !==` guard) and any other action types that render status inline.

- [ ] Task 7: Manual verification
  - [ ] 7.1: Open DT Processing; expand a **feeding** action — confirm toggle appears inside the Validation Status section (right panel), not in the left column.
  - [ ] 7.2: Expand a **project** action — same confirmation.
  - [ ] 7.3: Expand a **sorcery** action — same confirmation.
  - [ ] 7.4: Expand a **merit** action — same confirmation.
  - [ ] 7.5: Expand an **ST-created** action — confirm toggle appears after the inline Validation Status block.
  - [ ] 7.6: Click toggle on each type — confirm active state (amber, "Second Opinion"), queue-row dot appears.
  - [ ] 7.7: Reload page — confirm flag state persists.
  - [ ] 7.8: Confirm left column no longer shows the toggle for any action type.

---

## Dev Notes

### Exact removal target (Task 1)

Lines 6666-6672 in `downtime-views.js` (inside `renderActionPanel`, left column, after the Attach Reminder block and before Player Feedback):

```js
  // Second-opinion flag toggle
  {
    const isActive = !!rev.second_opinion;
    h += `<div class="proc-section proc-second-opinion-row">`;
    h += `<button class="proc-second-opinion-btn${isActive ? ' active' : ''}" data-proc-key="${esc(entry.key)}">${isActive ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
    h += `</div>`;
  }
```

Delete this entire block. The `proc-second-opinion-row` CSS class on the wrapper div becomes unused; it can be left in the CSS for now or cleaned up in a later housekeeping pass.

### Right-panel status section anatomy (per function)

| Function | Status section open | Status section close | Insert before |
|---|---|---|---|
| `_renderFeedRightPanel` | `h += '<div class="proc-feed-right-section proc-feed-right-validation">'` (~5712) | `h += '</div>'` (~5741) | that `</div>` |
| `_renderProjRightPanel` | `h += '<div class="proc-feed-right-section proc-feed-right-validation">'` (~5453) | `h += '</div>'` (~5484) | that `</div>` |
| `_renderSorceryRightPanel` | `h += '<div class="proc-feed-right-section proc-feed-right-validation">'` (~5378) | `h += '</div>'` (~5388) | that `</div>` |
| `_renderMeritRightPanel` | `h += '<div class="proc-feed-right-section proc-feed-right-validation">'` (~5310) | `h += '</div>'` (~5320) | that `</div>` |

In each function, `rev` is already in scope as the first parameter or the review object — no extra lookup needed.

### Event handler — no change needed

The existing `.proc-second-opinion-btn` click handler (lines 4602-4613 in the event wiring section) delegates via `querySelectorAll` on the container. It works regardless of where in the DOM the button renders. No handler changes are needed.

### CSS — no change needed

`.proc-second-opinion-btn` and `.proc-second-opinion-btn.active` already have appropriate styles in `admin-layout.css` (lines 4366-4385). The button will naturally fill the width of its sidebar wrapper. `.proc-second-opinion-row` on the old wrapper div is vestigial after Task 1 — leave it in CSS for now.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Remove left-column block; add button to each of the four right-panel status sections; add button after inline status block for st_created/others |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Claude (research + authoring) |
