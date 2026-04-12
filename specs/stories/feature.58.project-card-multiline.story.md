# Story feature.58: Project Action Card — Multi-line Collapsed View

## Status: done

## Story

**As an** ST processing downtime submissions,
**I want** the collapsed project action card to show Characters Involved, Merits & Bonuses, Description, and the player's submitted pool as separate lines,
**so that** I can read all the relevant context without having to expand every card.

## Background

The processing queue renders each action as a collapsed card (character name | action type | description | status). For project entries (Ambience Increase/Decrease, personal projects), all context — cast, merits, description, and pool — was concatenated into a single truncated line, making it unreadable.

This story splits the description column into a stacked multi-line block for project entries, and adds the player's submitted pool as a fourth line. Non-project entries (feeding, sorcery, merit actions) are unchanged.

## Acceptance Criteria

1. For project entries that have any of `projCast`, `projMerits`, `entry.description`, or `entry.poolPlayer`, the description column renders a `proc-row-desc-multi` stacked block instead of the single truncated `proc-row-desc` span.
2. Each present field occupies its own line with a small dimmed label prefix:
   - "Characters involved:" — `entry.projCast`
   - "Merits & Bonuses:" — `entry.projMerits`
   - "Description:" — `entry.description`
   - "Pool:" — `entry.poolPlayer`
3. Absent fields are omitted (no empty lines).
4. The row uses `align-items: start` when multi-line so char name and status badge sit at the top edge.
5. Non-project entries continue to show the single-line truncated `proc-row-desc` span unchanged.

## Tasks / Subtasks

- [x] Task 1: Multi-line description block — cast, merits, description (AC: 1–3, 5)
  - [x] Detect `hasStructured` for project entries with any relevant field
  - [x] Render `proc-row-desc-multi` div with conditional lines for cast, merits, description
  - [x] Add `.proc-action-row.multiline { align-items: start }` CSS
  - [x] Add `.proc-row-desc-multi`, `.proc-row-desc-lbl` CSS classes

- [x] Task 2: Player's submitted pool line (AC: 2, 3)
  - [x] Add pool line to `proc-row-desc-multi` block using `entry.poolPlayer`
  - [x] Update `hasStructured` check to also consider `entry.poolPlayer`

## Dev Notes

### Entry structure

Project entries in the processing queue carry:
- `entry.projCast` — `resp[project_N_cast]`
- `entry.projMerits` — `resp[project_N_merits]`
- `entry.description` — `proj.detail || proj.desired_outcome`
- `entry.poolPlayer` — `proj.primary_pool?.expression || resp[project_N_pool_expr]`

### Relevant render location

`renderProcessingMode` in `public/js/admin/downtime-views.js` — the loop that builds `proc-action-row` elements (search for `proc-row-desc-multi` after Task 1 is done).

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Row render — multi-line desc block |
| `public/css/admin-layout.css` | `.proc-action-row.multiline`, `.proc-row-desc-multi`, `.proc-row-desc-lbl` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-13 | 1.0 | Initial draft | Angelus |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.58.project-card-multiline.story.md`
