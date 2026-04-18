# Story 1.3: Build the More Grid App Launcher

Status: ready-for-dev

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

- [ ] Create `#t-more` tab container and More grid component in `index.html` (AC: #5)
  - [ ] Wrapping div `#more-grid` with flex-wrap layout
  - [ ] Auto-fill grid: `display:flex; flex-wrap:wrap; gap:12px; padding:16px`
- [ ] Build `renderMoreGrid()` function in `app.js` (AC: #1, #2, #4)
  - [ ] Define app registry: `{ id, label, icon (SVG/emoji), stOnly, playerOnly, condition }`
  - [ ] Filter by role: `isSTRole()` → show stOnly, hide playerOnly; player → opposite
  - [ ] Filter conditional apps: call condition function against loaded character data
  - [ ] Render each visible app as a `.char-chip`-style button
- [ ] Wire app icon navigation (AC: #3)
  - [ ] Each icon click calls `goTab(appId)` or opens a sub-view
  - [ ] Ensure back/close from any sub-view returns to More grid (`goTab('more')`)
- [ ] Apply CSS for app icons (AC: #5)
  - [ ] `.more-app-icon`: `--surf2` bg, `--bdr` border, radius 8px, min 44px, `--fl` Lato small-caps label
  - [ ] Active/hover: `--accent-a8` bg, `--accent-a40` border
  - [ ] Add to `suite.css` — no hardcoded colours

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

### Debug Log References

### Completion Notes List

### File List
