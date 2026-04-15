# Story feature.74: Support — Target Action Selector (C3)

## Status: ready-for-dev

## Story

**As an** ST coding a Support merit action,
**I want** to select which action in the queue this support is linked to,
**so that** the teamwork bonus is correctly associated with the action it supports.

## Background

Support actions exist in the dropdown but have no way to record which action they're supporting. Per the matrix, a Support action adds successes as an uncapped Teamwork Bonus to the supported action's pool. The ST needs to link the support action to its target entry in the processing queue.

The processing queue is available as an array of entries with unique `key` values. Each entry has `entry.key`, `entry.charName`, `entry.meritLabel` or `entry.projTitle`, and `entry.actionType`.

---

## Acceptance Criteria

1. When `entry.actionType === 'support'`, the action panel shows a **Supporting** dropdown listing all other entries in the current processing queue, grouped or labelled by character name + action description.
2. The dropdown excludes the current entry itself.
3. The selected entry's `key` saves to `rev.support_target_key`.
4. View mode shows the selected target as a single summary line: `Supporting: [Character] — [Action]`.
5. The field is included in `buildActionContext` when set. Label: `Supporting Action`.
6. Field only appears for `support` action type.

---

## Tasks / Subtasks

- [ ] Task 1: Add support target dropdown to merit panel
  - [ ] Gate on `entry.actionType === 'support'`
  - [ ] Build options from the current `_procQueue` or equivalent — each entry formatted as `${charName} — ${actionLabel}`
  - [ ] Exclude current entry (`entry.key`)
  - [ ] Pre-select from `rev.support_target_key`
  - [ ] CSS class: `proc-support-target-sel`

- [ ] Task 2: Save handler
  - [ ] On change: `saveEntryReview(entry, { support_target_key: val })`

- [ ] Task 3: Wire into `buildActionContext`
  - [ ] Resolve the target entry from key; push label line if found

- [ ] Task 4: Manual verification
  - [ ] Set an action to Support — confirm dropdown populates with other queue entries
  - [ ] Select a target, save — confirm persists and displays correctly

---

## Dev Notes

### Queue access

The processing queue is built in `buildProcessingQueue` and stored globally. Check how `renderActionPanel` receives or can access the full queue to populate the dropdown.

### Schema path

```js
rev.support_target_key  // entry.key of the supported action
```

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add support target dropdown |
| `public/js/admin/downtime-story.js` | Wire into `buildActionContext` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
