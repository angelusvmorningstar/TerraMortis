# Story 1.9: Validation Button Consistency

## Status: ready-for-dev

## Story

**As an** ST reviewing actions in DT Processing,
**I want** consistent status buttons (Pending / Validated or Approved / No Roll Needed / Skip) across all action types,
**so that** the phase progress counter and DT Story Copy Context visibility behave predictably for every action.

## Background

DT Story (B2 and B3) suppresses the Copy Context button for skipped actions and excludes them from completion counting. For this to work, every action type in DT Processing must be able to reach a `skipped` pool_status. Currently, some action types lack the Skip button entirely.

This story audits all action type status button sets in `downtime-views.js` and closes the gaps. It is the only story in this epic that explicitly modifies `downtime-views.js`.

---

## Audit findings

The audit is based on `_renderValStatusButtons` call sites and the `_renderMeritRightPanel`, `_renderSorceryRightPanel`, `_renderProjRightPanel`, and fallthrough rendering blocks in downtime-views.js.

### DONE_STATUSES — already correct

```js
const DONE_STATUSES = new Set(['validated', 'no_roll', 'no_feed', 'maintenance', 'resolved', 'no_effect', 'skipped']);
```

All needed status values are already present. No change required.

### Status button gaps by action type

| Renderer / context | Function | Current buttons | Gaps |
|--------------------|----------|-----------------|------|
| Merit actions | `_renderMeritRightPanel` (line ~5151) | pending, resolved, no_roll, skipped | ✅ None |
| Project actions | `_renderProjRightPanel` (line ~5287) | pending, validated, no_roll | ❌ Missing `skipped` |
| Sorcery | `_renderSorceryRightPanel` (line ~5219) | pending, resolved, no_effect | ❌ Missing `skipped` |
| Feeding | `_renderFeedRightPanel` (line ~5550) | pending, validated, no_feed | ✅ None (feeding always rolls; no_feed covers invalid feeding; skip N/A) |
| Other/fallthrough | Inline in detail panel (line ~6330) | pending, validated, no_roll | ❌ Missing `skipped` |

### No Roll Needed coverage

`no_roll` is present for: merit actions, project actions, and fallthrough actions. **Not** needed for:
- Sorcery — a rite always requires a roll when cast; `no_effect` covers zero-success outcomes
- Feeding — feeding always involves a roll; `no_feed` covers invalid feeding

No changes needed for sorcery or feeding on this dimension.

---

## Required changes

### 1. Project actions — add Skip

**File:** `public/js/admin/downtime-views.js`
**Function:** `_renderProjRightPanel` (~line 5287)

```js
// Before:
h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed']]);

// After:
h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']]);
```

### 2. Sorcery — add Skip

**File:** `public/js/admin/downtime-views.js`
**Function:** `_renderSorceryRightPanel` (~line 5219)

```js
// Before:
h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['resolved', 'Resolved'], ['no_effect', 'No Effect']]);

// After:
h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['resolved', 'Resolved'], ['no_effect', 'No Effect'], ['skipped', 'Skip']]);
```

Rationale: if a character's rite submission is voided or withdrawn before processing, the ST needs a way to close it out without rolling. `skipped` covers this.

### 3. Fallthrough (other) actions — add Skip

**File:** `public/js/admin/downtime-views.js`
**Block:** Inline status rendering (~line 6330)

```js
// Before:
const statusOptions = isSorcery
  ? [['pending', 'Pending'], ['resolved', 'Resolved'], ['no_effect', 'No Effect']]
  : [['pending', 'Pending'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed']];

// After:
const statusOptions = isSorcery
  ? [['pending', 'Pending'], ['resolved', 'Resolved'], ['no_effect', 'No Effect'], ['skipped', 'Skip']]
  : [['pending', 'Pending'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']];
```

Note: this fallthrough block is only reached for action types that are not feeding, project, sorcery, or merit — per the condition at line 6329. The `isSorcery` branch here is dead code (sorcery is already handled above), but amending it for consistency is harmless and future-safe.

---

## DT Story implications (documentation only — no code change)

B2 (`renderProjectReports`) already specifies:
> Skipped actions (`pool_status === 'skipped'`) are not rendered

B3 (`renderMeritActionReports`) already specifies:
> Skipped actions do not generate a Copy Context card

Both stories were written with this constraint. Adding `skipped` to project and fallthrough status buttons in DT Processing completes the circuit — once the ST marks an action skipped, DT Story correctly suppresses it.

---

## Acceptance Criteria

1. Project action status buttons in DT Processing are: Pending / Validated / No Roll Needed / Skip.
2. Sorcery action status buttons in DT Processing are: Pending / Resolved / No Effect / Skip.
3. Fallthrough (other) action status buttons in DT Processing are: Pending / Validated / No Roll Needed / Skip.
4. Merit action status buttons are unchanged (already correct).
5. Feeding action status buttons are unchanged (already correct — skip N/A for feeding).
6. A project action set to `skipped` counts toward phase completion (already handled by `DONE_STATUSES` — no code change needed).
7. A sorcery action set to `skipped` counts toward phase completion (already handled by `DONE_STATUSES`).
8. `DONE_STATUSES` is not modified.
9. No changes to `downtime-story.js` — DT Story's existing `skipped` checks are already correct.

---

## Tasks / Subtasks

- [ ] Task 1: Project actions — add Skip button
  - [ ] Find `_renderProjRightPanel` in downtime-views.js (~line 5287)
  - [ ] Add `['skipped', 'Skip']` to the status button array

- [ ] Task 2: Sorcery — add Skip button
  - [ ] Find `_renderSorceryRightPanel` in downtime-views.js (~line 5219)
  - [ ] Add `['skipped', 'Skip']` to the status button array

- [ ] Task 3: Fallthrough (other) actions — add Skip button
  - [ ] Find the fallthrough status block in downtime-views.js (~line 6330)
  - [ ] Add `['skipped', 'Skip']` to both branches of the `isSorcery` ternary

- [ ] Task 4: Manual verification
  - [ ] Open DT Processing with an active cycle
  - [ ] Confirm project action shows Pending / Validated / No Roll Needed / Skip
  - [ ] Confirm sorcery action (if any) shows Pending / Resolved / No Effect / Skip
  - [ ] Set a project action to Skip — confirm it counts toward phase progress
  - [ ] Confirm merit action buttons are unchanged

---

## Dev Notes

### Line number guidance

Line numbers are approximate and may shift with other changes. Use function name search rather than line numbers:
- `_renderProjRightPanel` → search for `Validation Status` comment inside it
- `_renderSorceryRightPanel` → search for `Validation Status` comment inside it
- Fallthrough block → search for `entry.source !== 'feeding' && entry.source !== 'project' && !isSorcery && entry.source !== 'merit'`

### Skipped project action — roll card behaviour

When a project action is skipped, the roll card is irrelevant. No change to roll card visibility is required — if the action is already rolled before being skipped, that's fine. The Skip status is purely for pool_status tracking.

### DONE_STATUSES already handles skipped

```js
const DONE_STATUSES = new Set(['validated', 'no_roll', 'no_feed', 'maintenance', 'resolved', 'no_effect', 'skipped']);
```

`skipped` is already in the set. No change needed. Once the button is added, phase progress counting automatically works.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Modify: three `_renderValStatusButtons` call sites — add `['skipped', 'Skip']` to each |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Debug Log References
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`
