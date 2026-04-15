# Story feature.72: Patrol / Scout Outcome Recording (C1)

## Status: done

## Story

**As an** ST resolving a Patrol/Scout merit action,
**I want** structured fields to record what was observed and at what detail level,
**so that** the outcome is captured in the submission record rather than only in my head.

## Background

Patrol/Scout actions exist in the action-type dropdown but have no outcome recording UI beyond the status buttons. The ST currently resolves these mentally with no structured record. Per the merit action matrix: Patrol/Scout returns info on 1 action per success by a PC or merit in a territory not covered by Hide/Protect, with detail scaling from 1 success (vague) to 5+ (detailed).

Territory pills are already wired for allies/merit actions. This story adds outcome fields specific to patrol/scout.

---

## Acceptance Criteria

1. When `entry.actionType === 'patrol_scout'`, the action panel shows an outcome section with:
   - **Actions Observed** — textarea for recording what was seen (free text)
   - **Detail Level** — selector: `1 — Vague` / `2` / `3` / `4` / `5+ — Detailed`
2. Fields appear in the left column, below the action-type row, above status buttons.
3. Actions Observed saves to `rev.patrol_observed`.
4. Detail Level saves to `rev.patrol_detail_level`.
5. Both fields are included in `buildActionContext` when present. Labels: `Observed` and `Detail Level`.
6. Fields only appear for `patrol_scout` action type.

---

## Tasks / Subtasks

- [ ] Task 1: Add outcome section to `renderActionPanel` merit block
  - [ ] Gate on `entry.actionType === 'patrol_scout'`
  - [ ] Render textarea (`proc-patrol-observed-ta`) and select (`proc-patrol-detail-sel`)
  - [ ] Pre-populate from `rev.patrol_observed` and `rev.patrol_detail_level`

- [ ] Task 2: Save handlers
  - [ ] `patrol_observed` → `saveEntryReview(entry, { patrol_observed: val })`
  - [ ] `patrol_detail_level` → `saveEntryReview(entry, { patrol_detail_level: val })`

- [ ] Task 3: Wire into `buildActionContext`
  - [ ] After effect line, add patrol fields if present

- [ ] Task 4: Manual verification
  - [ ] Set an action to Patrol/Scout type — confirm outcome fields appear
  - [ ] Record outcome, confirm saves and persists

---

## Dev Notes

### Detail level options

```js
const PATROL_DETAIL_LEVELS = ['1 — Vague', '2', '3', '4', '5+ — Detailed'];
```

### Schema paths

```js
rev.patrol_observed      // textarea text
rev.patrol_detail_level  // '1 — Vague' | '2' | '3' | '4' | '5+ — Detailed'
```

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add outcome fields to merit panel for patrol_scout |
| `public/js/admin/downtime-story.js` | Wire into `buildActionContext` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
