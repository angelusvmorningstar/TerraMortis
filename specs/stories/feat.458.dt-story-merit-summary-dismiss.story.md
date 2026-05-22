---
title: 'DT Story: expand merit summary incomplete list with names, reasons, and per-action dismiss'
type: 'feature'
issue: 458
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/458
branch: ms/issue-458-dt-story-merit-summary-dismiss
created: '2026-05-21'
status: review
recommended_model: 'sonnet — five touch-points all in downtime-story.js + one CSS block; no schema migration required'
context:
  - public/js/admin/downtime-story.js
  - public/css/admin-layout.css
---

## Intent

**Problem:** When a submission's Allies & Asset Summary section is blocked ("N outcomes still to
record in DT Processing"), the ST can see the count but has no way to know *which* actions are
blocking or *why*. If the ST decides that data entry for a particular action is genuinely
unneeded — e.g. the player's Contacts action was a no-show and there is nothing to narrate — they
must enter dummy text just to satisfy the completeness check.

**Desired behaviour:**

1. The blocking message expands to list each incomplete action by name and reason.
2. Each blocking item has a Dismiss button. Dismissing an item writes its index to
   `st_narrative.merit_summary_overrides` and removes it from the count.
3. When all blocks are dismissed, the section shows an amber "Overridden (N dismissed)" badge
   instead of the green "All outcomes recorded" badge, and the completion dot goes green (the
   section no longer gates sign-off).
4. Dismissed items show an Undismiss button — clicking again removes the override.
5. Overrides persist across page loads via `saveNarrativeField`.

## Critical: sync dev before starting

**This branch was cut from Morningstar before fix #456 was merged to dev.** The current file on
this branch has the pre-fix-456 `meritSummaryComplete` (no resources-specific logic) and the
pre-fix-456 `renderMeritSummary` footer (no T2/T3 fixes).

Before implementing any task, run:

```
git fetch origin && git merge origin/dev
```

Resolve the only expected conflict site (`specs/stories/sprint-status.yaml`) by keeping all
entries from both sides, then proceed.

After the merge the file will have the fix-456 versions of `meritSummaryComplete` (lines
~2233–2249) and `renderMeritSummary` (lines ~2257–2325). The tasks below describe changes
relative to those post-merge versions.

## State of key functions after dev merge

**`meritSummaryComplete` (post-fix-456, lines ~2233–2249):**

```js
function meritSummaryComplete(sub) {
  const actions  = sub?.merit_actions || [];
  const resolved = sub?.merit_actions_resolved || [];
  const acqRes   = sub?.acquisitions_resolved  || [];

  for (let i = 0; i < actions.length; i++) {
    const rev = resolved[i] || {};
    if ((rev.pool_status || '') === 'skipped') continue;
    if (deriveMeritCategory(actions[i].merit_type) === 'resources') {
      const revStatus = resolved[i]?.pool_status || '';
      if (revStatus === 'validated' || revStatus === 'skipped') continue;
      const acqStatus = acqRes[0]?.pool_status || '';
      if (acqStatus !== 'validated' && acqStatus !== 'skipped') return false;
      continue;
    }
    if (!rev.outcome_summary?.trim()) return false;
  }
  return true;
}
```

**`renderMeritSummary` footer section (post-fix-456, lines ~2306–2323):**

```js
h += `<div class="dt-story-section-actions">`;
if (complete) {
  h += `<span class="dt-story-complete-badge">&#10003; All outcomes recorded</span>`;
} else {
  const acqRes  = sub?.acquisitions_resolved || [];
  const missing = actions.filter((a, i) => {
    const rev = resolved[i] || {};
    if (rev.pool_status === 'skipped') return false;
    if (deriveMeritCategory(a.merit_type) === 'resources') {
      const revStatus = resolved[i]?.pool_status || '';
      if (revStatus === 'validated' || revStatus === 'skipped') return false;
      const acqStatus = acqRes[0]?.pool_status || '';
      return acqStatus !== 'validated' && acqStatus !== 'skipped';
    }
    return !rev.outcome_summary?.trim();
  }).length;
  h += `<span class="dt-story-pending-note">${missing} outcome${missing !== 1 ? 's' : ''} still to record in DT Processing</span>`;
}
h += `</div>`;
h += `</div></div>`;
return h;
```

**Click dispatch (lines ~270–331):** delegated `e.target.closest()` checks on the panel element.

**`saveNarrativeField(submissionId, patch)` (line ~362):** persists via `apiPut`; updates
`_currentSub` in-memory with the caller's memUpdate pattern.

**Re-render pattern (line ~1213):**
```js
const char = getCharForSub(_currentSub);
view.innerHTML = renderCharacterView(char, _currentSub);
```

## Tasks

### T1 — `meritSummaryComplete`: honour overrides

Replace the body of `meritSummaryComplete` (the entire function from the opening `{` to closing
`}`). Add `overrides` extraction and skip any action whose index is in the override set:

```js
function meritSummaryComplete(sub) {
  const actions   = sub?.merit_actions || [];
  const resolved  = sub?.merit_actions_resolved || [];
  const acqRes    = sub?.acquisitions_resolved  || [];
  const overrides = new Set(sub?.st_narrative?.merit_summary_overrides || []);

  for (let i = 0; i < actions.length; i++) {
    if (overrides.has(i)) continue;
    const rev = resolved[i] || {};
    if ((rev.pool_status || '') === 'skipped') continue;
    if (deriveMeritCategory(actions[i].merit_type) === 'resources') {
      const revStatus = resolved[i]?.pool_status || '';
      if (revStatus === 'validated' || revStatus === 'skipped') continue;
      const acqStatus = acqRes[0]?.pool_status || '';
      if (acqStatus !== 'validated' && acqStatus !== 'skipped') return false;
      continue;
    }
    if (!rev.outcome_summary?.trim()) return false;
  }
  return true;
}
```

### T2 — `renderMeritSummary`: blocking list + dismiss buttons + overridden badge

Replace the entire footer section (from `h += '<div class="dt-story-section-actions">';` to
and including the `h += '</div></div>'; return h;` lines) with the new implementation below.

Key logic:

1. Build `blockingItems[]` — all actions that are incomplete ignoring overrides. Each entry is
   `{ idx, label, reason }`.
2. Split into `remainingBlocks` (not overridden) and `dismissedBlocks` (overridden).
3. Dot class: `complete` (from `meritSummaryComplete`, which already respects overrides) →
   `dt-story-dot-complete` vs `dt-story-dot-pending`. No change to dot derivation is needed.

Replacement (full footer + closing tags):

```js
  // Build the list of all blocking items (ignoring overrides — overrides determine display)
  const acqRes    = sub?.acquisitions_resolved || [];
  const overrides = new Set(sub?.st_narrative?.merit_summary_overrides || []);

  const blockingItems = [];
  actions.forEach((a, i) => {
    const rev = resolved[i] || {};
    if ((rev.pool_status || '') === 'skipped') return;
    const cat = deriveMeritCategory(a.merit_type);
    if (cat === 'resources') {
      const revStatus = resolved[i]?.pool_status || '';
      if (revStatus === 'validated' || revStatus === 'skipped') return;
      const acqStatus = acqRes[0]?.pool_status || '';
      if (acqStatus === 'validated' || acqStatus === 'skipped') return;
      const { label, qualifier } = getMeritDetails(char, a);
      const displayLabel = label + (qualifier ? ` (${qualifier})` : '');
      blockingItems.push({ idx: i, label: displayLabel || 'Resources', reason: 'acquisition outcome pending' });
    } else {
      if (rev.outcome_summary?.trim()) return;
      const { label, qualifier } = getMeritDetails(char, a);
      const displayLabel = label + (qualifier ? ` (${qualifier})` : '');
      blockingItems.push({ idx: i, label: displayLabel || a.merit_type || 'Merit', reason: 'outcome not yet recorded' });
    }
  });

  const remainingBlocks = blockingItems.filter(item => !overrides.has(item.idx));
  const dismissedBlocks = blockingItems.filter(item =>  overrides.has(item.idx));
  const genuinelyComplete = blockingItems.length === 0;

  h += `<div class="dt-story-section-actions">`;
  if (genuinelyComplete) {
    h += `<span class="dt-story-complete-badge">&#10003; All outcomes recorded</span>`;
  } else if (remainingBlocks.length === 0) {
    // All blocks dismissed
    const n = dismissedBlocks.length;
    h += `<span class="dt-story-complete-badge dt-story-complete-overridden">&#10003; Overridden (${n} dismissed)</span>`;
  } else {
    const n = remainingBlocks.length;
    h += `<span class="dt-story-pending-note">${n} outcome${n !== 1 ? 's' : ''} still to record in DT Processing</span>`;
  }

  // Render blocking list — remaining (dismissable) first, then dismissed (undismissable)
  const allDisplayed = [...remainingBlocks, ...dismissedBlocks];
  if (allDisplayed.length) {
    h += `<div class="dt-merit-blocking-list">`;
    for (const item of allDisplayed) {
      const isDismissed = overrides.has(item.idx);
      const btnClass = isDismissed ? 'dt-merit-dismiss-btn dt-merit-dismiss-btn--active' : 'dt-merit-dismiss-btn';
      const btnLabel = isDismissed ? 'Undismiss' : 'Dismiss';
      h += `<div class="dt-merit-blocking-item">`;
      h += `<span class="dt-merit-blocking-item-label">${esc(item.label)}</span>`;
      h += `<span class="dt-merit-blocking-reason">— ${esc(item.reason)}</span>`;
      h += `<button class="${btnClass}" data-action-idx="${item.idx}">${btnLabel}</button>`;
      h += `</div>`;
    }
    h += `</div>`;
  }

  h += `</div>`;
  h += `</div></div>`;
  return h;
```

**Important — `char` must be in scope.** The current `renderMeritSummary` signature is
`function renderMeritSummary(char, sub)` — `char` is already the first parameter, so
`getMeritDetails(char, a)` works without changes.

### T3 — `_handleMeritSummaryDismiss(btn)` handler

Add this async function near `_handleStoryTaBlur` (around line 381) or adjacent to other
`_handle*` helpers:

```js
async function _handleMeritSummaryDismiss(btn) {
  if (!_currentSub) return;
  const sub = _currentSub;
  const idx = parseInt(btn.dataset.actionIdx, 10);
  if (isNaN(idx)) return;

  const current = Array.isArray(sub.st_narrative?.merit_summary_overrides)
    ? [...sub.st_narrative.merit_summary_overrides]
    : [];

  const updated = current.includes(idx)
    ? current.filter(i => i !== idx)
    : [...current, idx].sort((a, b) => a - b);

  await saveNarrativeField(sub._id, { 'st_narrative.merit_summary_overrides': updated });
  (sub.st_narrative ??= {}).merit_summary_overrides = updated;

  const char = getCharForSub(sub);
  const view = document.getElementById('dt-story-char-view');
  if (view) view.innerHTML = renderCharacterView(char, sub);
}
```

### T4 — Wire dismiss handler into click dispatch

In the click dispatch listener (lines ~270–331), add a new handler guard. Insert it immediately
after the `feedApproveBtn` block (line ~291) and before the `saveDraftBtn` block (line ~293):

```js
    // Merit summary dismiss / undismiss
    const dismissBtn = e.target.closest('.dt-merit-dismiss-btn');
    if (dismissBtn) { _handleMeritSummaryDismiss(dismissBtn); return; }
```

### T5 — CSS: new classes for blocking list and overridden badge

Append to the merit summary block in `public/css/admin-layout.css` (after line 6959,
`.dt-story-pending-note { color: var(--txt3); font-style: italic; }`):

```css
/* ── Issue #458: merit summary dismiss/override ──────────────────── */
.dt-story-complete-badge.dt-story-complete-overridden { color: var(--gold2); }
.dt-merit-blocking-list {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.dt-merit-blocking-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.dt-merit-blocking-item-label { color: var(--txt2); font-weight: 500; }
.dt-merit-blocking-reason { color: var(--txt3); font-style: italic; flex: 1; }
.dt-merit-dismiss-btn {
  font-size: 11px;
  padding: 2px 7px;
  border: 1px solid var(--bdr);
  border-radius: 3px;
  background: var(--surf2);
  color: var(--txt2);
  cursor: pointer;
  white-space: nowrap;
}
.dt-merit-dismiss-btn:hover { border-color: var(--gold2); color: var(--gold2); }
.dt-merit-dismiss-btn--active {
  border-color: var(--gold2);
  color: var(--gold2);
  background: var(--surf3);
}
```

### T6 — Playwright spec

File: `tests/feat-458-dt-story-merit-summary-dismiss.spec.js`

Use the `fake-test-token` auth pattern from
`tests/fix-432-checklist-merit-star-icon.spec.js` (mock `/api/auth/me`, mock
`/api/downtime_cycles`, mock `/api/downtime_submissions/:id`, set `merit_actions` directly on
the submission fixture to bypass `buildMeritActions`).

**Fixtures:**

```js
const baseSub = (id) => ({
  _id: id,
  character_id: 'char-test',
  character_name: 'Test Character',
  cycle_id: 'cycle-test',
  cycle_name: 'Test Cycle',
  responses: {},
  _raw: { sphere_actions: [], contact_actions: { requests: [] }, retainer_actions: { actions: [] } },
  merit_actions: [],
  merit_actions_resolved: [],
  acquisitions_resolved: [],
  st_narrative: {},
  st_review: {},
  projects_resolved: [],
  feeding_validation: {},
});

// One blocking contacts action, no outcome_summary
const SUB_ONE_MISSING = {
  ...baseSub('sub-458-one'),
  merit_actions: [{ merit_type: 'Contacts (Church)', action_type: 'misc', desired_outcome: 'Info from Church' }],
  merit_actions_resolved: [{ pool_status: 'confirmed', outcome_summary: '' }],
};

// Two blocking actions
const SUB_TWO_MISSING = {
  ...baseSub('sub-458-two'),
  merit_actions: [
    { merit_type: 'Allies 3 (Police)', action_type: 'misc', desired_outcome: 'Police help' },
    { merit_type: 'Contacts (Church)', action_type: 'misc', desired_outcome: 'Church info' },
  ],
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: '' },
    { pool_status: 'confirmed', outcome_summary: '' },
  ],
};

// One missing, already dismissed (overrides: [0])
const SUB_DISMISSED = {
  ...baseSub('sub-458-dismissed'),
  merit_actions: [{ merit_type: 'Contacts (Church)', action_type: 'misc', desired_outcome: 'Church info' }],
  merit_actions_resolved: [{ pool_status: 'confirmed', outcome_summary: '' }],
  st_narrative: { merit_summary_overrides: [0] },
};

// All outcomes genuinely complete
const SUB_COMPLETE = {
  ...baseSub('sub-458-complete'),
  merit_actions: [{ merit_type: 'Allies 2 (Police)', action_type: 'misc', desired_outcome: 'Police help' }],
  merit_actions_resolved: [{ pool_status: 'confirmed', outcome_summary: 'Police network maintained.' }],
};
```

**Tests to write (AC-1 through AC-6):**

```
AC-1: SUB_ONE_MISSING → "1 outcome still to record in DT Processing" visible; action name
      "Contacts (Church)" visible in blocking list; reason "outcome not yet recorded" visible.

AC-2: SUB_ONE_MISSING → Dismiss button present with text "Dismiss".

AC-3: SUB_TWO_MISSING → count text says "2 outcomes still to record"; both action names
      visible in blocking list.

AC-4: SUB_DISMISSED → section dot is green (dt-story-dot-complete); "Overridden (1 dismissed)"
      badge present; Undismiss button visible; no "still to record" text.

AC-5: SUB_DISMISSED → clicking Undismiss fires PATCH to /api/downtime_submissions/:id;
      after re-render, "1 outcome still to record" text re-appears and Dismiss button shown.
      (Mock the PATCH endpoint and assert it was called with merit_summary_overrides: [].)

AC-6: SUB_COMPLETE → "All outcomes recorded" badge visible; no blocking list rendered;
      dot is green; no "Dismiss" button.
```

**Pattern for checking dot class:**

```js
const dot = await page.locator('[data-section="merit_summary"] .dt-story-completion-dot');
await expect(dot).toHaveClass(/dt-story-dot-complete/);
```

## Acceptance Criteria

- [x] AC-1: When merit summary is incomplete, each blocking action is listed by name and reason below the count message
- [x] AC-2: Each blocking item has a Dismiss button
- [x] AC-3: Clicking Dismiss saves `merit_summary_overrides` via `saveNarrativeField` and immediately re-renders the section
- [x] AC-4: When all blocking items are dismissed, the section shows "Overridden (N dismissed)" in amber and the dot turns green
- [x] AC-5: Dismissed items show an Undismiss button; clicking it removes the override and re-renders
- [x] AC-6: Submissions with all outcomes genuinely present show only the green "All outcomes recorded" badge with no blocking list

## Dev Agent Record

_To be completed by the implementing agent._

### Tasks Completed
- [x] T1 — `meritSummaryComplete` override check
- [x] T2 — `renderMeritSummary` blocking list + overridden badge
- [x] T3 — `_handleMeritSummaryDismiss` handler
- [x] T4 — Click dispatch wire-up
- [x] T5 — CSS
- [x] T6 — Playwright spec (6 tests: AC-1 through AC-6)

### Notes

Root cause discovered during AC-5 debugging: Playwright glob pattern `**/api/downtime_submissions*`
does not match URLs with additional path segments (e.g. `.../downtime_submissions/sub-id`) because
Playwright's `*` wildcard does not cross `/` boundaries. Route mock in the spec was changed to use
a regex (`/\/api\/downtime_submissions/`) so both the list endpoint (GET) and ID endpoint (PUT)
are intercepted correctly.

### File List
- `public/js/admin/downtime-story.js` — T1–T4: `meritSummaryComplete`, `renderMeritSummary`, `_handleMeritSummaryDismiss`, click dispatch
- `public/css/admin-layout.css` — T5: new CSS classes
- `tests/feat-458-dt-story-merit-summary-dismiss.spec.js` — T6: 6 Playwright tests
- `specs/stories/feat.458.dt-story-merit-summary-dismiss.story.md` — story file (this file)
- `specs/stories/sprint-status.yaml` — status updated to `review`
