---
id: dtil.3
epic: dtil
status: ready-for-dev
priority: medium
depends_on: [dtfp.7, dtil.2]
---

# Story DTIL-3: Auto-derive Action Queue state from mechanical_flag_N on first read

As a Storyteller opening the Action Queue,
I should see items where the player ticked the mechanical-effect checkbox already defaulted to "Action Needed", and unflagged items defaulted to "Unread", with the derived defaults written to persistence on first read so that subsequent reads have unambiguous state,
So that I do not have to manually triage every player-flagged highlight to "Action Needed" before I can use the Action Queue's filter to focus on what matters.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 4 (DT Intelligence Layer):

> **DTP4.3** — Auto-state derivation from `mechanical_flag_N`. Items with flag=true default to Action Needed; unflagged default to Unread. Derived default written to persistence on first read to remove default-vs-persisted ambiguity. Depends on DTF2.7.

DTFP-7 (`mechanical_flag_N`) gives players a per-highlight checkbox. DTIL-2 ships the Action Queue with default state "Unread" for any item with no entry in `cycle.action_queue_state`. DTIL-3 closes the loop: when the Action Queue first opens, items with `mechanical_flag_N === true` get an automatic default of "Action Needed" instead of "Unread", and the derived state is **written to persistence on first read** so the ST's later changes flow against a stable baseline rather than a recomputed default.

The "write on first read" rule is important: if the default were computed live every render, the ST might mark an item Resolved, and on next render the recomputation would overwrite their choice back to Action Needed (because the flag still says true). Writing the default on first read converts the default into a persisted state immediately; from that point on, the ST's choices win.

### Files in scope

- `public/js/admin/downtime-views.js` — `renderActionQueuePanel` (or its supporting initialiser):
  - On panel mount: iterate items, find ones not yet in `cycle.action_queue_state` AND with `mechanical_flag_N === true`.
  - For each such item, compute the derived default (`'action_needed'`) and **persist** it to `cycle.action_queue_state` before rendering.
  - Then render normally.

### Out of scope

- Changing existing entries in `cycle.action_queue_state`. If an entry already exists, leave it alone (the ST has already triaged or the system has already derived).
- Auto-resolving / auto-transitioning state based on later events (e.g. "the item was edited; revert to Unread"). v1 is one-shot derivation on first read.
- Server-side derivation. The derivation runs client-side at panel render time. If a separate process needs the derivation later, the persisted state is the source of truth.
- Bulk re-derivation across cycles. Each cycle handles its own first read independently.
- Surfacing "this state was auto-derived" vs "this state was set by ST" — the persisted state has no provenance flag. STs see them all as triaged.
- Auto-deriving for items that were unflagged at submission time but the player later edits to add the flag. v1: the derivation runs once per item; if the flag changes after first read, the derived state is locked in. (Edge case rare in practice; document and defer.)

---

## Acceptance Criteria

### Derivation rule

**Given** the Action Queue panel is opened on a cycle for the first time (no `cycle.action_queue_state` entries exist for some items)
**When** the panel computes derived defaults
**Then** for each item where:
- The corresponding `responses.mechanical_flag_<N>` on the submission is `true`, **and**
- No entry exists in `cycle.action_queue_state` for the item key (`${sub_id}:${slot_idx}`)

**Then** the item is assigned state `'action_needed'`.
**And** for items where the flag is `false`/missing AND no entry exists, the item is assigned state `'unread'`.

### Persistence on first read

**Given** the derivation has assigned state to N items that previously had no entry
**Then** all N derivation results are batched and written to `cycle.action_queue_state` via a single PUT `/api/downtime_cycles/:id` call (one round trip, not N).
**And** after the write succeeds, `cycle.action_queue_state` in memory matches the persisted state.

**Given** all items already have entries in `cycle.action_queue_state`
**Then** **no PUT call** is made (no-op derivation).

**Given** the derivation runs and persists
**When** the ST refreshes the page
**Then** all derived states are present (no re-derivation needed; the persisted entries take precedence).

### Idempotence

**Given** an item already has an entry in `cycle.action_queue_state`
**When** the derivation runs
**Then** the existing entry is **not modified**, regardless of the current `mechanical_flag` value on the submission.

### ST overrides win

**Given** the derivation has assigned state `'action_needed'` to an item
**When** the ST manually changes the item's state to `'resolved'` (via DTIL-2's UI)
**Then** the ST's choice persists.
**And** subsequent panel renders show the ST's choice, not the derived default.
**And** even if the player later changes their mechanical flag, the ST's persisted choice wins.

### Failure handling

**Given** the derivation PUT fails (network error, server rejection)
**Then** the panel still renders with the in-memory derived defaults (the ST sees the right initial state).
**And** a console warning is logged.
**And** the next panel open will re-attempt the persistence.

### Edge cases

**Given** a submission has no `mechanical_flag_*` fields at all (legacy submission pre-DTFP-7)
**Then** every highlight from that submission derives to `'unread'` (the missing-field case).

**Given** a submission has `mechanical_flag_3 === true` but `game_recount_3` is empty
**Then** **no item exists** for that slot (Action Queue only renders items with non-empty highlight text), so derivation does not apply.

**Given** the cycle is brand new with no submissions
**Then** derivation is a no-op (no items to derive).

---

## Implementation Notes

### Derivation pass

Add a small initialiser at the start of `renderActionQueuePanel`:

```js
async function deriveActionQueueDefaults(cycle, submissions) {
  const stateMap = cycle.action_queue_state || {};
  const updates = {}; // collect new entries

  for (const sub of submissions) {
    for (let n = 1; n <= 5; n++) {
      const text = (sub.responses?.[`game_recount_${n}`] || '').trim();
      if (!text) continue;
      const key = `${sub._id}:${n - 1}`;
      if (stateMap[key]) continue; // existing entry wins

      const flagged = sub.responses?.[`mechanical_flag_${n}`] === true;
      updates[key] = {
        state: flagged ? 'action_needed' : 'unread',
        note: '',
      };
    }
  }

  if (!Object.keys(updates).length) return; // no-op

  // Merge and persist
  const newMap = { ...stateMap, ...updates };
  cycle.action_queue_state = newMap;

  try {
    await updateCycle(cycle._id, { action_queue_state: newMap });
  } catch (err) {
    console.warn('Action Queue default derivation persistence failed:', err);
    // In-memory state still useful for rendering this session
  }
}
```

Call before the panel render:

```js
async function renderActionQueuePanelWithDerivation(cycle, submissions, characters) {
  await deriveActionQueueDefaults(cycle, submissions);
  return renderActionQueuePanel(cycle, submissions, characters);
}
```

If the panel is rendered synchronously today (return-string pattern), restructure as a two-phase render: (1) async derivation, (2) sync render. Or accept that the first render shows derivation-stale state and re-render on derivation completion.

### Avoid blocking the panel render

If the derivation persistence is slow, do not block UI render. The pattern above has the derivation update the in-memory cycle.action_queue_state synchronously (before render), then the persistence call runs async. The render uses the in-memory state immediately.

### Batch the writes

Single PUT call carrying all new entries. Do not write one entry at a time.

### Don't re-derive on subsequent renders

The derivation is **first-read only**. If the panel re-renders within the same session (e.g. after a state change), the derivation should not re-run for items already in `cycle.action_queue_state`. The check `if (stateMap[key]) continue;` handles this naturally.

If the panel is dismounted and re-mounted (e.g. user switches tabs), derivation runs again — but it's still a no-op because all items now have entries (from the previous session's persistence).

### Coordination with DTIL-2

DTIL-2 ships the panel with a default of `'unread'` baked into render-time derivation (`entry.state || 'unread'`). DTIL-3 changes this so:
- The render-time default stays as `'unread'` (last-resort fallback).
- The pre-render derivation step writes the per-flag-aware defaults to persistence so that render-time mostly reads the persisted state.

The two stories together: render-time fallback is `'unread'`; derivation pass before render writes per-flag-aware defaults; ST manual changes override.

### British English

No new copy in this story.

### No tests required

Persistence + derivation logic. Manual smoke test:
- Open Action Queue on a fresh cycle with several submissions, some flagged: verify flagged items show "Action Needed" by default, unflagged show "Unread".
- Refresh: states still as derived, no re-derivation thrash.
- Manually set a flagged item to "Resolved", refresh: state stays "Resolved" even though flag is still true.
- Open a legacy cycle with no `mechanical_flag_*` at all: every item defaults to "Unread", no derivation churn.

A server-side test verifying the PUT round-trip would be useful; not blocking.

---

## Files Expected to Change

- `public/js/admin/downtime-views.js` — `deriveActionQueueDefaults` helper; integration into the Action Queue render path (async pre-step).

No CSS, no schema, no server route changes.

---

## Definition of Done

- All AC verified.
- Manual smoke tests for: fresh cycle (derivation runs), already-derived cycle (no-op), ST override of derived state (sticks), legacy cycle (no flags, defaults to unread).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtil-3-auto-state-mechanical-flag: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on DTFP-7** (`mechanical_flag_N` field on submissions). Without DTFP-7, the derivation has nothing to read.
- **Depends on DTIL-2** (Action Queue panel and `cycle.action_queue_state` shape). DTIL-3 modifies DTIL-2's render flow.
- Independent of DTIL-1 (Court Pulse) and DTIL-4 (Territory Pulse).
