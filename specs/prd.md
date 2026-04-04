---
status: active
version: "2.0"
date: "2026-04-04"
author: Angelus
projectType: web_app
projectContext: brownfield
complexity: medium
workflowType: prd
workflow: edit
stepsCompleted:
  - step-e-01-discovery
  - step-e-02-review
  - step-e-03-edit
lastEdited: "2026-04-04"
editHistory:
  - date: "2026-03-29"
    changes: "Initial PRD — brownfield restructure and launch phase"
  - date: "2026-04-04"
    changes: "v2.0 — updated to reflect Epics 1-4 complete, current stack (Express/MongoDB/Netlify/Render), new FRs for game cycle management and data portability, phased delivery realigned with epic-restructure-proposal v3; elicitation pass (challenge + first principles + self-consistency): FR-GC-03 no-submission fallback, FR-GC-04 consistency guarantee, FR-GC-05 expenditure tracking schema, FR-5-04 precision fix, FR-5-06 degraded state, FR-DP-01 nested document note, business success criterion sharpened, Epic 3 and Epic 6 FRs added to anchor all user journeys; validation pass (BMAD v2.0): Journey 1 and Journey 2 capability lists extended, FR-3-02/03/GC-03 reframed to actor/capability, FR-5-01/5-04 reframed to actor/capability, FR-3-04/GC-01 cross-referenced, FR-3-04 collection name removed"
inputDocuments:
  - specs/prd/epic-restructure-proposal.md
  - specs/architecture.md
  - CLAUDE.md
---

# Product Requirements Document — TM Suite v2.0

**Author:** Angelus
**Date:** 4 April 2026

---

## Executive Summary

Terra Mortis TM Suite is the operational platform for a 30+ player Vampire: The Requiem 2nd Edition parlour LARP running monthly in Sydney. It provides character management, downtime processing, live game mechanics (dice rolling, contested rolls, feeding), territory tracking, and player access through a shared backend serving both an ST admin app and a player-facing portal.

The system has completed its foundational phase. A modular Express API (Render), MongoDB Atlas database, Discord OAuth authentication, and Netlify-hosted frontend serve 31 characters with 203+ merits, 42 devotions, and full VtR 2e rule encoding. The first automated downtime cycle for 30 characters completed in a single day, down from a week of volunteer effort.

The current phase extends this foundation into robust operational tooling: a complete game cycle management system, player self-service portal, live game ST interface, and a data portability layer that allows any collection to be exported and cleanly re-imported.

### What Makes This Special

The TM Suite is not a generic RPG tool. It is a purpose-built rules engine that encodes both VtR 2e mechanics and the specific characters, merits, disciplines, and house rules of Terra Mortis. Generic tools store character sheets; this tool runs the game. The gap between "something happens" and "here is the outcome" collapses to a tap. The data corpus — years of domain encoding — is the core asset.

---

## Success Criteria

### User Success

- ST can complete a full 30-character downtime cycle in under 1 day (achieved; maintain as ceiling)
- ST can press a single reset action to atomically publish all player outcomes, apply all sheet updates, and reset all tracks adjusted for downtime expenditures — with the new cycle opening as a result
- Players can view their own character sheet, submit downtime, and receive published outcomes without going through the ST
- ST can export any collection as CSV and re-import it cleanly; import errors are reported row-by-row without aborting the batch

### Business Success

- Two contributors can develop separate features in parallel without merge conflicts
- ST can look up any character, view their pre-calculated dice pool, and resolve a contested roll without leaving the app or consulting any external reference

### Technical Success

- MongoDB Atlas is the sole source of truth for all collections; no client-side JSON files as primary data source
- Every collection supports CSV export and schema-validated CSV import
- Cycle reset (publish + sheet updates + track reset) executes as a single coordinated operation

### Measurable Outcomes

| Metric | Target | Status |
|---|---|---|
| Full downtime cycle duration | Under 1 day | Achieved |
| Cycle reset | Single action | Not yet built |
| Player self-service for character view | Available to all players | In progress (Epic 5) |
| Collections with CSV export | All | 1 of N (characters only) |
| Imports with schema validation | All | 0 of N |

---

## Product Scope

### Done

- **Epic 1:** Foundation restructure — modular codebase, single SPA, shared accessor layer, v2 schema
- **Epic 2:** Backend foundation — Express API on Render, MongoDB Atlas, Discord OAuth, Netlify deployment
- **Epic 3:** ST admin features — character editing, MCI/PT grants, city domain views, attendance and finance, data migration (substantially complete; session log parked)
- **Epic 4:** Downtime system — CSV import, cycle management, submission processing, feeding rolls, project/merit resolution, narrative authoring, mechanical summaries, investigation tracker, NPC register, publish-to-players workflow, ambience update

### Current Phase

- **Epic 5:** Player Access Layer — player portal, downtime submission form, published outcome delivery, ordeal tracking
- **Game Cycle Management** — cycle reset wizard, track management (Vitae/WP/Influence), feeding scene carry-forward from approved DT, regency lock-in, sheet mutations from downtime
- **Data Portability** — CSV export and validated import for all collections

### Later

- **Epic 6:** Live Game App — tablet-optimised ST interface for game day (quick rolls, read-only sheets, live status tracker)
- **Epic 7:** Public Website — landing page and authenticated player resource portal

Epic-level story breakdown: `specs/prd/epic-restructure-proposal.md`

---

## User Journeys

### Journey 1: Angelus — Live Game (Primary)

5:45pm Saturday. Angelus opens the TM Suite on his iPad. A Carthian player attempts Majesty on a Lancea character. Angelus taps the Carthian's name, sees their Discipline dots and pool, taps Roll. Three successes. Taps the target, sees Composure + Blood Potency resistance pool already calculated. One contested roll resolved without breaking stride. Later, a territory dispute escalates. He opens the Territory tab — holdings and influence generation are right there.

**Capabilities:** Character lookup, pre-loaded dice pools, contested roll workflow, territory display, resistance checks, tablet-optimised ST view, downtime submission read-only view, live per-character game state tracking with session reset.

### Journey 2: Angelus — Game Cycle Management (Primary)

Sunday after game. Angelus records attendance for all 31 players, notes XP extras, locks in who held Regency. He confirms all feeding scene results from the previous night — each character's approved method, ambience modifier, and rote flag are pre-populated from their downtime submission. Over the following days he works through downtime submissions: resolving projects, drafting narrative outcomes, marking submissions ready to publish. Thursday: he clicks Reset. All player outcomes publish simultaneously. All approved sheet mutations apply to character records. All Vitae, Willpower, and Influence tracks reset, adjusted for each character's downtime expenditures. The new cycle opens.

**Capabilities:** Attendance recording, session log, regency lock-in, feeding scene carry-forward, downtime processing, atomic cycle reset (publish + sheet updates + track reset + new cycle), monthly influence income application at reset.

### Journey 3: Angelus — Between Games Admin (Primary)

Character consequences: territory changed hands, an MCI benefit granted a new merit. Angelus updates territory holdings. Adjusts the MCI — derived grants recalculate automatically. He exports the full character list as CSV for the offline master spreadsheet. When the master sheet changes, he re-imports cleanly; invalid rows are flagged without losing the valid ones.

**Capabilities:** Character editing, merit manipulation, CSV export for all collections, validated CSV import.

### Journey 4: Player — Self-Service Portal (Active Development)

Monday after game. A player logs in via Discord. They see their own character sheet — attributes, skills, merits, disciplines, XP remaining. They read their published downtime outcome. They submit their downtime for the new cycle, including feeding approach. They cannot see other players' sheets or edit their own data.

**Capabilities:** Discord authentication, read-only character sheet, downtime submission, published outcome view, ordeal tracking.

### Journey 5: Rules ST — At Game (Secondary)

Marcus pulls his phone mid-scene. A contested Social Manoeuvre. He finds both characters, sees both pools, taps through the roll. Result on screen. Back in character.

**Capabilities:** Mobile-friendly read-only character access, dice rolling, pool calculation.

### Journey 6: Peter — Development (Tertiary)

Peter picks up a story. The file structure is clear — he finds the right module immediately. He builds the feature, pushes to dev. No merge conflicts because the codebase is modular.

**Capabilities:** Modular file structure, documented conventions, parallel development without collision.

---

## Functional Requirements

### Epic 3: ST Admin Features (Substantially Complete)

- FR-3-01: ST can view, create, and edit character records — attributes, skills, disciplines, merits, derived stats — through the admin character editor
- FR-3-02: ST can view MCI and Professional Training standing merit grants, with child merits derived at render time from the active dot level; prerequisites are validated automatically and failed grants are surfaced distinctly from active grants
- FR-3-03: ST can view the city domain — territory map, current court position holders, and influence rankings derived from active character merits
- FR-3-04: ST records per-session attendance per player (attended/costuming/downtime/extra XP components); XP totals are calculated dynamically from session records
- FR-3-05: ST can export character data as CSV from the admin app; extended to all collections by FR-DP-01

### Epic 5: Player Access Layer

- FR-5-01: Players can authenticate via Discord and access their linked character(s); player-to-character mapping is maintained server-side and not hardcoded
- FR-5-02: Players view their own character sheet (read-only) from a mobile-first portal; ST data is stripped from all player API responses
- FR-5-03: Players submit a downtime form with section gating based on their character data; deadline enforcement applies
- FR-5-04: Players can view their published downtime outcome from the moment the ST completes the cycle reset; no individual delivery action by the ST is required
- FR-5-05: Players track ordeals (setting/rules/covenant at player level; questionnaire/history at character level) with XP cascade on approval
- FR-5-06: The player portal displays a clear "your ST is still processing this cycle" state when a cycle is closed but the reset has not yet been completed; players are not shown an empty or broken outcome view

### Game Cycle Management

- FR-GC-01: ST records game session attendance per player with attended/costuming/downtime/extra XP components; XP totals derive dynamically from session records (see also FR-3-04 — same capability, formalised here for the cycle management context)
- FR-GC-02: ST locks in which character holds Regency for a given cycle; Regency history is queryable
- FR-GC-03: ST can view a feeding scene summary presenting each character's approved feeding method, ambience modifier for their declared territory, and rote quality flag from their last resolved downtime submission; characters with no downtime submission are shown a generic feeding pool using their highest applicable method with no modifiers applied
- FR-GC-04: Cycle reset executes as a coordinated sequence — publish all ready submissions, apply approved sheet mutations, reset tracks, open new cycle — with the guarantee that if sheet mutations are approved for a character, they are applied before that character's outcomes are published; no character has updated sheets without published outcomes; if any phase fails, subsequent phases do not execute and the ST is shown the failure state with the option to retry or roll back
- FR-GC-05: The downtime submission schema records per-character expenditures (Vitae spent, Willpower spent, Influence spent) as part of the ST approval workflow; track reset uses these recorded values to calculate the adjusted starting state for each track at the next cycle
- FR-GC-06: End-of-cycle snapshot records eminence, ascendancy, and prestige for all characters at the moment of reset
- FR-GC-07: Monthly influence income is calculated per character based on active influence merits and territory holdings, and applied during cycle reset

### Epic 6: Live Game App

- FR-6-01: The live game interface runs in a tablet-optimised layout (max 600px, bottom navigation) with all edit controls hidden; character switching occurs without page reload
- FR-6-02: ST can look up any character and view their complete read-only sheet with all dice pools pre-calculated from current character data
- FR-6-03: ST can initiate and resolve common contested roll workflows — territory bid, social manoeuvre, resistance check — with pools drawn directly from character data; results are logged to the session log automatically
- FR-6-04: ST can view any character's current cycle downtime submission in read-only mode with ST notes visible
- FR-6-05: ST can track per-character live game state (Vitae, Willpower, Health, Conditions) with a reset-all function at session start; state persists for the duration of the session without requiring manual save
- FR-6-06: ST can access a searchable rules quick reference (roll mechanics, resistance formulas, discipline summaries, merit effects) without leaving the character view

### Data Portability

- FR-DP-01: Any collection (characters, territories, game sessions, attendance, investigations, NPCs) can be exported as a CSV file with all fields represented; nested fields (e.g. character merits array, disciplines map) require a defined flat export format to be specified before implementation — round-trip fidelity depends on this format being established
- FR-DP-02: Any exported CSV can be re-imported with schema validation, deduplication against existing records, and row-level error reporting
- FR-DP-03: Import operations report errors per row without aborting the batch; valid rows are written, invalid rows are reported with field-level messages
- FR-DP-04: Import functions validate all fields against the current collection schema before writing; malformed or out-of-range values are rejected with clear messages
- FR-DP-05: Export followed by immediate import produces an identical data state (no field loss, truncation, or type coercion artefacts)

---

## Non-Functional Requirements

### Performance

- NFR1: Tab/view switching completes in under 100ms as measured in-browser on the target devices (iPad Safari, desktop Chrome)
- NFR2: Character sheet rendering completes in under 500ms from API response receipt
- NFR3: Dice roll results display within 200ms of user tap
- NFR4: Initial app load completes in under 3 seconds on a standard broadband connection
- NFR5: API responses for character list and submission fetch complete in under 500ms at 95th percentile under normal load

### Security

- NFR6: Players access only their own character data; `st_review`, ST notes, and internal flags are stripped from all player-role API responses by server-side middleware
- NFR7: No credentials, API keys, or sensitive configuration are stored in the repository
- NFR8: All ST-only routes are protected by `requireRole('st')` middleware; all player routes by `requireRole('player')` middleware; unauthenticated requests receive 401

### Accessibility

- NFR9: All interactive elements are keyboard-navigable
- NFR10: Colour contrast meets WCAG 2.1 AA minimum ratios on all text/background combinations
- NFR11: Semantic HTML used for structure (headings, lists, buttons — not div-only layouts)

### Integration

- NFR12: All character and collection data is stored in MongoDB Atlas and accessed exclusively via the Express API; no client-side JSON files serve as primary data sources
- NFR13: Discord OAuth is the sole authentication mechanism; player-to-character mapping is maintained in the players collection, not hardcoded

### Maintainability

- NFR14: CSS custom properties (design tokens) are defined in one theme file; no hardcoded colour values outside that file
- NFR15: Reference data (MERITS_DB, DEVOTIONS_DB, MAN_DB) is stored as separate importable JS modules, not inline in application code
- NFR16: Code organisation follows the documented file structure; each feature module has a clear, single responsibility

### Conventions

- NFR17: British English throughout — Defence, Armour, Vigour, Honour, Socialise; no em-dashes in any output text
- NFR18: Dots rendered as `'●'.repeat(n)` (U+25CF); gold accent `#E0C47A` (CSS var `--gold2`); heading font Cinzel/Cinzel Decorative, body font Lora
- NFR19: Dark theme defined on `:root` — `--bg: #0D0B09`, `--surf*` surface tiers, `--gold*` accent tiers, `--crim: #8B0000` for damage/crimson states
