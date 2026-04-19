# Story 1.3: Build the More Grid App Launcher

Status: review

## Story

As an authenticated user,
I want a full-screen app grid behind the More tab,
So that I can access specialised tools without cluttering the primary nav.

## Background

The More tab opens a grid of app icons. Role determines which icons are visible. Tapping an icon navigates to that app. A back/close route returns to the More grid. This story builds the launcher shell; content populates in Epic 2.

**Depends on:** Stories 1.1 and 1.4 complete.

## Acceptance Criteria

1. **Given** an ST taps More **When** the grid renders **Then** it shows all shared apps PLUS ST-only apps (Tracker, Sign-In, Emergency Contacts) and does NOT show player-only apps (DT Submission, Ordeals)
2. **Given** a player taps More **When** the grid renders **Then** it shows all shared apps PLUS player-only apps (DT Submission, Ordeals) and does NOT show ST-only apps
3. **Given** any user taps an app icon **When** the icon is tapped **Then** they navigate to that app's view with a back/close route to return to More
4. **Given** a conditional app (Regency, Office) whose condition is not met **When** the More grid renders **Then** that icon is not shown
5. **Given** the grid renders on a 390px phone **When** measured **Then** ≥2 icons per row, each ≥44px tap target

## Tasks / Subtasks

- [x] Create `#t-more` tab container and More grid component in `index.html` (AC: #5)
  - [x] More grid renders inside `#t-more` via `renderMoreGrid()`
  - [x] App containers for all More grid destinations added to `index.html`
- [x] Build `renderMoreGrid()` function in `app.js` (AC: #1, #2, #4)
  - [x] `MORE_APPS` registry with id, label, icon, stOnly, playerOnly, condition
  - [x] Filter by role: `effectiveRole() === 'st'`
  - [x] Filter conditional apps: `hasRegency`, `hasOffice` from character data
  - [x] Renders `.more-app-icon` buttons with emoji icon + label
- [x] Wire app icon navigation (AC: #3)
  - [x] Each icon calls `goTab(appId)` — `NAV_ALIAS` maps all More grid apps to `n-more`
  - [x] Back to More: tap More nav button
- [x] Apply CSS for app icons (AC: #5)
  - [x] `.more-app-icon`: `--surf2` bg, `--bdr` border, 80px min, flex column
  - [x] Hover: `--surf3` bg, `--bdr2` border
  - [x] `.more-app-label`: `--fl` Lato 10px uppercase
  - [x] `.nav-badge` class added for Story 3.3

## Dev Notes

**App registry (initial — content wired in Epic 2):**

| App ID | Label | ST only | Player only | Condition |
|---|---|---|---|---|
| status | Status | — | — | — |
| whos-who | Who's Who | — | — | — |
| dt-report | DT Report | — | — | — |
| feeding | Feeding | — | — | — |
| primer | Primer | — | — | — |
| game-guide | Game Guide | — | — | — |
| rules | Rules | — | — | — |
| dt-submission | Submit DT | — | ✓ | — |
| ordeals | Ordeals | — | ✓ | — |
| tracker | Tracker | ✓ | — | — |
| sign-in | Sign-In | ✓ | — | — |
| emergency | Emergency | ✓ | — | — |
| regency | Regency | — | — | character has regency |
| office | Office | — | — | character has office |
| archive | Archive | — | — | character has archive |

- `public/js/app.js` — add `renderMoreGrid()` called by `goTab('more')`
- `public/index.html` — add `#t-more` tab + `#more-grid` container
- `public/css/suite.css` — add `.more-app-icon` styles
- Role check: `import { isSTRole } from './auth/discord.js'` — already available in app.js
- Conditional tabs: derive from `suiteState.chars` (player's loaded character) or `getPlayerInfo().character_ids`

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: public/js/editor/list.js] — `.char-chip` pattern to extend for app icons
- [Source: public/mockups/font-test.html#chip] — `.chip` pattern

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Emoji icons used instead of SVGs for simplicity — can be replaced with SVGs in Epic 2 polish
- `NAV_ALIAS` extended to map all More grid app ids → `more` button
- Conditional apps (Regency, Office) check character's court_category — simplistic v1, refine in Epic 2
- 24/24 tests pass including 3 new More grid tests

### Completion Notes List
- `MORE_APPS` registry with 14 entries covering all three visibility tiers
- `renderMoreGrid()` filters by role and condition, renders icon grid
- `goTab('more')` calls `renderMoreGrid()` — grid re-renders on every open
- All More grid destinations have `#t-{id}` containers in index.html (empty — Epic 2 fills them)
- `.more-app-icon`, `.more-app-label`, `.nav-badge` CSS added to suite.css

### File List
- public/index.html
- public/js/app.js
- public/css/suite.css
- tests/post-game-1.spec.js
