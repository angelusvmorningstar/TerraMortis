---
id: nav.5
epic: unified-nav-polish
group: D
status: ready
priority: medium
---

# Story nav.5: Logic & Polish

As a user of the unified game app,
I want small logic and ordering issues fixed,
So that the app behaves correctly and coherently without requiring workarounds.

## Background

Six small logic/configuration issues identified during dev review. None require new UI design or API changes. All can be batched and shipped together.

### Issues in scope

| # | Issue |
|---|---|
| 12 | Archive tab — move to Player section in nav; remove historic DT storage role (superseded by Downtime tab) |
| 15 | Tickets — hide closed tickets from default view |
| 16 | Lore nav section order — should be: Primer, Guide, Rules |
| 17 | Rules search — cursor loses focus on each keystroke (re-render loop) |
| 21 | Tracker — remove honorific from character names |
| 22 | Tracker collapsed card — show influence alongside vitae/WP |

## Acceptance Criteria

### Issue 12 — Archive nav placement

**Given** the More grid renders
**When** a user views the nav sections
**Then** Archive appears in the Player section, not its current section

**Given** Archive no longer stores historic downtimes
**When** Archive is opened
**Then** it does not reference or attempt to load historic DT data — any such UI is removed

**Note:** If Archive's remaining scope is unclear after removing DT history, display an "Archive — coming soon" placeholder rather than a broken view. Raise the scope question with Angelus before building new Archive content.

### Issue 15 — Closed tickets hidden

**Given** a player views the Tickets tab
**When** the ticket list renders
**Then** only open/active tickets are shown by default

**Given** a closed ticket exists
**When** the default Tickets view renders
**Then** the closed ticket is not shown (no separate toggle required for v1 — just hide them)

### Issue 16 — Lore nav order

**Given** the Lore section renders in the More grid or desktop sidebar
**When** the items are displayed
**Then** the order is: Primer, Guide, Rules — in that exact order

### Issue 17 — Rules search cursor

**Given** a user types in the Rules search input
**When** each keystroke fires
**Then** the input retains focus — the cursor does not jump away or require re-clicking

**Root cause (likely):** The rules tab re-renders entirely on each `input` event, destroying and recreating the `<input>` element, which loses focus. Fix: update the results list only, not the entire tab container. Do not call a full tab re-render on search input; instead update only the `#rules-results` list in place.

### Issue 21 — Tracker names without honorific

**Given** the Tracker tab renders character rows
**When** a character has an honorific (e.g., "Lord", "Lady", "Doctor")
**Then** the tracker displays only `moniker || name` — no honorific prefix

**Implementation:** Replace `displayName(c)` calls in the tracker render with `sortName(c)` or `c.moniker || c.name` directly. `displayName()` is for sheet headers and formal contexts; tracker rows are functional, not ceremonial.

### Issue 22 — Tracker collapsed shows influence

**Given** the Tracker tab renders a collapsed character card
**When** the card is in its collapsed/summary state
**Then** current influence is displayed alongside vitae and WP

**Given** influence data is available from tracker state
**When** the collapsed card renders
**Then** the influence value is shown as: `Inf [current]/[max]` or equivalent compact format matching the existing vitae/WP display pattern

## Dev Notes

- Issue 12: Find where Archive is declared in `MORE_APPS` or `MORE_SECTIONS` in `app.js` and move its section assignment to Player. Remove any DT history fetch or render calls from the Archive tab renderer.
- Issue 15: In the tickets render function, filter `tickets.filter(t => t.status !== 'closed')` before rendering.
- Issue 16: In `MORE_SECTIONS` or wherever Lore apps are declared in `app.js`, reorder to: Primer, Guide, Rules.
- Issue 17: Find the `input` event listener on the rules search field. Replace full tab re-render with a targeted list update. The search input element must not be inside the container that gets replaced.
- Issue 21: `sortName(c)` is defined in `public/js/data/helpers.js` — use it in tracker name renders.
- Issue 22: Influence max = sum of all influence merits (see `reference_influence_formula.md`). Current influence comes from `tracker_state`. Add to collapsed card template.

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
All 6 issues implemented. Archive DT history removed (downtime_response type no longer rendered). Rules search refactored to separate input from sections div — focus preserved on keystroke. Tracker collapsed header now shows Inf current/max.
### File List
- public/js/app.js
- public/js/game/rules.js
- public/js/game/tracker.js
- public/js/player/archive-tab.js
- public/js/player/tickets-tab.js
