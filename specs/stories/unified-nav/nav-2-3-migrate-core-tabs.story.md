# Story 2.3: Migrate player.html Core Tabs to More Grid

Status: ready-for-dev

## Story

As a player,
I want all my portal features accessible from the unified app,
So that I don't need to visit player.html for any regular function.

## Tabs being migrated

From `player.html` → More grid in unified app:
- **DT Report** (was: Story tab) — read-only published narrative
- **Status** — court hierarchy, prestige display
- **Primer** — setting overview
- **Tickets** — support/query tickets
- **Ordeals & XP** — ordeal progress and XP log
- **DT Submission** (Submit DT) — player downtime form

## Mobile-Readiness Tiers

| Tab | Tier | Treatment |
|---|---|---|
| DT Report | Full mobile | Read-only prose — adapt CSS for 390px |
| Status | Full mobile | Read-only display — adapt for narrow |
| Primer | Full mobile | Read-only content — adapt for narrow |
| Tickets | Already mobile-ready | Simple list — minimal change |
| Ordeals & XP | Already mobile-ready | Simple list — minimal change |
| DT Submission | Desktop-optimised, mobile-accessible | Render as-is; add "Best experienced on desktop" notice on ≤600px |

## Acceptance Criteria

1. **Given** a player taps DT Report in More grid **When** the view opens **Then** their published downtime narrative renders (same content as `player.html` Story tab)
2. **Given** a player taps Status **When** the view opens **Then** court hierarchy and prestige display render
3. **Given** a player taps Primer, Tickets, Ordeals & XP **When** each view opens **Then** the same content from `player.html` renders correctly
4. **Given** a player taps DT Submission on a phone (≤600px) **When** the view renders **Then** a "This form works best on desktop" notice is shown above the form — form is still accessible
5. **Given** any migrated tab renders **When** inspected **Then** all colours use CSS tokens — no hardcoded values

## Tasks / Subtasks

- [ ] Wire DT Report to More grid (AC: #1)
  - [ ] `goTab('dt-report')` renders `renderStoryTab()` / DT narrative content from `player/story-tab.js`
  - [ ] Responsive check: prose readable at 390px
- [ ] Wire Status to More grid (AC: #2)
  - [ ] `goTab('status')` renders `renderSuiteStatusTab()` — already in `app.js`
  - [ ] Confirm renders correctly at 390px
- [ ] Wire Primer, Tickets, Ordeals & XP to More grid (AC: #3)
  - [ ] Each gets a `#t-{id}` container and `goTab()` handler
  - [ ] Port JS init functions from `player.js` to `app.js`
- [ ] Wire DT Submission with desktop notice (AC: #4)
  - [ ] `goTab('dt-submission')` renders `renderDowntimeTab()` from `player/downtime-form.js`
  - [ ] On ≤600px viewports inject a `.dt-mobile-notice` banner above the form
  - [ ] Banner text: "This form works best on desktop — you can also access it at terramortissuite.netlify.app/player"
- [ ] Token audit across all migrated tab renders (AC: #5)

## Dev Notes

- `public/js/player/story-tab.js` — DT Report renderer
- `public/js/player/downtime-form.js` — DT Submission form
- `public/js/player/ordeals-view.js` — Ordeals view
- `public/js/player/tickets-tab.js` — Tickets list
- `public/js/player/primer-tab.js` — Primer content
- `public/js/player/status-tab.js` — Status display
- `public/js/suite/status.js` — `renderSuiteStatusTab()` already wired in app.js
- **API calls per tab:**
  - DT Report: `GET /api/downtime_submissions`, `GET /api/downtime_cycles`
  - Status: character data already loaded
  - Tickets: `GET /api/tickets`
  - Ordeals: `GET /api/ordeal_submissions`
  - DT Submission: `GET /api/downtime_cycles`, `POST /api/downtime_submissions`
- `.dt-mobile-notice` CSS: `.panel` container, `--warn-dk` text, `--warn-dk-bg` background, `--fl` Lato

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: public/js/player/] — all player tab modules
- [Source: public/mockups/font-test.html#badge] — `.badge.warn` for desktop notice styling

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
