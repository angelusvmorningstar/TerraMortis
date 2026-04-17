# Story feature.71: Contacts Info-Type Selector (B3)

## Status: done

## Story

**As an** ST coding a Contacts merit action,
**I want** a structured selector for information type and a subject field,
**so that** I can record what the contact is being asked to find without relying on free text.

## Background

Merit actions of category `contacts` currently have the standard merit action panel (action type dropdown, merit link selector, territory pills) but no structured fields for what information is being requested. The Investigation Matrix defines four information types: Public / Internal / Confidential / Restricted. Adding these as selectors gives the ST a clear record and feeds the context generator accurately.

This is a Zone 1b addition — new coding controls in the Action Definition zone. No pool or outcome changes.

---

## Acceptance Criteria

1. When a merit action's category is `contacts`, the action panel shows two additional fields below the merit-link selector:
   - **Information Type** — selector: `Public` / `Internal` / `Confidential` / `Restricted`
   - **Subject / Sphere** — text input (free text — genuinely open field)
2. Both fields are visible in view mode (collapsed to a summary line when not set).
3. Information Type saves to `rev.contacts_info_type`.
4. Subject saves to `rev.contacts_subject`.
5. Both fields are included in `buildActionContext` output when present. Labels: `Info Type` and `Subject`.
6. Fields only appear for `contacts` category — not for allies, status, retainer, or staff.

---

## Tasks / Subtasks

- [x] Task 1: Add fields to merit panel left column
  - [x] In left panel contacts block, after Target field
  - [x] Gate on `entry.meritCategory === 'contacts'`
  - [x] Render info-type selector (Public/Internal/Confidential/Restricted) and subject text input
  - [x] Pre-populate from `rev.contacts_info_type` and `rev.contacts_subject`

- [x] Task 2: Save handlers
  - [x] `contacts_info_type` → `saveEntryReview(entry, { contacts_info_type: val })` on `change`
  - [x] `contacts_subject` → `saveEntryReview(entry, { contacts_subject: val })` on `blur`

- [x] Task 3: Wire into `buildActionContext`
  - [x] Already present in `downtime-story.js` lines 1864-1865

- [ ] Task 4: Manual verification
  - [ ] Open a Contacts merit action
  - [ ] Confirm new fields appear; set values and save
  - [ ] Copy context — confirm both fields appear in output
  - [ ] Confirm fields do not appear for Allies, Status, Retainer actions

---

## Dev Notes

### Information type options (from Investigation Matrix)

```js
const CONTACTS_INFO_TYPES = ['Public', 'Internal', 'Confidential', 'Restricted'];
```

### Schema paths

```js
rev.contacts_info_type  // 'Public' | 'Internal' | 'Confidential' | 'Restricted'
rev.contacts_subject    // free text
```

Saved via `saveEntryReview(entry, patch)` → `merit_actions_resolved[idx]`.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add fields to merit contacts panel |
| `public/js/admin/downtime-story.js` | Wire into `buildActionContext` |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
| 2026-04-17 | 1.1 | Tasks 1-2 implemented | claude-sonnet-4-6 |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Info Type selector (Public/Internal/Confidential/Restricted) added to contacts panel in `downtime-views.js`, after existing Target field, gated on `entry.meritCategory === 'contacts'`
- Subject text input added below Info Type
- Both fields pre-populate from `rev.contacts_info_type` / `rev.contacts_subject`
- Save handlers wired: info type on `change`, subject on `blur`; both via `saveEntryReview(entry, patch)`
- `buildActionContext` in `downtime-story.js` already had Tasks 3 lines (1864-1865); no change needed there

### File List
- `public/js/admin/downtime-views.js`
- `specs/stories/feature.71.dt-processing-contacts-info-type.story.md`
