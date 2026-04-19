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

All epics are complete as of April 2026. This document is now a reference record — requirements inventory, FR coverage map, and a compact story list per epic. Story acceptance criteria have been removed; the implemented code is the authoritative specification.

## Requirements Inventory

### Functional Requirements

**Epic 3: ST Admin Features**

- FR-3-01: ST can view, create, and edit character records — attributes, skills, disciplines, merits, derived stats — through the admin character editor
- FR-3-02: ST can view MCI and Professional Training standing merit grants, with child merits derived at render time from the active dot level; prerequisites are validated automatically and failed grants are surfaced distinctly from active grants
- FR-3-03: ST can view the city domain — territory map, current court position holders, and influence rankings derived from active character merits
- FR-3-04: ST records per-session attendance per player (attended/costuming/downtime/extra XP components); XP totals are calculated dynamically from session records
- FR-3-05: ST can export character data as CSV from the admin app; extended to all collections by FR-DP-01

**Epic 5: Player Access Layer**

- FR-5-01: Players can authenticate via Discord and access their linked character(s); player-to-character mapping is maintained server-side and not hardcoded
- FR-5-02: Players view their own character sheet (read-only) from a desktop portal; ST data is stripped from all player API responses
- FR-5-03: Players submit a downtime form with section gating based on their character data; deadline enforcement applies
- FR-5-04: Players can view their published downtime outcome from the moment the ST completes the cycle reset; no individual delivery action by the ST is required
- FR-5-05: Players track ordeals (setting/rules/covenant at player level; questionnaire/history at character level) with XP cascade on approval
- FR-5-06: The player portal displays a clear "your ST is still processing this cycle" state when a cycle is closed but the reset has not yet been completed

**Game Cycle Management**

- FR-GC-01: ST records game session attendance per player with attended/costuming/downtime/extra XP components
- FR-GC-02: ST locks in which character holds Regency for a given cycle; Regency history is queryable
- FR-GC-03: ST can view a feeding scene summary presenting each character's approved feeding method, ambience modifier, and rote quality flag from their last resolved downtime submission
- FR-GC-04: Cycle reset executes as a coordinated sequence — publish outcomes, apply sheet mutations, reset tracks, open new cycle — atomically; failures halt subsequent phases
- FR-GC-05: Downtime submission schema records per-character expenditures (Vitae, Willpower, Influence); track reset uses these for adjusted starting state
- FR-GC-06: End-of-cycle snapshot records eminence, ascendancy, and prestige for all characters
- FR-GC-07: Monthly influence income is calculated per character and applied during cycle reset
- FR-GC-08: ST can confirm each character's feeding pool and toggle rote flag from within the downtime review; dice engine rolls on command; result persists to submission
- FR-GC-09: ST can press "New Game Cycle" to advance cycle status to `"game"`, opening the player feeding tab
- FR-GC-10: ST can export a per-character downtime packet as structured markdown for Claude-assisted narrative drafting

**Epic 6: Live Game App**

- FR-6-01: The live game interface runs in a tablet-optimised layout with all edit controls hidden; character switching without page reload
- FR-6-02: ST can look up any character and view their complete read-only sheet with all dice pools pre-calculated
- FR-6-03: ST can initiate and resolve common contested roll workflows (territory bid, social manoeuvre, resistance check) with pools drawn from character data
- FR-6-04: ST can view any character's current cycle downtime submission in read-only mode
- FR-6-05: ST can track per-character live game state (Vitae, Willpower, Health, Conditions) with reset-all function
- FR-6-06: ST can access a searchable rules quick reference without leaving the character view

**Epic OR: Ordeal System**

- FR-OR-01: ST can import historical ordeal submissions from Google Forms Excel exports into MongoDB, with player-to-character resolution; existing review comments imported as draft markings
- FR-OR-02: ST can browse all ordeal submissions by type or by character; each view shows player response alongside rubric expected answer
- FR-OR-03: ST can mark each answer Yes/Close/No, add per-answer feedback, add overall feedback, and mark the ordeal complete
- FR-OR-04: On ordeal completion, 3 XP is awarded to the character and ordeal status updates in the player portal
- FR-OR-05: ST can view and edit rubric entries per question per ordeal type from within the admin app

**Epic AR: Archive and Documents**

- FR-AR-01: All 31 dossiers, 27 Downtime 1 ST responses, and 4 character history Word doc submissions are converted from .docx to HTML via mammoth and stored in `archive_documents` linked to character IDs
- FR-AR-02: Players can view their own archive documents in-browser in the Archive tab; no other character's documents are accessible
- FR-AR-03: ST can upload a new .docx for any character via the admin app; mammoth conversion runs server-side and the document is stored immediately
- FR-AR-04: Players can view the Terra Mortis city map and a who's who of active characters in the City tab
- FR-AR-05: Players can read the primer as a formatted web page; ST can update primer content from the admin app without a redeploy

**Data Portability**

- FR-DP-01: Any collection can be exported as a CSV file with all fields represented
- FR-DP-02: Any exported CSV can be re-imported with schema validation, deduplication, and row-level error reporting
- FR-DP-03: Import operations report errors per row without aborting the batch
- FR-DP-04: Import functions validate all fields against the current collection schema before writing
- FR-DP-05: Export followed by immediate import produces an identical data state

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
- `players` MongoDB collection maps Discord ID to role, character IDs, and player-level ordeal status
- Role-aware API middleware: player tokens cause `GET /api/characters` to return only that player's characters; ST tokens return all
- `st_review` subdocument is stripped from all player-facing API responses server-side
- `player.html` is a separate desktop-first entry point sharing JS modules with `admin.html` and `index.html`
- Auth callback redirects by role: ST → `admin.html`, player → `player.html`; dual-role users (Symon, Kurtis) get bidirectional switching without re-login
- Game app (`index.html`) uses cache-first loader: fetches from API on startup, falls back to localStorage if API unreachable
- All dates in MongoDB documents and API responses use ISO 8601 strings (`new Date().toISOString()`)
- No JS file exceeds 500 lines; modules are split by single responsibility
- MongoDB collection names: plural snake_case (`characters`, `downtime_cycles`, `downtime_submissions`, `players`, `game_sessions`, `territories`, `tracker_state`, `session_logs`)

### FR Coverage Map

| FR | Epic/Area | Story | Status |
|---|---|---|---|
| FR-3-01 | Epic 3 | 3.1 | Done |
| FR-3-02 | Epic 3 | 3.1 | Done |
| FR-3-03 | Epic 3 | 3.2 | Done |
| FR-3-04 | Epic 3 / GC | GC-1 | Done |
| FR-3-05 | Epic 3 / DP | DP-1 | Done |
| FR-5-01 | Epic 5 | 5.1 | Done |
| FR-5-02 | Epic 5 | 5.3 | Done |
| FR-5-03 | Epic 5 | 5.4 | Done |
| FR-5-04 | Epic 5 | 5.5 | Done |
| FR-5-05 | Epic 5 | 5.6 | Done |
| FR-5-06 | Epic 5 | 5.4 / 5.5 | Done |
| FR-GC-01 | Game Cycle | GC-1 | Done |
| FR-GC-02 | Game Cycle | GC-2 | Done |
| FR-GC-03 | Game Cycle | GC-3 | Done |
| FR-GC-04 | Game Cycle | GC-5 | Done |
| FR-GC-05 | Game Cycle | GC-4 | Done |
| FR-GC-06 | Game Cycle | GC-5 | Done |
| FR-GC-07 | Game Cycle | GC-5 | Done |
| FR-GC-08 | Game Cycle | GC-6 | Done |
| FR-GC-09 | Game Cycle | GC-7 | Done |
| FR-GC-10 | Game Cycle | DT-1 | Done |
| FR-6-01 | Epic 6 | 6.1 | Done |
| FR-6-02 | Epic 6 | 6.2 | Done |
| FR-6-03 | Epic 6 | 6.3 | Done |
| FR-6-04 | Epic 6 | 6.4 | Done |
| FR-6-05 | Epic 6 | 6.5 | Done |
| FR-6-06 | Epic 6 | 6.6 | Done |
| FR-OR-01 | Epic OR | OR-1 | Done |
| FR-OR-02 | Epic OR | OR-2 | Done |
| FR-OR-03 | Epic OR | OR-2 | Done |
| FR-OR-04 | Epic OR | OR-2 | Done |
| FR-OR-05 | Epic OR | OR-3 | Done |
| FR-AR-01 | Epic AR | AR-1 | Done |
| FR-AR-02 | Epic AR | AR-2 | Done |
| FR-AR-03 | Epic AR | AR-3 | Done |
| FR-AR-04 | Epic AR | AR-4 | Done |
| FR-AR-05 | Epic AR | AR-5 | Done |
| FR-DP-01 | Data Portability | DP-1 | Done |
| FR-DP-02 | Data Portability | DP-2 | Done |
| FR-DP-03 | Data Portability | DP-2 | Done |
| FR-DP-04 | Data Portability | DP-2 | Done |
| FR-DP-05 | Data Portability | DP-3 | Done |
| FR-DTFC-01 | DTFC | dtfc.1 | Ready |
| FR-DTFC-02 | DTFC | dtfc.1 | Ready |
| FR-DTFC-03 | DTFC | dtfc.1 | Ready |
| FR-DTFC-04 | DTFC | dtfc.2 | Ready |
| FR-DTFC-05 | DTFC | dtfc.3 | Ready |
| FR-DTFC-06 | DTFC | dtfc.4 | Ready |
| FR-DTFC-07 | DTFC | dtfc.5 | Ready |
| FR-DTFC-08 | DTFC | dtfc.6 | Ready |
| FR-DTFC-09 | DTFC | dtfc.7 | Ready |
| FR-DTFC-10 | DTFC | dtfc.8 | Ready |
| FR-DTFC-11 | DTFC | dtfc.9 | Blocked |
| FR-DTFC-12 | DTFC | dtfc.10 | Blocked |
| FR-DTFC-13 | DTFC | dtfc.11 | Deferred |

---

## Epic List — Active

### Epic DTFC: Downtime Form Calibration — IN PROGRESS (Wave 1 ready-for-dev)
Post-launch design review identified 21 calibration tasks. Fixes UX gaps, enforces mechanical correctness in feeding/XP spend, restructures project/sphere actions with smart targeting, updates ST panel for breaking key format changes.
**Stories:** dtfc.1 Court calibrations, dtfc.2 Section ordering, dtfc.3 Project/sphere fields, dtfc.4 Aspirations structured *(Wave 2)*, dtfc.5 Territory feeding rights *(Wave 2)*, dtfc.6 Feeding pool + vitae projection *(Wave 2)*, dtfc.7 Rote project commitment *(Wave 2)*, dtfc.8 XP spend structured *(Wave 2)*, dtfc.9–11 Deferred (NPC system, collaborative projects, equipment tab)
**Breaking changes:** dtfc.4 and dtfc.5 must ship with paired `downtime-views.js` updates.
**Epic file:** `specs/epic-dtfc-downtime-form-calibration.md`

---

## Epic List — All Complete

### Epic 1: Foundation Restructure — DONE
Single SPA, modular JS/CSS, v2 data layer, shared accessors.

### Epic 2: Backend Foundation — DONE
Express API on Render, MongoDB Atlas, Discord OAuth, Netlify deployment, all collection APIs, game app API integration.

### Epic 3: ST Admin Features — DONE
Character editing, MCI/PT grants, city domain views, attendance and finance, data migration. Story 3.3 (Session Log) parked — live testing needed.
**Stories:** 3.1 Character Editor, 3.2 City Domain, 3.3 Session Log (parked), 3.4 Attendance & Finance, 3.5 Data Migration

### Epic 4: Downtime System — DONE
CSV import, cycle management, submission processing, feeding rolls, project/merit resolution, narrative authoring, investigation tracker, NPC register, publish-to-players workflow, ambience update.

### Epic 5: Player Access Layer — DONE
Players authenticate, view characters, submit downtimes, track ordeals, receive published outcomes. Cross-submission influence conflict detection intentionally omitted.
**Stories:** 5.1 Players Collection + Role Middleware, 5.2 Player HTML Shell, 5.3 Read-Only Sheet, 5.4 Downtime Form, 5.5 ST Publish Workflow, 5.6 Ordeals + Story + Archive, 5.7 Character Creator Wizard, 5.8 Downtime Form Enhancement

### Epic GC: Game Cycle Management — DONE
Lock in Regency, process downtime with integrated dice, confirm feeding pools, export narrative packets, execute atomic reset.
**Stories:** GC-1 Regency Lock-In, GC-2 Feeding Scene Summary, GC-3 Expenditure Tracking, GC-4 Snapshot + Influence Income, GC-5 Cycle Reset Wizard, GC-6 Dice Integration + Rote Toggle, GC-7 New Game Cycle Gate, DT-1 Downtime Export Packet

### Epic DP: Data Portability — DONE
Export any collection as CSV and re-import cleanly. Import errors reported row-by-row without aborting.
**Stories:** DP-1 CSV Export All Collections, DP-2 Validated CSV Import, DP-3 Round-Trip Fidelity

### Epic OR: Ordeal System — DONE
Import historical Google Forms data, mark responses against rubrics, award XP on completion, surface status to players.
**Stories:** OR-1 Ordeal Import Script, OR-2 Ordeal Marking UI, OR-3 Rubric Editor, OR-4 Player Ordeal Status View

### Epic AR: Archive and Documents — DONE
Convert ST-authored .docx files to HTML and store in MongoDB. Players read archive in-portal. City map, who's who, primer page.
**Stories:** AR-1 Document Import Script, AR-2 Player Archive Tab, AR-3 Admin Document Upload, AR-4 City Map + Who's Who, AR-5 Primer Page

### Epic 6: Live Game App — DONE
Tablet-optimised ST interface: character lookup, pre-calculated pools, contested roll workflows, live state tracking.
**Stories:** 6.1 Game Mode Shell, 6.2 Read-Only Sheet, 6.3 Quick Roll Workflows, 6.4 Downtime Lookup, 6.5 Live State Tracker, 6.6 Rules Quick Reference

### Epic 7: Public Website — DONE
Public landing page and player resource portal.
**Stories:** 7.1 Public Landing Page, 7.2 Player Resources Portal
