# Story feature.75: Block — Outcome Display (C4)

## Status: ready-for-dev

## Story

**As an** ST processing a Block merit action,
**I want** a clear resolved-state display showing what the block auto-resolves,
**so that** I can confirm and close out the action without rolling.

## Background

Block is fully automatic — no roll required. Per the matrix: Block auto-blocks any merit of the same level or lower. The panel currently has the status buttons but no display of what level is being blocked or a confirmation UI. The ST has to calculate this mentally.

No pool builder is needed. This is a Zone 3 (Outcome) addition only — a display panel showing the auto-resolution, plus a confirmation toggle.

---

## Acceptance Criteria

1. When `entry.actionType === 'block'`, the action panel right-side shows a Block Resolution panel (Zone 3) instead of the pool builder.
2. The panel displays: `Auto-blocks: merits of level [N] or lower` where N is the blocking merit's dot rating.
3. A **Confirm Block** toggle/button is available. When clicked, it sets `pool_status` to `'no_action'` (Block = no roll needed = skip equivalent) via the existing status button mechanism.
4. The existing status buttons (pending / no_action / skip) remain accessible.
5. No pool builder is rendered for block actions.
6. `buildActionContext` notes the block as automatic with the level cap.

---

## Tasks / Subtasks

- [ ] Task 1: Add Block resolution panel to right-side rendering
  - [ ] In `_renderMeritRightPanel`, gate a special display on `actionType === 'block'`
  - [ ] Show `Auto-blocks merits of level [dots] or lower`
  - [ ] Render a Confirm button that saves `pool_status: 'no_action'`
  - [ ] Suppress pool builder sections for block

- [ ] Task 2: Wire into `buildActionContext`
  - [ ] Push `Effect: Auto-blocks merits of level ${dots} or lower` when action is block

- [ ] Task 3: Manual verification
  - [ ] Set an action to Block — confirm pool builder is gone, resolution panel shows
  - [ ] Confirm button sets status correctly

---

## Dev Notes

### Merit dots access

`entry.meritDots` holds the dot rating of the merit performing the block.

### Status value

Block confirmed → `pool_status: 'no_action'` (already in `DONE_STATUSES`).

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add block resolution display to `_renderMeritRightPanel` |
| `public/js/admin/downtime-story.js` | Wire into `buildActionContext` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
