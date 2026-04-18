# Story 3.4: DT Report Icon Unread State

Status: ready-for-dev

## Story

As a player,
I want to know when a new downtime narrative has been published for me,
So that I read it promptly rather than discovering it by chance.

## Background

Builds on Story 3.3's badge infrastructure. While 3.3 adds the badge to the More tab, this story adds the unread indicator to the DT Report icon itself within the More grid. Uses the same localStorage-keyed "viewed" tracking.

## Acceptance Criteria

1. **Given** the ST pushes a player's downtime outcome **When** the player next opens the app **Then** the DT Report icon in More grid shows an unread dot
2. **Given** the player opens DT Report and views their narrative **When** they close or navigate away **Then** the unread dot clears
3. **Given** the player has already viewed their current narrative **When** the app loads **Then** no unread indicator on DT Report
4. **Given** the unread dot is shown **When** measured **Then** it is visually consistent with the More tab badge from Story 3.3 — `--accent` dot, top-right of icon

## Tasks / Subtasks

- [ ] Extend More grid app registry with badge count support (AC: #1, #3)
  - [ ] Add optional `badge` property to app registry entries: `{ ..., badge: () => boolean }`
  - [ ] DT Report entry: `badge: () => hasUnreadDTReport()`
- [ ] Implement `hasUnreadDTReport()` (AC: #1, #3)
  - [ ] Get current published submission ID from loaded submission data
  - [ ] Get last-viewed ID from `localStorage['tm-last-viewed-sub']`
  - [ ] Return `true` if IDs differ (new narrative not yet seen)
- [ ] Render badge dot on DT Report icon in More grid (AC: #4)
  - [ ] Each More grid icon: if `badge()` returns true, inject `.nav-badge` dot on the icon
  - [ ] Same CSS as Story 3.3's `.nav-badge` — `--accent` dot, `position:absolute`, top-right
  - [ ] Ensure icon container has `position:relative`
- [ ] Clear badge on DT Report view (AC: #2)
  - [ ] On `goTab('dt-report')`: `localStorage['tm-last-viewed-sub'] = currentSubmissionId`
  - [ ] Re-render More grid or update the icon badge immediately after storing
- [ ] Verify Story 3.3 More tab badge also clears when DT Report is viewed (AC: #2)
  - [ ] Re-call `checkMoreBadge()` after marking viewed

## Dev Notes

- Reuse `localStorage['tm-last-viewed-sub']` from Story 3.3 — same key, same mechanism
- Submission ID to track: the `_id` of the most recent submission with `published_outcome` for this player
- **API:** No new calls — reuse submission data already loaded in app init
- **CSS:** `.nav-badge` already defined in Story 3.3; reuse the same class on app icons
- More grid icon container needs `position:relative` — add when creating `.more-app-icon` in Story 1.3
- Server-side "viewed" tracking (persisted to MongoDB) is a future enhancement — localStorage is sufficient for v1

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: specs/stories/unified-nav/nav-3-3-more-tab-badge.story.md] — badge CSS and localStorage pattern

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
