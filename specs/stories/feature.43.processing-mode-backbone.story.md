# Story feature.43: Downtime Processing Mode — Backbone

## Status: done

## Story

**As an** ST processing a downtime cycle,
**I want** a Processing Mode view on the downtime admin tab that shows all actions across all submissions sorted by processing priority,
**so that** I can work through the methodology in the correct order without jumping between individual character submissions.

## Background

The existing downtime admin tab is character-centric: open one submission, work through it, close it. The ST methodology is action-type-centric: process all ambience projects across all characters first, then all global effects, then defensive, etc. This story builds the backbone of Processing Mode — the container, the phase sections, the cross-character queue, and the two shared data structures used by every subsequent phase story:

1. **Per-action ST notes thread** — attributed to the logged-in ST (Discord identity), timestamped, append-only. Replaces the single `st_note` string on each project and merit action.
2. **Per-action pool validation state** — player's submitted pool (read-only) vs ST validated pool (editable), with a `Pending / Validated / No Roll Needed` status per action.

This story does **not** implement rolling or the sorcery queue (feature.44). It delivers the view and the infrastructure.

---

## Acceptance Criteria

1. A "Processing" toggle/tab appears in the downtime admin tab header alongside the existing submission list view.
2. Switching to Processing Mode renders a phase-ordered queue of all actions from all submissions in the selected cycle.
3. Phase sections appear in this order (sections with no actions are hidden):
   - **Resolve First** — sorcery/ritual actions (all characters)
   - **Feeding** — all feeding submissions
   - **Ambience** — `ambience_increase` and `ambience_decrease` actions
   - **Defensive** — `hide_protect` actions
   - **Investigative** — `investigate` actions
   - **Hostile** — `attack` actions
   - **Support & Patrol** — `patrol_scout` and `support` actions
   - **Miscellaneous** — `misc`, `xp_spend`, and unrecognised types
   - **Sphere Actions** — `block`, `rumour`, `grow`, `acquisition` from merit actions
   - **Allies & Status Actions** — ally/status merit actions
   - **Contacts Actions** — contact merit actions
   - **Resources & Retainers** — resource/retainer actions
4. Within each phase section, actions are sorted alphabetically by character name.
5. Each action row shows: character name, action label, player's submitted description (truncated to ~80 chars, expandable).
6. Clicking an action row expands it to show the full action detail panel (see AC 9–13).
7. A "character name" link in the expanded panel opens the existing per-character submission view for that character.
8. The per-character submission view remains fully functional and unchanged.

### Per-action detail panel (AC 9–13)

9. **Player's submitted pool** — read-only display of what the player submitted (`responses.project_N_pool_expr` or manually constructed label from `_feed_method` / `_feed_disc` for feeding).
10. **ST validated pool** — editable text field. Saved on blur to the submission document.
11. **Validation status** — three-button toggle: `Pending` / `Validated` / `No Roll Needed`. Saved immediately on click. Default: `Pending`.
12. **ST notes thread** — append-only list of attributed notes. Each entry shows: `[ST Name]  HH:MM  note text`. A text input + "Add Note" button appends a new entry attributed to `getUser().global_name || getUser().username`. Notes are ST-only (never shown to players).
13. **Player feedback field** — a separate single-line text input. This is the player-visible comment on the pool decision (e.g. "Pool corrected — Obfuscate applies here, not Auspex"). Saved on blur.

---

## Data Model Changes

### New fields on `projects_resolved[idx]`

Add to the existing structure (which already has `action_type`, `pool`, `roll`, `st_note`, `resolved_at`):

```js
{
  // existing
  action_type: string,
  pool: object,
  roll: object | null,
  st_note: string,        // legacy — keep for backwards compat, not shown in new UI
  resolved_at: string,

  // new
  pool_player: string,    // player's submitted pool expression (copied from responses at first save)
  pool_validated: string, // ST's confirmed pool expression
  pool_status: 'pending' | 'validated' | 'no_roll',
  notes_thread: [{ author_id, author_name, text, created_at }],
  player_feedback: string,
}
```

### New fields on `merit_actions_resolved[idx]`

Same additions: `pool_player`, `pool_validated`, `pool_status`, `notes_thread`, `player_feedback`.

### New fields on submission document (top level)

```js
feeding_review: {
  pool_player: string,    // player's submitted feed method + disc
  pool_validated: string,
  pool_status: 'pending' | 'validated' | 'no_roll',
  notes_thread: [{ author_id, author_name, text, created_at }],
  player_feedback: string,
}
```

The sorcery section review state lives on the cycle document and is covered in feature.44.

---

## Tasks / Subtasks

- [ ] Task 1: Processing Mode toggle and container (AC: 1, 2)
  - [ ] Add "Processing" button to the DT tab toolbar (alongside existing buttons)
  - [ ] Toggle state: `processingMode = false` by default; clicking toggles and re-renders the main content area
  - [ ] In processing mode, hide the existing submission list; render the phase queue
  - [ ] In normal mode, hide the phase queue; show existing submission list

- [ ] Task 2: Action aggregation and phase sorting (AC: 3, 4, 5)
  - [ ] Write `buildProcessingQueue(submissions)` — iterates all submissions for the selected cycle, extracts each action, tags it with `{ charName, subId, phase, actionIdx, actionType, label, description }`
  - [ ] Phase assignment logic:
    - Sorcery slots (`responses.sorcery_N_rite` present) → `resolve_first`
    - Feeding section → `feeding`
    - Project `action_type` → map to phase using `PHASE_ORDER` constant
    - Merit actions by merit category → `allies`, `contacts`, `resources_retainers`
  - [ ] Define `PHASE_ORDER` map:
    ```js
    const PHASE_ORDER = {
      resolve_first: 0,
      feeding: 1,
      ambience_increase: 2, ambience_decrease: 2,
      hide_protect: 3,
      investigate: 4,
      attack: 5,
      patrol_scout: 6, support: 6,
      misc: 7, xp_spend: 7,
      block: 8, rumour: 8, grow: 8, acquisition: 8,
      allies: 9,
      contacts: 10,
      resources_retainers: 11,
    };
    ```
  - [ ] Sort queue by phase number, then character name within phase
  - [ ] Render phase sections; skip sections with zero actions

- [ ] Task 3: Expanded action detail panel (AC: 6, 7, 9–13)
  - [ ] Click-to-expand rows (toggle `expanded` state; only one expanded at a time or multiple — pick one)
  - [ ] Render player's submitted pool (read from submission responses)
  - [ ] Render ST validated pool (editable input, save on blur via `updateSubmission`)
  - [ ] Render validation status toggle (three buttons, save on click)
  - [ ] Render notes thread (list of attributed entries + add-note input)
  - [ ] Render player feedback input (save on blur)
  - [ ] "Open full submission" link — scrolls to or opens character submission in normal mode

- [ ] Task 4: Notes thread save (AC: 12)
  - [ ] On "Add Note" click: read current user via `getUser()`, build note entry `{ author_id: user.id, author_name: user.global_name || user.username, text, created_at: new Date().toISOString() }`
  - [ ] Append to the action's `notes_thread` array on the submission document via `updateSubmission`
  - [ ] Re-render thread immediately (optimistic update)

- [ ] Task 5: ST can re-tag an action's type (AC: implied by design)
  - [ ] In the expanded panel, add a small "Re-tag" dropdown showing all `action_type` values
  - [ ] Changing it updates `projects_resolved[idx].action_type` (or the relevant field) and moves the action to the correct phase section on next render

- [ ] Task 6: Processing mode respects existing cycle selection (AC: implied)
  - [ ] Processing mode uses the same `selectedCycleId` and `submissions` state as the existing view
  - [ ] Cycle selector, status badge, and deadline editor remain visible in processing mode

---

## Dev Notes

### Key files

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | Add processing mode toggle, `buildProcessingQueue()`, phase section render, expanded panel render, notes thread save |

### getUser() for attribution

```js
import { getUser } from '../auth/discord.js';
const user = getUser();
const authorName = user?.global_name || user?.username || 'ST';
```

### Schema validation

The new fields (`notes_thread`, `pool_validated`, `pool_status`, `player_feedback`, `feeding_review`) are nested inside `projects_resolved`, `merit_actions_resolved`, and `feeding_review` which are either not schema-validated or use `additionalProperties: false` only at the top level. Verify that the submission schema allows these new sub-fields. If not, add them to `server/schemas/downtime_submission.schema.js`.

### Backwards compatibility

The existing `st_note` field on `projects_resolved` remains in place. The processing mode UI reads from and writes to `notes_thread`; the existing per-character submission view continues to show `st_note` unchanged. Do not migrate old data.

### What this story does NOT build

- Rolling in the processing queue (later stories)
- Sorcery reminder notes (feature.44)
- Feeding-specific pool calculation (feature.45)
- Ambience dashboard (feature.47)

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Claude (SM) |

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- `getUser` import added to `downtime-views.js` for ST note attribution.
- `processingMode` flag and `procExpandedKey` added as module-level state.
- `PHASE_ORDER`, `PHASE_LABELS`, `PHASE_NUM_TO_LABEL`, `ACTION_TYPE_LABELS`, `ALL_ACTION_TYPES` constants defined.
- "Processing" button added to toolbar in `buildShell()`. Wired in `initDowntimeView()`.
- `renderSubmissions()` now delegates to `renderProcessingMode()` when `processingMode` is true.
- `loadCycleById()` resets `procExpandedKey` on cycle switch and keeps processing btn state in sync.
- `buildProcessingQueue(subs)`: aggregates sorcery, feeding, projects, sphere actions, contacts, retainers into tagged queue entries. Contacts and retainers use flat `merit_actions_resolved` index (matching existing per-character panel logic).
- `getEntryReview(entry)` / `saveEntryReview(entry, patch)`: read/write per-action review objects on the submission document via `updateSubmission`.
- `renderProcessingMode(container)`: groups queue by phase, renders collapsed rows with char/label/desc/status columns, wires all click/blur/change handlers.
- `renderActionPanel(entry, review)`: renders expanded detail — player pool (read-only), ST validated pool (editable), validation status toggle, player feedback, ST notes thread with add-note, re-tag dropdown (projects only), open-submission link.
- Schema check: `resolvedAction` definition uses `additionalProperties: true`, so new fields (`pool_player`, `pool_validated`, `pool_status`, `notes_thread`, `player_feedback`) and top-level `feeding_review` do not require schema changes.
- Processing mode does not reset when switching cycles; `procExpandedKey` resets to avoid stale expansion.
- Task 5 (re-tag) implemented for project actions only; saves `action_type` to `projects_resolved[idx]`.
- Task 6 (cycle selection respects processing mode): yes, queue is rebuilt from current `submissions` on each render.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
