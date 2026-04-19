---
id: nav.2
epic: unified-nav-polish
group: A
status: blocked
blocked-by: nav.1
priority: high
---

# Story nav.2: Restore Lost Tab Functionality (Regressions)

As a player or ST using the unified game app,
I want the Feeding, Regency, Ordeals, Sign-In, and Emergency tabs to work as they did in `player.html` (main branch),
So that no functionality was lost in the navigation migration.

## Background

The following tabs render blank or with stripped functionality in the current dev build. Before writing any fixes, the developer must investigate the canonical implementation in `player.html` on main and document what was present versus what is now missing.

**Investigation required before any fix is written.** Do not guess — read the source.

### Tabs in scope

| Tab | Issue # | Symptom | Reference |
|---|---|---|---|
| Feeding | 8 | Two-pane split layout issue + missing functionality | `main:public/js/player/feeding-tab.js` |
| Regency | 10 | Blank | `main:public/player.html` regency tab section |
| Ordeals | 13/14 | Blank or stripped — also clarify: is "Submit Ordeal" a separate tab from "Ordeals"? | `main:public/js/player/` ordeals files |
| Sign-In | 23 | Blank, all functionality lost | `main:public/js/game/signin-tab.js` |
| Emergency | 24 | Blank, all functionality lost | `main:public/js/game/` emergency files |

### Open question (must resolve during investigation)

Issues 13 and 14 were logged separately as "Submit Ordeal" (stripped functionality) and "Ordeals" (completely blank). **Determine during investigation** whether these are one tab or two distinct views and update the ACs accordingly.

## Acceptance Criteria

**Given** the dev data fixture (nav.1) is active and providing character/territory data
**When** the developer opens the Feeding tab
**Then** it renders with the same functionality as `renderFeedingTab()` in `main:public/js/player/feeding-tab.js` — feeding method display, roll mechanics, vitae/influence tracking

**Given** the Feeding tab renders
**When** the layout is viewed on a 390px-wide screen
**Then** it is single-column (no two-pane split) — same fix as the story-split/tab-split mobile collapse pattern

**Given** the developer opens the Regency tab
**When** the tab renders with fixture data
**Then** it shows the same content as the Regency tab in `main:public/player.html`

**Given** the Ordeals tab (and Submit Ordeal if separate)
**When** the tabs render with fixture data
**Then** all functionality from `main:public/player.html` is present and functional

**Given** the Sign-In tab
**When** rendered by an ST
**Then** it shows the same sign-in functionality as `main:public/js/game/signin-tab.js`

**Given** the Emergency tab
**When** rendered by an ST
**Then** it shows emergency contact or emergency procedures as in the main branch implementation

## Investigation Protocol

For each tab above:
1. Run `git show main:public/js/player/<tab-file>.js` (or relevant path) to read the source
2. Compare against the current unified app implementation — what calls are made? what data is needed? what render function is invoked?
3. Document the gap: missing import? missing init call? missing data? wrong render function?
4. Fix the gap — do not rewrite, restore

## Dev Notes

- The most likely root cause for blank tabs is a missing `init()` or `render()` call in the unified app's `goTab()` handler — check `app.js` `goTab()` for each affected tab ID.
- Feeding's two-pane issue is the same pattern as `story-split` — add `flex-direction: column` on `≤768px` breakpoint if a split wrapper exists in `renderFeedingTab()`.
- Do not rewrite any of these tabs. The canonical code is in `player/` — if it's not being called, wire it up. If it's being called incorrectly, fix the call.
- After nav.1 (dev fixture) is active, render each tab and screenshot before and after fix.

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
Feeding, Regency, Sign-In were already wired correctly in app.js — no changes needed.

Ordeals: initOrdeals() hardcoded getElementById('tab-xplog') (player portal ID). Added optional containerEl param; game app passes t-ordeals element. One-line change to ordeals-view.js, one-line change to goTab handler.

Emergency: no source file existed. Built game/emergency-tab.js — fetches /api/players, renders emergency contact + medical info cards. Medical rows highlighted. Cached on first visit (no re-fetch on re-open). Added CSS to suite.css.

Feeding mobile layout was already handled by existing .tab-split CSS (column on mobile, row ≥768px).

Sign-In and Regency rendered correctly with dev fixture data.
### File List
- public/js/player/ordeals-view.js
- public/js/game/emergency-tab.js (new)
- public/js/app.js
- public/css/suite.css
