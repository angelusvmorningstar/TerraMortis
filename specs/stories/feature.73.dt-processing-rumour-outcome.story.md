# Story feature.73: Rumour Outcome Recording (C2)

## Status: ready-for-dev

## Story

**As an** ST resolving a Rumour merit action,
**I want** structured fields to record what rumour was surfaced and at what detail level,
**so that** the outcome is captured in the submission record.

## Background

Rumour actions exist in the dropdown but have no outcome recording UI beyond status buttons. Same gap as Patrol/Scout (feature.72). Per the matrix: Rumour returns info on 1 action taken by a similar merit not covered by Hide/Protect, with detail scaling 1–5+. Unlike Patrol/Scout (territory-based), Rumour is sphere/network-based.

This story mirrors feature.72 with Rumour-specific field labels.

---

## Acceptance Criteria

1. When `entry.actionType === 'rumour'`, the action panel shows:
   - **Rumour Surfaced** — textarea for recording what was heard (free text)
   - **Detail Level** — selector: `1 — Vague` / `2` / `3` / `4` / `5+ — Detailed`
2. Rumour Surfaced saves to `rev.rumour_content`.
3. Detail Level saves to `rev.rumour_detail_level`.
4. Both fields included in `buildActionContext` when present.
5. Fields only appear for `rumour` action type.

---

## Tasks / Subtasks

- [ ] Task 1: Add outcome section to `renderActionPanel` merit block
  - [ ] Gate on `entry.actionType === 'rumour'`
  - [ ] Render textarea (`proc-rumour-content-ta`) and select (`proc-rumour-detail-sel`)
  - [ ] Pre-populate from `rev.rumour_content` and `rev.rumour_detail_level`

- [ ] Task 2: Save handlers
  - [ ] `rumour_content` → `saveEntryReview(entry, { rumour_content: val })`
  - [ ] `rumour_detail_level` → `saveEntryReview(entry, { rumour_detail_level: val })`

- [ ] Task 3: Wire into `buildActionContext`

- [ ] Task 4: Manual verification

---

## Dev Notes

Same detail level options as feature.72: `['1 — Vague', '2', '3', '4', '5+ — Detailed']`

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add outcome fields for rumour action type |
| `public/js/admin/downtime-story.js` | Wire into `buildActionContext` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
