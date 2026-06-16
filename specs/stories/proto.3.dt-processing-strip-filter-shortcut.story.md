# Story proto.3: DT Processing — Character Strip Filter Shortcut

Status: review

## Story

As an ST,
I want to click a square in the character status strip to instantly filter the queue to that character and phase,
so that I can jump straight into processing one character's specific action type without manually selecting pills.

## Acceptance Criteria

1. Each square in the character strip is clickable and carries two data attributes: the character name and the phase key it represents.
2. Clicking a square **replaces** the current filter state entirely: sets `_procFilters.chars` to `{ charName }` and `_procFilters.phases` to `{ phaseKey }`, clears statuses and territories, then re-renders.
3. After a strip-click re-render, the filter bar pills visually reflect the active state (the character pill and phase pill for that combination are highlighted).
4. Clicking "Clear all" in the filter bar returns to the unfiltered view normally.
5. Smoke test: click a strip square → queue narrows to that character's actions in that phase; filter bar shows two active pills; Clear all restores full view.

## Tasks / Subtasks

- [x] Audit `renderCharacterStrip` to understand current square markup (AC: 1)
  - [x] Find `renderCharacterStrip` in `downtime-views.js`
  - [x] Identify what each clickable element currently does (scroll / jump)
  - [x] Note the existing data attributes on each square element

- [x] Add filter data attributes to strip squares (AC: 1)
  - [x] Ensure each square element has `data-strip-char="<charName>"` and `data-strip-phase="<phaseKey>"`
  - [x] Do not remove existing navigation behaviour if it coexists cleanly; if it conflicts, replace with filter behaviour (filter is the primary action from this story onward)

- [x] Wire strip square clicks in the container event delegation block (AC: 2)
  - [x] In the existing `container.addEventListener('click', ...)` block, add a case for `.closest('[data-strip-char]')`
  - [x] On match: reset all four sets; set `_procFilters.chars = new Set([btn.dataset.stripChar])`; set `_procFilters.phases = new Set([btn.dataset.stripPhase])`; call `renderProcessingMode(container)`

- [x] Verify filter bar reflects strip-click state (AC: 3)
  - [x] No extra code needed if proto.2 is complete — `renderProcFilterBar` already reads `_procFilters` to set `is-active`; confirm this works after a strip click

- [x] Smoke test on proto (AC: 5)
  - [x] Open `http://localhost:8080/dt-proto.html`, navigate to Processing tab
  - [x] Click a strip square → queue narrows; filter bar shows character pill + phase pill active
  - [x] Click Clear all → full queue restored

## Dev Notes

### Depends on
- proto.1: `_procFilters` state, `renderProcessingMode` filter wiring
- proto.2: filter bar UI with active pill rendering and Clear all

### Key file
- `public/js/admin/downtime-views.js` only

### Step 1 is mandatory
Read `renderCharacterStrip` in full before writing any code. The current implementation determines what data attributes already exist and whether any scroll/jump logic needs to be removed or preserved. Do not guess.

### Replace, not add
Strip click must **replace** the full filter state, not toggle or add to it. The intent is "show me exactly this character in exactly this phase" — not "add this character to whatever is already selected."

### phaseKey on strip squares
The character strip currently groups by character, not by phase. Each "square" may represent a phase slot. Confirm during the audit (Step 1) what phase information is available per square — if `entry.phase` is not already on the square, it will need to be passed through `renderCharacterStrip`.

### No changes to filter bar logic
The filter bar pill wiring from proto.2 handles Clear all and per-pill toggles. This story only adds a new way to **set** the filter state — it does not change how the filter bar renders or how pills work.

### No changes to admin.js or app.js

### References
- `renderCharacterStrip`: search `downtime-views.js` for `function renderCharacterStrip`
- `_procFilters`: defined in proto.1
- Filter bar clear handler: defined in proto.2
- Container click delegation: `downtime-views.js`, search for `container.addEventListener('click'`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- **Audit finding**: `renderCharacterStrip` still exists but is not called from `renderProcessingMode` — it was replaced by the filter bar's Character chip row in proto.2. The character chips in `renderProcFilterBar` are the "strip squares" for this story.
- **Strip data attributes**: Added `data-strip-char` and `data-strip-phase` to character chips in `renderProcFilterBar`. `stripPhase` is the `phase` field of the first pending (non-DONE) entry for that character — the "most urgent" phase for each char. Chips with no pending entries get no `data-strip-phase` attribute.
- **Replace handler**: Modified the filter pill click handler: chips with `data-strip-char` use replace-not-toggle (resets all four `_procFilters` sets, sets chars to the single clicked char, phases to the first-pending phase). All other pills (Status, Phase, Territory rows) continue to use toggle behaviour.
- **AC3 confirmed**: No extra code needed — `renderProcFilterBar` already reads `_procFilters` on re-render to set `is-active` classes, so the character pill and phase pill both highlight correctly after a strip click.
- **Existing scroll handler preserved**: The `.proc-char-chip` click handler at line 4693 checks for `data-sub-id`; filter bar chips don't have that attribute so `jumpEntry` is null and the handler returns early — no interference.
- Parse verified clean (`node --input-type=module --check`).

### File List

- `public/js/admin/downtime-views.js`
