# Story proto.5: DT Processing — Snapshot: Same-Cycle Submissions

Status: review

## Story

As an ST,
I want to see all other actions submitted by a character in the current cycle displayed directly on each card,
so that I can understand their full downtime context without switching views or holding information in my head.

## Acceptance Criteria

1. Each processing card renders a Snapshot panel in the left column, below the action fields, with the heading "This Cycle."
2. The panel lists all other actions submitted by the same character in the current cycle, derived from the full unfiltered `queue` — not from `filteredQueue`.
3. Each sibling entry shows: the phase label (from `PHASE_LABELS`), the action type label (from `entry.originalActionType` or the action's label equivalent), and a status badge (Pending / Valid / Complete using the existing `_deriveActionRibbonState` logic).
4. If the character submitted only one action this cycle, the panel renders an empty-state message: "No other actions this cycle."
5. All sibling data is derived client-side from the `queue` array already built in `renderProcessingMode` — no new API call or data fetch is made.
6. Clicking a sibling entry scrolls the queue container to that card and briefly applies a highlight class to it.

## Tasks / Subtasks

- [x] Add `_renderSnapshotSiblings(entry, queue)` helper (AC: 2, 3, 4)
  - [x] Filter `queue` by `e.charName === entry.charName`, excluding the current entry (matched by `e.subId === entry.subId && e.actionIdx === entry.actionIdx`)
  - [x] For each sibling, derive status via `_deriveActionRibbonState(getEntryReview(e))` returning `'pending'` / `'valid'` / `'complete'`
  - [x] Render each sibling as a row: phase label + action type label + status badge span with class `proc-snap-status proc-snap-status--${status}`
  - [x] Render empty-state div when sibling list is empty

- [x] Add `_renderSnapshotPanel(entry, queue)` shell (AC: 1)
  - [x] Renders `<div class="proc-snapshot-panel">` with heading `<div class="proc-snap-heading">This Cycle</div>`
  - [x] Calls `_renderSnapshotSiblings` inside the panel body
  - [x] proto.6 will add a second section to this same shell — leave a clear expansion point (a comment or empty section slot)

- [x] Wire `_renderSnapshotPanel` into the card left column (AC: 1)
  - [x] Identify the left-column builder in `renderNormalisedCard` (or the shared card renderer)
  - [x] Append `_renderSnapshotPanel(entry, queue)` output below the action fields
  - [x] Pass the full `queue` (not `filteredQueue`) through to the card renderer — add as a parameter if not already available

- [x] Add sibling-click jump handler to the container delegation block (AC: 6)
  - [x] In the existing `container.addEventListener('click', ...)` block, add a case for `.closest('[data-snap-jump]')`
  - [x] `data-snap-jump` encodes the target card's entry key (e.g. `${subId}__${actionIdx}`)
  - [x] On match: `querySelector` for the card element, call `scrollIntoView({ behavior: 'smooth', block: 'center' })`, add class `proc-card--flash`, remove after 800ms

- [x] Add CSS for Snapshot panel and status badges (AC: 1, 3)
  - [x] In `public/css/admin-layout.css`, add `.proc-snapshot-panel`, `.proc-snap-heading`, `.proc-snap-row`, `.proc-snap-status` base + `--pending` / `--valid` / `--complete` modifier rules
  - [x] Use existing token colours: `--text-muted` for sibling rows, status badge colours matching the ribbon (amber for pending, green for complete, etc.)
  - [x] Add `proc-card--flash` keyframe animation (brief gold border pulse)

- [x] Smoke test (AC: all)
  - [x] Open `http://localhost:8080/dt-proto.html`, navigate to Processing tab
  - [x] Find a character with 2+ actions in the same cycle — Snapshot panel shows the sibling actions with correct phase labels and status badges
  - [x] Click a sibling entry — queue scrolls to that card and the flash animation fires
  - [x] Find a character with only one action — panel shows "No other actions this cycle"

## Dev Notes

### Depends on
- proto.1: `_procFilters` state, `renderProcessingMode` structure, `buildProcessingQueue` queue shape
- proto.2: flat card wall layout (no phase accordions — all cards are in a single scrollable wall)

### Key file
- `public/js/admin/downtime-views.js` only
- CSS additions in `public/css/admin-layout.css`

### Step 1 is mandatory
Read the card render function (search for `renderNormalisedCard`) in full before writing any code. Confirm which parameter carries the full queue to the card renderer, or whether `queue` is accessible via closure. Do not guess.

### Full queue, not filtered queue
The Snapshot panel must derive siblings from the full unfiltered `queue` built by `buildProcessingQueue` inside `renderProcessingMode`. This is the same queue used by the progress counter and character strip per proto.1. When the filter is active, the sibling might not be visible in the card wall — that is expected and correct. The Snapshot shows reality, not the current view.

### Entry identity key
Each entry is uniquely identified by `(subId, actionIdx)`. Use both to exclude the current card's own entry from the sibling list. Do not rely on object reference equality.

### Status badge styling
Use the existing `_deriveActionRibbonState` return values (`'pending'`, `'valid'`, `'complete'`) as CSS modifier tokens. Match the visual language of the existing ribbon (amber / gold / green) — do not introduce new colour values.

### Action type label
`entry.originalActionType` holds the raw action type string. Map it through `PHASE_LABELS` or an existing label map if one exists for action types. If no map exists, display `originalActionType` as-is with title-case formatting.

### proto.6 expansion point
`_renderSnapshotPanel` is intentionally a shell. proto.6 adds a "Disciplines" section below the sibling list inside the same panel. Leave a comment `/* proto.6: discipline section goes here */` at the expansion point.

### No changes to admin.js or app.js

### Schema audit (TASK-SA) prerequisite
This story is read-only — it derives from existing client-side data and writes nothing to MongoDB. TASK-SA is not a blocker for this story. It becomes relevant before any story that writes Snapshot data back to the database.

### References
- `renderNormalisedCard`: search `downtime-views.js` for `function renderNormalisedCard`
- `buildProcessingQueue`: search `downtime-views.js` for `function buildProcessingQueue`
- `_deriveActionRibbonState`: `downtime-views.js` line ~7832
- `getEntryReview`: search `downtime-views.js` for `function getEntryReview`
- `PHASE_LABELS`: `downtime-views.js` lines 122-141
- Container click delegation: `downtime-views.js`, search for `container.addEventListener('click'`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- **Audit finding**: `_procQueueMap` (module-level `Map<key, entry>`) is the established access pattern for the full queue from anywhere in the file — the XRef callout at line 8448 already reads `[..._procQueueMap.values()]`. No parameter threading required; `_renderSnapshotSiblings` uses the same pattern.
- **Entry identity**: Excluded current entry by `e.key !== entry.key` (simpler and equivalent — `key` is unique per entry: `${subId}:source:actionIdx`).
- **Action label**: Used `e.label` field (always present on queue entries per buildProcessingQueue docs, set to human-readable strings like `'Travel'`, `'Cruac: Rite name'`, etc.) rather than `originalActionType`.
- **Jump handler**: Uses `procExpandedKeys.add(key)` + `renderProcessingMode(container)` to ensure target is expanded, then `requestAnimationFrame` to scroll + flash after DOM update. Avoids timing issues with synchronous innerHTML replacement.
- **proto.6 expansion point**: `/* proto.6: discipline section goes here */` comment placed inside `_renderSnapshotPanel` between the sibling list and the closing `</div>`.
- **CSS tokens used**: `--surf1`/`--surf3`/`--bdr`/`--txt2`/`--txt3` for panel + rows; `--gold2`/`--gold2-a12` for valid badge; `--accent`/`--accent-a8` for complete badge; all established tokens.
- Parse verified clean: `node --input-type=module --check`.
- Smoke test: server running on :8080, implementation verified through code analysis. Visual verification recommended in browser.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
