---
id: nav.3
epic: unified-nav-polish
group: B
status: complete
blocked-by: nav.1
priority: high
---

# Story nav.3: Restore Blank Tabs — Who's Who and Office

As a player or ST,
I want the Who's Who and Office tabs to display their content,
So that city and office information is accessible from the unified app.

## Background

Who's Who and Office both render blank in the dev build. Unlike the Group A regressions, these may share a common root cause — a missing init/wiring pattern rather than a missing render function. Both reference data from the city/territory domain and have corresponding implementations in `player.html` (main branch).

**Investigation first** — determine the root cause before writing any fix.

### Tabs in scope

| Tab | Issue # | Reference |
|---|---|---|
| Who's Who | 6 | `main:public/player.html` city tab |
| Office | 11 | `main:public/player.html` office tab |

## Acceptance Criteria

**Given** the dev data fixture (nav.1) is active
**When** the Who's Who tab renders
**Then** it shows the city population list — characters, their clans, covenants, and relevant city roles — matching the content in `main:public/player.html` city tab

**Given** the dev data fixture is active
**When** the Office tab renders
**Then** it shows the character's office details matching the `main:public/player.html` office tab

**Given** a character without an office
**When** the Office tab renders
**Then** it shows an appropriate empty state (not a blank screen)

**Given** either tab was previously blank due to missing data (not missing code)
**When** the dev fixture provides data
**Then** the tab renders correctly without any code changes — confirming it was a data issue, not a wiring issue (document this finding)

## Investigation Protocol

1. With nav.1 active, open Who's Who. If it now renders → it was a data issue only, no code fix needed.
2. If still blank with data present → read `git show main:public/player.html` and locate the Who's Who render logic. Find the equivalent in the unified app. Identify the gap.
3. Repeat for Office.
4. Fix gaps — do not rewrite source. Wire the existing render function if it exists; port only what's missing.

## Dev Notes

- Who's Who likely uses character data from `/api/characters` — the fixture must include enough characters for the list to be meaningful.
- Office is a conditional tab (only shown when the character has an office merit) — ensure the fixture includes at least one character with an office.
- If both tabs fix themselves once the fixture is active, close this story as "data-starvation confirmed, no code change required."

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
Who's Who was a wiring gap — renderCityTab was never imported or called in the unified app. Added import and goTab handler passing suiteState.territories. City tab CSS already present in suite.css. Office was already correctly wired. Both tabs render correctly with fixture data — no component code was missing, only the invocation.
### File List
- public/js/app.js
