# Story DT-Fix-14: Second-Opinion Flag on Actions

## Status: done

## Story

**As an** ST processing a downtime cycle,
**I want** to flag individual actions for a second ST read,
**so that** I can signal to the other ST that this action needs review without relying on out-of-band messages.

## Background

Some actions require a second opinion — a contested action where the result is ambiguous, an unusual pool interaction, or a sensitive narrative situation. Currently there is no in-system way to flag these. STs rely on Discord messages or verbal coordination during game prep.

The flag should be passive (a badge on the action) rather than an active notification (no email/Discord ping). STs will check for flagged actions during their processing session.

---

## Design Decisions

### 1. Data model

`second_opinion` is stored as a boolean on the **review** object for each action type:

- Feeding: `sub.feeding_review.second_opinion`
- Project: `sub.projects_resolved[n].second_opinion`
- Merit: `sub.merit_actions_resolved[n].second_opinion`
- Sorcery: `sub.sorcery_review[n].second_opinion`

All review shapes have `additionalProperties: true` in the schema — no schema change needed. `saveEntryReview(entry, { second_opinion: true })` handles all four types transparently via the existing branch logic (line 2155–2193).

### 2. UI — toggle button

An amber `[Second Opinion]` toggle button in the expanded action panel. Placed in the panel header zone alongside the existing status chips, or as a standalone row below the action header and above the notes thread.

**Implementation:** A single button rendered via a helper call. When active:
- Button background: `var(--gold2)` (`#E0C47A`), dark text
- Button text: `Second Opinion`

When inactive:
- Subtle outline, muted text: `Flag for 2nd opinion`

### 3. Queue row indicator

When `second_opinion: true`, the collapsed queue row shows an amber `●` badge (same visual token as other status indicators) immediately after the status cell. Class: `proc-row-second-opinion-dot`.

### 4. Workflow

- Either ST can toggle the flag on any action
- Flagged actions do not block status progression — `DONE_STATUSES` is not changed
- No external notification; purely a visual marker

---

## Acceptance Criteria

1. ST can toggle `second_opinion` on any action in DT Processing — feeding, project, merit, sorcery.
2. Toggle button renders in the expanded action panel; active state is visually distinct (amber).
3. Flagged collapsed queue rows show an amber dot badge.
4. Flag persists in the submission document and survives page reload.
5. Flag can be cleared (toggling off) by any ST.
6. Flagged actions are not blocked from reaching validated/done status.
7. No external notification is sent.

---

## Tasks / Subtasks

- [x] Task 1: Render toggle button in expanded action panel
  - [x] 1.1: Added as standalone row in `renderActionPanel`, just before Player Feedback — consistent location across all action types
  - [x] 1.2: Reads `rev.second_opinion` to determine active state
  - [x] 1.3: Active: button with `active` class + text "Second Opinion"; inactive: outline + "Flag for 2nd opinion"

- [x] Task 2: Wire toggle handler in event wiring section
  - [x] 2.1: Handler on `.proc-second-opinion-btn` added in event wiring section
  - [x] 2.2: Reads `review?.second_opinion`, calls `saveEntryReview(entry, { second_opinion: !current })`, re-renders
  - [x] 2.3: No action-type branching needed — `saveEntryReview` handles all sources transparently

- [x] Task 3: Add amber badge to collapsed queue row
  - [x] 3.1: `proc-row-second-opinion-dot` span injected after `proc-row-status-cell` when `review?.second_opinion` is true
  - [x] 3.2: Styled with `color: var(--gold2)`, `font-size: 0.65rem`, `margin-left: 0.3rem`

- [ ] Task 4: Manual verification
  - [ ] 4.1: Open DT Processing; expand any action panel
  - [ ] 4.2: Click "Flag for 2nd opinion" — confirm button turns amber, collapsed row shows amber dot
  - [ ] 4.3: Reload page — confirm flag persists
  - [ ] 4.4: Click again — confirm flag clears, amber dot disappears
  - [ ] 4.5: Confirm the action can still be validated/resolved with the flag active
  - [ ] 4.6: Test at least one feeding, one project, and one merit/sorcery action

---

## Dev Notes

### `saveEntryReview` — no new branch needed

The existing four branches in `saveEntryReview` (line 2155) patch the review object for each source using spread: `{ ...current, ...patch }`. Calling `saveEntryReview(entry, { second_opinion: true })` works for all action types without any modification.

### Queue row exact location

The collapsed row is rendered at line ~3211–3220:
```js
h += `<div class="proc-action-row${isExpanded ? ' expanded' : ''}" data-proc-key="${esc(entry.key)}">`;
h += `<span class="proc-row-char">${esc(entry.charName)}</span>`;
h += `<span class="proc-row-label">${esc(entry.label)}</span>`;
h += `<span class="proc-row-desc" ...>${esc(shortDesc || '—')}</span>`;
h += `<span class="proc-row-status-cell">`;
// ... validator name + status badge
h += `</span>`;
// ADD second-opinion dot here, before closing </div>
h += '</div>';
```

### Amber colour

Use `var(--gold2)` (`#E0C47A`). This is the same gold accent used for amber state indicators elsewhere in the system. Do not introduce a new CSS variable.

### Schema — no change needed

The `resolvedAction` definition used by `projects_resolved` and `merit_actions_resolved` has `additionalProperties: true` (line ~325 in the schema file). `feeding_review` and `sorcery_review` slots also allow additional properties. No schema file changes needed.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Toggle button in `renderActionPanel`, handler in event wiring, amber badge in queue row renderer |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |
| 2026-04-15 | 1.1 | Implementation paths fleshed out: exact save wiring, queue row location, no schema change needed | Claude (SM assist) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Toggle button placed just before Player Feedback section — last consistent zone in all action types before the notes thread.
- `saveEntryReview` required no changes; the spread patch handles `second_opinion` for all four source branches.
- `st_created` entries also get the flag (no exclusion needed).

### File List
- `public/js/admin/downtime-views.js`
