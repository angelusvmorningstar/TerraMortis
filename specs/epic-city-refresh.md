---
epic_id: cr
epic_name: City Refresh
status: in-progress
created: 2026-04-17
---

# Epic CR: City Refresh

## Overview

UI polish and redesign pass targeting the city display, layout system, status visualisation, and theme consistency. Sourced from backlog analysis session 2026-04-17 (Bob / Mary / brainstorming).

Covers: court title rename, layout squish audit, status & power visualisation redesign, sphere view (ST admin), modal theming audit, and favicon.

---

## Story CR-1: Court Two-Tier Title System & Territory Name Fix

**Backlog items:** 2, 3, 11

**As a** player or ST viewing the City tab,
**I want** court positions grouped by functional category and displayed with their specific in-character epithet,
**so that** the display reflects the game's actual title hierarchy correctly.

### Background

Court titles have two tiers:
- **Category** (mechanical, sort/group key): Head of State | Primogen | Administrator | Socialite | Enforcer
- **Epithet** (flavour, display name): the specific in-character title, e.g. Premier (Head of State), Harpy (Socialite), Protector (Enforcer)

Currently, some court epithets are stored in `honorific` (Premier, Harpy, Protector) because that drove display. However `honorific` is also used for social address (Lord, Lady, Doctor) — these are separate concerns.

The code already references `c.court_title` for the court list, but that field does not exist in the data — so the court display is currently empty.

The fix: add `court_title` + `court_category` as proper fields. The `honorific` field is **not touched** — it continues to drive `displayName()` correctly (e.g. "Premier Firstname"). The new fields are used purely for court mechanics.

### Acceptance Criteria

1. Character schema (`server/schemas/character.schema.js`) gains two new optional fields:
   - `court_title`: string — the epithet (e.g. "Premier", "Harpy", "Seneschal")
   - `court_category`: enum — `['Head of State', 'Primogen', 'Administrator', 'Socialite', 'Enforcer']`
2. A one-time migration script populates these fields on existing court holders:
   - Characters with `honorific: 'Premier'` → `court_title: 'Premier'`, `court_category: 'Head of State'`
   - Characters with `honorific: 'Harpy'` → `court_title: 'Harpy'`, `court_category: 'Socialite'`
   - Characters with `honorific: 'Protector'` → `court_title: 'Protector'`, `court_category: 'Enforcer'`
   - Primogens and Administrators have no court-title honorific — ST sets these manually via character editor post-deploy
3. `CATEGORY_ORDER` in both `city-tab.js` and `city-views.js` updated to: `['Head of State', 'Primogen', 'Administrator', 'Socialite', 'Enforcer']`
4. Court list sorts and groups by `court_category`; displays `court_title` as the position label
5. Character editor gains `court_title` (text input) and `court_category` (dropdown, enum) fields
6. Both player side (`city-tab.js`) and ST admin side (`city-views.js`) use the new fields
7. The "harbour" territory displays its name — migration sets `name: 'The Harbour'` on the territories document

### Dev Notes

- `honorific` is NOT modified — it continues to drive `displayName()` for social address
- Migration script: `server/migrate-court-titles.js` — safe, additive only (sets new fields, reads old ones)
- Current court holders to migrate: check `db.characters.find({ honorific: { $in: ['Premier','Harpy','Protector'] } })`
- Primogens and Administrators: after deploy, ST sets `court_title` + `court_category` via character editor
- Files: `server/schemas/character.schema.js`, `server/migrate-court-titles.js` (new), `public/js/player/city-tab.js`, `public/js/admin/city-views.js`, `public/js/editor/` (character editor court fields)

---

## Story CR-2: Layout Audit & Two-Panel Fix

**Backlog items:** 12, 13, 14, 15, 17

**As a** player or ST using any tab in the app,
**I want** all two-panel layouts to use their full available width,
**so that** content is not squished into half the screen.

### Acceptance Criteria

1. City tab (ST admin) renders as two equal panels (~50% each)
2. Ordeals & XP tab (player) has correct padding in both halves
3. Story tab (player) renders correctly at full width
4. Tickets tab (player) is redesigned as two-panel: submit form on left, ticket list on right
5. A shared CSS pattern (or documented convention) for two-panel layouts is established — no new custom `-split` class per tab needed

### Dev Notes

- The `-split` / `-left` / `-right` grid system exists in `player-layout.css` and is consistent
- Root cause is likely a container max-width or missing `width: 100%` on a wrapper — audit the tab content containers in `admin.html` and `index.html`
- Tickets tab currently single-column in `public/js/player/tickets-tab.js` — restructure to two-panel
- Files: `public/css/player-layout.css`, `public/css/admin-layout.css`, `public/js/player/tickets-tab.js`, `index.html`, `admin.html`

---

## Story CR-3: Status & Power Visualisation (Player)

**Backlog items:** 4, 5

**As a** player viewing the Status tab,
**I want** to see a clear hierarchical view of city, clan, and covenant standing with defined apex slots that loom visually,
**so that** I can immediately understand where I and others stand in the power structure.

### Acceptance Criteria

1. Status tab displays three views: City Status (1–10), Clan Status (1–5), Covenant Status (1–5)
2. City Status appears screen-wide above the existing clan/covenant columns
3. Each view uses the shared slot architecture:
   - **Apex slot** (rank 5 / city rank 10): full-width prominent card, large typography, gold border — displays even when vacant
   - **High seats** (rank 4 / city ranks 9–8): two cards side by side, imposing but smaller than apex — display even when vacant
   - **Open floor** (ranks 1–3 / city ranks 7 and below): compact character rows, scrollable
4. City Status slot caps: 1@10 | 2@9 | 2@8 | 3@7 | 3@6 | 4@5 | 4@4 | open below
5. Clan/Covenant slot caps: 1@5 | 2@4 | open below
6. Composite dot display: solid gold dots (●) for innate status, lighter/outlined variant (◐) for title-derived bonus
7. Active player's character is highlighted (existing `.status-row-me` pattern)
8. Vacant apex and high-seat slots render as placeholder cards (not hidden)

### Dev Notes

- Current status tab: `public/js/player/status-tab.js` — two-column clan/covenant layout
- Characters have `status.clan`, `status.covenant`, `status.city` fields (verify field names)
- Title-derived boost: characters have court positions; the boost amount needs to be defined — confirm how title bonuses map to numeric status values (e.g., Head of State = +3 city status)
- Slot architecture is shared across all three status types — build as one reusable component
- Extends existing dot system: `●` inherent, `◐` or similar for title-derived
- Files: `public/js/player/status-tab.js`, `public/css/player-layout.css`

---

## Story CR-4: Sphere / Influence View (ST Admin)

**Backlog item:** 18

**As a** Storyteller viewing the City tab,
**I want** a clear per-sphere view of influence rankings with slot caps visible,
**so that** I can track who holds influence across domains and whether positions are filled or vacant.

### Acceptance Criteria

1. ST admin city tab displays an influence/sphere section showing all spheres
2. Each sphere shows: sphere name, slot caps, ranked character list (or compact cards) with current holders
3. Vacant slots are clearly indicated
4. Design is functional/administrative — not the theatrical "looming" treatment of the player status view
5. Editability: ST can update sphere rankings from this view (or confirm this is read-only)

### Dev Notes

- Current admin city view: `public/js/admin/city-views.js` — Ascendancy charts + Prestige switchable views
- Sphere names = influence domain names already in the system
- Sphere slot caps need to be confirmed — are they the same structure as status (1 at max, 2 at next), or domain-specific?
- Confirm whether sphere rankings are stored per-character or in a separate collection
- Files: `public/js/admin/city-views.js`, `public/css/admin-layout.css`

---

## Story CR-5: Modal Theming Audit

**Backlog item:** 21

**As a** user of the admin or player app,
**I want** all modals to use the parchment theme consistently,
**so that** the app feels visually cohesive.

### Acceptance Criteria

1. All modals audited against the established parchment modal pattern (`.plm-*` namespace)
2. "Add new character" modal brought into line with parchment standard
3. Any other modals missing parchment modality identified and fixed
4. No new modal CSS classes introduced — existing `.plm-*` pattern extended if needed

### Dev Notes

- Reference modal pattern: `.plm-overlay`, `.plm-dialog`, `.plm-header` in `public/css/player-layout.css`
- Admin uses its own modal patterns (`.dt-*`) — confirm which admin modals need parchment treatment
- Files: `public/css/player-layout.css`, `public/css/admin-layout.css`, any JS files rendering modals

---

## Story CR-6: Favicon — Game App

**Backlog item:** 1

**As a** player using the game app (index.html),
**I want** a favicon to appear in the browser tab,
**so that** the tab is identifiable.

### Acceptance Criteria

1. `public/index.html` includes `<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">`
2. Favicon asset exists at `public/assets/favicon.svg` (or correct path)
3. Favicon displays in browser tab

### Dev Notes

- Admin.html already has a favicon — copy the same link tag to index.html
- Verify asset path matches what admin.html uses
- Files: `public/index.html`
