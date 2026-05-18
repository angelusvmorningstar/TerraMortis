---
issue: 361
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/361
branch: ms/issue-361-dt-story-processing-status-chip
status: review
---

# Story: DT Story — Read-Only Processing Status Chip on Action Cards

## Story

As an ST writing downtime narratives in DT Story,
I want each action card (merit actions, projects, feeding) to show a read-only chip displaying the DT Processing pool_status,
so that I can tell at a glance whether an action has been processed and is ready to write without switching tabs.

## Acceptance Criteria

- [ ] Each merit action card in DT Story (allies, status, retainers, contacts, resources, misc) displays a read-only chip showing the action's `pool_status` from `sub.merit_actions_resolved[idx].pool_status`.
- [ ] Each project card in DT Story displays a read-only chip showing `sub.projects_resolved[idx].pool_status`.
- [ ] The feeding section header in DT Story displays a read-only chip showing `sub.feeding_review.pool_status`.
- [ ] Chips use the existing `.proc-row-status` CSS class and modifier (e.g., `.proc-row-status.pending`) — no new CSS required.
- [ ] Chip label text comes from `POOL_STATUS_LABELS` (e.g., `pending` → `"Pending"`, `validated` → `"Validated"`).
- [ ] Chips are purely read-only — no click handlers, no writes.
- [ ] If `pool_status` is absent or undefined, the chip falls back to `"Pending"` (matching the existing DT Processing behaviour).
- [ ] `POOL_STATUS_LABELS` is moved to `downtime-constants.js` and exported; both `downtime-story.js` and `downtime-views.js` import it from there. The "Zero imports from downtime-views.js" invariant in `downtime-story.js` is preserved.

## Dev Notes

### Architecture: Zero-import invariant

`downtime-story.js` line 5: `"Zero imports from downtime-views.js."` This is a hard architectural constraint (NFR-DS-01 per `downtime-constants.js` header). `POOL_STATUS_LABELS` lives in `downtime-views.js` as a local `const` (not exported, line 242). The solution is to move it to `downtime-constants.js` — already the shared-constants file imported by both files — and import it in `downtime-story.js`.

### The existing chip pattern

`downtime-views.js` lines 874 and 4418 render:
```js
h += `<span class="proc-row-status ${status}">${POOL_STATUS_LABELS[status] || status}</span>`;
```
Use this exact pattern. No new CSS is needed — `.proc-row-status` and all its modifier variants (`pending`, `validated`, `rolled`, `confirmed`, `no_roll`, `no_feed`, `maintenance`, `resolved`, `no_effect`, `obvious`, `neutral`, `subtle`) are already defined in `admin-layout.css` lines 4711-4743 and their light-mode overrides at lines 6190-6239.

### POOL_STATUS_LABELS reference

```js
const POOL_STATUS_LABELS = {
  pending:     'Pending',
  confirmed:   'Confirmed',
  rolled:      'Rolled',
  validated:   'Validated',
  no_roll:     'No Roll',
  no_feed:     'No Valid Feeding',
  maintenance: 'Maintenance',
  resolved:    'Resolved',
  no_effect:   'No Effect',
  obvious:     'Obvious',
  neutral:     'Neutral',
  subtle:      'Subtle',
};
```

### Files to change

| File | Change |
|------|--------|
| `public/js/admin/downtime-constants.js` | Add `POOL_STATUS_LABELS` export (move from downtime-views.js) |
| `public/js/admin/downtime-views.js` | Remove local `POOL_STATUS_LABELS` const; import from downtime-constants.js |
| `public/js/admin/downtime-story.js` | Import `POOL_STATUS_LABELS` from downtime-constants.js; add chip to 3 render functions |

### Exact insertion points in downtime-story.js

**1. Import line (~line 16)** — add `POOL_STATUS_LABELS` to the existing import from `./downtime-constants.js`:
```js
import { ACTION_TYPE_LABELS, MERIT_MATRIX, INVESTIGATION_MATRIX, TERRITORY_SLUG_MAP as _TERRITORY_SLUG_MAP_BASE, AMBIENCE_STEPS, POOL_STATUS_LABELS } from './downtime-constants.js';
```

**2. `renderActionCard()` (~line 2297) — `.dt-story-merit-header` div**

Current:
```js
h += `<div class="dt-story-merit-header">`;
const chipLabel = meritCat === 'resources' ? 'Request' : modeLabel;
const chipClass = (meritCat === 'resources' || isAuto) ? 'auto' : 'rolled';
h += `<span class="dt-story-mode-chip ${chipClass}">${chipLabel}</span>`;
h += `<span class="dt-story-merit-label">${label}${dotStr ? ' ' + dotStr : ''}${qualStr}</span>`;
h += `<button class="dt-story-copy-ctx-btn" data-action-idx="${idx}">Copy Context</button>`;
h += `</div>`;
```

After change — add the status chip after the mode chip:
```js
h += `<div class="dt-story-merit-header">`;
const chipLabel = meritCat === 'resources' ? 'Request' : modeLabel;
const chipClass = (meritCat === 'resources' || isAuto) ? 'auto' : 'rolled';
h += `<span class="dt-story-mode-chip ${chipClass}">${chipLabel}</span>`;
const procStatus = rev.pool_status || 'pending';
h += `<span class="proc-row-status ${procStatus}">${POOL_STATUS_LABELS[procStatus] || procStatus}</span>`;
h += `<span class="dt-story-merit-label">${label}${dotStr ? ' ' + dotStr : ''}${qualStr}</span>`;
h += `<button class="dt-story-copy-ctx-btn" data-action-idx="${idx}">Copy Context</button>`;
h += `</div>`;
```

Note: `rev` is already defined at line 2244 as `const rev = sub.merit_actions_resolved?.[idx] || {};`

**3. `renderProjectCard()` (~line 1358) — `.dt-story-proj-header` div**

Current:
```js
h += `<div class="dt-story-proj-header">`;
h += `<span class="dt-story-action-chip">${actionLabel}</span>`;
h += `<span class="dt-story-proj-title">${title}</span>`;
h += `<button class="dt-story-copy-ctx-btn" data-proj-idx="${idx}">Copy Context</button>`;
h += `</div>`;
```

After change:
```js
h += `<div class="dt-story-proj-header">`;
h += `<span class="dt-story-action-chip">${actionLabel}</span>`;
const projStatus = rev.pool_status || 'pending';
h += `<span class="proc-row-status ${projStatus}">${POOL_STATUS_LABELS[projStatus] || projStatus}</span>`;
h += `<span class="dt-story-proj-title">${title}</span>`;
h += `<button class="dt-story-copy-ctx-btn" data-proj-idx="${idx}">Copy Context</button>`;
h += `</div>`;
```

Note: `rev` is already defined at line 1320 as `const rev = sub.projects_resolved?.[idx] || {};`

**4. `renderFeedingValidation()` (~line 1192) — feeding section header**

Current:
```js
h += `<div class="dt-story-section-header">`;
h += `<span class="dt-story-section-label">Feeding</span>`;
h += `<span class="dt-story-completion-dot ${complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span>`;
h += `</div>`;
```

After change:
```js
h += `<div class="dt-story-section-header">`;
h += `<span class="dt-story-section-label">Feeding</span>`;
h += `<span class="proc-row-status ${poolStatus}">${POOL_STATUS_LABELS[poolStatus] || poolStatus}</span>`;
h += `<span class="dt-story-completion-dot ${complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span>`;
h += `</div>`;
```

Note: `poolStatus` is already defined at line 1189 as `const poolStatus = fr.pool_status || 'pending';`

### downtime-constants.js change

Append at the end of `downtime-constants.js` (or after the `AMBIENCE_STEPS` export):
```js
// Human-readable labels for pool_status values (shared with downtime-views.js)
export const POOL_STATUS_LABELS = {
  pending:     'Pending',
  confirmed:   'Confirmed',
  rolled:      'Rolled',
  validated:   'Validated',
  no_roll:     'No Roll',
  no_feed:     'No Valid Feeding',
  maintenance: 'Maintenance',
  resolved:    'Resolved',
  no_effect:   'No Effect',
  obvious:     'Obvious',
  neutral:     'Neutral',
  subtle:      'Subtle',
};
```

### downtime-views.js change

Replace the local `const POOL_STATUS_LABELS = { ... }` block (lines 242-255) with an import at the top of the file. Check what `downtime-views.js` already imports from `downtime-constants.js` and add `POOL_STATUS_LABELS` to that import.

## Tasks

- [x] Move `POOL_STATUS_LABELS` to `downtime-constants.js` as an export
- [x] Update `downtime-views.js` to import `POOL_STATUS_LABELS` from constants (remove local const)
- [x] Import `POOL_STATUS_LABELS` in `downtime-story.js` from constants
- [x] Add status chip to `renderActionCard()` merit header
- [x] Add status chip to `renderProjectCard()` project header
- [x] Add status chip to `renderFeedingValidation()` section header
- [ ] Smoke test: open DT Story, verify chips appear on action cards with correct label and colour for at least pending, validated, and no_roll statuses

## Verification

- Open DT Story tab for a character with mixed processing states.
- Each merit action card header should show a coloured chip (e.g., yellow "Pending", green "Validated").
- Each project card header should show the same chip.
- The Feeding section header should show the feeding `pool_status` chip.
- Chips are not interactive (no cursor change, no click effect).
- No regressions in DT Processing (chips there still render correctly).
- No console errors about missing imports.

## Dev Agent Record

### File List
- `public/js/admin/downtime-constants.js` — added `POOL_STATUS_LABELS` export
- `public/js/admin/downtime-views.js` — import `POOL_STATUS_LABELS` from constants; removed local const
- `public/js/admin/downtime-story.js` — import `POOL_STATUS_LABELS`; added chip to feeding section header, project card header, and merit action card header

### Change Log
- 2026-05-18: Moved `POOL_STATUS_LABELS` to `downtime-constants.js`; added read-only `.proc-row-status` chip to feeding, project, and merit action card headers in DT Story

### Completion Notes
`POOL_STATUS_LABELS` moved from a local const in `downtime-views.js` to an export in `downtime-constants.js`, satisfying the NFR-DS-01 "zero imports from downtime-views.js" constraint. Chips use the existing `.proc-row-status` CSS class pattern — no new CSS required. All three insertion points use the same `rev.pool_status || 'pending'` fallback. Parse-checked clean via `node --input-type=module --check`. Smoke test (manual browser verification) remains for user.
