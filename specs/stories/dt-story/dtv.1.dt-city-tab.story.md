# Story DTV.1: DT City Tab — Split City Overview into Dedicated Sub-Tab

## Status

Done

## Story

As an ST running downtime processing,
I want a dedicated "DT City" sub-tab in the Downtime domain,
So that I can check the city-level view (feeding matrix, ambience, territory actions, discipline profile, spheres) independently of the individual action processing queue.

## Background

The current Downtime domain has two sub-tabs: **DT Processing** and **DT Story**.

"DT Processing" contains two conceptually distinct concerns:
1. **Individual action processing** — the per-character submission queue, phase ribbon, feeding scene, snapshot, NPC register
2. **City Overview** — a city-level aggregate view: Feeding Matrix, Ambience, Actions in Territories (TAAG), Discipline Profile, Spheres of Influence, ST Notes

These are used at different points in the ST workflow. City Overview is a reference panel consulted before and during processing to understand the city-wide picture. The processing queue is the active work surface. Mixing them into one scrollable panel makes both harder to access.

This story splits the Downtime tab into three sub-tabs:

| Tab | Contents |
|-----|----------|
| **DT City** | City Overview: Feeding Matrix, Ambience, TAAG, Discipline Profile, Spheres, ST Notes |
| **DT Processing** | Toolbar, cycle selector, phase ribbon, snapshot, match summary, feeding scene, processing queue, NPC register |
| **DT Story** | Unchanged — DT Story tab |

DT Processing remains the default active tab on page load. DT City lazy-initialises on first visit (same pattern as DT Story) using the already-loaded cycle and submission data.

## Acceptance Criteria

1. The Downtime domain has three sub-tabs: **DT Processing** (default), **DT City**, **DT Story** — in that order.
2. DT Processing contains only the processing-specific UI: toolbar, cycle selector, phase ribbon, sub-ribbon, snapshot, warnings, match summary, feeding scene, `#dt-submissions`, `#dt-npcs`.
3. DT City contains the City Overview panel: Feeding Matrix, Ambience, Actions in Territories, Discipline Profile, Spheres of Influence, ST Notes (and the Export JSON button).
4. DT City lazy-initialises on first activation — if cycle data is already loaded, `renderCityOverview()` is called immediately; if no cycle is selected, a "No cycle loaded — switch to DT Processing to select a cycle" placeholder is shown.
5. Activating DT Processing or DT City after data changes (e.g. a validation action) re-renders their respective content correctly — no stale view.
6. Sub-tab active state (`active` class on `.dt-sub-tab-btn`) correctly tracks all three tabs.
7. No visual regression — City Overview content renders identically in the new panel in both themes.
8. `#dt-conflicts` is removed from `buildShell()` — it no longer exists inside the DT Processing panel.

## Tasks / Subtasks

- [x] **Task 1 — admin.html**: Add "DT City" sub-tab button between "DT Processing" and "DT Story" (`data-tab="city"`). Add `<div id="dt-city-panel" class="dt-panel" style="display:none"></div>` alongside the existing `dt-processing-panel` and `dt-story-panel` divs.

- [x] **Task 2 — admin.js**: Update the `.dt-sub-tab-btn` click handler to manage three panels:
  - `tab === 'processing'` → show `#dt-processing-panel`, hide city + story
  - `tab === 'city'` → show `#dt-city-panel`, hide processing + story; on first activation call `renderCityOverview()` (or show placeholder if `!currentCycle`)
  - `tab === 'story'` → existing logic, unchanged
  - Introduce `_dtCityInited` flag (same pattern as `_dtStoryInited`)

- [x] **Task 3 — downtime-views.js**: Remove `<div id="dt-conflicts"></div>` from `buildShell()`. Update `renderCityOverview()` to target `document.getElementById('dt-city-panel')` rather than `#dt-conflicts`. Added `export` keyword.

- [x] **Task 4 — downtime-views.js**: All 4 call sites of `renderCityOverview()` (lines 855, 1364, 3121, 3454) unchanged — they continue to fire after cycle load and action validation, keeping the city tab live-updated.

- [x] **Task 5 — admin-layout.css**: `dt-panel` is a class rule — `#dt-city-panel` inherits it automatically. No CSS changes needed.

## Dev Notes

### Current structure (before)

`buildShell()` in `downtime-views.js` generates:
```html
<div id="dt-conflicts"></div>      <!-- City Overview mounts here -->
<div id="dt-submissions" ...></div>
<div id="dt-npcs"></div>
```
`renderCityOverview()` targets `document.getElementById('dt-conflicts')`.

### Target structure (after)

`buildShell()` omits `#dt-conflicts`. Admin.html has:
```html
<div id="dt-processing-panel" class="dt-panel">
  <div id="downtime-content"></div>   <!-- buildShell() output: toolbar, ribbon, submissions, npcs -->
</div>
<div id="dt-city-panel" class="dt-panel" style="display:none">
  <!-- renderCityOverview() writes here directly -->
</div>
<div id="dt-story-panel" class="dt-panel" style="display:none"></div>
```

### renderCityOverview() mount change

Currently reads/writes `document.getElementById('dt-conflicts')`. After the change it should read/write `document.getElementById('dt-city-panel')`. The `dt-conflict-panel` wrapper div inside the function can stay as-is — only the root `el` reference changes.

The `el.dataset.open` collapse state persists on the element itself — this behaviour is unchanged.

### Lazy-init in admin.js

```js
let _dtCityInited = false;
// in click handler:
if (tab === 'city') {
  cityPanel.style.display = '';
  if (!_dtCityInited) {
    _dtCityInited = true;
    renderCityOverview();  // imported from downtime-views.js or called via the module export
  }
}
```

Note: `renderCityOverview` is declared in `downtime-views.js`. Confirm it is exported (or accessible as a module export) to `admin.js`. If it is not currently exported, add it to the export list in `downtime-views.js`.

### renderCityOverview call sites in downtime-views.js

Current call sites (all should remain):
- `renderCycle()` line ~856 — fires after every cycle load
- `renderCycleView()` line ~1365 — fires on closed-cycle view
- Action validation handler line ~3122 — fires after pool validation
- Retally handler line ~3455 — fires after disc retally

These keep City tab content live-updated without requiring a tab switch. No changes needed.

### Tab order rationale

DT Processing is the primary active-work tab and stays first (and default). DT City is reference/planning — second. DT Story is narrative delivery — third. This matches the ST workflow order: process → check city → write story.

## Dev Agent Record

### File List

- `public/admin.html`
- `public/js/admin.js`
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`

### Completion Notes

- Exported `renderCityOverview` from `downtime-views.js`; imported into `admin.js`
- Removed `#dt-conflicts` from `buildShell()`; redirected mount to `#dt-city-panel`
- All 4 internal call sites (renderCycle, renderCycleView, validation handler, retally handler) untouched — city tab stays live-updated
- `dt-panel` class rule covers `#dt-city-panel` automatically — no CSS changes needed
- Chip → expand cross-tab behaviour: clicking a TAAG chip still expands the action in the processing queue, but does not auto-switch tabs (out of scope for this story)

### Change Log

- 2026-04-16: Story created and implemented
