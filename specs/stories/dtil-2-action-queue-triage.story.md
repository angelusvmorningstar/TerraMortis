---
id: dtil.2
epic: dtil
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTIL-2: Action Queue per-item triage state machine

As a Storyteller scanning every player highlight in the cycle to decide what needs follow-up,
I should have an Action Queue panel that lists every highlight across every submission with a per-item triage state (Unread / Acknowledged / Action Needed / Resolved / Ignored), per-item one-line ST notes, and a state filter,
So that I can sweep the cycle's highlights once, mark each one with what I plan to do about it, and return to the Action Needed items as a focused work list during processing.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 4 (DT Intelligence Layer):

> **DTP4.2** — Action Queue per-item triage. State machine over highlights: Unread / Acknowledged / Action Needed / Resolved / Ignored. Per-item one-line ST note. Filter by state. Persisted on `cycle.action_queue_state` keyed by `${submission_id}:${slot_index}`.

The Action Queue surfaces **every** game-highlight slot from every submission as an individually-triagable item. Each item gets:
- A state from the five-value enum: `unread | acknowledged | action_needed | resolved | ignored`
- A one-line ST note (free text, ~140 chars)

Persistence shape:
```js
cycle.action_queue_state = {
  '<sub_id>:0': { state: 'action_needed', note: 'Follow up Bertram about the artefact' },
  '<sub_id>:1': { state: 'unread', note: '' },
  // ...
}
```

Default state: `unread` (no entry in the map). DTIL-3 layers on top: items with `mechanical_flag_N === true` default to `action_needed` instead of `unread` on first read.

The panel sits alongside Court Pulse in DT Processing. State filter is a pill row at the top: All / Unread / Action Needed / Acknowledged / Resolved / Ignored. Clicking a state filters the visible rows.

### Files in scope

- `public/js/admin/downtime-views.js` — DT Processing tab: new `renderActionQueuePanel(cycle, submissions, characters)` panel, with state-filter pills, per-item rows, state-toggle and note-edit handlers.
- `public/css/admin-layout.css` — styles for the Action Queue panel.

### Out of scope

- Auto-state derivation from `mechanical_flag_N` (DTIL-3's territory).
- Cross-cycle state persistence (e.g. an Action Needed item in DT3 staying flagged in DT4). Memory explicitly defers this:
  > Open call: cross-cycle persistence of Action Queue items (Action Needed in cycle N still showing in cycle N+1). Deferred — "revisit when it bites".
- Bulk state transitions ("mark all visible as Acknowledged"). One item at a time in v1.
- Multi-line ST notes per item. v1 is one-line; if STs need more, append to the per-submission ST notes thread.
- Sorting beyond the default (most-recent submission first, then by slot index).
- Linking an Action Queue item to a project/merit action for cross-reference. v1 stays focused on highlights.
- Player-side visibility of triage state. ST-only.
- Auto-resolve when the item's text is edited by the player after triage. v1 ignores text changes; the ST re-reads if needed.

---

## Acceptance Criteria

### Panel placement and visibility

**Given** I am an ST on the DT Processing tab for the active cycle
**Then** I see an "**Action Queue**" panel near the Court Pulse panel (or in a logical adjacent position).
**And** the panel renders for any cycle status (prep, game, active, closed) — STs may want to triage as soon as highlights start arriving.

**Given** there are zero non-empty highlights across all submissions
**Then** the panel shows a placeholder: "*No highlights to triage yet.*"

### Item rows

**Given** at least one highlight exists
**Then** the panel renders one row per non-empty `game_recount_N` field across all submissions.
**And** each row contains:
- The character display name (with link/click to navigate to that submission in DT Processing).
- The slot index (e.g. "Highlight 2").
- The highlight text (truncated to ~120 characters with full-text on hover or expand).
- A state pill showing the current state (default Unread when no entry exists).
- A small note input (text, ~140 char max) pre-filled with any saved note for this item.

**Given** a row's text is truncated
**Then** clicking the row (or a dedicated expand affordance) reveals the full text inline.

### State filter

**Given** the panel renders
**Then** at the top, a row of state-filter pills shows: **All / Unread / Action Needed / Acknowledged / Resolved / Ignored**.
**And** the count of items in each state is shown next to the pill (e.g. "Action Needed (4)").

**Given** I click a filter pill
**Then** only items in that state are visible.
**And** clicking "All" clears the filter.
**And** the active filter pill is visually highlighted.

### State transitions

**Given** an item row
**Then** clicking the state pill cycles to the next state (Unread → Acknowledged → Action Needed → Resolved → Ignored → Unread), or opens a small dropdown of all five options.
**Choose at implementation:** dropdown is more discoverable, cycle is faster. Recommended: dropdown.

**Given** I select a new state
**Then** `cycle.action_queue_state['<sub_id>:<slot_idx>']` is updated with `{ state: '<new_state>', note: '<existing note>' }`.
**And** the row re-renders with the new state pill.
**And** if a state filter is active, the row may disappear from view (filtered out).

### Note editing

**Given** I type into an item's note input
**Then** on blur (or after a short debounce), the note is saved to the item's `note` field on `action_queue_state`.

**Given** I save a note for an item with no triage state set yet
**Then** the item's state defaults to `unread` (or whatever the no-entry default is) — saving a note alone does not transition state.

### Persistence

**Given** I make any state or note change
**Then** the change persists to `cycle.action_queue_state` via PUT `/api/downtime_cycles/:id`.

**Given** I reload the page
**Then** all state and note values persist.

### Default state

**Given** an item has no entry in `cycle.action_queue_state`
**Then** its rendered state is **Unread** (default for unhandled items).
**And** its note input is empty.

### Ordering

**Given** multiple items are visible
**Then** they sort by:
1. Submission's `submitted_at` descending (most recent first).
2. Within a submission, slot index ascending (1, 2, 3...).

(Alphabetical by character name is a reasonable alternative; the dev can pick whichever feels right at implementation.)

### Visibility / role

**Given** I am authenticated as a player
**Then** the panel is **not** visible (DT Processing is ST-only).

### British English / no em-dashes

**Given** any new copy
**Then** it follows project conventions.

---

## Implementation Notes

### Item key format

`${sub_id}:${slot_index}` where slot_index is 0-based corresponding to `game_recount_${slot_index + 1}`. So item key for Highlight 1 of submission abc is `abc:0`.

### Render

```js
function renderActionQueuePanel(cycle, submissions, characters) {
  const charById = new Map(characters.map(c => [String(c._id), c]));
  const stateMap = cycle.action_queue_state || {};

  // Build item list
  const items = [];
  for (const sub of submissions) {
    for (let n = 1; n <= 5; n++) {
      const text = (sub.responses?.[`game_recount_${n}`] || '').trim();
      if (!text) continue;
      const key = `${sub._id}:${n - 1}`;
      const entry = stateMap[key] || {};
      items.push({
        key,
        sub_id: sub._id,
        slot_idx: n - 1,
        slot_n: n,
        text,
        state: entry.state || 'unread',
        note: entry.note || '',
        char: charById.get(String(sub.character_id)),
        submitted_at: sub.submitted_at || sub.created_at || '',
      });
    }
  }

  // Sort: most-recent submission first, then slot
  items.sort((a, b) => {
    const t = (b.submitted_at || '').localeCompare(a.submitted_at || '');
    if (t !== 0) return t;
    return a.slot_idx - b.slot_idx;
  });

  // Counts per state
  const counts = { all: items.length, unread: 0, acknowledged: 0, action_needed: 0, resolved: 0, ignored: 0 };
  for (const it of items) counts[it.state]++;

  // Render filter pills + rows
  // ...
}
```

### State-filter pills

Track active filter in a local state (could be a module-level `let _actionQueueFilter = 'all';`). Re-render the panel when filter changes. Or use CSS to show/hide rows by adding a class to the panel (`.dt-action-queue-panel.filter-action-needed .dt-action-queue-row:not(.state-action-needed) { display: none; }`).

### State dropdown

```html
<select class="dt-action-queue-state-select" data-key="${key}">
  <option value="unread"${state === 'unread' ? ' selected' : ''}>Unread</option>
  <option value="acknowledged"${state === 'acknowledged' ? ' selected' : ''}>Acknowledged</option>
  <option value="action_needed"${state === 'action_needed' ? ' selected' : ''}>Action Needed</option>
  <option value="resolved"${state === 'resolved' ? ' selected' : ''}>Resolved</option>
  <option value="ignored"${state === 'ignored' ? ' selected' : ''}>Ignored</option>
</select>
```

Change handler:

```js
async function setActionQueueState(key, newState, currentNote) {
  const newMap = { ...(cycle.action_queue_state || {}) };
  newMap[key] = { state: newState, note: currentNote };
  await updateCycle(cycle._id, { action_queue_state: newMap });
  cycle.action_queue_state = newMap;
  // re-render panel
}
```

### Note input

```html
<input type="text" class="dt-action-queue-note-input" data-key="${key}" value="${esc(note)}" maxlength="140" placeholder="ST note…">
```

Debounced save on input or save on blur:

```js
input.addEventListener('blur', async () => {
  const key = input.dataset.key;
  const stateMap = cycle.action_queue_state || {};
  const current = stateMap[key] || { state: 'unread', note: '' };
  if (current.note === input.value) return; // no change
  current.note = input.value;
  await setActionQueueState(key, current.state, input.value);
});
```

### Open submission affordance

The character name (or a small "↗ Open submission" affordance) navigates the DT Processing view to that submission. Reuse the existing `selectedCycleId` / submission-focus logic in `downtime-views.js`.

### CSS (strawman)

```css
.dt-action-queue-panel {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--surf2);
  border: 1px solid var(--bdr);
  border-radius: 4px;
}
.dt-action-queue-filter-pills { display: flex; gap: .35rem; margin-bottom: .75rem; }
.dt-action-queue-filter-pill { padding: .25rem .6rem; background: var(--surf); border: 1px solid var(--bdr2); border-radius: 999px; cursor: pointer; font-size: .8rem; }
.dt-action-queue-filter-pill.active { background: var(--gold2); color: var(--bg); }

.dt-action-queue-row { display: grid; grid-template-columns: minmax(8rem, 1fr) auto minmax(12rem, 3fr) auto auto; gap: .75rem; align-items: center; padding: .5rem 0; border-bottom: 1px solid var(--bdr); }
.dt-action-queue-state-select { font-size: .75rem; }
.dt-action-queue-note-input { font-size: .8rem; padding: .25rem .5rem; }
```

Reuse tokens; substitute project-canonical equivalents.

### No tests required

UI + cycle write. Manual smoke test:
- Open DT Processing on a cycle with several submissions.
- See Action Queue with one row per non-empty highlight.
- Change a row's state via dropdown: row updates, persistence verified by refresh.
- Type in a note: persists.
- Click a filter pill: only matching rows show.
- Click All: all rows show.

### Strawman wording

- Panel header: "**Action Queue**"
- Filter pills: "All", "Unread (N)", "Action Needed (N)", "Acknowledged (N)", "Resolved (N)", "Ignored (N)"
- State labels: "Unread", "Acknowledged", "Action Needed", "Resolved", "Ignored"
- Note placeholder: "ST note…"

---

## Files Expected to Change

- `public/js/admin/downtime-views.js` — `renderActionQueuePanel` and supporting helpers; placement in DT Processing render orchestration; click/change handlers for state and note.
- `public/admin.html` — slot if needed (likely dynamic).
- `public/css/admin-layout.css` — styles for `.dt-action-queue-*`.

No server changes (existing `PUT /api/downtime_cycles/:id` accepts the new field).

---

## Definition of Done

- All AC verified.
- Manual smoke tests for state transitions, note edits, filter, persistence.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtil-2-action-queue-triage: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies for the data path; reads from existing `responses.game_recount_N`.
- **Pairs with DTIL-3** (auto-state derivation from `mechanical_flag_N`). DTIL-2 ships the manual triage UI; DTIL-3 changes the default-state derivation. Either ships first, but DTIL-2 ships the panel that DTIL-3 modifies.
- Independent of DTIL-1 (Court Pulse) and DTIL-4 (Territory Pulse) — three separate intelligence surfaces.
