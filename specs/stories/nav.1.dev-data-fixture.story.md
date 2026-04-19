---
id: nav.1
epic: unified-nav-polish
group: 0
status: ready
priority: prerequisite
blocks: nav.2, nav.3
---

# Story nav.1: Dev Data Fixture

As a developer working on the unified game app locally,
I want the dev shell to serve real-ish fixture data for all API endpoints,
So that I can visually verify tab content and distinguish wiring regressions from data-starvation without needing a live MongoDB connection.

## Background

The dev shell (`dev-login.html` auth bypass + `localhost:8080`) currently returns empty arrays from all `fetch()` calls that hit `/api/*`. This makes it impossible to tell whether a blank tab is a broken component or simply has no data to display.

The fix is a fixture layer: export a sanitised snapshot from MongoDB Atlas, save it as static JSON, and intercept all `/api/*` fetch calls in dev mode to return fixture responses. The existing auth bypass already sets `localStorage` credentials — the fixture layer extends that pattern.

## Acceptance Criteria

**Given** the dev environment is running (`localhost:8080`, `dev-login.html` auth bypass active)
**When** any tab makes a fetch to `/api/characters`, `/api/territories`, `/api/tracker_state`, `/api/downtime_cycles`, `/api/downtime_submissions`, `/api/game_sessions`, or `/api/players`
**Then** the fetch returns fixture data from `data/dev-fixtures/` rather than hitting the network

**Given** the fixture layer is active
**When** character data is returned
**Then** it contains at least 5 characters with realistic but anonymised data (names, clans, disciplines, merits, tracker state)

**Given** the fixture layer is active
**When** territory data is returned
**Then** it contains territory entries with regent and ambience fields populated

**Given** a production build (non-dev auth)
**When** any API call is made
**Then** the fixture layer is not active — real API calls go through as normal

**Given** the dev fixture is running
**When** any tab that was previously blank due to missing data renders
**Then** it is now possible to determine whether it renders correctly with data present

## Tasks

- [ ] Export sanitised snapshot from MongoDB Atlas for: characters (5–10 records), territories, downtime_cycles (1 active), downtime_submissions (1–2 records), game_sessions (next upcoming), players (matching character records), tracker_state (matching characters)
- [ ] Save to `data/dev-fixtures/` as individual JSON files per collection (e.g., `characters.json`, `territories.json`)
- [ ] Anonymise: replace real player names with fictional TM-style names; keep clan/covenant/merit data intact (this is what drives render logic)
- [ ] Add dev fixture intercept to `public/js/app.js` or a new `public/js/dev-fixtures.js` — activated only when `localStorage.getItem('tm_auth_user')` contains the dev bypass token
- [ ] Fixture intercept wraps `window.fetch` (or the app's API utility function) to match path patterns and return fixture JSON
- [ ] Document the fixture setup in a comment block at the top of `dev-fixtures.js`

## Dev Notes

- Do NOT use `data/chars_v2.json` as the fixture source — it is the seed file and may be out of date. Export fresh from Atlas.
- The dev bypass token is set in `dev-login.html` — check what value it sets in `tm_auth_user` and match against that.
- Fixture intercept must be transparent to the rest of the app — components should not know whether they're receiving fixture or live data.
- Characters should include at least one Regent and one character with an Office to test conditional tab visibility.

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
Fixture intercept implemented. 6 anonymised characters cover all 5 clans, all 5 covenants, one Head of State (Office tab), one Regent (Regency tab). Player login mapped to Elara Voss (id 600000000000000000000006). Fixture data inlined in dev-fixtures.js; JSON reference files saved to data/dev-fixtures/. Replace JSON files with Atlas exports when available.
### File List
- public/js/dev-fixtures.js (new)
- public/js/app.js (import added)
- public/dev-login.html (character_ids for player role)
- data/dev-fixtures/characters.json (new)
- data/dev-fixtures/territories.json (new)
- data/dev-fixtures/tracker_state.json (new)
- data/dev-fixtures/downtime_cycles.json (new)
- data/dev-fixtures/game_sessions.json (new)
