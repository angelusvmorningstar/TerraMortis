---
id: fix.461
title: "DT form hidden after submission deadline passes"
issue: 461
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/461
branch: ms/issue-461-dt-form-deadline-gate
status: review
type: fix
---

## Story

**As a player**, once the downtime submission deadline has passed I should no longer see the submission form — I should see a clear status message instead, so I know submissions are closed without accidentally re-editing or resubmitting.

## Context

The downtime form's gate condition (`_gateBlocks`) only tests `cycle.status`. When the deadline passes but the cycle remains in `'active'` status (results published but not manually closed), the full form stays visible. Players see "Submissions closed" in the header but can still interact with all form sections.

**Observed in Downtime 3:** results published, `deadline_at` past, `cycle.status` still `'active'` → form fully rendered.

## Acceptance Criteria

1. When `deadline_at` is in the past and the player is not in `out_of_window_player_ids`, the form is replaced by the gate page — not just labelled "Submissions closed".
2. When `deadline_at` is in the past and results are published (`responseDoc.published_outcome` truthy), the gate message reads: **"Your results for this cycle have been published — see the Story tab."**
3. When `deadline_at` is in the past and results are not yet published, the gate message reads: **"Submissions are closed. Your ST is processing the results — published outcomes will appear in the Story tab."**
4. Players with `out_of_window_player_ids` access continue to see the form past the deadline (window-access exception unchanged).
5. STs (`isSTRole()`) are never gated — they can always see the form regardless of deadline.
6. `devPreview` (localhost) bypass is unchanged — form always renders in local dev.
7. Existing gate behaviour for `status === 'game'` and `status === 'closed'` is unchanged.

## Implementation

### File: `public/js/tabs/downtime-form.js`

**Change 1 — add deadline gate to `_gateBlocks` (lines ~1471–1474):**

```js
// BEFORE
const _formStatuses = _isST ? ['active', 'prep'] : ['active'];
const _hasWindowAccess = (currentCycle?.out_of_window_player_ids || [])
  .map(String).includes(String(currentChar._id));
const _gateBlocks = !currentCycle || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess);

// AFTER
const _formStatuses = _isST ? ['active', 'prep'] : ['active'];
const _hasWindowAccess = (currentCycle?.out_of_window_player_ids || [])
  .map(String).includes(String(currentChar._id));
const _deadlinePast = !!(currentCycle?.deadline_at && new Date(currentCycle.deadline_at) < new Date());
const _gateBlocks = !currentCycle
  || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess)
  || (_deadlinePast && !_hasWindowAccess);
```

**Change 2 — update `renderCycleGatePage` to handle deadline-past state (lines ~1590–1612):**

`renderCycleGatePage` is synchronous and runs after the module-level `responseDoc` and `currentCycle` are populated. Add a `isDeadlinePast` branch before the existing `isGame` / `isClosed` branches:

```js
function renderCycleGatePage() {
  if (!currentCycle) {
    return `<div class="reading-pane qf-gate-page">
      <p class="placeholder-msg">No active downtime cycle right now. Your ST will open submissions before the next game.</p>
    </div>`;
  }
  const label = esc(currentCycle.label || 'This cycle');
  const isGame        = currentCycle.status === 'game';
  const isClosed      = currentCycle.status === 'closed';
  const isDeadlinePast = !!(currentCycle.deadline_at && new Date(currentCycle.deadline_at) < new Date());
  const isPublished   = !!(responseDoc?.published_outcome);

  let h = `<div class="reading-pane qf-gate-page">`;
  h += `<h3 class="qf-title">${label}</h3>`;

  if (isGame) {
    h += `<p class="qf-gate-msg">Submissions for this cycle are locked — the game is on. Check the <strong>Feeding</strong> tab for your feeding roll.</p>`;
  } else if (isClosed) {
    h += `<p class="qf-gate-msg">Your ST is processing downtime results. Published outcomes will appear in the <strong>Story</strong> tab once ready.</p>`;
  } else if (isDeadlinePast && isPublished) {
    h += `<p class="qf-gate-msg">Your results for this cycle have been published — see the <strong>Story</strong> tab.</p>`;
  } else if (isDeadlinePast) {
    h += `<p class="qf-gate-msg">Submissions are closed. Your ST is processing the results — published outcomes will appear in the <strong>Story</strong> tab.</p>`;
  } else {
    h += `<p class="qf-gate-msg">Downtime submissions are currently closed.</p>`;
  }

  // If the player already has a submission for this cycle, show its status
  if (responseDoc) {
    const statusLabel = responseDoc.status === 'submitted' ? 'Submitted' : 'Draft saved';
    h += `<p class="qf-gate-sub-status"><span class="qf-badge qf-badge-submitted">${statusLabel}</span> Your ${label} submission is on file.</p>`;
  }

  h += `</div>`;
  return h;
}
```

## Dev Notes

- `responseDoc` is a module-level `let` (line 102) populated by `initDowntimeForm` before `renderCycleGatePage` is ever called — safe to read in the gate function.
- `_gateBlocks` is evaluated inside `initDowntimeForm` (line ~1474) which is async; `new Date()` comparison is correct there.
- The `devPreview` bypass (`location.hostname === 'localhost'`) exists at both render sites (lines ~1479, ~1499) — no change needed there.
- No CSS changes required. The gate page already uses `.qf-gate-page` / `.qf-gate-msg` classes.
- No API changes. No new fields needed — `deadline_at` and `published_outcome` are already on the cycle/submission documents.
- The `renderCycleGatePage` function is called at exactly two sites: `singleColumn` path (~1480) and split-layout path (~1500). Both use the same function; the new branches cover both.

## Out of Scope

- The "Submissions closed" label in the form header (line 1943) — this existing label is harmless and can stay; once gated the form doesn't render at all so the label is never seen.
- Any change to how `deadline_at` is set — that's the ST's responsibility via the prep panel.
- The published results banner inside the form (`qf-results-banner`) — unaffected; once gated the form doesn't render.
