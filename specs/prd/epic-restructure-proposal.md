# Epic Restructure Proposal

**Author:** Angelus (Project Lead)
**Date:** 31 March 2026
**Status:** Proposal -- inviting Peter's input before finalising

---

## Executive Summary

The vision for Terra Mortis has grown beyond a single local app. We are building toward three interconnected products: a hosted **TM Website** (public landing page + ST admin backend), a tablet-friendly **Live Game App** for use at the table, and eventually a **Player Portal** for character access and downtime submission. All three share a common data layer that will migrate from localStorage to MongoDB when we are ready for player-facing features.

This proposal restructures the epics and stories to align the build order with that end state. ST tools come first. Player-facing features come last. Nothing we build now should be throwaway.

### What changed

| Original Story | What happened | New location |
|---|---|---|
| 2.1 Character Administration | **DONE** | Epic 2, story 2.1 |
| 2.2 MCI Benefit Grants | Unchanged | Epic 2, story 2.2 |
| 2.3 Professional Training | Unchanged | Epic 2, story 2.3 |
| 2.4 Print Character Sheet | Unchanged | Epic 2, story 2.4 |
| 2.5 Downtime Feeding Rolls | Decomposed | Epic 3, stories 3.2 + 3.3 |
| 2.6 Downtime Outcome Approval | Rewritten | Epic 3, story 3.5 |
| 2.7 Session Log + Roll Workflows | Split | Epic 2 story 2.5 (log) + Epic 4 story 4.3 (roll workflows) |
| 2.8 GitHub API | **DROPPED** | Replaced by Epic 5 (MongoDB backend) |
| Epic 3 Player Portal | Rewritten | Epic 6, depends on backend infrastructure |

### Key design decisions

1. **Downtime gets its own epic (3).** Peter's downtime helper is a substantial standalone codebase -- it deserves dedicated stories, not two stories bolted onto the editor epic.
2. **Downtime helper stays as a separate page**, not merged into the SPA. It uses IndexedDB (5 object stores), has its own lifecycle (CSV upload, cycle management), and will be the first thing rewired when MongoDB arrives. Keeping it separate makes all of that cleaner.
3. **GitHub API story (2.8) is dropped.** With MongoDB in the future plan, a GitHub commit mechanism is a dead-end investment. Current workflow (edit locally, export JSON) continues until the backend epic.
4. **Game Mode is a UI toggle, not a separate app.** Same SPA, same code, different presentation layer. Admin Mode is the default (desktop, full editing). Game Mode strips edit controls and optimises for tablet.
5. **Backend infrastructure (Epic 5) is explicitly gated.** Nothing in Epics 2-4 requires a server. We build ST features on localStorage, then swap the storage layer when we are ready. The v2 schema is already document-shaped and maps directly to MongoDB collections.
6. **ST notes on downtimes are designed in now (story 3.4)**, even though players cannot see them until Epic 6. This avoids a painful retrofit.

### Priority order

**Immediate:** Epic 2 (ST admin features) + Epic 3 (downtime integration) -- can run in parallel
**Next:** Epic 4 (Live Game App) -- starts once core character rendering is stable
**When ready:** Epic 5 (backend) -- when both devs are comfortable and frontend features are battle-tested
**Last:** Epic 6 (player portal + website) -- depends on Epic 5

---

## Dependency Map

```
Epic 1 (DONE) --+
                 +--> Epic 2 (ST Admin Features) ----------------+
                 |                                                |
                 +--> Epic 3 (Downtime System) ------------------+
                 |         (parallel with Epic 2)                 |
                 |                                                +--> Epic 6 (Player Portal)
                 +--> Epic 4 (Live Game App) --------------------+
                           (after Epic 2 stories 2.2-2.3)        |
                                                                  |
                      Epic 5 (Backend Infrastructure) ------------+
                           (independent; required before Epic 6)
```

Two developers can work in parallel: one on Epic 2, the other on Epic 3.

---

## Epic 1: Foundation Restructure -- DONE

**Goal:** Same functionality, maintainable modular architecture.

**Status:** Complete. Single SPA, modular JS/CSS, v2 data layer, shared accessors, GitHub Pages deployment.

No changes.

---

## Epic 2: ST Administration Features

**Goal:** Complete the character editing and rendering features that are pure frontend logic, independent of storage backend. These are the Admin Mode building blocks that Game Mode will later consume as read-only views.

**Prerequisites:** Epic 1 (done).

| Story | Title | Status | Notes |
|---|---|---|---|
| 2.1 | Character Administration | **DONE** | Status, BP, Humanity, features, touchstones, banes |
| 2.2 | MCI Benefit Grants -- Complete Wiring | Draft | Pure rendering/logic. Existing story unchanged. |
| 2.3 | Professional Training Grant System | Draft | Pure rendering/logic. Existing story unchanged. |
| 2.4 | Print Character Sheet | Draft | Pure frontend. Existing story unchanged. |
| 2.5 | Session Log | New (from old 2.7) | Scoped to: log data layer, roll logging from Roll tab, log viewer UI. Automated contest workflows (territory bid, social manoeuvre) move to Epic 4. |

**Dropped:** Story 2.8 (GitHub API Integration). Dead end -- replaced by Epic 5 backend.

**Moved out:** Stories 2.5/2.6 (downtime) moved to Epic 3.

---

## Epic 3: Downtime System

**Goal:** Integrate Peter's standalone downtime helper into the TM Suite ecosystem, bridging it with character data so a full 30-character downtime cycle can be processed efficiently.

**Prerequisites:** Epic 1 (done). Stories 2.2/2.3 are nice-to-have (derived merits affect influence totals) but not blockers.

| Story | Title | Source | Notes |
|---|---|---|---|
| 3.1 | Module Conversion | New | Convert downtime helper from plain `<script>` globals to ES modules. Align CSS with shared theme. Keep as separate page at `/downtime/`, not merged into SPA. |
| 3.2 | Character Data Bridge | From old 2.5 | Connect to `tm_chars_db` in localStorage. Character matching, not-found warnings. |
| 3.3 | Feeding Roll Resolution | From old 2.5 | Build feeding pool from character data. Roll using existing `roll_pool()`. Batch "Roll All" button. |
| 3.4 | ST Notes and Hidden Annotations | New | Per-submission `st_notes` field with `visibility: 'st_only'` flag. Designed so Player Portal (Epic 6) can exclude them without retrofit. |
| 3.5 | Outcome Approval and Application | From old 2.6 | Approval workflow (pending/approved/modified/rejected). Write-back to character data. Resolution summary export. |
| 3.6 | Cycle History and Comparison | New | View closed cycles, compare across cycles (who submitted, who didn't). |
| 3.7 | Discord Auth for Access Control | Extends Peter's auth.js | Formalise ST vs player access. Players see own submissions only, no ST notes. Lightweight precursor to Epic 6 auth. |

**Architecture decision:** The downtime helper stays as a separate page (`/downtime/`) rather than merging into the SPA. Reasons:
- Uses IndexedDB (5 normalised stores) while the SPA uses localStorage
- Has its own lifecycle (CSV upload, cycle management) that does not fit the tab model
- Shares CSS theme and data accessors via ES modules without being the same HTML page
- When MongoDB arrives, the IndexedDB layer is the first thing replaced -- separation makes that swap cleaner

**What carries forward from Peter's work:** CSV parser, IndexedDB persistence (5 stores), dashboard (Summary/Territories/Players tabs), territory matching with ambience scoring, dice pool parser, `roll_pool()`, roll persistence, cycle management, Discord OAuth (`auth.js`, `config.js`).

---

## Epic 4: Live Game App (Game Mode)

**Goal:** Tablet-friendly ST interface for live games. Read-only character sheets, quick rolls, rules reference, territory display, downtime lookup with ST notes.

**Prerequisites:** Epic 2 stories 2.2-2.3 (so derived merits render correctly in read-only sheets).

| Story | Title | Notes |
|---|---|---|
| 4.1 | Game Mode Shell and Navigation | Game/Admin mode toggle in top nav. Game Mode hides edit controls, shows streamlined tablet layout. Persists mode choice. |
| 4.2 | Read-Only Character Sheet | Reuse `renderSheet()` with edit controls stripped. Tablet-optimised: larger tap targets, collapsible sections, quick-access character search. |
| 4.3 | Quick Roll Workflows | Territory bid, social manoeuvre, resistance check -- contested roll automation. From old story 2.7 Tasks 2-4. Results logged to session log (Epic 2 story 2.5). |
| 4.4 | Downtime Lookup | Read-only view of current cycle submissions for any character. ST notes visible here (hidden in Player Portal). Reads from downtime helper's IndexedDB. |
| 4.5 | Live Status Tracker | Per-character at-game state: Vitae, Willpower, Health, Conditions. Uses existing `tm_tracker_<name>` localStorage keys. Reset-all for session start. |
| 4.6 | Rules Quick Reference | Collapsible panels: roll mechanics, resistance formulas, discipline summaries, merit effects. Drawn from existing data (`MAN_DB`, `MERITS_DB`, `DEVOTIONS_DB`). Searchable. |

**Design note:** Game Mode and Admin Mode are not separate apps. Same SPA, same code, mode toggle controls which UI elements are visible. Improvements to character rendering in Admin Mode (Epic 2) automatically improve Game Mode.

---

## Epic 5: Backend Infrastructure

**Goal:** Replace localStorage/IndexedDB with MongoDB and an API layer. Enables multi-device access, hosted deployment, and player-facing features.

**Prerequisites:** Practically, start after Epics 2-3 are stable so the data model is settled.

| Story | Title | Notes |
|---|---|---|
| 5.1 | Data Access Abstraction Layer | Refactor all localStorage/IndexedDB calls behind a `DataStore` interface. `LocalDataStore` (current) and `MongoDataStore` (new). Config flag to switch. |
| 5.2 | MongoDB Schema and API Design | Collections mapping to v2 character schema, downtime submissions, session logs, tracker state. One document per character (better for concurrent editing). |
| 5.3 | Minimal API Server | Node.js/Express exposing CRUD endpoints. Business logic stays in the frontend; server is a persistence layer. Free tier hosting (Render/Railway). |
| 5.4 | Authentication and Authorisation | Discord OAuth2 server-side token exchange. Roles: ST (full access), Player (own character, submit downtimes, no ST notes). |
| 5.5 | Data Migration Tooling | Scripts to import from localStorage/IndexedDB exports to MongoDB. Validate round-trip. |
| 5.6 | Hosted Deployment Pipeline | CI/CD for frontend (Netlify/Vercel) and API server. Domain: `terramortislarp.com`. |

**Why this is gated:** Nothing in Epics 2-4 requires a server. The learning curve stays manageable (edit file, refresh browser) while core features are being built. MongoDB is needed only when multiple people need shared live state or authenticated access.

---

## Epic 6: Player Portal and Website

**Goal:** Players access their own character, submit downtimes, receive outcomes, and explore lore through the TM website. STs manage the game through the admin backend.

**Prerequisites:** Epic 5 (backend infrastructure).

| Story | Title | Notes |
|---|---|---|
| 6.1 | Public Landing Page | `terramortislarp.com` home page. About the game, next game date (not location). No auth required. |
| 6.2 | Player Login and Character View | Discord OAuth. Player sees own character sheet (read-only, mobile-first). Cannot see other characters. |
| 6.3 | Downtime Submission | Player submits feeding approach and actions through a form (replaces Google Forms). Goes to same MongoDB collection the ST dashboard reads. |
| 6.4 | Downtime Outcomes | Player sees approved outcomes after ST processes the cycle. ST notes remain hidden. Modified outcomes show public note only. |
| 6.5 | Lore Library | Authenticated players access campaign lore documents. ST controls visibility (public/restricted). |
| 6.6 | Character Drafting and Ordeal Tracking | Guided character creation wizard. Submit to ST for review. Track ordeal completion for XP. |
| 6.7 | ST Admin Panel (Website Backend) | The main SPA re-pointed at `MongoDataStore`. Same tools, hosted, backed by MongoDB. |

**Last priority.** ST tools must be stable and battle-tested before opening anything to players.

---

## Suggested Sequencing

**Immediate (April 2026):**
- Epic 2: Stories 2.2, 2.3
- Epic 3: Stories 3.1, 3.2 (Peter, since he built the downtime helper)

**Near-term (May-June 2026):**
- Epic 2: Stories 2.4, 2.5
- Epic 3: Stories 3.3, 3.4, 3.5
- Epic 4: Story 4.1 (Game Mode shell -- can start once 2.2/2.3 are merged)

**Mid-term:**
- Epic 4: Stories 4.2-4.6
- Epic 3: Stories 3.6, 3.7

**When ready:**
- Epic 5: When both devs are comfortable with backend concepts and frontend is stable
- Epic 6: After Epic 5 delivers a working API and auth
