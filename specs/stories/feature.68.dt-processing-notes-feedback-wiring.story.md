# Story feature.68: ST Notes + Player Feedback → DT Story (A1)

## Status: done

## Story

**As an** ST processing downtimes,
**I want** the DT Story copy context to include ST notes and player feedback for each action,
**so that** the prompt generator has full context and player-visible feedback flows correctly to the narrative output.

## Background

Both fields already exist and save correctly:
- `st_notes` — submission-level field, flagged `st_notes_visibility: 'st_only'`. ST-only context. Not visible to players.
- `player_feedback` — per-action field on review objects (`feeding_review.player_feedback`, `projects_resolved[n].player_feedback`, `merit_actions_resolved[n].player_feedback`). Player-visible output.

Neither field is currently included in `buildProjectContext` or `buildActionContext` in `downtime-story.js`. This story wires them in.

---

## Acceptance Criteria

1. `buildProjectContext` includes `player_feedback` from `rev.player_feedback` when present. Label: `Player Feedback`.
2. `buildProjectContext` includes `st_notes` from `sub.st_notes` when present. Label: `ST Notes (not for player)`.
3. `buildActionContext` includes `player_feedback` from `rev.player_feedback` when present. Label: `Player Feedback`.
4. `buildActionContext` includes `st_notes` from `sub.st_notes` when present. Label: `ST Notes (not for player)`.
5. `player_feedback` appears before the style rules, after roll result.
6. `st_notes` appears after `player_feedback`, clearly labelled as ST-only.
7. Neither field is included if empty or falsy.
8. No changes to how fields are saved — data contract is unchanged.

---

## Tasks / Subtasks

- [ ] Task 1: `buildProjectContext` — add player_feedback and st_notes
  - [ ] After roll result block, add: `if (rev.player_feedback) lines.push(\`Player Feedback: \${rev.player_feedback}\`)`
  - [ ] After player_feedback: `if (sub.st_notes) lines.push(\`ST Notes (not for player): \${sub.st_notes}\`)`

- [ ] Task 2: `buildActionContext` — add player_feedback and st_notes
  - [ ] Same pattern as Task 1, using `rev.player_feedback` and `sub.st_notes`

- [ ] Task 3: Manual verification
  - [ ] Open DT Story tab for a character with player_feedback set on a project action
  - [ ] Copy Context — confirm player_feedback line appears in output
  - [ ] Confirm st_notes line appears and is labelled as ST-only
  - [ ] Confirm empty fields produce no output line

---

## Dev Notes

### Field locations

```js
// player_feedback — per action:
sub.feeding_review?.player_feedback
sub.projects_resolved?.[idx]?.player_feedback
sub.merit_actions_resolved?.[idx]?.player_feedback

// st_notes — submission level:
sub.st_notes
```

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-story.js` | Modify `buildProjectContext` and `buildActionContext` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
