# Story feature.71: Contacts Info-Type Selector (B3)

## Status: ready-for-dev

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

- [ ] Task 1: Add fields to merit panel left column
  - [ ] In `renderActionPanel`, merit block, after the merit-link dropdown and territory pills
  - [ ] Gate on `entry.meritCategory === 'contacts'`
  - [ ] Render info-type selector and subject text input (edit mode inside `proc-feed-desc-card` or as standalone rows)
  - [ ] Pre-populate from `rev.contacts_info_type` and `rev.contacts_subject`

- [ ] Task 2: Save handlers
  - [ ] `contacts_info_type` → `saveEntryReview(entry, { contacts_info_type: val })`
  - [ ] `contacts_subject` → `saveEntryReview(entry, { contacts_subject: val })`

- [ ] Task 3: Wire into `buildActionContext`
  - [ ] In `downtime-story.js`, after existing fields:
    ```js
    if (rev.contacts_info_type) lines.push(`Info Type: ${rev.contacts_info_type}`);
    if (rev.contacts_subject)   lines.push(`Subject: ${rev.contacts_subject}`);
    ```

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
