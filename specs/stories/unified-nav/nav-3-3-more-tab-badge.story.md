# Story 3.3: More Tab Badge — Unread/Pending Indicator

Status: ready-for-dev

## Story

As a user,
I want a badge on the More tab when something inside it needs my attention,
So that I don't miss content that's waiting without having to open More to find out.

## Acceptance Criteria

1. **Given** a player has a published DT narrative they haven't viewed **When** the app loads **Then** the More tab shows a badge dot
2. **Given** the feeding phase is open and this player hasn't rolled yet **When** the app loads **Then** the More tab badge is shown
3. **Given** the player opens More and views the relevant content **When** they return to the primary nav **Then** the badge clears
4. **Given** no unread content or pending actions exist **When** the app loads **Then** no badge on the More tab
5. **Given** the badge is shown **When** measured **Then** it is visually distinct — `--accent` colour dot, positioned top-right of the More button

## Tasks / Subtasks

- [ ] Implement `checkMoreBadge()` async function (AC: #1, #2, #4)
  - [ ] Batch API queries: `GET /api/downtime_cycles` + `GET /api/downtime_submissions` + `GET /api/game_sessions/next`
  - [ ] Check: active cycle exists AND player's submission has `published_outcome` AND submission ID ≠ `localStorage['tm-last-viewed-sub']`
  - [ ] Check: feeding phase open AND player has no `feeding_roll_player` for this cycle
  - [ ] If either is true → set badge; else → clear badge
- [ ] Add badge element to More nav button (AC: #5)
  - [ ] `<span class="nav-badge" id="more-badge" style="display:none"></span>` inside `#n-more` button
  - [ ] CSS: absolute position top-right, 8px circle, `--accent` background, `--surf` ring border
- [ ] Show/hide badge based on `checkMoreBadge()` result (AC: #1–#4)
  - [ ] Call `checkMoreBadge()` on app init after data loads
  - [ ] `document.getElementById('more-badge').style.display = hasBadge ? '' : 'none'`
- [ ] Clear badge when More is opened and content addressed (AC: #3)
  - [ ] On `goTab('more')`: store `localStorage['tm-last-viewed-sub']` = current submission ID
  - [ ] Re-run `checkMoreBadge()` after viewing feeding or DT Report — clear if conditions no longer met
- [ ] CSS for `.nav-badge` (AC: #5)
  - [ ] Add to `suite.css` using tokens only
  - [ ] `position:absolute; top:4px; right:4px; width:8px; height:8px; border-radius:50%; background:var(--accent); border:1.5px solid var(--surf);`

## Dev Notes

- **API:** `GET /api/game_sessions/next` (PUBLIC — no auth), `GET /api/downtime_cycles` (requireAuth), `GET /api/downtime_submissions` (requireAuth)
- Reuse data already fetched by Story 3.1 lifecycle cards — don't duplicate API calls; share the cached result
- **localStorage:** `tm-last-viewed-sub` stores the last-viewed submission ID for "viewed" tracking. Server-side tracking is a future enhancement.
- ST view: STs may not have a personal submission — badge logic for ST should only trigger on feeding-phase check (if any character in their list hasn't rolled). Simpler: suppress badge for ST in v1.
- `.nav-badge` is absolutely positioned inside `.nbtn` — ensure `#n-more` has `position:relative`

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: public/css/suite.css] — `.nbtn` styles to extend

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
