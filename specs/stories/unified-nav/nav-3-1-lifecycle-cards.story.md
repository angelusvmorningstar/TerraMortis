# Story 3.1: Lifecycle-Aware Contextual Cards

Status: review

## Story

As a player or ST,
I want the app to surface a prompt when feeding is open or a DT deadline is approaching,
So that I take action at the right time without having to remember to check.

## Acceptance Criteria

1. **Given** the game cycle is in feeding phase (upcoming game session exists) **When** any user opens the app **Then** a "Your feeding roll is ready" card is visible on the Sheet tab or a home surface
2. **Given** the feeding card is shown **When** the user taps it **Then** they navigate directly to Feeding (More grid)
3. **Given** a downtime cycle is open and its deadline is within 7 days **When** a player opens the app **Then** a "Downtime due [date]" card is visible in the app
4. **Given** no feeding phase is active and no DT deadline is imminent **When** the user opens the app **Then** no contextual cards are shown (clean state)
5. **Given** the user has already rolled feeding **When** the feeding phase is still open **Then** the feeding card is NOT shown (roll already done)

## Tasks / Subtasks

- [ ] Add contextual card container to Sheet tab or create a home/dashboard surface (AC: #1)
  - [ ] `<div id="lifecycle-cards"></div>` injected near the top of `#t-sheet` or a dedicated zone
- [ ] Implement `renderLifecycleCards(el)` in `app.js` or new module (AC: #1–#4)
  - [ ] Query `GET /api/game_sessions/next` — if session date ≥ today → feeding phase may be open
  - [ ] Query `GET /api/downtime_cycles` — find active cycle, check `deadline_at` within 7 days
  - [ ] Query `GET /api/downtime_submissions` — check if player already has `feeding_roll_player` set for active cycle
  - [ ] Render feeding card only if: phase open AND player has not yet rolled
  - [ ] Render DT deadline card only if: active cycle with deadline within 7 days
  - [ ] No cards if neither condition applies
- [ ] Feeding card UI (AC: #1, #2)
  - [ ] `.lifecycle-card` with `.panel` container, `--accent` left border or header
  - [ ] "Your feeding roll is ready" heading (`--fl` Lato, 12px small-caps)
  - [ ] Tap target ≥44px — tap calls `goTab('feeding')`
- [ ] DT deadline card UI (AC: #3)
  - [ ] "Downtime due [formatted date]" — format: `dd Month yyyy`
  - [ ] Tap calls `goTab('dt-submission')`
  - [ ] `--warn-dk` accent for urgency if ≤3 days remaining; `--accent` if 4–7 days
- [ ] Call `renderLifecycleCards()` on app init and on Sheet tab open (AC: #4)

## Dev Notes

- **API:** `GET /api/game_sessions/next` (public — no auth needed), `GET /api/downtime_cycles` (requireAuth), `GET /api/downtime_submissions` (requireAuth, player gets own only)
- Batch these on app load — cache results for the session to avoid repeated calls
- **CSS:** New `.lifecycle-card` class using `.panel` pattern: `--surf` bg, `--bdr2` border, 8px radius, 14px padding. Add to `suite.css`. Use tokens only.
- Feeding card check: player has rolled if `submission.feeding_roll_player` is non-null for current cycle
- ST view: ST should see feeding card for ANY character without a roll (or suppress — discuss with Angelus before implementing)
- 7-day window: `deadline_at` minus today in days

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: public/mockups/font-test.html#panel] — `.panel`, `.panel-label`, `.panel-body`
- [Source: public/mockups/font-test.html#badge] — `.badge.warn` urgency pattern

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
