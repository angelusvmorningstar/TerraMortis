---
id: dtsr.3
epic: dtsr
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTSR-3: Scope DT Story tab to the current active cycle only

As a Storyteller opening the DT Story tab,
I should only ever see the cycle the campaign is currently working on (most recent non-complete cycle), with a clear empty state if no such cycle exists,
So that I never accidentally author or publish narratives against a previous cycle's submissions while the active cycle sits unattended (the "DT2-in-DT3" bug).

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform). Today's `initDtStory(cycleId)` at `public/js/admin/downtime-story.js:87` falls back through a priority chain when called with `null`:

```js
const preferred = sorted.find(c => c.status === 'active')
  || sorted.find(c => c.status === 'game' || c.status === 'closed')
  || sorted[0];
```

The final `|| sorted[0]` catches any cycle when the first two predicates miss. In practice, when DT3 is in `prep` status (no submissions yet), `sorted[0]` resolves to the most recent cycle by `created_at` — which can be DT2 (`complete`). The ST opens DT Story expecting to see DT3's prep state, sees DT2's published state instead, and risks editing or republishing yesterday's narratives.

DTSR-3 fixes the leak by tightening the cycle resolution: load only the most recent non-`complete` cycle. If none exists, show an empty state explaining there is nothing to author.

The memory uses the phrase "drop historical cycle selector" — there is no literal dropdown UI in the DT Story tab today; the "selector" the memory refers to is the implicit fallback chain in the cycle resolver. DTSR-3 closes that implicit selector.

### Cycle status taxonomy (current)

Verified across `public/js/admin/downtime-views.js` and `public/js/downtime/db.js`:

| Status | Phase |
|---|---|
| `prep` | DT Prep (admin authoring, not yet open to players) |
| `game` | City & Feeding (game night) |
| `active` | Downtimes (players submitting) |
| `closed` | DT Processing (ST authoring narratives) |
| `complete` | Push Ready / published |

DT Story is meaningful in `closed` (active authoring), useful in `active` (early prep of context), and largely empty in `prep` (no submissions yet). It should **never** show `complete` cycles — those are already published; nothing should be edited there.

### Files in scope

- `public/js/admin/downtime-story.js` — `initDtStory(cycleId)` cycle resolver at line 87; the fallback empty-state copy at line 110.

### Out of scope

- Read-only viewing of historical cycles. The memory locks this: DT Story is for the active cycle only. Players can read their own published outcomes via the player-facing report (epic-dtp); STs viewing a historical cycle's narratives can do so via MongoDB or a dedicated archive surface (out of scope for this epic).
- Editing of `complete` cycles for late corrections. If late edits become necessary, a separate explicit "re-open this cycle" workflow is the right answer; silently allowing edits via the resolver is not.
- Player-side scope (player Story view; that's DTSR-4's subject).
- Any change to DT Processing's `selectedCycleId` flow in `downtime-views.js` (DT Processing legitimately needs to view all cycles for status overview; DT Story does not).
- Removing the `cycleId` parameter from `initDtStory` (kept for testability and the CLI/dev paths that may pass an explicit id).

---

## Acceptance Criteria

### Resolver behaviour

**Given** I open the DT Story tab and `initDtStory` is called with no explicit cycle id
**When** the cycle resolver runs
**Then** it loads the most recent cycle whose `status !== 'complete'` (i.e. one of `prep`, `game`, `active`, or `closed`).
**And** "most recent" is determined by `created_at` descending, matching today's `sorted` ordering.

**Given** all cycles have `status === 'complete'` or no cycles exist at all
**When** `initDtStory(null)` runs
**Then** the panel renders an empty state with copy along the lines of:
> *"No active downtime cycle. The DT Story tab will load when a new cycle is created."*
**And** no submissions are fetched.
**And** no nav rail is rendered.

**Given** `initDtStory(cycleId)` is called with an **explicit** cycle id (e.g. by a future archive surface or test harness)
**Then** the resolver respects the explicit id and loads that cycle regardless of status — the implicit-resolution rule applies only when `cycleId` is `null`/`undefined`.

### Removal of the silent fallback

**Given** the codebase
**When** the cycle resolver fails to find a non-complete cycle
**Then** there is **no further fallback to `sorted[0]`**, no fallback to "any cycle", no fallback to the most recent `complete` cycle. The empty state is the terminal answer.

### Empty state surface

**Given** the empty state renders
**Then** the copy explains why (no active cycle).
**And** the copy points the ST at where to act (DT Processing tab, where they create a new cycle).
**And** there is no leakage: no submission counts, no character pills, no per-cycle metadata that would suggest a historical cycle is being viewed.

### DT2-in-DT3 bug regression check

**Given** DT2 has `status: 'complete'` and DT3 has `status: 'prep'`
**When** I open the DT Story tab
**Then** the resolver picks DT3 (the prep cycle).
**And** the panel renders DT3's nav rail (likely empty, since prep cycles have no submissions yet).
**And** DT2's data is **not** fetched and **not** rendered.

**Given** DT2 has `status: 'complete'` and there is no DT3 yet
**When** I open the DT Story tab
**Then** the panel renders the empty state (per above).
**And** DT2's data is **not** fetched.

---

## Implementation Notes

### Resolver change

Replace the existing cycle resolver block at `public/js/admin/downtime-story.js:94-107` with:

```js
let resolvedCycleId = cycleId;
if (!resolvedCycleId) {
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    if (Array.isArray(cycles) && cycles.length) {
      const sorted = cycles.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      const preferred = sorted.find(c => c.status !== 'complete');
      resolvedCycleId = preferred?._id || null;
    }
  } catch {
    resolvedCycleId = null;
  }
}
```

Single-predicate resolution: not complete. The previous priority over `active` / `game` / `closed` is no longer necessary because all non-complete statuses are eligible, and `created_at` ordering ensures the most recently-created (i.e. current) one wins. In normal operation only one non-complete cycle exists at a time; if multiple exist due to data drift, the most recent one is the safer pick.

### Empty state copy

Update line 110 from:

```js
panel.innerHTML = '<div class="dt-story-empty">No downtime cycles found. Create a cycle in DT Processing first.</div>';
```

to something that handles both "no cycles at all" and "all cycles complete" cases with one message:

```js
panel.innerHTML = '<div class="dt-story-empty">No active downtime cycle. The DT Story tab will load when a new cycle is created in DT Processing.</div>';
```

Final wording can be tuned at implementation; the principle is "explain why and point to the action site".

### No need to change the explicit-id path

`initDtStory(cycleId)` callers that pass an explicit id (e.g. `publishAllForCycle(cycleId)` at line 3027, or any future test harness) should continue to work — the resolver only enforces the active-cycle rule when `cycleId` is null. This preserves the testability of the module and any future "load this specific cycle" hook (e.g. an admin-only archive view).

### Sanity check on callers

Grep for `initDtStory(` to confirm callers:
- `public/js/admin.js:259` — `initDtStory(null)` — relies on the resolver, will benefit from the fix.
- Any other callers? If they pass explicit cycle ids, leave them alone.

### No tests required

UI / data-resolution change. Manual smoke test:
- Set DT3 status to `prep`, verify DT3 (empty rail) loads, not DT2.
- Set DT3 to `closed`, verify DT3 loads with submissions.
- Mark DT3 `complete`, verify the empty state appears (no fallback to DT2).
- Empty database / no cycles, verify the empty state appears.

---

## Files Expected to Change

- `public/js/admin/downtime-story.js` — single-predicate resolver in `initDtStory`; updated empty-state copy.

No server changes, no schema changes, no test changes.

---

## Definition of Done

- All AC verified.
- Manual smoke test exercises the four scenarios above.
- The DT2-in-DT3 regression scenario specifically reproduced and confirmed fixed.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-3-active-cycle-scope: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No dependencies. Independent of every other story.
- Sets up DTSR-4 (player Story view inline edit on historical cycles) by making "active vs historical" a meaningful distinction on the admin side; DTSR-4 makes the same distinction on the player side. Neither blocks the other.
