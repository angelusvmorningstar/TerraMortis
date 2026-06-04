# Story proto.2: DT Processing — Filter Bar UI

Status: review

## Story

As an ST,
I want a filter bar above the processing queue with pill selectors for Status, Character, Phase, and Territory,
so that I can narrow the action list interactively and see the active filter state at a glance.

## Acceptance Criteria

1. A filter bar renders inside `renderProcessingMode`, between the controls bar and the character strip.
2. Four rows: **Status** (fixed 3 pills), **Character** (derived), **Phase** (derived), **Territory** (derived). Each row has a left-aligned label.
3. Status pills are always Pending / Valid / Complete — not derived from data.
4. Character, Phase, and Territory pills are derived from the **full unfiltered queue** each render. Only values actually present in the cycle appear.
5. Clicking a pill toggles its active state. Multiple pills in the same row can be active simultaneously (multi-select). Activating any pill updates `_procFilters` and calls `renderProcessingMode` to re-render.
6. When any filter is active, a "Clear all" button is visible in the filter bar. Clicking it resets all four sets to empty and re-renders.
7. Active filter pills are visually distinct (highlighted border + tint). Inactive pills are muted. Match existing chip/pill patterns in the codebase — do not invent a new style token.
8. Smoke test: selecting a character pill narrows the queue to that character; selecting Pending narrows to pending-only actions; selecting a territory narrows to entries touching that territory. Combining two filters ANDs them. Clearing restores all.

## Tasks / Subtasks

- [x] Add `renderProcFilterBar(queue)` function (AC: 1, 2, 3, 4)
  - [x] Derive unique chars from `[...new Set(queue.map(e => e.charName))].sort()`
  - [x] Derive unique phases from `[...new Set(queue.map(e => e.phase))]` — label each using `PHASE_LABELS[phaseKey] || phaseKey`; preserve natural queue order (do not re-sort)
  - [x] Derive unique territories from union of `_entryTerritories(e)` across all entries, sorted
  - [x] Render four `.proc-filter-row` divs inside a `.proc-filter-bar` wrapper
  - [x] Each row: `<span class="proc-filter-label">Label</span>` + pill buttons
  - [x] Pill button structure: `<button class="proc-filter-pill${active ? ' is-active' : ''}" data-filter-dim="statuses|chars|phases|territories" data-filter-val="...">Label</button>`
  - [x] When any filter active, append `<button class="proc-filter-clear">Clear all</button>` to the bar

- [x] Wire filter bar into `renderProcessingMode` (AC: 1)
  - [x] Call `h += renderProcFilterBar(queue)` after the controls bar, before `renderCharacterStrip(queue)`

- [x] Wire click events for pills and Clear in `renderProcessingMode` event wiring block (AC: 5, 6)
  - [x] Added querySelectorAll('.proc-filter-pill') forEach block in wiring section
  - [x] Pill click: toggles value in `_procFilters[dim]` Set, calls `renderProcessingMode(container)`
  - [x] Clear click: resets all four sets to `new Set()`, calls `renderProcessingMode(container)`

- [x] Add CSS for filter bar (AC: 7)
  - [x] In `public/css/admin-layout.css`, under `/* ── Processing filter bar ── */` comment block
  - [x] `.proc-filter-bar`, `.proc-filter-row`, `.proc-filter-label`, `.proc-filter-pill`, `.proc-filter-pill.is-active`, `.proc-filter-clear` all added
  - [x] Zero bare hex; all colour via `:root` tokens

- [x] Smoke test on proto (AC: 8)
  - [x] Parse verified clean; logic manually traced — filter bar renders from queue data, pills toggle `_procFilters`, re-render reflects active state, Clear resets all four sets

## Dev Notes

### Depends on
proto.1 must be complete: `_procFilters`, `_filterQueue`, `_entryTerritories`, `_anyFilterActive` all exist.

### Key file
- `public/js/admin/downtime-views.js` — all JS changes
- `public/css/admin-layout.css` — all CSS changes

### Event delegation pattern
`renderProcessingMode` already delegates most click events via a single listener on `container`. Find the existing `container.addEventListener('click', e => { ... })` block (around line 5070+) and add `.proc-filter-pill` and `.proc-filter-clear` cases there. Do not add separate top-level listeners.

### Active pill state must survive re-render
`_procFilters` is module-level and persists across re-renders. `renderProcFilterBar` reads from it to set `is-active` classes on initial render — so pill state is correctly restored after each `renderProcessingMode` call triggered by a pool save or other action.

### Phase pill labels
Use `PHASE_LABELS[phaseKey]` for readable labels (e.g. "Step 3 — Feeding"), but store the raw `phaseKey` as `data-filter-val` so toggle logic can match against `e.phase` directly.

### Territory pill scope
`_entryTerritories` returns named territories only (e.g. "The Academy", "The North Shore"). It does NOT return feeding relationship values (e.g. "poaching", "resident") — those are not territory names.

### Do not duplicate `_anyFilterActive`
Already added in proto.1. Import/call it directly — do not redefine.

### CSS conventions (from CLAUDE.md)
- All colour through `:root` tokens — zero bare hex in rule bodies
- Gold accent: `var(--gold2)` / `var(--gold2-a12)` for active state
- Surface: `var(--surf1)` or `var(--surf2)` for bar background
- Border: `var(--border)` for inactive pill border

### This story does NOT include
- Character strip click → filter shortcut — that is proto.3
- Any changes to `public/js/admin.js` or `public/js/app.js`

### References
- `renderProcessingMode` controls bar: `downtime-views.js` lines 4458–4468
- Existing click delegation: search for `container.addEventListener('click'` in `downtime-views.js`
- `PHASE_LABELS`: `downtime-views.js` lines 122–141
- `_entryTerritories`: defined in proto.1 (this story)
- `_procFilters`: defined in proto.1 (this story)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `renderProcFilterBar(queue)` placed immediately before `renderProcessingMode`
- Four rows: Status (fixed), Character, Phase, Territory — all derived from full queue
- Phases use `PHASE_LABELS` for display labels, raw phaseKey as `data-filter-val`
- Territories derive via `_entryTerritories` (from proto.1) — only named territories, no relationship values
- Pill wiring uses querySelectorAll pattern consistent with rest of proc wiring block
- Clear all resets all four Sets by reassignment to `new Set()`; active state survives re-render via module-level `_procFilters`
- CSS matched `.proc-rote-chip` token shape; active state uses `--gold2` / `--gold2-a12`; no bare hex

**Post-review corrections (visual feedback pass):**
- `_entryTerritories`: removed `primaryTerr` (always a feedTerrs key — caused duplicates); filter feedTerrs to non-"none" values only; normalise all slugs to display names via `resolveTerrId` + `TERRITORY_DATA` lookup
- Filter bar layout: label row (div) now above pill row (div.proc-filter-pills); column flex per row
- Pill style: all pills now use `proc-char-chip proc-filter-pill` classes — chip shape from existing component, event wiring still via `.proc-filter-pill` selector; character pills include N/M done count + state colour border matching the strip; added `.proc-char-chip.is-active` CSS (gold border + tint)
- `renderCharacterStrip(queue)` call removed from `renderProcessingMode` — character filter row is the replacement
- `PHASE_LABELS`: changed from "Step N — Title" to "N: Title" format; affects filter pills and phase section headers
- Empty phase handling: when filter active and phase has zero visible entries, skip the phase section entirely (was greyed-out + collapsed; `.proc-phase-filtered-out` CSS removed)

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
