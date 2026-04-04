---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - specs/prd.md
  - specs/architecture-st-admin.md
  - specs/architecture-player-access.md
  - specs/prd/epic-restructure-proposal.md
  - specs/architecture.md
---

# TM Suite - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for TM Suite, decomposing the requirements from the PRD, Architecture documents, and Epic Restructure Proposal v3 into implementable stories.

Epics 1–4 are complete and listed as reference only. Active work begins at Epic 5.

## Requirements Inventory

### Functional Requirements

**Epic 3: ST Admin Features (Substantially Complete)**

- FR-3-01: ST can view, create, and edit character records — attributes, skills, disciplines, merits, derived stats — through the admin character editor
- FR-3-02: ST can view MCI and Professional Training standing merit grants, with child merits derived at render time from the active dot level; prerequisites are validated automatically and failed grants are surfaced distinctly from active grants
- FR-3-03: ST can view the city domain — territory map, current court position holders, and influence rankings derived from active character merits
- FR-3-04: ST records per-session attendance per player (attended/costuming/downtime/extra XP components); XP totals are calculated dynamically from session records
- FR-3-05: ST can export character data as CSV from the admin app; extended to all collections by FR-DP-01

**Epic 5: Player Access Layer**

- FR-5-01: Players can authenticate via Discord and access their linked character(s); player-to-character mapping is maintained server-side and not hardcoded
- FR-5-02: Players view their own character sheet (read-only) from a mobile-first portal; ST data is stripped from all player API responses
- FR-5-03: Players submit a downtime form with section gating based on their character data; deadline enforcement applies
- FR-5-04: Players can view their published downtime outcome from the moment the ST completes the cycle reset; no individual delivery action by the ST is required
- FR-5-05: Players track ordeals (setting/rules/covenant at player level; questionnaire/history at character level) with XP cascade on approval
- FR-5-06: The player portal displays a clear "your ST is still processing this cycle" state when a cycle is closed but the reset has not yet been completed; players are not shown an empty or broken outcome view

**Game Cycle Management**

- FR-GC-01: ST records game session attendance per player with attended/costuming/downtime/extra XP components; XP totals derive dynamically from session records (see also FR-3-04)
- FR-GC-02: ST locks in which character holds Regency for a given cycle; Regency history is queryable
- FR-GC-03: ST can view a feeding scene summary presenting each character's approved feeding method, ambience modifier for their declared territory, and rote quality flag from their last resolved downtime submission; characters with no downtime submission are shown a generic feeding pool using their highest applicable method with no modifiers applied
- FR-GC-04: Cycle reset executes as a coordinated sequence — publish all ready submissions, apply approved sheet mutations, reset tracks, open new cycle — with the guarantee that if sheet mutations are approved for a character, they are applied before that character's outcomes are published; no character has updated sheets without published outcomes; if any phase fails, subsequent phases do not execute and the ST is shown the failure state with the option to retry or roll back
- FR-GC-05: The downtime submission schema records per-character expenditures (Vitae spent, Willpower spent, Influence spent) as part of the ST approval workflow; track reset uses these recorded values to calculate the adjusted starting state for each track at the next cycle
- FR-GC-06: End-of-cycle snapshot records eminence, ascendancy, and prestige for all characters at the moment of reset
- FR-GC-07: Monthly influence income is calculated per character based on active influence merits and territory holdings, and applied during cycle reset

**Epic 6: Live Game App**

- FR-6-01: The live game interface runs in a tablet-optimised layout (max 600px, bottom navigation) with all edit controls hidden; character switching occurs without page reload
- FR-6-02: ST can look up any character and view their complete read-only sheet with all dice pools pre-calculated from current character data
- FR-6-03: ST can initiate and resolve common contested roll workflows — territory bid, social manoeuvre, resistance check — with pools drawn directly from character data; results are logged to the session log automatically
- FR-6-04: ST can view any character's current cycle downtime submission in read-only mode with ST notes visible
- FR-6-05: ST can track per-character live game state (Vitae, Willpower, Health, Conditions) with a reset-all function at session start; state persists for the duration of the session without requiring manual save
- FR-6-06: ST can access a searchable rules quick reference (roll mechanics, resistance formulas, discipline summaries, merit effects) without leaving the character view

**Epic OR: Ordeal System**

- FR-OR-01: ST can import historical ordeal submissions from Google Forms Excel exports (Lore Mastery, Rules Mastery, Covenant Questionnaire, Character History) into MongoDB, with player-to-character resolution by email and name; existing Review Data tab comments are imported as draft markings
- FR-OR-02: ST can browse all ordeal submissions in the admin app by ordeal type or by character; each view shows the player's response alongside the rubric expected answer
- FR-OR-03: ST can mark each answer Yes / Close / No, add per-answer feedback, add overall feedback, and mark the ordeal complete; marking persists between sessions
- FR-OR-04: On ordeal completion, 3 XP is awarded to the character and ordeal status updates in the player portal
- FR-OR-05: ST can view and edit rubric entries (expected answers and marking notes) per question per ordeal type from within the admin app

**Epic AR: Archive and Documents**

- FR-AR-01: All 31 dossiers, 27 Downtime 1 ST responses, and 4 character history Word doc submissions are converted from .docx to HTML via mammoth and stored in `archive_documents` linked to character IDs
- FR-AR-02: Players can view their own archive documents (dossier, downtime responses, history) in-browser in the Archive tab; no other character's documents are accessible
- FR-AR-03: ST can upload a new .docx for any character via the admin app; mammoth conversion runs server-side and the document is stored immediately
- FR-AR-04: Players can view the Terra Mortis city map and a who's who of active characters (name, clan, covenant, court position) in the City tab
- FR-AR-05: Players can read the primer as a formatted web page; ST can update primer content from the admin app without a redeploy

**Data Portability**

- FR-DP-01: Any collection (characters, territories, game sessions, attendance, investigations, NPCs) can be exported as a CSV file with all fields represented; nested fields (e.g. character merits array, disciplines map) require a defined flat export format to be specified before implementation — round-trip fidelity depends on this format being established
- FR-DP-02: Any exported CSV can be re-imported with schema validation, deduplication against existing records, and row-level error reporting
- FR-DP-03: Import operations report errors per row without aborting the batch; valid rows are written, invalid rows are reported with field-level messages
- FR-DP-04: Import functions validate all fields against the current collection schema before writing; malformed or out-of-range values are rejected with clear messages
- FR-DP-05: Export followed by immediate import produces an identical data state (no field loss, truncation, or type coercion artefacts)

### NonFunctional Requirements

- NFR1: Tab/view switching completes in under 100ms as measured in-browser on the target devices (iPad Safari, desktop Chrome)
- NFR2: Character sheet rendering completes in under 500ms from API response receipt
- NFR3: Dice roll results display within 200ms of user tap
- NFR4: Initial app load completes in under 3 seconds on a standard broadband connection
- NFR5: API responses for character list and submission fetch complete in under 500ms at 95th percentile under normal load
- NFR6: Players access only their own character data; `st_review`, ST notes, and internal flags are stripped from all player-role API responses by server-side middleware
- NFR7: No credentials, API keys, or sensitive configuration are stored in the repository
- NFR8: All ST-only routes are protected by role-gating middleware; all player routes by player-role middleware; unauthenticated requests receive 401
- NFR9: All interactive elements are keyboard-navigable
- NFR10: Colour contrast meets WCAG 2.1 AA minimum ratios on all text/background combinations
- NFR11: Semantic HTML used for structure (headings, lists, buttons — not div-only layouts)
- NFR12: All character and collection data is stored in MongoDB Atlas and accessed exclusively via the Express API; no client-side JSON files serve as primary data sources
- NFR13: Discord OAuth is the sole authentication mechanism; player-to-character mapping is maintained in the players collection, not hardcoded
- NFR14: CSS custom properties (design tokens) are defined in one theme file; no hardcoded colour values outside that file
- NFR15: Reference data (MERITS_DB, DEVOTIONS_DB, MAN_DB) is stored as separate importable JS modules, not inline in application code
- NFR16: Code organisation follows the documented file structure; each feature module has a clear, single responsibility
- NFR17: British English throughout — Defence, Armour, Vigour, Honour, Socialise; no em-dashes in any output text
- NFR18: Dots rendered as `'●'.repeat(n)` (U+25CF); gold accent `#E0C47A` (CSS var `--gold2`); heading font Cinzel/Cinzel Decorative, body font Lora
- NFR19: Dark theme defined on `:root` — `--bg: #0D0B09`, `--surf*` surface tiers, `--gold*` accent tiers, `--crim: #8B0000` for damage/crimson states

### Additional Requirements

From `specs/architecture-st-admin.md` and `specs/architecture-player-access.md`:

- Express API is a thin CRUD persistence layer; all VtR 2e business logic (derived stats, XP calculations, merit prerequisites, dice rolling) remains in browser JS
- All API calls from the browser go through `public/js/data/api.js` — no raw fetch calls in feature modules
- `players` MongoDB collection maps Discord ID to role, character IDs, and player-level ordeal status; sits between auth and character data
- Role-aware API middleware: player tokens cause `GET /api/characters` to return only that player's characters; ST tokens return all
- `st_review` subdocument is stripped from all player-facing API responses server-side (not by client filtering)
- Downtime submissions use domain-based subdocuments (11 sections: Court, Regency, City/Feeding, Projects ×4, Spheres ×5, Contacts ×6, Retainers ×5, Acquisitions, Blood Sorcery, Vamping, Admin) with an `st_review` section for ST-only data
- `player.html` is a separate mobile-first entry point sharing JS modules with `admin.html` and `index.html`
- Auth callback redirects by role: ST → `admin.html`, player → `player.html`; dual-role users (Symon, Kurtis) get bidirectional switching without re-login
- Game app (`index.html`) uses cache-first loader: fetches from API on startup, falls back to localStorage if API unreachable — preserves offline resilience for live game
- All dates in MongoDB documents and API responses use ISO 8601 strings (`new Date().toISOString()`)
- No JS file exceeds 500 lines; modules are split by single responsibility
- MongoDB collection names: plural snake_case (`characters`, `downtime_cycles`, `downtime_submissions`, `players`, `game_sessions`, `territories`, `tracker_state`, `session_logs`)
- Cycle reset atomicity: coordinated sequence with failure state and retry/rollback option; sheet mutations applied before outcomes published for any given character

### UX Design Requirements

N/A — No UX design document exists. UI patterns are defined inline in Architecture decisions and are captured in relevant story acceptance criteria.

### FR Coverage Map

| FR | Epic/Area | Story (planned) |
|---|---|---|
| FR-3-01 | Epic 3 | Done |
| FR-3-02 | Epic 3 | Done |
| FR-3-03 | Epic 3 | Done |
| FR-3-04 | Epic 3 / GC | Done (Epic 3); GC-1 extends |
| FR-3-05 | Epic 3 / DP | Done (basic); DP-1 extends to all collections |
| FR-5-01 | Epic 5 | 5.1 |
| FR-5-02 | Epic 5 | 5.3 |
| FR-5-03 | Epic 5 | 5.4 |
| FR-5-04 | Epic 5 | 5.5 |
| FR-5-05 | Epic 5 | 5.6 |
| FR-5-06 | Epic 5 | 5.4 / 5.5 |
| FR-GC-01 | Game Cycle | GC-1 (extends FR-3-04) |
| FR-GC-02 | Game Cycle | GC-2 |
| FR-GC-03 | Game Cycle | GC-3 |
| FR-GC-04 | Game Cycle | GC-5 |
| FR-GC-05 | Game Cycle | GC-4 |
| FR-GC-06 | Game Cycle | GC-5 |
| FR-GC-07 | Game Cycle | GC-5 |
| FR-6-01 | Epic 6 | 6.1 |
| FR-6-02 | Epic 6 | 6.2 |
| FR-6-03 | Epic 6 | 6.3 |
| FR-6-04 | Epic 6 | 6.4 |
| FR-6-05 | Epic 6 | 6.5 |
| FR-6-06 | Epic 6 | 6.6 |
| FR-OR-01 | Epic OR | OR-1 |
| FR-OR-02 | Epic OR | OR-2 |
| FR-OR-03 | Epic OR | OR-2 |
| FR-OR-04 | Epic OR | OR-2 |
| FR-OR-05 | Epic OR | OR-3 |
| FR-AR-01 | Epic AR | AR-1 |
| FR-AR-02 | Epic AR | AR-2 |
| FR-AR-03 | Epic AR | AR-3 |
| FR-AR-04 | Epic AR | AR-4 |
| FR-AR-05 | Epic AR | AR-5 |
| FR-DP-01 | Data Portability | DP-1 |
| FR-DP-02 | Data Portability | DP-2 |
| FR-DP-03 | Data Portability | DP-2 |
| FR-DP-04 | Data Portability | DP-2 |
| FR-DP-05 | Data Portability | DP-3 |

## Epic List

### Epic 1: Foundation Restructure — DONE
Single SPA, modular JS/CSS, v2 data layer, shared accessors. All active epics build on this foundation.

### Epic 2: Backend Foundation — DONE
Express API on Render, MongoDB Atlas, Discord OAuth, Netlify deployment, all collection APIs, game app API integration.

### Epic 3: ST Admin Features — DONE (Story 3.3 Session Log parked)
Character editing, MCI/PT grants, city domain views, attendance and finance, data migration. Story 3.3 parked until game day for live testing.
**FRs covered:** FR-3-01, FR-3-02, FR-3-03, FR-3-04, FR-3-05 (character CSV export only)

### Epic 4: Downtime System — DONE
CSV import, cycle management, submission processing, feeding rolls, project/merit resolution, narrative authoring, mechanical summaries, investigation tracker, NPC register, publish-to-players workflow, ambience update.

### Epic 5: Player Access Layer
Players can authenticate, view their characters, submit downtimes, track ordeals, and receive published outcomes — all without going through the ST.
**FRs covered:** FR-5-01, FR-5-02, FR-5-03, FR-5-04, FR-5-05, FR-5-06

### Epic GC: Game Cycle Management
The ST can manage the full post-game cycle from one place — lock in Regency, confirm feeding scenes, track expenditures, and execute a single reset action that atomically publishes outcomes, applies sheet mutations, resets all tracks, and opens the new cycle.
**FRs covered:** FR-GC-01, FR-GC-02, FR-GC-03, FR-GC-04, FR-GC-05, FR-GC-06, FR-GC-07

### Epic DP: Data Portability
The ST can export any collection as CSV and re-import it cleanly. Import errors are reported row-by-row without aborting the batch. Round-trip fidelity guaranteed.
**FRs covered:** FR-DP-01, FR-DP-02, FR-DP-03, FR-DP-04, FR-DP-05

### Epic OR: Ordeal System
Import historical Google Forms ordeal data, mark player responses against rubrics with Yes/Close/No per-answer feedback, award XP on completion, surface status to players.
**FRs covered:** FR-OR-01, FR-OR-02, FR-OR-03, FR-OR-04, FR-OR-05

### Epic AR: Archive and Documents
Convert all ST-authored .docx files (dossiers, downtime responses, histories) to HTML and store in MongoDB. Players read their archive in-portal. ST uploads future cycle documents from admin. City map, who's who, and primer page round out the player portal.
**FRs covered:** FR-AR-01, FR-AR-02, FR-AR-03, FR-AR-04, FR-AR-05

### Epic 6: Live Game App
The ST can look up any character, view pre-calculated dice pools, resolve contested rolls, check downtime submissions, and track live game state — all from a tablet-optimised interface on game day.
**FRs covered:** FR-6-01, FR-6-02, FR-6-03, FR-6-04, FR-6-05, FR-6-06

### Epic 7: Public Website — LATER
Public landing page and authenticated player resource portal. Depends on Epics 2–5 stable. No FRs in current PRD scope.

---

## Epic 5: Player Access Layer

Players can authenticate, view their characters, submit downtimes, track ordeals, and receive published outcomes — all without going through the ST.

**FRs covered:** FR-5-01, FR-5-02, FR-5-03, FR-5-04, FR-5-05, FR-5-06
**NFRs:** NFR6, NFR8, NFR12, NFR13
**Architecture reference:** specs/architecture-player-access.md

### Story 5.1: Players Collection and Role Middleware

As an ST,
I want the system to distinguish between ST and player roles based on Discord identity,
So that players can only access their own data and ST-only routes remain protected.

**Acceptance Criteria:**

**Given** a new `players` MongoDB collection with `discord_id`, `role`, `character_ids`, and `ordeals` fields
**When** a Discord OAuth callback completes
**Then** the server looks up the user in `players` by `discord_id` and resolves their role (st / player)
**And** `requireRole('st')` middleware returns 403 for player tokens on ST-only routes
**And** `requireRole('player')` middleware returns 403 for unauthenticated requests

**Given** a player token on `GET /api/characters`
**When** the request is processed
**Then** only characters with `_id` in that player's `character_ids` are returned
**And** an ST token returns all characters unchanged

**Given** an ST user who is also listed as a player (dual-role)
**When** their token is resolved
**Then** their role is `st` and they retain full admin access
**And** a separate player profile exists so they can switch to player view

### Story 5.2: Player HTML Shell and Auth Redirect

As a player,
I want to be redirected to a mobile-first player portal after logging in with Discord,
So that I see my character and downtime tools immediately without navigating through the ST admin interface.

**Acceptance Criteria:**

**Given** a user with `role: 'player'` completes Discord OAuth
**When** the auth callback resolves their role
**Then** they are redirected to `player.html`

**Given** a user with `role: 'st'` completes Discord OAuth
**When** the auth callback resolves their role
**Then** they are redirected to `admin.html`

**Given** a dual-role user on `admin.html`
**When** they click "My Character"
**Then** `player.html` opens in the same session without requiring re-login

**Given** `player.html` loads
**When** the page initialises
**Then** a top navigation bar with tabs (Sheet, Downtime, Ordeals, Story, Archive) is displayed
**And** the layout is mobile-first with responsive behaviour for larger screens

**Given** a player with multiple characters
**When** the shell initialises
**Then** a character selector dropdown appears and defaults to their first character

### Story 5.3: Read-Only Character Sheet Read-Only Character Sheet

As a player,
I want to view my character sheet in read-only mode,
So that I can see my attributes, skills, merits, disciplines, and remaining XP without being able to edit anything.

**Acceptance Criteria:**

**Given** a player is logged in and on the Sheet tab
**When** the sheet renders
**Then** all attributes, skills, disciplines, merits, derived stats, and XP remaining are displayed
**And** no edit controls, save buttons, or admin fields are present

**Given** the character sheet API response for a player token
**When** it is received
**Then** `st_review`, ST notes, internal flags, and any admin-only fields are absent from the response

**Given** a player with multiple characters
**When** they switch character using the selector
**Then** the sheet re-renders for the selected character without a page reload

**Given** a player's character has MCI or PT standing merits
**When** the sheet renders
**Then** derived child merit grants are displayed at render time (same logic as admin sheet)

### Story 5.4: Downtime Submission Form (Level 1)

As a player,
I want to submit my downtime through a structured form that adapts to my character,
So that I no longer need to fill out a generic Google Form, and the ST receives structured data immediately.

**Acceptance Criteria:**

**Given** a player opens the Downtime tab
**When** the current cycle is open and before the soft deadline
**Then** the submission form is displayed with sections gated by character data (e.g. Blood Sorcery section only shown for characters with relevant merits/powers)

**Given** a player submits the form
**When** the submission is saved
**Then** a `downtime_submissions` document is created with domain-based subdocuments (Court, Regency, City/Feeding, Projects, Spheres, Contacts, Retainers, Acquisitions, Blood Sorcery, Vamping, Admin)
**And** the player can return and edit their submission before the hard deadline

**Given** the current cycle is past the hard deadline
**When** a player tries to submit
**Then** the form is locked and a "Submissions closed" message is displayed
**And** if a submission already exists it remains visible in read-only mode

**Given** the current cycle is closed but reset has not occurred
**When** a player opens the Downtime tab
**Then** a clear "Your ST is still processing this cycle" message is displayed
**And** no empty or broken outcome state is shown

### Story 5.5: ST Publish Workflow

As an ST,
I want to publish all approved downtime outcomes in a single coordinated action,
So that all players receive their results simultaneously the moment I complete the cycle reset.

**Acceptance Criteria:**

**Given** the ST has marked one or more submissions as `outcome_visibility: 'ready'`
**When** the ST initiates cycle reset
**Then** all ready submissions are set to `outcome_visibility: 'published'` with a `published_at` timestamp
**And** approved sheet mutations are applied to character records before outcomes are published for each character
**And** no character has published outcomes without applied mutations

**Given** any phase of the reset sequence fails
**When** the failure occurs
**Then** subsequent phases do not execute
**And** the ST sees a failure state with the option to retry or roll back

**Given** a player views the Downtime tab after their outcome is published
**When** the page loads
**Then** their published narrative write-up and mechanical changes are visible
**And** if their submission is not yet published, the "processing" state is shown instead

**Given** `GET /api/downtime_submissions` is called with a player token
**When** the response is returned
**Then** the `st_review` subdocument is stripped — narrative, mechanical outcomes, and published status are returned, but ST notes are not

### Story 5.6: Ordeals, Story Tab, and Archive

As a player,
I want to track my ordeal progress, read my published downtime narrative history, and view any retired characters,
So that I have a complete picture of my character's journey in one place.

**Acceptance Criteria:**

**Given** a player opens the Ordeals tab
**When** it renders
**Then** all five ordeals (Questionnaire, History, Setting, Rules, Covenant) are shown with current status (pending / submitted / approved)
**And** player-level ordeals (Setting, Rules, Covenant) show status at the player level
**And** character-level ordeals (Questionnaire, History) show status per character

**Given** an ST approves an ordeal
**When** approval is saved
**Then** 3 XP is cascaded to the appropriate character(s)
**And** player-level ordeal XP applies to all of that player's characters

**Given** a player opens the Story tab
**When** it renders
**Then** their published downtime narrative write-ups are listed in reverse-chronological order
**And** each entry shows the cycle it belongs to and the ST-authored content

**Given** a player has a retired character
**When** they open the Archive tab
**Then** the retired character appears as a read-only sheet
**And** no edit controls are present

### Story 5.7: Character Creator Wizard

As a new player,
I want a guided character creation flow,
So that I can build my first character without needing to understand the full v2 schema or consult the ST for every field.

**Acceptance Criteria:**

**Given** a player with no approved characters logs in
**When** `player.html` initialises
**Then** the character creator wizard is displayed instead of the normal tabs

**Given** the wizard is active
**When** the player completes each step (identity → attributes → skills → merits → powers → review)
**Then** only valid options for their clan and bloodline are shown in filtered dropdowns
**And** XP costs are calculated and displayed in real time against their starting budget

**Given** a player submits their first character
**When** the submission is saved
**Then** the character is auto-approved and immediately available in read-only sheet view

**Given** a player submits a subsequent character
**When** the submission is saved
**Then** the character is locked pending ST sign-off
**And** the character remains inaccessible until an ST approves it

### Story 5.8: Downtime Form Enhancement (Levels 2 and 3)

As a player,
I want smart dropdowns, auto-calculated dice pools, and XP budget validation in the downtime form,
So that I can make accurate submissions without manually consulting rulebooks or spreadsheets.

**Acceptance Criteria:**

**Given** a player is filling in the Projects section
**When** they select a discipline or merit for a project
**Then** the dropdown is filtered to options available to their character
**And** the dice pool for that action is calculated and displayed from their character data

**Given** a player enters an XP spend request in the form
**When** the total requested spend is calculated
**Then** it is validated against their available XP budget
**And** a submission that exceeds the budget is blocked with a clear error message

**Given** a player fills in the Influence section
**When** they enter spend values
**Then** the form validates against their influence caps derived from active merits
**And** any cross-submission conflicts (e.g. same sphere targeted by two characters) are flagged

---

## Epic GC: Game Cycle Management

The ST can manage the full post-game cycle from one place — lock in Regency, confirm feeding scenes, track expenditures, and execute a single reset action that atomically publishes outcomes, applies sheet mutations, resets all tracks, and opens the new cycle.

**FRs covered:** FR-GC-01, FR-GC-02, FR-GC-03, FR-GC-04, FR-GC-05, FR-GC-06, FR-GC-07
**NFRs:** NFR1, NFR12

### Story GC-1: Regency Lock-In

As an ST,
I want to record which character holds Regency for a given cycle,
So that Regency benefits and history are tracked and queryable.

**Acceptance Criteria:**

**Given** the ST opens the cycle management view for the current cycle
**When** they select a character from the Regency dropdown and save
**Then** the cycle document records the `regency_character_id` and display name
**And** the Regency lock-in is confirmed with a visual indicator

**Given** a Regency holder has been set for a previous cycle
**When** the ST views cycle history
**Then** each closed cycle shows which character held Regency for that cycle

**Given** the ST changes Regency before the cycle closes
**When** the update is saved
**Then** the new selection overwrites the previous one and the cycle record is updated

### Story GC-2: Feeding Scene Summary View

As an ST,
I want a feeding scene summary that pre-populates each character's approved method, ambience modifier, and rote flag,
So that I can confirm feeding results at the start of a cycle without manually reconstructing each character's situation.

**Acceptance Criteria:**

**Given** the ST opens the feeding scene view
**When** it renders
**Then** each character is listed with their approved feeding method, ambience modifier for their declared territory, and rote quality flag — all drawn from their last resolved downtime submission

**Given** a character has no downtime submission for the current cycle
**When** the feeding scene view renders their row
**Then** a generic feeding pool is shown using their highest applicable method with no modifiers applied
**And** the row is visually distinguished to indicate no submission was received

**Given** the feeding scene view is rendered
**When** the ST reviews it
**Then** the list is sortable and all active characters are present with no missing rows

### Story GC-3: Downtime Expenditure Tracking

As an ST,
I want to record per-character Vitae, Willpower, and Influence expenditures during the downtime approval workflow,
So that the cycle reset can calculate the correct adjusted starting state for each track.

**Acceptance Criteria:**

**Given** the ST is approving a downtime submission
**When** they review and approve expenditures
**Then** the `st_review` subdocument records `vitae_spent`, `willpower_spent`, and `influence_spent` per character

**Given** expenditure fields are saved
**When** the ST later views the same submission
**Then** the recorded expenditure values are displayed and editable until the cycle is reset

**Given** a character has no approved submission
**When** track reset calculates their starting state
**Then** zero expenditure is assumed for all tracks for that character

### Story GC-4: End-of-Cycle Snapshot and Influence Income

As an ST,
I want the system to snapshot eminence, ascendancy, and prestige for all characters and apply monthly influence income at the moment of cycle reset,
So that the historical record is preserved and influence balances are correct at the start of each new cycle.

**Acceptance Criteria:**

**Given** the ST initiates cycle reset
**When** the snapshot phase executes
**Then** eminence, ascendancy, and prestige values for all active characters are recorded in the cycle document at that moment

**Given** the snapshot phase executes
**When** influence income is applied
**Then** each character's influence balance is increased by the monthly income derived from their active influence merits and territory holdings
**And** income is applied before the new cycle opens

**Given** a closed cycle is viewed historically
**When** the snapshot data is retrieved
**Then** the eminence, ascendancy, and prestige values reflect the state at reset, not the current state

### Story GC-5: Cycle Reset Wizard

As an ST,
I want a single reset action that atomically publishes all ready outcomes, applies approved sheet mutations, resets all tracks adjusted for downtime expenditures, takes the end-of-cycle snapshot, applies influence income, and opens the new cycle,
So that I can close a game cycle in one deliberate action rather than manually coordinating multiple steps.

**Acceptance Criteria:**

**Given** the ST opens the cycle reset wizard
**When** the pre-reset checklist is displayed
**Then** it shows counts of: ready submissions, pending sheet mutations, characters with expenditure data, and characters missing feeding data

**Given** the ST confirms and initiates reset
**When** the reset sequence executes
**Then** it runs in order: (1) end-of-cycle snapshot, (2) influence income applied, (3) sheet mutations applied per character, (4) outcomes published per character, (5) tracks reset using recorded expenditures, (6) new cycle created and opened
**And** for each character, sheet mutations are applied before their outcome is published

**Given** any phase fails during reset
**When** the failure is detected
**Then** subsequent phases do not execute
**And** the ST is shown which phase failed with the option to retry from that phase or roll back completed phases

**Given** reset completes successfully
**When** the new cycle is opened
**Then** all Vitae tracks reset to 0 minus approved Vitae expenditure for each character
**And** all Willpower and Influence tracks reset to their respective maxima minus approved expenditures
**And** the previous cycle is marked closed with a `closed_at` timestamp

---

## Epic DP: Data Portability

The ST can export any collection as CSV and re-import it cleanly. Import errors are reported row-by-row without aborting the batch. Round-trip fidelity guaranteed.

**FRs covered:** FR-DP-01, FR-DP-02, FR-DP-03, FR-DP-04, FR-DP-05
**Note:** FR-3-05 (character CSV export) already done — this epic extends export/import to all collections and adds validated import.

### Story DP-1: CSV Export for All Collections

As an ST,
I want to export any collection as a CSV file,
So that I can maintain an offline master spreadsheet and share data outside the app.

**Acceptance Criteria:**

**Given** the ST opens the Data Portability section of the admin app
**When** they select a collection (characters, territories, game sessions, attendance, investigations, NPCs) and click Export
**Then** a CSV file is downloaded with all fields represented for that collection

**Given** a collection contains nested fields (e.g. character merits array, disciplines map)
**When** the CSV is generated
**Then** nested fields are flattened to a defined format documented alongside the export feature
**And** the flat format is consistent across all exports of that collection

**Given** the ST exports the characters collection
**When** the CSV is opened
**Then** it matches the structure of the existing character CSV export (FR-3-05) with any additions from the new flat format spec

### Story DP-2: Validated CSV Import with Row-Level Error Reporting

As an ST,
I want to re-import a previously exported CSV with schema validation,
So that I can update records in bulk and receive clear feedback on any invalid rows without losing the valid ones.

**Acceptance Criteria:**

**Given** the ST uploads a CSV for a given collection
**When** the import is processed
**Then** each row is validated against the current collection schema before any writes occur

**Given** a row contains a malformed or out-of-range value
**When** validation runs
**Then** that row is rejected with a field-level error message identifying the column and the issue
**And** all valid rows in the same batch are written successfully

**Given** a CSV contains a record with the same identifier as an existing document
**When** the import processes that row
**Then** the existing document is updated (upsert), not duplicated

**Given** the import completes
**When** the result is displayed to the ST
**Then** a summary shows: rows processed, rows written, rows rejected, with per-row error detail for each rejected row

### Story DP-3: Round-Trip Fidelity Verification

As an ST,
I want to trust that exporting and immediately re-importing a collection produces an identical data state,
So that I can use CSV as a reliable backup and restore mechanism without fear of silent data loss.

**Acceptance Criteria:**

**Given** any collection is exported to CSV
**When** that CSV is immediately re-imported
**Then** no field values are lost, truncated, or type-coerced
**And** the resulting documents match the originals field-for-field

**Given** a collection contains boolean, numeric, date, and array fields
**When** these are exported and re-imported
**Then** booleans remain booleans, numbers remain numbers, ISO 8601 dates remain dates, and arrays are reconstructed from the flat format

**Given** a round-trip import is attempted with a flat format that has not yet been defined for a nested field
**When** the import processes that column
**Then** an error is surfaced indicating the flat format spec must be established before that field can be round-tripped

---

## Epic 6: Live Game App

The ST can look up any character, view pre-calculated dice pools, resolve contested rolls, check downtime submissions, and track live game state — all from a tablet-optimised interface on game day.

**FRs covered:** FR-6-01, FR-6-02, FR-6-03, FR-6-04, FR-6-05, FR-6-06
**NFRs:** NFR1 (100ms tab switching), NFR2 (500ms sheet rendering), NFR3 (200ms roll results)
**Prerequisite:** Epic 3 complete (stable character rendering)

### Story 6.1: Game Mode Shell and Navigation

As an ST,
I want a tablet-optimised game day interface with all edit controls hidden,
So that I can focus on resolving scenes quickly without accidentally modifying character data.

**Acceptance Criteria:**

**Given** the ST opens `index.html` on a tablet
**When** the game app shell loads
**Then** bottom navigation is displayed with tabs for character lookup, rolls, tracker, and rules reference
**And** the layout is constrained to a tablet-friendly width with no admin sidebar or edit controls visible

**Given** the ST switches between tabs
**When** the navigation is tapped
**Then** the view updates in under 100ms without a full page reload

**Given** the ST navigates to a character
**When** they switch to a different character
**Then** the transition completes without interrupting the current view state

### Story 6.2: Read-Only Character Sheet

As an ST,
I want to look up any character and view their complete read-only sheet with all dice pools pre-calculated,
So that I can resolve any scene without leaving the app or doing mental arithmetic.

**Acceptance Criteria:**

**Given** the ST searches or browses to a character
**When** the sheet renders
**Then** all attributes, skills, disciplines, merits, and derived stats are displayed
**And** all relevant dice pools are pre-calculated and displayed (Attribute + Skill, Attribute + Attribute, resistance pools)
**And** the sheet renders in under 500ms from API response receipt

**Given** the character has MCI or PT standing merits
**When** the sheet renders
**Then** derived child merit grants are displayed at render time

**Given** the ST is on the sheet view
**When** they tap a dice pool
**Then** the roll workflow initiates directly from that pool

### Story 6.3: Quick Roll Workflows

As an ST,
I want to initiate and resolve common contested roll workflows — territory bid, social manoeuvre, resistance check — with pools drawn directly from character data,
So that I can resolve contested scenes in seconds with the result logged automatically.

**Acceptance Criteria:**

**Given** the ST initiates a contested roll
**When** they select the roll type (territory bid, social manoeuvre, resistance check)
**Then** the attacker and defender pools are pre-loaded from the relevant characters' data

**Given** the roll is resolved
**When** the result is calculated
**Then** successes are displayed for both sides with a clear win/draw/lose outcome
**And** the roll result is logged to the session log automatically with character names, pool sizes, and outcome

**Given** dice roll inputs are confirmed
**When** the result is calculated
**Then** it displays within 200ms of the ST tapping Roll

### Story 6.4: Downtime Submission Lookup

As an ST,
I want to view any character's current cycle downtime submission in read-only mode with ST notes visible,
So that I can quickly check what a character is doing this cycle without switching to the admin app.

**Acceptance Criteria:**

**Given** the ST navigates to a character's downtime tab in the game app
**When** the submission loads
**Then** all submitted sections are displayed in read-only mode
**And** ST notes from the `st_review` subdocument are visible

**Given** a character has no submission for the current cycle
**When** the downtime tab renders
**Then** a clear "No submission for this cycle" message is shown

**Given** the ST is mid-scene
**When** they open downtime lookup
**Then** the lookup is available within the character view without navigating away from the current character context

### Story 6.5: Live Game State Tracker

As an ST,
I want to track per-character live game state — Vitae, Willpower, Health, and Conditions — with a reset-all function at session start,
So that I always know the current state of each character without relying on paper notes.

**Acceptance Criteria:**

**Given** the ST opens the tracker for a character
**When** the tracker renders
**Then** Vitae, Willpower, Health (bashing/lethal/aggravated), and active Conditions are displayed as editable counters

**Given** the ST adjusts a counter
**When** the change is saved
**Then** state persists for the duration of the session without requiring manual save
**And** the state is available if the ST navigates away and returns to that character

**Given** the ST taps Reset All at session start
**When** the reset is confirmed
**Then** all characters' Vitae, Willpower, and Health are reset to their derived maxima
**And** all Conditions are cleared

### Story 6.6: Rules Quick Reference

As an ST,
I want a searchable rules quick reference covering roll mechanics, resistance formulas, discipline summaries, and merit effects,
So that I can answer rules questions in seconds without leaving the character view or consulting external documents.

**Acceptance Criteria:**

**Given** the ST opens the rules reference panel
**When** it renders
**Then** collapsible sections are shown for: roll mechanics, resistance formulas, discipline summaries, merit effects

**Given** the ST types in the search field
**When** they type 3 or more characters
**Then** matching entries across all sections are filtered and displayed in real time

**Given** the ST is viewing a character sheet
**When** they open the rules reference
**Then** it overlays or slides in without navigating away from the character context
**And** closing the reference returns them to the character they were viewing

---

## Epic 7: Public Website — LATER

Public landing page and authenticated player resource portal. Scoped separately when Epics 2–5 are stable.

### Story 7.1: Public Landing Page

As a prospective player,
I want to find basic information about Terra Mortis,
So that I know what the game is and when it runs.

**Acceptance Criteria:**

**Given** a visitor opens the public landing page
**When** the page loads
**Then** the game name, a brief description, and the next game date are displayed
**And** no authentication is required

### Story 7.2: Player Resources Portal

As a player,
I want access to a gated resources section with setting documents, player guides, and errata,
So that I have everything I need to prepare for the game in one place.

**Acceptance Criteria:**

**Given** a player logs in with Discord
**When** their server membership is verified
**Then** they are granted access to the resources section

**Given** an authenticated player opens the resources section
**When** it renders
**Then** setting primer, player guide, errata, and rules references are available

### Story 7.3: Lore Library

As a player,
I want to browse campaign lore documents with ST-controlled visibility,
So that I can access the information the ST has made available to me without seeing restricted content.

**Acceptance Criteria:**

**Given** the ST marks a lore document as public
**When** any authenticated player views the lore library
**Then** that document is visible

**Given** the ST marks a lore document as restricted
**When** a player without that permission views the library
**Then** the restricted document is not shown

---

## Epic OR: Ordeal System

The ST can import all historical ordeal submissions from Google Forms, mark player responses against rubrics with per-answer feedback, and award XP on approval. Players can see their ordeal status and ST feedback in the portal.

**FRs covered:** FR-OR-01 through FR-OR-05 (below)
**NFRs:** NFR6, NFR8, NFR12
**Depends on:** Epic 2 (API), Epic 5 (player portal for OR-4)

### Functional Requirements

- FR-OR-01: ST can import historical ordeal submissions (Lore Mastery, Rules Mastery, Covenant Questionnaire, Character History) from Google Forms Excel exports into MongoDB, with player-to-character resolution by email and name matching; existing ST review comments from the Excel Review Data tabs are imported as draft markings
- FR-OR-02: ST can view all ordeal submissions in the admin Downtime domain, browseable by ordeal type or by character; each view shows the player's response alongside the rubric expected answer for that question
- FR-OR-03: ST can mark each answer as Yes / Close / No, add per-answer text feedback, add overall feedback, and mark the ordeal as complete; marking state persists between sessions
- FR-OR-04: On ordeal completion, XP is awarded to the character (3 XP per completed ordeal) and the ordeal status updates in the player's portal view
- FR-OR-05: ST can view and edit rubric entries (expected answers and marking notes) per question per ordeal type from within the admin app

### Story OR-1: Ordeal Import Script

As an ST,
I want all historical Google Forms ordeal responses imported into MongoDB,
So that the data is in the system and no longer locked inside Excel files.

**Acceptance Criteria:**

**Given** the five Google Forms Excel files and the player-character mapping from Character Details
**When** the import script runs
**Then** one `ordeal_submissions` document is created per player per ordeal type for all submissions matching known player emails
**And** submissions from non-players (email not in players collection) are skipped with a logged warning
**And** each document stores the full question-answer array for that ordeal type
**And** for Covenant Questionnaire submissions, only the columns belonging to the character's covenant are stored (plus the shared Q1)

**Given** existing ST review comments in the Review Data tabs
**When** the import script runs
**Then** each reviewer comment is stored as a draft `marking.answers[n].feedback` on the corresponding submission
**And** `marking.status` is set to `'in_progress'` for any submission with at least one review comment, `'unmarked'` otherwise

**Given** the four Word doc history submissions (Carver, Edna Judge, René Meyer, Ryan Ambrose)
**When** the import script runs
**Then** each is converted to HTML via mammoth and stored as an `ordeal_submissions` document with `source: 'word_doc'` and `ordeal_type: 'character_history'`

**Given** René Meyer has both a form submission and a Word doc for Character History
**When** both are imported
**Then** both documents are stored with distinct `source` values; neither is discarded

**Given** the import script completes
**When** it exits
**Then** a summary is printed: total imported, skipped (non-player), draft markings carried over, errors

**Schema — `ordeal_submissions` collection:**
```
{
  _id: ObjectId,
  character_id: ObjectId,
  player_id: ObjectId,
  ordeal_type: "lore_mastery" | "rules_mastery" | "covenant_questionnaire" | "character_history",
  covenant: String | null,       // covenant_questionnaire only
  submitted_at: Date,
  source: "google_form" | "word_doc",
  responses: [
    { question: String, answer: String }
  ],
  marking: {
    status: "unmarked" | "in_progress" | "complete",
    marked_by: String | null,
    marked_at: Date | null,
    overall_feedback: String,
    xp_awarded: Number | null,
    answers: [
      {
        question_index: Number,
        result: "yes" | "close" | "no" | null,
        feedback: String
      }
    ]
  }
}
```

**Schema — `ordeal_rubrics` collection:**
```
{
  _id: ObjectId,
  ordeal_type: String,
  covenant: String | null,
  questions: [
    {
      index: Number,
      question: String,
      expected_answer: String,
      marking_notes: String
    }
  ]
}
```

**Seed file:** `data/ordeal_rubrics_seed.json` exists with placeholder answers; import script seeds this collection on first run if empty.

### Story OR-2: Ordeal Marking UI

As an ST,
I want to review and mark ordeal submissions from within the admin app,
So that I can replace the Excel workflow with something that persists and feeds into the system.

**Acceptance Criteria:**

**Given** the ST opens the Downtime domain in admin
**When** they navigate to the Ordeals section
**Then** a two-panel view is shown: left panel lists all ordeals grouped by type (Lore Mastery, Rules Mastery, Covenant Questionnaire, Character History); each entry shows character name and marking status (Unmarked / In Progress / Complete)

**Given** the ST selects a submission
**When** it loads
**Then** each question is shown with three columns: the question text, the player's answer, and the rubric expected answer
**And** a Yes / Close / No toggle and a text feedback field appear per row
**And** any draft feedback imported from Excel is pre-populated

**Given** the ST marks all answers and clicks "Mark Complete"
**When** the save action fires
**Then** `marking.status` is set to `'complete'`, `marking.marked_by` and `marking.marked_at` are recorded
**And** 3 XP is added to the character's XP log with source `ordeal_[type]`
**And** the submission status in the left panel updates to Complete

**Given** the ST marks an ordeal as complete
**When** the player next views their Ordeals tab
**Then** the ordeal shows status Approved and any overall feedback is visible
**And** per-answer feedback is visible per question

**Given** a Covenant Questionnaire submission
**When** it loads in the marking view
**Then** only the questions for that character's covenant are shown (not all 88 columns)

### Story OR-3: Rubric Editor

As an ST,
I want to view and update the expected answers and marking notes for each ordeal question,
So that rubric knowledge is in the system rather than in my head.

**Acceptance Criteria:**

**Given** the ST navigates to the Rubric section of the Ordeals tab
**When** they select an ordeal type (and covenant for Covenant Questionnaire)
**Then** all questions are listed with their current expected answer and marking notes

**Given** the ST edits an expected answer
**When** they save
**Then** the `ordeal_rubrics` document is updated
**And** the updated answer appears immediately in the marking view for that question

**Given** questions currently have placeholder text
**When** the rubric editor loads
**Then** placeholder entries are visually flagged (e.g. italicised or dimmed) to indicate they need filling in

### Story OR-4: Player Ordeal Status View

As a player,
I want to see my ordeal submission status and any ST feedback,
So that I know what I've completed, what's pending review, and what I need to resubmit.

**Acceptance Criteria:**

**Given** a player opens the Ordeals tab
**When** it renders
**Then** all four ordeal types are listed with current status: Not Submitted / Submitted / In Review / Approved

**Given** an ordeal is marked Complete by an ST
**When** the player views it
**Then** the status shows Approved and any overall feedback is displayed
**And** per-answer feedback is shown per question (without revealing the rubric expected answer or ST marking notes)

**Given** an ordeal is In Progress (draft marking exists)
**When** the player views it
**Then** no partial feedback is shown; status shows Submitted

---

## Epic AR: Archive and Documents

ST-authored documents (dossiers, downtime responses, character histories) are stored in MongoDB as HTML and surfaced to players in their Archive tab. The player portal also includes a city map, a who's who page, and a web-readable primer.

**FRs covered:** FR-AR-01 through FR-AR-05 (below)
**NFRs:** NFR6, NFR8, NFR12
**Depends on:** Epic 2 (API), Epic 5 (player auth)

### Functional Requirements

- FR-AR-01: All 31 character dossiers, 27 Downtime 1 ST response documents, and 4 character history Word doc submissions are converted from .docx to HTML via mammoth and stored in a new `archive_documents` MongoDB collection linked to character IDs
- FR-AR-02: Players can view their own archive documents (dossier, downtime responses, history submissions) in a readable in-browser format in the Archive tab; documents from other characters are not accessible
- FR-AR-03: ST can upload a new .docx document for any character via the admin app, triggering mammoth conversion and storage; this is the workflow for delivering future downtime cycle responses
- FR-AR-04: Players can view the Terra Mortis city map as a full-screen image in the portal
- FR-AR-05: Players can view a who's who page listing all active characters with court positions, covenant, and clan — no private ST data included

### Story AR-1: Document Import Script

As an ST,
I want all existing dossiers, downtime responses, and history submissions imported into MongoDB as HTML,
So that players can read them in-browser and the documents are no longer scattered as Word files.

**Acceptance Criteria:**

**Given** the 31 `*_Dossier.docx` files in the project root
**When** the import script runs
**Then** each is converted to HTML via mammoth and stored as an `archive_documents` document with `type: 'dossier'`, `cycle: null`, `visible_to_player: true`
**And** each document is linked to the correct character by matching the filename stem to the characters collection (using the name mapping table in the script)

**Given** the 27 `*_Downtime1.docx` files in the project root
**When** the import script runs
**Then** each is converted and stored with `type: 'downtime_response'`, `cycle: 1`, `title: 'Downtime 1 Response'`
**And** characters who did not submit downtime (no matching file) have no downtime_response document for cycle 1 — this is not an error

**Given** the 4 character history Word doc submissions
**When** the import script runs
**Then** each is converted and stored with `type: 'history_submission'`, `cycle: null`, `title: 'Character History'`

**Given** filename-to-character mismatches (Mac/Macheath, Cazz/Casimir, Charlie Ballsack/Balsac)
**When** the import script resolves character IDs
**Then** the script uses a hardcoded name mapping table to handle known mismatches; unresolved names are logged as warnings and skipped rather than erroring

**Given** the import script completes
**When** it exits
**Then** a summary is printed: documents imported by type, skipped (unresolved character), conversion errors

**Schema — `archive_documents` collection:**
```
{
  _id: ObjectId,
  character_id: ObjectId,
  type: "dossier" | "downtime_response" | "history_submission",
  cycle: Number | null,
  title: String,
  content_html: String,
  visible_to_player: Boolean,
  created_at: Date
}
```

**New API routes:**
- `GET /api/archive_documents/:character_id` — returns all documents for a character; player token enforced to own character only; `visible_to_player: false` documents excluded for player tokens
- `POST /api/archive_documents` — ST only; accepts `character_id`, `type`, `cycle`, `title`, `content_html`

### Story AR-2: Player Archive Tab

As a player,
I want an Archive tab where I can read my dossier, downtime responses, and character history,
So that I have a permanent record of my character's story in one place.

**Acceptance Criteria:**

**Given** a player opens the Archive tab
**When** it renders
**Then** documents are grouped by type: Dossier (pinned at top), Downtime Responses (reverse-chronological by cycle), Character History

**Given** a player selects a document
**When** it loads
**Then** the mammoth-converted HTML is rendered in a styled reading pane using the app's body font (Lora) and dark theme
**And** no download button or raw HTML is exposed

**Given** a character has no documents of a given type
**When** the Archive tab renders
**Then** that section is omitted rather than shown as empty

**Given** the player token on `GET /api/archive_documents/:character_id`
**When** the request is processed
**Then** only documents for that player's own character are returned
**And** documents with `visible_to_player: false` are excluded

### Story AR-3: Admin Document Upload

As an ST,
I want to upload a .docx file for any character from within the admin app,
So that I can deliver future downtime cycle responses without running a script.

**Acceptance Criteria:**

**Given** the ST opens a character record in the admin Player domain
**When** they navigate to the Archive section
**Then** existing documents for that character are listed with type, cycle, and creation date

**Given** the ST selects "Upload Document"
**When** they choose a .docx file, set type and cycle, and confirm
**Then** the file is sent to `POST /api/archive_documents/upload`, converted via mammoth server-side, and stored
**And** the document appears immediately in the character's archive list

**Given** a mammoth conversion error (corrupted file, unsupported format)
**When** the upload is attempted
**Then** a clear error message is shown and no document is stored

### Story AR-4: City Map and Who's Who

As a player,
I want to see the Terra Mortis city map and a who's who of active characters,
So that I can orient myself in the setting between games.

**Acceptance Criteria:**

**Given** a player navigates to the City tab in the portal
**When** it renders
**Then** the city map image (`Terra Mortis Map.png`) is displayed full-width with pinch-to-zoom on mobile

**Given** the who's who section renders below the map
**When** it loads
**Then** all active (non-retired) characters are listed with: display name, clan, covenant, and any court position held
**And** no private ST fields (haven, st_review, notes, XP data) are included
**And** characters are sorted by covenant then sort name

**Given** `GET /api/characters` is called with a player token for the who's who
**When** the response is built
**Then** only public fields are returned: `name`, `honorific`, `moniker`, `clan`, `covenant`, `court_position` (if any)

### Story AR-5: Primer Page

As a player,
I want to read the Terra Mortis primer as a web page,
So that I do not need to download and open a PDF.

**Acceptance Criteria:**

**Given** a player navigates to the Primer tab in the portal
**When** it renders
**Then** the primer content is displayed as formatted HTML in a readable single-column layout

**Given** the primer content is stored as a single `archive_documents` document with `type: 'primer'` and no `character_id`
**When** the ST updates it via the admin app
**Then** the player-facing view reflects the update immediately

**Given** the primer has section headings
**When** it renders
**Then** a sticky table of contents with anchor links is shown on the left (desktop) or as a collapsible menu (mobile)

