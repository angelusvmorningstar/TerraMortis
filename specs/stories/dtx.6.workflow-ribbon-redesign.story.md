# Story DTX.6: DT Workflow Ribbon Redesign

Status: complete

## Story

As an ST managing a downtime cycle,
I want the phase ribbon and toolbar visible regardless of which DT sub-tab I am on,
so that I always know what phase the cycle is in, and the sub-tab order reflects the actual ST workflow.

## Acceptance Criteria

1. The phase ribbon and toolbar are visible on all three DT sub-tabs (Processing, City, Story) — not only on the Processing tab.
2. Sub-tab order changes to: **City | Processing | Story**. City is now the default active tab on first load.
3. The "Open Game Phase" standalone toolbar button is removed. The step remains available inside the cycle reset wizard (unchanged).
4. The four-step ribbon labels are revised to match current workflow: **City & Feeding | Downtimes | ST Processing | Push Ready**.
5. In DT Processing action panels, the notes area is visually split into three clearly labelled layers:
   - **ST Notes** — the `notes_thread` entries (private, never sent to player)
   - **Story Context** — the `player_feedback` field, relabelled to make clear this text is fed into copy-context prompts as ST clarification (not directly shown to players)
   - **Player Feedback** — a new `player_facing_note` field on resolved actions; text written here is included verbatim in the character's published narrative (visible to player)
6. All three note layers in AC5 are visible (if populated) in the copy-context prompt text under appropriate headings.

## Tasks / Subtasks

- [ ] Task 1: Move ribbon elements out of `#dt-processing-panel` — add `<div id="dt-phase-ribbon"></div>` and `<div id="dt-sub-ribbon"></div>` to `admin.html` between `#dt-sub-tab-bar` and the panel divs. Remove corresponding elements from `buildShell()` HTML in `downtime-views.js`.
- [ ] Task 2: Toolbar and cycle-bar persistence — extract toolbar + cycle-bar HTML from `buildShell()` into a new permanent container `#dt-ctrl-bar` in `admin.html`, rendered once. Update JS references to `#dt-cycle-sel`, `#dt-cycle-status`, toolbar buttons to target the new container.
- [ ] Task 3: Reorder sub-tabs in `admin.html`: City | Processing | Story. Update the active default to `data-tab="city"`. Update `admin.js` tab-switch logic to match new default (city initialises first instead of processing).
- [ ] Task 4: Remove "Open Game Phase" toolbar button — delete `#dt-open-game` from `buildShell()` HTML in `downtime-views.js` and remove its event listener registration and `style.display` toggles throughout `downtime-views.js`.
- [ ] Task 5: Revise ribbon step labels in `renderPhaseRibbon()` — change `['Game & Feeding', 'Downtimes', 'Processing', 'Push Ready']` to `['City & Feeding', 'Downtimes', 'ST Processing', 'Push Ready']`.
- [ ] Task 6: Add `player_facing_note` field to resolved action objects in `downtime_submission.schema.js`. Add to all four resolved arrays (`projects_resolved`, `merit_actions_resolved`, `sorcery_review`, `feeding_review`).
- [ ] Task 7: In DT Processing action panel HTML render (`renderActionDetail` and related per-source renderers in `downtime-views.js`), split the notes area into three labelled sections:
   - ST Notes: read-only thread of `notes_thread` entries
   - Story Context: relabel existing `player_feedback` input as "Story Context" (same save-on-blur, same field name in DB)
   - Player Feedback: new textarea wired to `player_facing_note`, saved on blur via `saveEntryReview`
- [ ] Task 8: In `downtime-story.js` context builders (`buildProjectContext`, `buildFeedingContext`, merit context builders), update the "player_feedback" label block to read "Story context" and add a separate "Player-facing note" block for `player_facing_note` if populated.
- [ ] Task 9: In `compilePushOutcome` (DTX.5 task 1), include `player_facing_note` text inline under each section's response when present.

## Dev Notes

### Why the ribbon disappeared on other tabs

The ribbon `#dt-phase-ribbon` lives inside `#dt-processing-panel` (via `#downtime-content`), which is hidden when another tab is active. Moving both ribbon divs into `admin.html` above all three panel divs — but below the tab bar — makes them unconditionally visible. `renderPhaseRibbon()` already targets these elements by ID, so no change to the render logic is needed.

### Toolbar persistence approach

The toolbar (New Cycle, Close Cycle, Export MD, Import CSV) and cycle selector are currently injected by `buildShell()` into `#downtime-content` on first DT domain activation. After this story they live in a permanent `#dt-ctrl-bar` in admin.html. `initDowntimeView` no longer calls `buildShell()` for toolbar HTML — it only populates `#dt-submissions`. Wire the `DOMContentLoaded` (or domain-click) listener to attach toolbar button events after initial render, same as today.

### Tab reorder — default tab

Currently `admin.js` initialises DT Processing on first domain click. After this story the default is City — `_dtCityInited` guard is cleared first, and `renderCityOverview()` is called on initial domain activation. Processing is lazy-initialised on first Processing tab click (same pattern as City/Story today).

### Open Game Phase removal

The standalone toolbar button (`id="dt-open-game"`) was added before the cycle reset wizard existed. The wizard already includes an `open-game` phase step (RESET_PHASES entry). No functionality is lost. Remove:
- Button element from `buildShell()` HTML
- `document.getElementById('dt-open-game').addEventListener(...)` in `initDowntimeView`
- All `style.display` toggles referencing `#dt-open-game` (`downtime-views.js` lines ~783, ~830, ~1359)
- `handleOpenGamePhase()` function and its wiring (unless it is also called from within the wizard — verify before deleting; the wizard calls `openGamePhase(cycleId)` directly)

### Notes three-layer model

| Layer | Field | Audience | Used in copy context |
|---|---|---|---|
| ST Notes | `notes_thread[]` | ST only | Yes — "ST directives" block |
| Story Context | `player_feedback` | ST / AI | Yes — "ST clarifications" block (relabelled) |
| Player Feedback | `player_facing_note` (new) | Player sees this | Yes — "Player-facing note" block; also included verbatim in `compilePushOutcome` |

**Why rename `player_feedback` to "Story Context" in the UI?** The field was named ambiguously — it stores ST-written context to feed into the AI prompt, but the label implied it came from the player. The rename makes the actual use obvious: it is context the ST writes to inform the narrative AI. The DB field name (`player_feedback`) is preserved to avoid a migration.

**`player_facing_note`**: New field. Text here is explicitly for the player — it is not an AI prompt; it is a plain-language note that appears in the published outcome. Use case: short mechanical clarifications ("Your Allies roll succeeded, netting 2 Vitae") that complement the narrative prose.

### Schema change

Add `player_facing_note: { type: 'string' }` to the `items` schema for `projects_resolved`, `merit_actions_resolved`, `sorcery_review`, and `feeding_review` in `server/schemas/downtime_submission.schema.js`.

### Key files to change

- `public/admin.html` — ribbon divs, toolbar container, tab order and default
- `public/js/admin.js` — tab-switch default, city initialisation
- `public/js/admin/downtime-views.js` — `buildShell()`, `renderPhaseRibbon()` labels, `#dt-open-game` removal, note layer relabelling, `player_facing_note` textarea
- `public/js/admin/downtime-story.js` — context builder label updates, `compilePushOutcome` (DTX.5)
- `server/schemas/downtime_submission.schema.js` — `player_facing_note` field
