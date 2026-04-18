---
stepsCompleted: [1]
inputDocuments:
  - specs/ux-design-unified-nav.md
  - specs/architecture/system-map.md
  - specs/prd.md
---

# TM Suite — Unified App Navigation Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the unified app navigation redesign, decomposing requirements from the UX design specification, system architecture map, and product context into implementable stories.

**Primary reference:** `specs/ux-design-unified-nav.md`
**Architecture reference:** `specs/architecture/system-map.md`

---

## Requirements Inventory

### Functional Requirements

FR1: The app must provide a single unified entry point accessible to both players and STs, replacing the current two-app model (index.html + player.html)
FR2: Primary nav must have exactly 4 permanent tabs: Dice, Sheet, Map, More
FR3: The More tab must open a full-screen app grid showing role-appropriate icons
FR4: ST role must see Tracker, Sign-In, Emergency Contacts in the More grid; players do not
FR5: Player role must see DT Submission and Ordeals in the More grid; STs do not
FR6: Shared More grid apps (Status, Who's Who, DT Report, Feeding, Primer, Game Guide, Rules, Tickets) must be visible to all authenticated roles
FR7: Character sheet must render in single-column layout on screens ≤768px
FR8: Character sheet must render in multi-column layout on desktop (>1024px)
FR9: ST Sheet tab must include a character picker (chip grid) before rendering the sheet
FR10: Player Sheet tab must render their own character without a picker
FR11: Map tab must display the territory/city map
FR12: Feeding must surface as a contextual card when the game cycle is in feeding phase
FR13: A downtime deadline card must surface when a downtime cycle is open and approaching deadline
FR14: Feeding must be accessible from the More grid at all times (not just during feeding phase)
FR15: Unified app must support both dark and parchment (light) themes
FR16: Theme preference must persist via localStorage['tm-theme'] and apply on load
FR17: Theme toggle must be accessible from within the unified app
FR18: All 12 player.html tabs must have a functional destination in the unified app
FR19: Conditional tabs (Regency, Office, Archive) must only show in More grid when the relevant role/condition applies
FR20: Admin portal (admin.html) must remain a separate desktop-first application for management tasks
FR21: Admin portal must be tablet-aware (≥44px tap targets, collapsible sidebar) but not phone-optimised

### Non-Functional Requirements

NFR1: Primary nav tabs must be reachable in ≤1 tap from any screen in the app
NFR2: All interactive tap targets must be ≥44px (mobile accessibility minimum)
NFR3: The app must work on phones as the primary device, with tablet and desktop as secondary
NFR4: All CSS must use token-based colour variables (--accent, --surf*, --txt*) — no hardcoded colours in new components
NFR5: Each feature (sheet, feeding, tracker) must have exactly one implementation — no duplication
NFR6: Role-gating of More grid content must be derived from the authenticated user's Discord role (already implemented)
NFR7: The app must degrade gracefully on poor network connectivity (game venues)
NFR8: Dark theme must be the default for the unified app (consistent with game venue low-light context)

### Additional Requirements (from Architecture)

- **Current duplication to resolve**: feeding-tab.js exists in player.html and suite/tracker-feed.js in index.html — the canonical implementation is player/feeding-tab.js (API-backed, EPA.2)
- **Current duplication to resolve**: character sheet rendered in both editor/sheet.js (admin) and suite/sheet.js (suite) — needs single platform-aware implementation
- **Existing work to leverage**: Role-aware nav already exists in applyRoleRestrictions() in app.js
- **Existing work to leverage**: Single-column sheet CSS breakpoints in player-layout.css (EPB.2)
- **Existing work to leverage**: Character chips in editor/list.js (EPB.6)
- **Existing work to leverage**: Sign-in tab module in game/signin-tab.js (EPC.4)
- **Existing work to leverage**: Tracker state in MongoDB (EPA.2) — vitae/WP/influence already API-backed
- **Theme system**: Token-based CSS already works in both themes across all components; the change is adding a toggle and reconciling opposite defaults (index.html defaults dark, player.html defaults light)
- **`player.html` fate**: Can remain as a redirect or legacy access point during transition while unified app is built incrementally

### UX Design Requirements

UX-DR1: Replace current 6–7 tab bottom nav with 4-tab permanent layout (Dice, Sheet, Map, More)
UX-DR2: Build More grid as a full-screen app launcher with role-aware icon visibility and conditional app support
UX-DR3: Implement platform-aware character sheet rendering: 1-col on mobile, multi-col on desktop, single component
UX-DR4: Build lifecycle-aware contextual card system: feeding phase card, DT deadline card, surfaced on home or relevant tab
UX-DR5: Add theme toggle to unified app with dark as default; reconcile opposite defaults between current apps
UX-DR6: Migrate all 12 player.html tabs to their unified app destinations (see migration table in UX spec)
UX-DR7: Demote feeding from permanent tab to More grid app with contextual promotion during feeding phase
UX-DR8: Ensure admin portal has ≥44px tap targets and collapsible sidebar for tablet use (foundational work already done in EPB.4)

### FR Coverage Map

| FR | Epic | Story |
|---|---|---|
| FR1 | Epic 1 | 1.1 |
| FR2 | Epic 1 | 1.2 |
| FR3 | Epic 1 | 1.3 |
| FR4–FR6 | Epic 1 | 1.3 |
| FR7–FR10 | Epic 2 | 2.1 |
| FR11 | Epic 2 | 2.2 |
| FR12–FR13 | Epic 3 | 3.1 |
| FR14 | Epic 2 | 2.5 |
| FR15–FR17 | Epic 3 | 3.2 |
| FR18–FR19 | Epic 2 | 2.3–2.4 |
| FR20–FR21 | Out of scope (admin portal, ongoing) |

---

## Epic List

1. **Navigation Shell** — New 4-tab primary nav and More grid launcher
2. **Content Migration** — Migrate player.html and suite app content into unified app
3. **Contextual Intelligence** — Lifecycle cards and theme system

---

## Epic 1: Navigation Shell

**Goal:** Replace the current multi-tab bottom navs in `index.html` and `player.html` with a single unified 4-tab structure (Dice, Sheet, Map, More) and build the More grid app launcher. This is the structural foundation — content migration comes in Epic 2.

**Why first:** Nothing else can be built until the nav container exists. This epic creates the shell; subsequent epics fill it.

### Story 1.1: Unify auth and routing into a single entry point

As an authenticated user (player or ST),
I want a single URL to open the Terra Mortis game app regardless of my role,
So that I don't need to know which of two apps to open.

**Acceptance Criteria:**

**Given** a player logs in at the app URL
**When** auth completes
**Then** the app renders with player-appropriate nav and content

**Given** an ST logs in at the same URL
**When** auth completes
**Then** the app renders with ST-appropriate nav and additional tabs visible

**Given** `player.html` is accessed directly
**When** the page loads
**Then** it redirects to the unified app (or renders identically)

**Architectural decision (resolved):** Evolve `index.html` — absorb `player.html`'s functionality progressively. No new HTML file needed. `player.html` becomes a redirect once migration is complete. Desktop-oriented features (DT Submission, Ordeals) live in the unified app; responsive behaviour handles viewport differences, no separate URL. Dark theme is the unified default; theme toggle is added in Epic 3.

---

### Story 1.2: Replace bottom nav with 4-tab permanent layout

As a user on a phone,
I want exactly four bottom tabs (Dice, Sheet, Map, More),
So that I can reach any primary function in one tap with no ambiguity.

**Acceptance Criteria:**

**Given** any authenticated user
**When** the app loads
**Then** the bottom nav shows exactly: Dice, Sheet, Map, More — in that order

**Given** I am on any tab
**When** I tap a bottom nav button
**Then** I navigate to that tab with no more than one transition

**Given** a screen width of 390px (iPhone 14)
**When** the bottom nav renders
**Then** all 4 tabs are visible without scrolling, each with ≥44px tap target

**Notes:** Remove existing 6–7 tab structures. Routing for Roll → Dice, Characters → Sheet, Territory → Map. Old tabs that don't map directly go to More grid in Story 1.3.

---

### Story 1.3: Build the More grid app launcher

As an authenticated user,
I want a full-screen app grid behind the More tab,
So that I can access specialised tools without cluttering the primary nav.

**Acceptance Criteria:**

**Given** an ST user taps More
**When** the More grid renders
**Then** it shows all shared apps plus ST-only apps (Tracker, Sign-In, Emergency Contacts) and does NOT show player-only apps (DT Submission, Ordeals)

**Given** a player user taps More
**When** the More grid renders
**Then** it shows all shared apps plus player-only apps (DT Submission, Ordeals) and does NOT show ST-only apps

**Given** any user taps an app icon in the More grid
**When** the icon is tapped
**Then** they navigate to that app's view, with a back/close route to return to More

**Given** a conditional app (Regency, Office) whose condition is not met
**When** the More grid renders
**Then** that app icon is not shown

**Notes:** App icons use design system tokens (--surf2, --bdr, --accent on active). Min tap target 44px. Grid layout: auto-fill, ≥2 per row on phone.

---

### Story 1.4: Carry forward existing working content into new shell

As a user on day one of the new unified app,
I want the Dice, Sheet, and Map tabs to work with real content immediately,
So that the app is usable from the moment it ships — not a skeleton.

**Acceptance Criteria:**

**Given** any user opens the unified app after Epic 1 ships
**When** they tap the Dice tab
**Then** the existing dice roller (from `suite/roll.js` + char pool chips) functions identically to the current game app

**Given** any user taps the Sheet tab
**When** the tab renders
**Then** the existing suite sheet renders (single-column on mobile, wider on desktop) for the relevant character(s)

**Given** any user taps the Map tab
**When** the tab renders
**Then** the existing territory view renders from `/api/territories`

**Given** any user taps More
**When** the grid renders
**Then** ST-only grid apps that already exist (Tracker, Sign-In, Rules) are wired and functional

**Notes:** This story is about *not shipping a skeleton*. No new functionality — carry forward what works today. The polish and consolidation of sheet/feeding implementations happens in Epic 2.

---

## Epic 2: Content Migration

**Goal:** Move all `player.html` tab content into the unified app's routing, consolidate duplicate implementations (sheet, feeding), and ensure every current user journey still works — just from one app instead of two.

**Why second:** The shell exists from Epic 1. Now we fill it with real content. No duplication survives this epic.

### Story 2.1: Platform-aware character sheet (single implementation)

As a user on any device,
I want the character sheet to render appropriately for my screen,
So that I get the best experience whether I'm on a phone or desktop.

**Acceptance Criteria:**

**Given** a phone screen (≤768px)
**When** the Sheet tab opens
**Then** attributes and skills render in a single column, no horizontal scroll required

**Given** a desktop screen (>1024px)
**When** the Sheet tab opens
**Then** the full multi-column layout renders with all sections visible

**Given** an ST user on the Sheet tab
**When** no character is selected
**Then** the character picker (chip grid) is shown first

**Given** an ST selects a character from the picker
**When** the chip is tapped
**Then** that character's sheet renders replacing the picker

**Given** a player user on the Sheet tab
**When** the tab opens
**Then** their own character sheet renders immediately (no picker)

**Notes:** Consolidate `editor/sheet.js` and `suite/sheet.js` into a single platform-aware renderer. EPB.2 CSS breakpoints already exist in player-layout.css. The editor sheet is more complete — likely the base to extend.

---

### Story 2.2: Map tab renders territory view

As a user at game,
I want the Map tab to show the city territory layout,
So that I can reference territory control and ambience during scenes.

**Acceptance Criteria:**

**Given** any authenticated user taps the Map tab
**When** the tab renders
**Then** the territory map is displayed with current territory data from the API

**Given** territories have regent and ambience data
**When** the map renders
**Then** each territory shows its current state (regent, ambience level)

**Notes:** This migrates the territory/city map view currently in index.html Territory tab. Uses existing `/api/territories` endpoint.

---

### Story 2.3: Migrate player.html core tabs to More grid

As a player,
I want all my portal features (DT Report, Status, City, Primer, Tickets, Ordeals & XP) accessible from the unified app,
So that I don't need to visit player.html for any regular function.

**Acceptance Criteria:**

**Given** a player taps DT Report in the More grid
**When** the view opens
**Then** their published downtime narrative renders (same content as player.html Story tab)

**Given** a player taps Status in the More grid
**When** the view opens
**Then** the court hierarchy and prestige display renders

**Given** a player taps Ordeals & XP
**When** the view opens
**Then** their ordeal progress and XP log renders

**Given** a player taps Primer, Tickets
**When** each view opens
**Then** the same content currently in player.html renders correctly

**Mobile-readiness tiers:**
- **Full mobile treatment** (read-only, simple layout): DT Report, Status, Primer, Who's Who — adapt CSS for 390px, no functional compromise
- **Desktop-optimised, mobile-accessible** (form-heavy): DT Submission, Ordeals — render as-is, add a "Best experienced on desktop" notice on narrow viewports; do not attempt to reflow complex forms
- **Already mobile-ready**: Tickets (simple list), XP Log (simple list)

Each story AC must specify which tier applies.

---

### Story 2.4: Migrate conditional player.html tabs (Regency, Office, Archive)

As a player with a court role,
I want my Regency and Office tabs accessible from the unified app when relevant,
So that the More grid only shows what applies to me.

**Acceptance Criteria:**

**Given** a player whose character holds a regency
**When** the More grid renders
**Then** the Regency app icon is visible

**Given** a player without regency
**When** the More grid renders
**Then** the Regency app icon is not shown

**Given** a player with an office
**When** the More grid renders
**Then** the Office app icon is visible

**Notes:** Condition logic needs to be determined — currently `tab-btn-regency` and `tab-btn-office` are shown/hidden via JS in player.js. The same condition logic moves to the More grid renderer.

---

### Story 2.5: Consolidate feeding and add to More grid (FR14)

As an ST or player,
I want feeding to be accessible from the More grid at any time and to work identically regardless of how I reach it,
So that there is one feeding experience with no divergence between surfaces.

**Acceptance Criteria:**

**Given** a player accesses Feeding from the More grid
**When** the feeding tab renders
**Then** it uses `renderFeedingTab()` from `player/feeding-tab.js` (the canonical API-backed implementation)

**Given** the feeding roll is completed and confirmed
**When** the confirm button is tapped
**Then** vitae and influence are written to `/api/tracker_state` (not localStorage)

**Given** the user navigates away and returns to Feeding
**When** the tab re-renders
**Then** the previously-rolled result is shown (persisted to API)

**Given** a user opens More
**When** the grid renders
**Then** a Feeding icon is always present regardless of game cycle phase

**Notes:** FR14 — Feeding must always be accessible from More, not only during feeding phase (the contextual promotion card is Epic 3). Remove `suite/tracker-feed.js` entirely after this story. The canonical implementation already exists and is API-backed from EPA.2 and EPA.4.

---

## Epic 3: Contextual Intelligence

**Goal:** Make the app context-aware — surfacing feeding when it's open, signalling DT deadlines, and letting users control their theme preference. The app knows where you are in the game cycle and shows what's relevant.

**Why third:** Requires the unified shell (Epic 1) and real content (Epic 2) to already be in place. Contextual cards are a layer on top of a working app.

### Story 3.1: Lifecycle-aware contextual cards

As a player or ST,
I want the app to surface a prompt when feeding is open or a DT deadline is approaching,
So that I take action at the right time without having to remember to check.

**Acceptance Criteria:**

**Given** the game cycle is in feeding phase (game_session exists with a future date)
**When** any user opens the app
**Then** a "Your feeding roll is ready" card is visible on the home screen or Sheet tab

**Given** the feeding card is shown
**When** the user taps it
**Then** they navigate directly to the Feeding view

**Given** a downtime cycle is open and its deadline is within 7 days
**When** a player opens the app
**Then** a "Downtime due [date]" card is visible in the app

**Given** no feeding phase is active and no DT deadline is imminent
**When** the user opens the app
**Then** no contextual cards are shown (clean state)

**Notes:** Cycle phase is determined by querying `/api/downtime_cycles` and `/api/game_sessions/next`. Cards use the design system panel pattern (`.panel`, `--surf2`, `--accent`).

---

### Story 3.2: Theme toggle — dark/light with persistent preference

As a user,
I want to switch between dark and light (parchment) themes,
So that I can choose the display that suits my environment.

**Acceptance Criteria:**

**Given** a new user opens the unified app for the first time
**When** the app loads
**Then** dark theme is applied by default

**Given** a user switches to light (parchment) theme via the toggle
**When** the preference is set
**Then** `localStorage['tm-theme']` is set to `'light'` and the app re-renders in parchment

**Given** the user returns to the app later
**When** the app loads
**Then** their saved theme preference is applied immediately (before first render)

**Given** the theme toggle is accessed
**When** the user looks in the More grid or app settings
**Then** the toggle is no more than 2 taps away from any screen

**Notes:** The token-based CSS system already supports both themes throughout all components. The change is: (1) unify the theme init logic from the two opposite defaults, (2) add a toggle UI, (3) ensure all new components in Epics 1–2 use only token-based colours.
