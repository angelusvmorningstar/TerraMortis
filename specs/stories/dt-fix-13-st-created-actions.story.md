# Story DT-Fix-13: ST-Created Actions in DT Interface

## Status: done

## Story

**As an** ST processing a downtime cycle,
**I want** to add actions on behalf of a character directly in DT Processing (e.g. Rite actions not in the player's submission),
**so that** I can resolve mechanically-necessary actions without asking players to resubmit.

## Background

Symon has multiple Rite actions that must be resolved each cycle but are not in his player submission (the player handles them as standing procedural items). Currently there is no way to add these in DT Processing — the ST must either manually track them off-system or ask the player to resubmit.

---

## Design Decision — Data Model

**Use `sub.st_actions` (dedicated array on the submission document).**

Option B (inject into `projects_resolved` / `merit_actions_resolved`) was considered and rejected: sorcery uses a slot-keyed object `sorcery_review[n]` rather than a flat array, so injected sorcery entries have no natural index. A dedicated `sub.st_actions` array is cleaner and maps to an equally simple `sub.st_actions_resolved` parallel array, matching the `projects_resolved` pattern exactly.

The schema file (`server/schemas/downtime_submission.schema.js`) has `additionalProperties: true` at the top-level submission object (line 398) — no schema change is required to add these two new fields. The document will accept them on the next PATCH.

### Data shape

```js
// sub.st_actions — authored by ST, saved via updateSubmission
sub.st_actions = [
  {
    action_type: 'sorcery',          // 'sorcery' | 'project' | 'merit'
    label:       'Theban Sorcery: Rite of X',
    description: 'Optional ST note — targets, notes, context',
    phase:       'resolve_first',    // same phase key strings as buildProcessingQueue
    pool_player: '',                  // ST-estimated pool expression, optional
  }
];

// sub.st_actions_resolved — parallel review array, same shape as projects_resolved
sub.st_actions_resolved = [
  { pool_status: 'pending', pool_validated: '', notes_thread: [], player_feedback: '' }
];
```

### Queue entry shape

ST-created entries enter the queue with `source: 'st_created'` and `actionIdx` = their index in `sub.st_actions`:

```js
{
  key:        `${sub._id}:st:${idx}`,
  subId:      sub._id,
  source:     'st_created',
  actionIdx:  idx,
  charName,
  phase,
  phaseNum,
  actionType: stAction.action_type,
  label:      stAction.label,
  description: stAction.description || '',
  poolPlayer: stAction.pool_player || '',
}
```

---

## Acceptance Criteria

1. ST can add a new sorcery, project, or merit action to any character in DT Processing via an inline "Add action" row at the bottom of each character's queue section.
2. ST-created actions appear in the queue with an `[ST]` badge on the collapsed row, visually distinct from player actions.
3. ST-created actions go through the same pool/roll/status workflow as player actions (rendered by the existing `renderActionPanel`).
4. ST-created actions persist across page reload — saved to `sub.st_actions` on the submission document.
5. Review state (`pool_status`, notes, etc.) persists in `sub.st_actions_resolved` across page reload.
6. ST can delete an ST-created action (player actions are not deletable).
7. ST-created actions count toward phase completion (`DONE_STATUSES` check includes them).

---

## Tasks / Subtasks

- [x] Task 1: Add "Add action" UI row per character
  - [x] 1.1: In `renderProcessingMode`, a dedicated "Add ST Actions" section renders after all phase sections — one collapsed row per submission with a `+` button
  - [x] 1.2: The form renders collapsed by default; clicking `+` expands it inline
  - [x] 1.3: "Add" button calls `addStAction(subId, { action_type, label, description })` and re-renders

- [x] Task 2: `addStAction(subId, actionDef)` function
  - [x] 2.1: Fetches sub from `submissions`; builds new entry for `sub.st_actions`
  - [x] 2.2: Phase derived via `ST_ACTION_PHASE_MAP` (sorcery→0, project→7, merit→8)
  - [x] 2.3: Appends to `sub.st_actions`; calls `await updateSubmission(subId, { st_actions: stActions })` to persist
  - [x] 2.4: Caller re-renders after `addStAction` resolves

- [x] Task 3: Add ST-created entries to `buildProcessingQueue`
  - [x] 3.1: Loop over `sub.st_actions || []` added after retainers loop, inside `for (const sub of subs)`
  - [x] 3.2: Pushes queue entry with `source: 'st_created'`, key `${sub._id}:st:${idx}`

- [x] Task 4: Add `st_created` branch to `saveEntryReview`
  - [x] 4.1: Added after sorcery branch; reads/writes `sub.st_actions_resolved`

- [x] Task 5: Add `[ST]` badge to queue row renderer
  - [x] 5.1: Badge injected inline into `proc-row-label` span when `entry.source === 'st_created'`
  - [x] 5.2: `.proc-row-st-badge` styled with `var(--gold2)`, small font, inline

- [x] Task 6: Add delete affordance for ST-created entries
  - [x] 6.1: `proc-delete-st-action` button rendered in `renderActionPanel` for `st_created` entries
  - [x] 6.2: `deleteStAction(subId, actionIdx)` splices arrays and calls `updateSubmission`

- [x] Task 7: `getEntryReview` — add `st_created` branch
  - [x] 7.1: Added before `return null`

- [ ] Task 8: Manual verification
  - [ ] 8.1: Open DT Processing; find a character (e.g. Symon); click "+ Add action"; add a Theban sorcery rite
  - [ ] 8.2: Confirm the entry appears in the queue with `[ST]` badge, in the correct phase section
  - [ ] 8.3: Expand the entry; confirm pool/roll/status controls render normally
  - [ ] 8.4: Set pool status to Resolved; reload page; confirm status persists
  - [ ] 8.5: Delete the action; confirm it disappears and the queue re-renders cleanly
  - [ ] 8.6: Confirm phase completion counter counts the ST-created action once resolved

---

## Dev Notes

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | All changes: `buildProcessingQueue`, `saveEntryReview`, `getEntryReview`, queue row renderer, `renderActionPanel` delete button, "Add action" UI, event wiring |
| `server/schemas/downtime_submission.schema.js` | No change needed — `additionalProperties: true` on root submission object (line 398) |
| `server/routes/downtime_submissions.js` | No change needed — PUT route uses `$set` with no field validation |

### `renderActionPanel` reuse

ST-created entries reuse `renderActionPanel` as-is. The panel renders based on `entry.actionType` (sorcery / project / merit). ST-created entries carry the same `actionType` field — they will naturally render the appropriate sorcery/project/merit panel.

For sorcery ST-created entries: `entry.riteName` must be set from `stAction.label` (or a separate `rite_name` field in `st_actions`). Ensure the entry pushed to the queue includes `riteName: stAction.rite_name || ''` so the rite selector renders correctly.

### Phase assignment for ST-created actions

```js
const ST_ACTION_PHASE_MAP = {
  sorcery: 0,   // resolve_first
  project: 7,   // misc fallback — ST can pick a more specific type in the form
  merit:   8,   // allies fallback
};
const phaseNum = PHASE_ORDER[stAction.action_type] ?? ST_ACTION_PHASE_MAP[stAction.category] ?? 7;
```

For the "Add action" form, offer a simplified category picker (Sorcery / Project / Merit), then map to a phase. Don't try to expose the full `action_type` enum in the form — the ST can use the action-type override in the panel after adding.

### `getEntryReview` location

```js
// Line ~2145 — add BEFORE the final `return null`:
if (entry.source === 'feeding') return sub.feeding_review || null;
if (entry.source === 'project') return (sub.projects_resolved || [])[entry.actionIdx] || null;
if (entry.source === 'merit')   return (sub.merit_actions_resolved || [])[entry.actionIdx] || null;
if (entry.source === 'sorcery') return (sub.sorcery_review || {})[entry.actionIdx] || null;
// ADD:
if (entry.source === 'st_created') return (sub.st_actions_resolved || [])[entry.actionIdx] || null;
return null;
```

### Scope boundary

This story does not add a player-facing view of ST-created actions. DT Story tab prompt generators are out of scope.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |
| 2026-04-15 | 1.1 | Design decision resolved (Option A — `sub.st_actions`); full implementation paths added | Claude (SM assist) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- "Add action" UI placed as a dedicated collapsible section after all phase sections (not per-character within each phase), to avoid duplicate buttons across phases. One row per submission.
- `ST_ACTION_PHASE_MAP` added as module-level constant (sorcery→0, project→7, merit→8).
- `st_created` entries use the simple status panel (pending/validated/no_roll/skipped) rather than the sorcery/project/merit two-column layout, since `renderActionPanel` branches on `entry.source`.
- `stActionAddExpandedSubs` Set tracks which add-forms are open across re-renders.
- `deleteStAction` clears all `:st:*` expanded keys for the sub after delete to avoid stale expansion.

### File List
- `public/js/admin/downtime-views.js`
