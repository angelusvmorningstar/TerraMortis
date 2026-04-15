# Story DT-Fix-14: Second-Opinion Flag on Actions

## Status: ready-for-dev

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

- [ ] Task 1: Render toggle button in expanded action panel
  - [ ] 1.1: In `renderActionPanel` (the shared panel renderer), add a `second_opinion` toggle button. Placement: in the panel header zone, as a standalone row, or below the pool status chips — use a consistent location across all action types
  - [ ] 1.2: Read `review?.second_opinion` to determine active state
  - [ ] 1.3: Active: `<button class="proc-second-opinion-btn active" data-proc-key="${key}">Second Opinion</button>`; inactive: same class without `active`, label `Flag for 2nd opinion`

- [ ] Task 2: Wire toggle handler in event wiring section
  - [ ] 2.1: In the event wiring section (near line 4118), add a `querySelectorAll('.proc-second-opinion-btn')` click handler
  - [ ] 2.2: On click: read current `review.second_opinion`, call `await saveEntryReview(entry, { second_opinion: !current })`, then `renderProcessingMode(container)`
  - [ ] 2.3: No special-casing per action type — `saveEntryReview` handles all sources via its existing branch logic

- [ ] Task 3: Add amber badge to collapsed queue row (line ~3211)
  - [ ] 3.1: In the `proc-action-row` block, after the `proc-row-status-cell` closing `</span>`, add:
    ```js
    if (review?.second_opinion) h += `<span class="proc-row-second-opinion-dot" title="Flagged for second opinion">●</span>`;
    ```
  - [ ] 3.2: Style `.proc-row-second-opinion-dot` with `color: var(--gold2)` (`#E0C47A`), `font-size: 0.65rem`, `margin-left: 0.3rem`

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
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`
