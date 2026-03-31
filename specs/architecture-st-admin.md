---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-03-31'
inputDocuments:
  - specs/prd.md
  - specs/prd/epic-restructure-proposal.md
  - specs/prd/epic-2-operational-enhancement.md
  - specs/prd/epic-3-player-portal.md
  - specs/architecture.md
  - specs/architecture/tech-stack.md
  - specs/architecture/data-models.md
  - specs/architecture/unified-project-structure.md
  - specs/architecture/coding-standards.md
  - specs/architecture/testing-strategy.md
  - downtime_helper/ (full standalone app)
workflowType: 'architecture'
project_name: 'TM Suite — ST Admin App'
user_name: 'Angelus'
date: '2026-03-31'
---

# Architecture Decision Document — ST Admin App

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

The ST Admin App consolidates two functional streams:

- **Epic 2 — ST Administration (5 stories):** Character editing completion (Professional Training grants, print sheets), session logging, and the remaining admin features that are pure frontend logic. These are the Admin Mode building blocks.
- **Epic 3 — Downtime System (7 stories):** Module conversion of Peter's standalone downtime helper, character data bridge, feeding roll resolution, ST notes, outcome approval with write-back, cycle history, and Discord auth. This is the bulk of new functionality.

Combined, this is **12 stories** across 2 parallel epics, all frontend-only with no server dependency.

**Non-Functional Requirements (inherited + new):**

- **NFR-Desktop:** Admin Mode targets desktop browsers as primary device. No 600px cap. Sidebar navigation, multi-column layouts.
- **NFR-Perf (inherited):** Tab switching < 100ms, character lookup < 500ms, roll results < 200ms. Desktop has more screen real estate but the same performance bar.
- **NFR-15 (inherited):** No single JS file exceeds 500 lines. The downtime helper's `dashboard.js` and `parser.js` will need assessment against this.
- **NFR-Data:** Two persistence mechanisms (localStorage for characters/tracker, IndexedDB for downtime) must coexist cleanly and be individually replaceable when MongoDB arrives.
- **NFR-Auth:** Discord OAuth2 (currently in downtime helper only) becomes the shared auth mechanism. ST vs player role distinction designed in now.
- **NFR-Parallel:** Module boundaries must allow two developers to work on separate epics without merge conflicts.

**Scale and Complexity:**

- Primary domain: Frontend SPA, desktop-first with tablet Game Mode
- Complexity level: Medium
- Estimated architectural components: ~8 new/modified modules (desktop shell, sidebar nav, desktop layouts for each tab, downtime bridge, auth layer, cycle management, print view)

### Technical Constraints and Dependencies

| Constraint | Source | Implication |
|---|---|---|
| No build step | PRD, inherited | ES modules only. No bundler, no transpilation. |
| ~~No backend (yet)~~ | ~~Epic 5 is gated~~ | **Superseded by Decision 2 (step 4):** Multi-ST web app requires MongoDB from the start. |
| Vanilla JS, no framework | PRD, inherited | Desktop layout changes are CSS + DOM manipulation, not component framework. |
| Single v2 schema | Architecture v1.0 | Downtime helper must read character data through the same accessor layer. |
| British English | Coding standards | All new UI text, variable naming in user-facing strings. |
| Shared theme | `theme.css` owns all colours | Downtime helper CSS must be migrated to use shared custom properties. |
| ~~GitHub Pages deployment~~ | ~~Infrastructure~~ | **Superseded by Decision 5 (step 4):** Both frontends deploy to Netlify. API on Render. |

### Cross-Cutting Concerns Identified

1. **Persistence duality:** localStorage (characters, tracker) and IndexedDB (downtime) coexist. Both need a clean seam for MongoDB migration. The accessor pattern established in Epic 1 extends to downtime data.

2. **Auth model:** Discord OAuth from the downtime helper is currently standalone. It needs to become the shared auth for the entire app — gating admin features for STs, eventually gating player access in Epic 6.

3. **Desktop vs tablet presentation:** Same codebase, two modes. CSS does the heavy lifting (media queries, layout shifts), JS controls which UI elements are visible per mode. Not two apps.

4. **Downtime-to-character data bridge:** Downtime submissions reference characters by name. The bridge must handle matching, not-found warnings, and eventually write-back (approved outcomes updating character data).

5. **Design system consistency:** The downtime helper has its own dark theme CSS that's *close* to the main app's theme but not identical. Unifying under `theme.css` custom properties is a prerequisite for integration.

## Starter Template Evaluation

### Primary Technology Domain

Brownfield extension of an existing vanilla JS SPA. No starter template applies.

### Foundation: Existing Codebase

The ST Admin App builds directly on the Epic 1 foundation. All technology decisions are inherited from the approved architecture v1.0:

| Decision | Choice | Status |
|---|---|---|
| Language | Vanilla JavaScript (ES2020+) | Established |
| Module system | ES modules (`type="module"`) | Established |
| Styling | CSS3 with custom properties on `:root` | Established |
| Build tooling | None (edit file, refresh browser) | Established |
| Testing | Manual, browser-based | Established |
| Persistence | localStorage (characters), IndexedDB (downtime) | Established + incoming |
| Hosting | GitHub Pages (static) | Established |
| Code organisation | `public/js/` with domain-based module folders | Established |

### What's New for the Admin App

The admin app does not change the tech stack. It extends the existing codebase with:

1. **Desktop-first CSS** — new layout rules, sidebar nav, responsive breakpoints (additive to existing CSS)
2. **Downtime modules** — Peter's 7 JS files converted from global scripts to ES modules, integrated under `public/js/downtime/`
3. **Auth module** — Discord OAuth2 extracted from downtime helper, promoted to shared service
4. **Admin/Game mode toggle** — JS flag controlling UI element visibility, persisted to localStorage

No new dependencies, frameworks, or toolchain changes required.

> **Note:** The starter evaluation above was written before Decision 2 (MongoDB from the start) was made in step 4. The persistence and hosting rows are superseded by the core architectural decisions below. The frontend tech stack (vanilla JS, ES modules, CSS custom properties, no build step) remains unchanged.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (block implementation):**
1. Separate HTML entry points — `admin.html` and `index.html` sharing JS modules
2. MongoDB from the start — multi-ST shared persistence requires a real backend
3. Discord OAuth2 with server-side token exchange — ST-only access at launch
4. Thin API (Express), fat client — rules engine stays in browser JS

**Important Decisions (shape architecture):**
5. Four admin domains: Player, City, Downtime, Engine
6. Netlify for both frontends, Render for API, Atlas for MongoDB

**Deferred Decisions (post-MVP):**
- Player portal auth roles (Epic 6)
- Custom domain configuration (Epic 6)
- Render paid tier (if cold starts become a problem)

### Application Architecture

**Entry points:** Two separate HTML shells sharing a common JS module layer.

| Entry | Target | Layout | Auth |
|---|---|---|---|
| `admin.html` | Desktop (ST tool) | Sidebar nav, multi-column | Discord OAuth2, ST-only |
| `index.html` | Tablet/mobile (live game) | Bottom nav, 600px max | None (local use) |

Both import from the same `public/js/` modules. The admin app has four top-level domains in its sidebar:

- **Player** — character creation, sheet management, merits, XP, print
- **City** — territory management, city dynamics, holdings, influence
- **Downtime** — CSV upload, cycles, submissions, feeding rolls, approvals, ST notes
- **Engine** — dice roller, resistance checks, roll workflows, session log

### Data Architecture

**Database:** MongoDB Atlas (free tier, 512MB shared cluster).

**API server:** Express on Render (free tier). Thin CRUD persistence layer. No business logic server-side.

**Collections:**

| Collection | Content | Source |
|---|---|---|
| `characters` | v2 character documents | Migrated from `chars_v2.json` |
| `downtime_cycles` | Cycle metadata (active/closed, dates) | New |
| `downtime_submissions` | Per-character per-cycle submissions with embedded subdocuments | Replaces IndexedDB 5-store model |
| `tracker_state` | Per-character live game state (vitae, WP, health, conditions) | Replaces `tm_tracker_<name>` localStorage |
| `session_logs` | Roll history, session events | New (Epic 2 story 2.5) |
| `territories` | Territory holdings, bids, influence generation | Extracted from character data |

**Business logic:** All VtR 2e rules (derived stats, XP calculations, merit prerequisites, dice rolling) remain in browser JS. Shared accessor layer (`accessors.js`, `derived.js`) works identically in both admin and game apps. The API is a persistence pipe only.

### Authentication and Security

**Method:** Discord OAuth2 with server-side token exchange (Express handles the callback, not the browser).

**Roles at launch:** ST only. The four ST Discord IDs (already defined in downtime helper's `config.js`) are the whitelist.

**Future:** Player roles added in Epic 6. Same auth system, expanded role checks.

### Infrastructure and Deployment

| Component | Platform | Deploy method |
|---|---|---|
| Admin app (static) | Netlify | Auto-deploy from GitHub on push |
| Game app (static) | Netlify | Same repo, same deploy |
| API server | Render (free tier) | Auto-deploy from GitHub on push |
| MongoDB | Atlas (free tier) | Managed, no deploy needed |

GitHub Pages retired as hosting target. GitHub remains source control only.

## Implementation Patterns and Consistency Rules

### Conflict Points Addressed

7 areas where AI agents could make inconsistent choices, now standardised.

### Inherited Patterns (from Architecture v1.0)

All frontend coding standards from `specs/architecture/coding-standards.md` remain in force:

- British English throughout (Defence, Armour, Honour, etc.)
- ES modules, `const` by default, no `var`
- `camelCase` functions, `UPPER_SNAKE_CASE` constants, `kebab-case` files
- BEM-lite CSS classes, all colours via `theme.css` custom properties
- Data access exclusively through `accessors.js`
- Derived stats exclusively through `derived.js`
- No file over 500 lines
- Comment the why, not the what

### New Patterns for the Admin App

#### MongoDB Naming

- **Collections:** plural `snake_case` — `characters`, `downtime_cycles`, `downtime_submissions`, `tracker_state`, `session_logs`, `territories`
- **Fields:** `snake_case` — consistent with existing v2 schema (`blood_potency`, `xp_spent`, `benefit_grants`)
- **Document IDs:** MongoDB default `_id` (ObjectId). No custom ID schemes.
- **Indexes:** `collection_field_1` format — e.g., `submissions_cycle_character` for the compound unique index on `[cycle_id, character_name]`

#### API Endpoint Naming

All routes prefixed with `/api/`. Plural nouns, `snake_case` for multi-word resources, RESTful verbs via HTTP methods:

```
GET    /api/characters              → list all
GET    /api/characters/:id          → get one
PUT    /api/characters/:id          → update one
POST   /api/characters              → create one
DELETE /api/characters/:id          → delete one

GET    /api/downtime_cycles         → list cycles
POST   /api/downtime_cycles         → create cycle
GET    /api/downtime_submissions    → list submissions (filter by cycle_id query param)
PUT    /api/downtime_submissions/:id → update submission

GET    /api/territories             → list all
PUT    /api/territories/:id         → update one

GET    /api/tracker_state/:character_id → get tracker for character
PUT    /api/tracker_state/:character_id → update tracker

POST   /api/session_logs            → create log entry
GET    /api/session_logs            → list (filter by session_date query param)
```

Route parameters use `:id` format (Express convention).

#### API Response Format

Direct response bodies. HTTP status codes communicate success/failure. No envelope wrapper.

**Success responses:**
```json
// GET /api/characters/:id → 200
{ "_id": "abc123", "name": "Kirk Grimm", "clan": "Nosferatu" }

// GET /api/characters → 200
[{ "_id": "abc123", "name": "Kirk Grimm" }]

// PUT /api/characters/:id → 200
{ "_id": "abc123", "name": "Kirk Grimm" }

// POST /api/characters → 201
{ "_id": "new123", "name": "New Character" }

// DELETE /api/characters/:id → 204 (no body)
```

**Error responses:**
```json
// 400 Bad Request
{ "error": "VALIDATION_ERROR", "message": "Field 'clan' is required" }

// 401 Unauthorised
{ "error": "UNAUTHORISED", "message": "Valid Discord authentication required" }

// 403 Forbidden
{ "error": "FORBIDDEN", "message": "ST role required" }

// 404 Not Found
{ "error": "NOT_FOUND", "message": "Character not found" }

// 500 Internal Server Error
{ "error": "SERVER_ERROR", "message": "Unexpected error" }
```

Note: error field uses `UPPER_SNAKE_CASE` codes. Message field is human-readable. British English in messages (`Unauthorised`, not `Unauthorized`).

#### Server-Side Code Conventions

The Express API server follows the same style principles as the frontend, with these differences:

| Rule | Frontend | Server |
|---|---|---|
| npm packages | Forbidden | Allowed (Express, mongodb driver, dotenv, cors) |
| Module system | ES modules (`type="module"`) | ES modules (`type: "module"` in package.json) |
| File location | `public/js/` | `server/` |
| Naming | `camelCase` functions, `kebab-case` files | Same |
| File size limit | 500 lines | 500 lines |
| Comments | Why, not what | Same |
| Error handling | Trust schema, validate at boundaries | Validate all incoming request bodies. Trust MongoDB responses. |

Server directory structure:

```
server/
├── index.js              # Express app setup, middleware, listen
├── routes/
│   ├── characters.js     # /api/characters routes
│   ├── downtime.js       # /api/downtime_cycles + /api/downtime_submissions
│   ├── territories.js    # /api/territories routes
│   ├── tracker.js        # /api/tracker_state routes
│   └── sessions.js       # /api/session_logs routes
├── middleware/
│   └── auth.js           # Discord OAuth2 token validation, role checking
├── db.js                 # MongoDB connection, collection accessors
└── config.js             # Environment variables, ST ID whitelist
```

#### Authentication Token Handling

**Client → Server:**
```js
fetch('/api/characters', {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

**Server middleware** validates the Discord token on every `/api/` request:
- No token or invalid token → 401
- Valid token but not in ST whitelist → 403
- Valid ST token → request proceeds, `req.user` populated with Discord user info

**Token storage (client-side):** `localStorage` key `tm_auth_token`. Cleared on logout or expiry.

#### Date and Time Format

ISO 8601 strings (`2026-03-31T14:30:00Z`) for all dates in MongoDB documents and API responses. The frontend formats dates for display using `Intl.DateTimeFormat`. No locale-specific formats in the data layer. No Unix timestamps.

#### Client-Side API Communication

A single `api.js` module handles all fetch calls to the server:

```js
// public/js/data/api.js
export async function apiGet(path) { ... }
export async function apiPut(path, body) { ... }
export async function apiPost(path, body) { ... }
export async function apiDelete(path) { ... }
```

All API calls go through this module. No raw `fetch('/api/...')` calls scattered across feature modules. This is the seam — if the API URL changes, or auth headers change, one file updates.

### Anti-Patterns

| Do not | Do instead |
|---|---|
| `fetch('/api/characters')` in a feature module | Import from `api.js` |
| `char.attributes.Strength.dots` on the client | Use `attrDots(char, 'Strength')` via accessors |
| Hardcoded hex colour in CSS | Use `var(--token)` from `theme.css` |
| Business logic in an Express route handler | Keep rules in `public/js/`, API is CRUD only |
| `new Date().toString()` in a MongoDB document | ISO 8601: `new Date().toISOString()` |
| `Authorization: Token xyz` | `Authorization: Bearer xyz` |
| American spelling in error messages | British: `Unauthorised`, `Honour`, `Defence` |

## Project Structure and Boundaries

### Complete Project Directory Structure

```
TM Suite/
├── public/                              # Frontend — both apps served from here
│   ├── index.html                       # Game app entry (tablet/mobile, bottom nav)
│   ├── admin.html                       # Admin app entry (desktop, sidebar nav)
│   ├── css/
│   │   ├── theme.css                    # Design tokens — sole source of colour values
│   │   ├── layout.css                   # Game app layout (mobile-first, 600px max)
│   │   ├── admin-layout.css             # Admin app layout (desktop-first, sidebar, multi-column)
│   │   ├── components.css               # Shared UI components (cards, buttons, badges)
│   │   ├── editor.css                   # Editor-specific styles (shared by both apps)
│   │   └── suite.css                    # Suite-specific styles (game app tabs)
│   └── js/
│       ├── app.js                       # Game app entry: init, tab routing, game state
│       ├── admin.js                     # Admin app entry: init, sidebar routing, auth check
│       ├── data/
│       │   ├── accessors.js             # All character data access (v2 schema)
│       │   ├── derived.js               # Derived stat calculations (speed, defence, etc.)
│       │   ├── loader.js                # Data loading — delegates to api.js or localStorage
│       │   ├── api.js                   # API communication layer (apiGet, apiPut, etc.)
│       │   └── state.js                 # Editor state management
│       ├── auth/
│       │   └── discord.js               # Discord OAuth2 client-side flow + token management
│       ├── editor/
│       │   ├── list.js                  # Character card grid (Player domain)
│       │   ├── sheet.js                 # Read-only character sheet (Player domain)
│       │   ├── edit.js                  # Edit mode, shEdit(), markDirty() (Player domain)
│       │   ├── merits.js                # Merit add/edit/remove, prerequisites (Player domain)
│       │   ├── mci.js                   # MCI benefit grant system (Player domain)
│       │   ├── domain.js                # Domain merit sharing (Player domain)
│       │   ├── xp.js                    # XP log, xpToDots(), creation points (Player domain)
│       │   └── print.js                 # Print character sheet (Player domain)
│       ├── suite/
│       │   ├── roll.js                  # Dice pool construction, modifiers (Engine domain)
│       │   ├── sheet.js                 # Suite sheet view (Game app only)
│       │   ├── territory.js             # Territory tab (City domain)
│       │   └── tracker.js               # Session tracker (Engine domain)
│       ├── downtime/
│       │   ├── parser.js                # CSV tokeniser + downtime parsing (from Peter's code)
│       │   ├── db.js                    # Downtime data access — API calls (replaces IndexedDB)
│       │   ├── dashboard.js             # Summary stats, search, stat cards (Downtime domain)
│       │   ├── territories.js           # Territory ambience scoring (Downtime domain)
│       │   ├── players.js               # Per-character detail view (Downtime domain)
│       │   ├── cycles.js                # Cycle management (create, close, history)
│       │   ├── approval.js              # Outcome approval workflow (Downtime domain)
│       │   └── feeding.js               # Feeding roll resolution, batch rolls (Downtime domain)
│       ├── shared/
│       │   ├── dice.js                  # Core dice engine (10-again, rote, chance)
│       │   ├── influence.js             # Influence total calculation (16 spheres)
│       │   ├── pools.js                 # getPool() — parse pool strings to dot totals
│       │   └── resist.js                # Resistance check calculation
│       └── admin/
│           ├── sidebar.js               # Sidebar navigation, domain switching
│           ├── player-views.js          # Player domain desktop layouts
│           ├── city-views.js            # City domain desktop layouts
│           ├── downtime-views.js        # Downtime domain desktop layouts
│           ├── engine-views.js          # Engine domain desktop layouts
│           └── session-log.js           # Session log viewer + roll logging (Engine domain)
│
├── server/                              # Express API server (deployed to Render)
│   ├── package.json                     # Server dependencies (express, mongodb, dotenv, cors)
│   ├── index.js                         # App setup, middleware, listen
│   ├── db.js                            # MongoDB connection, collection accessors
│   ├── config.js                        # Environment variables, ST ID whitelist
│   ├── routes/
│   │   ├── characters.js                # /api/characters CRUD
│   │   ├── downtime.js                  # /api/downtime_cycles + /api/downtime_submissions
│   │   ├── territories.js               # /api/territories CRUD
│   │   ├── tracker.js                   # /api/tracker_state CRUD
│   │   └── sessions.js                  # /api/session_logs CRUD
│   └── middleware/
│       └── auth.js                      # Discord OAuth2 validation, role checking
│
├── data/                                # Reference data and schemas (not deployed)
│   ├── chars_v2.json                    # 30 real characters (migration source for MongoDB)
│   ├── chars_test.json                  # 12 test characters
│   ├── chars_v2.schema.json             # JSON Schema (source of truth)
│   ├── merits_db.json                   # 203+ merit entries
│   ├── devotions_db.json                # 42 devotion entries
│   ├── man_db.json                      # Manoeuvre definitions
│   ├── icons.json                       # Icon mappings
│   ├── clan_banes.json                  # Clan bane definitions
│   ├── bloodline_discs.json             # Bloodline discipline mappings
│   └── schema_v2_proposal.md            # Informal schema narrative
│
├── scripts/                             # Utility scripts
│   └── migrate-to-mongo.js             # Import chars_v2.json + test data into MongoDB
│
├── specs/                               # Planning artifacts (BMAD)
│   ├── prd.md
│   ├── architecture.md                  # v1.0 (game app, Epic 1)
│   ├── architecture-st-admin.md         # This document (admin app)
│   ├── prd/
│   ├── architecture/
│   └── stories/
│
├── downtime_helper/                     # Peter's original (reference only, not deployed)
│
├── .env.example                         # Environment variable template
├── .gitignore                           # Includes .env, node_modules/
├── netlify.toml                         # Netlify config (publish: public/, redirects)
├── CLAUDE.md
└── README.md
```

### Architectural Boundaries

**API boundary:** All data flows through `public/js/data/api.js` → Express `/api/*` routes → MongoDB. No frontend module talks to MongoDB directly. No server route contains business logic.

**Auth boundary:** `public/js/auth/discord.js` handles the client-side OAuth flow and token storage. `server/middleware/auth.js` validates tokens on every API request. Auth is transparent to feature modules — they call `api.js` functions, which attach the token automatically.

**Data access boundary:** Character data access goes through `accessors.js` (unchanged). Downtime data access goes through `downtime/db.js`. Both delegate to `api.js` for persistence. Feature modules never call `api.js` directly for character reads — they use the accessor layer.

**Presentation boundary:** `admin.js` owns the admin app shell (sidebar, domain routing). `app.js` owns the game app shell (bottom nav, tab routing). Feature modules (`editor/*`, `suite/*`, `downtime/*`) render into containers provided by the shell — they don't know which shell they're in.

### Domain to Structure Mapping

| Domain | Admin sidebar section | Primary modules | Shared modules |
|---|---|---|---|
| **Player** | Character list, sheet, edit, print | `editor/*` | `data/accessors.js`, `data/derived.js` |
| **City** | Territory management, influence, holdings | `suite/territory.js`, `admin/city-views.js` | `shared/influence.js` |
| **Downtime** | CSV upload, cycles, dashboard, approvals | `downtime/*` | `data/accessors.js`, `shared/dice.js` |
| **Engine** | Dice roller, resistance, session log | `suite/roll.js`, `suite/tracker.js`, `admin/session-log.js` | `shared/dice.js`, `shared/pools.js`, `shared/resist.js` |

### Epic to Structure Mapping

**Epic 2 (ST Admin Features):**
- Story 2.3 (Professional Training) → `editor/merits.js`
- Story 2.4 (Print Sheet) → `editor/print.js`
- Story 2.5 (Session Log) → `admin/session-log.js`

**Epic 3 (Downtime System):**
- Story 3.1 (Module Conversion) → `downtime/*` (all files, converted from Peter's globals)
- Story 3.2 (Character Data Bridge) → `downtime/db.js` + `data/accessors.js`
- Story 3.3 (Feeding Roll Resolution) → `downtime/feeding.js`
- Story 3.4 (ST Notes) → `downtime/approval.js`
- Story 3.5 (Outcome Approval) → `downtime/approval.js`
- Story 3.6 (Cycle History) → `downtime/cycles.js`
- Story 3.7 (Discord Auth) → `auth/discord.js`

**Epic 5 (Backend — now foundational):**
- Story 5.1 (Data Access Abstraction) → `data/api.js`, `data/loader.js`
- Story 5.2 (MongoDB Schema) → `server/db.js`, `scripts/migrate-to-mongo.js`
- Story 5.3 (API Server) → `server/*`
- Story 5.4 (Auth) → `server/middleware/auth.js`, `auth/discord.js`

### Data Flow

```
Browser (admin.html or index.html)
  │
  ├── Feature module (e.g., editor/sheet.js)
  │     │
  │     ├── reads via accessors.js ──→ local state (cached from API)
  │     └── writes via accessors.js ──→ api.js ──→ Express API ──→ MongoDB
  │
  ├── Downtime module (e.g., downtime/dashboard.js)
  │     │
  │     └── reads/writes via downtime/db.js ──→ api.js ──→ Express API ──→ MongoDB
  │
  └── Auth (auth/discord.js)
        │
        └── OAuth flow ──→ Express /auth/* ──→ Discord API ──→ token stored in localStorage
```

### Development Workflow

**Frontend development:** Edit files in `public/`, open `admin.html` or `index.html` in browser. No build step. ES modules load directly.

**Server development:** `cd server && npm install && npm run dev` (nodemon or similar for auto-restart). Requires `.env` with `MONGODB_URI` and `DISCORD_CLIENT_SECRET`.

**Netlify config** (`netlify.toml`): Publishes `public/` directory. API proxy redirects `/api/*` to the Render-hosted Express server, avoiding CORS in production.

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** All technology choices are compatible. Express + MongoDB, vanilla JS frontend with fetch-based API calls, Discord OAuth2 with server-side exchange. No conflicts between any decisions.

**Pattern Consistency:** Naming conventions are consistent across all layers — `snake_case` for data (MongoDB fields, API endpoints, v2 schema), `camelCase` for JS code, `kebab-case` for files and CSS. No contradictions.

**Structure Alignment:** Project structure directly supports all architectural decisions. Module boundaries are clean. The `api.js` seam separates frontend from backend. Server routes map 1:1 to MongoDB collections.

### Requirements Coverage

| Requirement | Coverage | Module(s) |
|---|---|---|
| Epic 2 (5 stories) | Full | `editor/*`, `admin/session-log.js` |
| Epic 3 (7 stories) | Full | `downtime/*`, `auth/discord.js` |
| Epic 5 (foundational) | Full | `server/*`, `data/api.js`, `scripts/migrate-to-mongo.js` |
| NFR-Desktop | Full | `admin-layout.css`, `admin/*` |
| NFR-Perf | No blocker | Same architecture, same performance bar |
| NFR-15 (500-line limit) | Needs assessment | Peter's `dashboard.js` and `parser.js` during conversion |
| NFR-Auth | Full | `auth/discord.js`, `server/middleware/auth.js` |
| NFR-Parallel | Full | `editor/*` and `downtime/*` are non-overlapping |

### Gap Resolution: Game App Offline Capability

**Issue:** The game app currently works entirely from localStorage. With MongoDB as the data source, venue WiFi may be unreliable.

**Resolution:** `loader.js` operates in two modes:
- **Admin app (API-first):** Always fetches from API. Requires network.
- **Game app (cache-first):** Fetches from API on startup, caches to localStorage. Falls back to cached data if API is unreachable. ST syncs before game by opening the game app while online.

This preserves the existing offline-capable behaviour for live game use without adding service worker complexity.

### Architecture Completeness Checklist

- [x] Project context analysed, scale assessed, constraints identified
- [x] Core decisions documented (entry points, MongoDB, Discord auth, thin API, four domains, hosting)
- [x] Implementation patterns established (naming, API format, server conventions, anti-patterns)
- [x] Complete directory structure defined with module boundaries
- [x] All epics mapped to specific files and directories
- [x] Data flow documented (browser → api.js → Express → MongoDB)
- [x] Development workflow defined (frontend: edit + refresh, server: npm run dev)
- [x] Offline fallback strategy for game app resolved

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Builds on proven Epic 1 foundation — no architectural leaps of faith
- Clean separation between thin API and fat client preserves all existing business logic
- Four-domain sidebar model maps naturally to two parallel epics
- Offline fallback for game app preserves existing live-game reliability

**Areas for Future Enhancement:**
- Real-time sync between STs (currently manual refresh — acceptable for 3 users)
- Service worker for true offline game app (only if venue WiFi proves unreliable)
- Rate limiting on API (not needed for 3 ST users, add when player portal opens)

### Implementation Handoff

**First implementation priority:** Stand up the Express API server with MongoDB connection, Discord auth, and the characters CRUD route. Migrate test data. Get `admin.html` rendering a character list from the API. This proves the full stack end-to-end before building out the four domains.
