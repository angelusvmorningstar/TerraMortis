# Epic Restructure Proposal — v2

**Author:** Angelus (Project Lead)
**Date:** 31 March 2026
**Status:** Active
**Supersedes:** Epic Restructure Proposal v1 (same date, pre-architecture session)

---

## Executive Summary

The vision for Terra Mortis has grown beyond a single local app. We are building toward three interconnected products: an **ST Admin App** (desktop, shared by all STs via the web), a tablet-friendly **Live Game App** for use at the table, and eventually a **Player Portal** for character access and downtime submission. All three share a MongoDB backend and a common JS module layer.

This proposal restructures the epics to reflect the architectural decision that **MongoDB and the API server are foundational, not gated**. Three STs need shared access to the same data — localStorage cannot serve that. The backend comes first, and everything builds on top of it.

### What changed from v1

| v1 position | What happened | v2 position |
|---|---|---|
| Epic 2: ST Admin Features | Stories 2.1/2.2 done. Remaining stories renumbered. | Epic 3 |
| Epic 3: Downtime System | Unchanged scope, renumbered. | Epic 4 |
| Epic 4: Live Game App | Unchanged scope, renumbered. | Epic 5 |
| Epic 5: Backend Infrastructure | **Promoted to Epic 2 — foundational, not gated.** | Epic 2 |
| Epic 6: Player Portal | Unchanged. | Epic 6 |

### Key design decisions

1. **Backend is foundational (Epic 2).** Three STs need shared access. localStorage is per-device. MongoDB Atlas + Express API + Discord auth come first.
2. **Thin API, fat client.** The Express server is a CRUD persistence pipe. All VtR 2e business logic stays in browser JS.
3. **Two HTML entry points, shared modules.** `admin.html` (desktop, sidebar nav) and `index.html` (tablet, bottom nav) import from the same `public/js/` modules.
4. **Four admin domains:** Player, City, Downtime, Engine — sidebar navigation for the desktop ST tool.
5. **Game app keeps offline capability.** `loader.js` operates in cache-first mode for the game app, API-first for the admin app.
6. **Netlify for both frontends, Render for API, Atlas for MongoDB.** GitHub Pages retired.

### Priority order

**Immediate:** Epic 2 (Backend Foundation) — proves the full stack end-to-end
**Next:** Epic 3 (ST Admin Features) + Epic 4 (Downtime System) — can run in parallel
**Then:** Epic 5 (Live Game App) — starts once core character rendering is stable on the API
**Last:** Epic 6 (Player Portal + Website) — depends on everything above

---

## Dependency Map

```
Epic 1 (DONE) ──→ Epic 2 (Backend Foundation) ──+
                                                  ├──→ Epic 3 (ST Admin Features) ──+
                                                  ├──→ Epic 4 (Downtime System) ────+
                                                  │         (parallel with Epic 3)   │
                                                  │                                  ├──→ Epic 6 (Player Portal)
                                                  └──→ Epic 5 (Live Game App) ──────+
```

Two developers can work in parallel: one on Epic 3, the other on Epic 4, once Epic 2 is complete.

---

## Epic 1: Foundation Restructure — DONE

**Goal:** Same functionality, maintainable modular architecture.

**Status:** Complete. Single SPA, modular JS/CSS, v2 data layer, shared accessors, GitHub Pages deployment.

No changes.

**Done stories (pre-restructure numbering):** 2.1 (Character Administration), 2.2 (MCI Benefit Grants) — these are character admin features built on the Epic 1 foundation. They carry forward and will work once the API layer is in place.

---

## Epic 2: Backend Foundation

**Goal:** Stand up the shared infrastructure that all three products (admin app, game app, player portal) build on. Prove the full stack end-to-end with the admin app rendering character data from MongoDB.

**Prerequisites:** Epic 1 (done).

**Architecture reference:** `specs/architecture-st-admin.md`

| Story | Title | Notes |
|---|---|---|
| 2.1 | Express API Server + MongoDB Connection | Express app on Render, MongoDB Atlas connection, health check endpoint. `.env` config, CORS setup, `server/` directory structure per architecture doc. |
| 2.2 | Discord Auth | Server-side OAuth2 token exchange. ST whitelist (4 Discord IDs). Auth middleware on all `/api/` routes. Client-side `auth/discord.js` for login flow + token storage. |
| 2.3 | Characters CRUD API + Data Migration | `/api/characters` routes (GET list, GET one, PUT, POST, DELETE). `scripts/migrate-to-mongo.js` to seed test data. Client-side `data/api.js` module. |
| 2.4 | Admin App Shell | `admin.html` entry point, sidebar nav with four domains (Player, City, Downtime, Engine). Desktop-first CSS (`admin-layout.css`). Player domain renders character list from API. Proves full stack end-to-end. |
| 2.5 | Remaining Collection APIs | `/api/territories`, `/api/tracker_state`, `/api/session_logs`, `/api/downtime_cycles`, `/api/downtime_submissions` — CRUD routes for all 6 collections. |
| 2.6 | Game App API Integration | Update `loader.js` to dual-mode: API-first (admin) and cache-first (game). Game app fetches from API on startup, falls back to localStorage. Netlify deployment config (`netlify.toml`) with API proxy. |

---

## Epic 3: ST Admin Features

**Goal:** Complete the character editing and rendering features in the admin app. These are the Player and City domain building blocks.

**Prerequisites:** Epic 2 (backend foundation).

**Previously completed:** Stories 2.1 (Character Administration) and 2.2 (MCI Benefit Grants) from the old numbering. These features exist in the current SPA and will work once wired to the API.

| Story | Title | Notes |
|---|---|---|
| 3.1 | Professional Training Grant System | Pure rendering/logic. Reads `role` field on PT merits, applies asset skills and dot-level benefits. Player domain. |
| 3.2 | Print Character Sheet | Print-formatted character sheet with print-optimised CSS. Player domain. |
| 3.3 | Session Log | Log data layer (`session_logs` collection), roll logging from Engine domain, log viewer UI. |
| 3.4 | City Domain Views | Territory management desktop layout, city dynamics, holdings, influence display. City domain in admin sidebar. |

---

## Epic 4: Downtime System

**Goal:** Integrate Peter's standalone downtime helper into the admin app's Downtime domain, bridging it with character data via the API so a full 30-character downtime cycle can be processed efficiently.

**Prerequisites:** Epic 2 (backend foundation). Stories 3.1/3.2 are nice-to-have (derived merits affect influence totals) but not blockers.

| Story | Title | Source | Notes |
|---|---|---|---|
| 4.1 | Module Conversion | New | Convert downtime helper from plain `<script>` globals to ES modules. Replace IndexedDB with API calls via `downtime/db.js`. Align CSS with shared `theme.css`. |
| 4.2 | Character Data Bridge | From old 2.5 | Connect to `characters` collection via API. Character name matching, not-found warnings. |
| 4.3 | Feeding Roll Resolution | From old 2.5 | Build feeding pool from character data. Roll using `shared/dice.js`. Batch "Roll All" button. |
| 4.4 | ST Notes and Hidden Annotations | New | Per-submission `st_notes` field with `visibility: 'st_only'` flag. Designed so Player Portal (Epic 6) can exclude them without retrofit. |
| 4.5 | Outcome Approval and Application | From old 2.6 | Approval workflow (pending/approved/modified/rejected). Write-back to character data via API. Resolution summary export. |
| 4.6 | Cycle History and Comparison | New | View closed cycles, compare across cycles (who submitted, who didn't). |
| 4.7 | Discord Auth for Access Control | Extends auth from Epic 2 | Formalise ST vs player access within Downtime domain. Players see own submissions only, no ST notes. |

**What carries forward from Peter's work:** CSV parser, dashboard (Summary/Territories/Players tabs), territory matching with ambience scoring, dice pool parser, `roll_pool()`, roll persistence, cycle management.

---

## Epic 5: Live Game App

**Goal:** Tablet-friendly ST interface for live games. Read-only character sheets, quick rolls, rules reference, territory display, downtime lookup with ST notes.

**Prerequisites:** Epic 3 stories 3.1-3.2 (so derived merits render correctly in read-only sheets).

| Story | Title | Notes |
|---|---|---|
| 5.1 | Game Mode Shell and Navigation | Game/Admin mode context. Game app hides edit controls, shows streamlined tablet layout. Bottom nav, 600px max. |
| 5.2 | Read-Only Character Sheet | Reuse `renderSheet()` with edit controls stripped. Tablet-optimised: larger tap targets, collapsible sections, quick-access character search. |
| 5.3 | Quick Roll Workflows | Territory bid, social manoeuvre, resistance check — contested roll automation. Results logged to session log. |
| 5.4 | Downtime Lookup | Read-only view of current cycle submissions for any character. ST notes visible. Reads from `downtime_submissions` collection via API. |
| 5.5 | Live Status Tracker | Per-character at-game state: Vitae, Willpower, Health, Conditions. Uses `tracker_state` collection. Reset-all for session start. |
| 5.6 | Rules Quick Reference | Collapsible panels: roll mechanics, resistance formulas, discipline summaries, merit effects. Drawn from existing data (`MAN_DB`, `MERITS_DB`, `DEVOTIONS_DB`). Searchable. |

**Design note:** Game app and admin app are not separate codebases. Same JS modules, different HTML shells. Improvements to character rendering in the admin app automatically improve the game app.

---

## Epic 6: Player Portal and Website

**Goal:** Players access their own character, submit downtimes, receive outcomes, and explore lore through the TM website. STs manage the game through the admin backend.

**Prerequisites:** Epics 2-5 stable.

| Story | Title | Notes |
|---|---|---|
| 6.1 | Public Landing Page | `terramortislarp.com` home page. About the game, next game date (not location). No auth required. |
| 6.2 | Player Login and Character View | Discord OAuth. Player sees own character sheet (read-only, mobile-first). Cannot see other characters. |
| 6.3 | Downtime Submission | Player submits feeding approach and actions through a form (replaces Google Forms). Goes to `downtime_submissions` collection. |
| 6.4 | Downtime Outcomes | Player sees approved outcomes after ST processes the cycle. ST notes remain hidden. Modified outcomes show public note only. |
| 6.5 | Lore Library | Authenticated players access campaign lore documents. ST controls visibility (public/restricted). |
| 6.6 | Character Drafting and Ordeal Tracking | Guided character creation wizard. Submit to ST for review. Track ordeal completion for XP. |
| 6.7 | ST Admin Panel (Website Backend) | The admin app re-pointed at production MongoDB. Same tools, hosted, backed by cloud DB. |

**Last priority.** ST tools must be stable and battle-tested before opening anything to players.

---

## Suggested Sequencing

**Immediate (April 2026):**
- Epic 2: All stories (2.1-2.6) — full stack foundation

**Near-term (May 2026):**
- Epic 3: Stories 3.1-3.4 (ST admin features)
- Epic 4: Stories 4.1-4.2 (downtime module conversion + character bridge)

**Mid-term (June-July 2026):**
- Epic 4: Stories 4.3-4.7 (downtime processing features)
- Epic 5: Stories 5.1-5.2 (game mode shell + read-only sheets)

**When ready:**
- Epic 5: Stories 5.3-5.6 (game mode features)
- Epic 6: After all ST tools are stable
