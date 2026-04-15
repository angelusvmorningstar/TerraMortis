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

Add a boolean field to each resolved action entry:

```js
// In feeding_review, projects_resolved[n], merit_actions_resolved[n]:
second_opinion: true  // or false / absent
```

### 2. UI — flagging

A small `[Second Opinion]` badge-style toggle button on the expanded action panel. Toggle on/off. Saves immediately.

**Placement:** In the ST notes zone, below the notes thread, above player feedback. Or as a standalone row in the action header zone.

**Visual:** When active — amber/gold accent badge (matches the amber state used elsewhere in the system). When inactive — subtle outline button.

### 3. UI — surfacing flagged actions

**Option A — In-queue indicator:** Flagged collapsed rows show an amber `●` badge on the queue row (like the existing amber state dot in DT Story).

**Option B — Checklist filter:** Add a "Flagged" filter to the checklist view so an ST can see all flagged actions at once.

**Option C — Both.**

**Recommendation:** Option A (amber badge on queue row) is low-cost and immediately visible. Option B adds filter-mode complexity. Implement A; defer B.

### 4. Workflow

- Either ST can flag any action
- Either ST can clear the flag
- No notification sent — passive indicator only
- Flagged actions do not count as incomplete for checklist purposes

---

## Acceptance Criteria

1. ST can toggle a `second_opinion` flag on any action in DT Processing.
2. Flagged actions show an amber indicator on the collapsed queue row.
3. The flag persists in the submission data and survives page reload.
4. The flag can be cleared by any ST.
5. Flagged actions are not blocked from progressing to validated/done status.
6. No external notification is sent.

---

## Tasks / Subtasks

- [ ] Task 1: Add `second_opinion` field to action resolved entry schema in `downtime_submission.schema.js`
- [ ] Task 2: Add toggle button to expanded action panel — amber badge style when active
- [ ] Task 3: Wire save to `saveEntryReview(entry, { second_opinion: true/false })`
- [ ] Task 4: Update queue row renderer to show amber badge when `second_opinion: true`
- [ ] Task 5: Verify flag persists; verify it doesn't block status progression
- [ ] Task 6: Verify flag works for all action types (feeding, project, merit)

---

## Dev Notes

### Amber colour token

Use `--gold2` (`#E0C47A`) or `--amber` if defined. Check existing amber state usage in queue rows for the exact class/token.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add toggle button, queue row indicator, save wiring |
| `server/schemas/downtime_submission.schema.js` | Add `second_opinion` to resolved action entry schema |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`
- `server/schemas/downtime_submission.schema.js`
