# Epic Restructure Proposal — v3

**Author:** Angelus (Project Lead) + Bob (SM) + Winston (Architect)
**Date:** 1 April 2026
**Status:** Active
**Supersedes:** Epic Restructure Proposal v2 (31 March 2026)

---

## Executive Summary

v3 reflects three developments since v2:

1. **Epic 4 (Downtime System) stories 4.1–4.6 are done.** Built ahead of schedule on the dev branch.
2. **Discord auth for ST login is live.** Epic 2 story 2.2 is complete in practice.
3. **Player Access Layer architecture is complete.** A new epic (Epic 5) replaces the old Epic 6 (Player Portal) with a fundamentally different design: single app, role-based views, character-aware downtime form replacing Google Forms, and an atomic publish workflow.

### What changed from v2

| v2 position | What happened | v3 position |
|---|---|---|
| Epic 4 stories 4.1–4.6 | Built and committed to dev | Marked done |
| Epic 4 story 4.7 (Discord auth) | Absorbed into Player Access Layer | Removed from Epic 4 |
| Epic 5: Live Game App | Renumbered | Epic 6 |
| Epic 6: Player Portal | Replaced by Player Access Layer architecture | Epic 5 (new scope) |
| — | Public website split out from old Player Portal | Epic 7 (new) |

### Key design decisions (new in v3)

1. **Player Access Layer is a role-based extension, not a separate app.** Same backend, separate `player.html` entry point (mobile-first), shared JS modules.
2. **`players` collection** sits between auth and character data. Maps Discord ID to role, characters, and ordeals.
3. **Downtime submission is character-aware.** Replaces Google Forms with structured subdocuments (11 domains). Progressive enhancement: Level 1 (section gating) → Level 2 (smart dropdowns) → Level 3 (full validation).
4. **Atomic publish via MongoDB transaction.** ST reviews and stages everything, one button makes it all live.
5. **Ordeal tracking splits player-level and character-level.** Setting/Rules ordeals persist across characters. Questionnaire/History are per-character.

### Priority order

**Immediate:** Epic 2 (finish 2.5 + 2.6) — completes the backend foundation
**Next:** Epic 3 (ST Admin Features) — ST tools before player tools
**Then:** Epic 5 (Player Access Layer) — the major new work
**Later:** Epic 6 (Live Game App) — once character rendering is stable on the API
**Last:** Epic 7 (Public Website) — depends on everything above

---

## Dependency Map

```
Epic 1 (DONE) --> Epic 2 (Backend Foundation) --+
                                                 +--> Epic 3 (ST Admin Features) --+
                                                 |                                  |
                              Epic 4 (DONE) -----+                                  +--> Epic 7 (Public Website)
                                                 |                                  |
                                                 +--> Epic 5 (Player Access) ------+
                                                 |
                                                 +--> Epic 6 (Live Game App) ------+
```

---

## Epic 1: Foundation Restructure — DONE

**Goal:** Same functionality, maintainable modular architecture.

**Status:** Complete. Single SPA, modular JS/CSS, v2 data layer, shared accessors.

**Done stories (pre-restructure numbering):** 2.1 (Character Administration), 2.2 (MCI Benefit Grants) — character admin features built on the Epic 1 foundation. They carry forward.

---

## Epic 2: Backend Foundation

**Goal:** Stand up the shared infrastructure that all products build on. Prove the full stack end-to-end with the admin app rendering character data from MongoDB.

**Prerequisites:** Epic 1 (done).

**Architecture reference:** `specs/architecture-st-admin.md`

| Story | Title | Status | Notes |
|---|---|---|---|
| 2.1 | Express API Server + MongoDB Connection | **Done** | Express on Render, Atlas connection, health check |
| 2.2 | Discord Auth | **Done** | Server-side OAuth2, ST whitelist, auth middleware |
| 2.3 | Characters CRUD API + Data Migration | **Done** | `/api/characters` routes, migration script |
| 2.4 | Admin App Shell | **Done** | `admin.html`, sidebar nav, four domains, character list from API |
| 2.5 | Remaining Collection APIs | Backlog | `/api/territories`, `/api/tracker_state`, `/api/session_logs`, `/api/downtime_cycles`, `/api/downtime_submissions` |
| 2.6 | Game App API Integration | Backlog | `loader.js` dual-mode, Netlify deployment config |

---

## Epic 3: ST Admin Features

**Goal:** Complete the character editing and rendering features in the admin app. Player and City domain building blocks.

**Prerequisites:** Epic 2 (backend foundation).

**Previously completed:** Stories 2.1 (Character Administration) and 2.2 (MCI Benefit Grants) from the old numbering. These features exist in the current SPA and work once wired to the API.

| Story | Title | Notes |
|---|---|---|
| 3.1 | Professional Training Grant System | Pure rendering/logic. Reads `role` field on PT merits, applies asset skills and dot-level benefits. Player domain. |
| 3.2 | Print Character Sheet | Print-formatted character sheet with print-optimised CSS. Player domain. |
| 3.3 | Session Log | Log data layer (`session_logs` collection), roll logging from Engine domain, log viewer UI. |
| 3.4 | City Domain Views | Territory management desktop layout, city dynamics, holdings, influence display. City domain in admin sidebar. |

---

## Epic 4: Downtime System — DONE

**Goal:** Integrate Peter's standalone downtime helper into the admin app's Downtime domain, bridging it with character data via the API so a full 30-character downtime cycle can be processed efficiently.

**Prerequisites:** Epic 2 (backend foundation).

**Status:** Complete. All stories committed to dev branch. Story 4.7 (Discord auth for access control) was absorbed into Epic 5 (Player Access Layer).

| Story | Title | Status | Notes |
|---|---|---|---|
| 4.1 | Module Conversion | **Done** | ES modules, API calls via `downtime/db.js`, CSS aligned with `theme.css` |
| 4.2 | Character Data Bridge | **Done** | Connect to `characters` collection, name matching |
| 4.3 | Feeding Roll Resolution | **Done** | Feeding pool from character data, batch rolls |
| 4.4 | ST Notes and Hidden Annotations | **Done** | Per-submission `st_notes` with `visibility: 'st_only'` |
| 4.5 | Outcome Approval and Application | **Done** | Approval workflow, write-back to character data |
| 4.6 | Cycle History and Comparison | **Done** | View closed cycles, compare across cycles |

---

## Epic 5: Player Access Layer

**Goal:** Extend the TM Suite with role-based access so players can view their characters, submit downtimes, track ordeals, and receive published outcomes — all through a mobile-first portal that shares the same backend as the ST admin app.

**Prerequisites:** Epic 2 (backend foundation). Epic 3 stories are nice-to-have (derived merits affect sheets) but not blockers.

**Architecture reference:** `specs/architecture-player-access.md`

| Story | Title | Notes |
|---|---|---|
| 5.1 | Players Collection + Role Middleware | New `players` MongoDB collection. Extend `auth.js` with role resolution, `requireRole()` middleware. Move ST whitelist from env to DB. Role-filtered API responses. |
| 5.2 | Player HTML Shell + Auth Redirect | `player.html` entry point (mobile-first). `player-layout.css`. Auth callback redirects by role (ST → admin, player → player). Bidirectional role switching for dual-role users. |
| 5.3 | Read-Only Character Sheet | Player view of their character(s). Wraps `editor/sheet.js` with edit controls stripped. Character selector for multi-character players. |
| 5.4 | Downtime Submission Form (Level 1) | Character-aware form replacing Google Forms. 11 domain sections with section gating (show/hide based on character data). Player types manually. Deadline enforcement (soft + hard). |
| 5.5 | ST Publish Workflow | Atomic MongoDB transaction: publish all approved outcomes, apply character mutations, set cycle status. Confirmation safeguard modal. `stripStReview()` for player API responses. |
| 5.6 | Ordeals + Story Tab + Archive | Ordeal tracking (split: player-level for setting/rules/covenant, character-level for questionnaire/history). XP cascade on approval. Story tab (dossier, published outcomes, historical DTs). Archive tab for retired characters. |
| 5.7 | Character Creator Wizard | Guided creation flow: identity, attributes, skills, merits (filtered), powers, review + submit. First character auto-approved, subsequent require ST sign-off. Character locked after approval. |
| 5.8 | Downtime Form Levels 2 + 3 | Level 2: smart dropdowns from character data, pool builder, merit picker. Level 3: auto-calculated totals, XP budget validation, influence caps, cross-submission validation. |

**What carries forward from Epic 4:** The ST-side downtime processing (CSV parser, dashboard, feeding rolls, approval workflow, cycle management) is already built. Epic 5 adds the player-side submission and the publish gate that connects ST processing to player visibility.

---

## Epic 6: Live Game App

**Goal:** Tablet-friendly ST interface for live games. Read-only character sheets, quick rolls, rules reference, territory display, downtime lookup with ST notes.

**Prerequisites:** Epic 3 stories 3.1–3.2 (so derived merits render correctly in read-only sheets).

| Story | Title | Notes |
|---|---|---|
| 6.1 | Game Mode Shell and Navigation | Game app hides edit controls, shows streamlined tablet layout. Bottom nav, 600px max. |
| 6.2 | Read-Only Character Sheet | Reuse `renderSheet()` with edit controls stripped. Tablet-optimised. |
| 6.3 | Quick Roll Workflows | Territory bid, social manoeuvre, resistance check — contested roll automation. Results logged to session log. |
| 6.4 | Downtime Lookup | Read-only view of current cycle submissions for any character. ST notes visible. |
| 6.5 | Live Status Tracker | Per-character at-game state: Vitae, Willpower, Health, Conditions. Reset-all for session start. |
| 6.6 | Rules Quick Reference | Collapsible panels: roll mechanics, resistance formulas, discipline summaries, merit effects. Searchable. |

**Design note:** Game app and admin app share JS modules. Improvements to character rendering in the admin app automatically improve the game app. Players who have completed the Rules ordeal may get access to dice/rules features in the game app.

---

## Epic 7: Public Website

**Goal:** Public-facing landing page and authenticated player portal with shared resources (lore, rules, errata).

**Prerequisites:** Epics 2–5 stable.

| Story | Title | Notes |
|---|---|---|
| 7.1 | Public Landing Page | `terramortislarp.com` home page. About the game, next game date (not location). No auth required. |
| 7.2 | Player Resources Portal | Authenticated section (Discord login, player + ST whitelist). Setting primer, player guide, errata, rules references. Gated behind general Discord membership. |
| 7.3 | Lore Library | Authenticated players access campaign lore documents. ST controls visibility (public/restricted). |

**Last priority.** ST tools and player access must be stable before opening shared resources.

---

## Suggested Sequencing

**Immediate (April 2026):**
- Epic 2: Stories 2.5–2.6 (finish backend foundation)
- Epic 3: Start ST admin features

**Near-term (May 2026):**
- Epic 3: Complete 3.1–3.4
- Epic 5: Stories 5.1–5.3 (player access foundation)

**Mid-term (June–July 2026):**
- Epic 5: Stories 5.4–5.7 (player features)
- Epic 6: Stories 6.1–6.2 (game mode shell)

**When ready:**
- Epic 5: Story 5.8 (form enhancement)
- Epic 6: Stories 6.3–6.6 (game mode features)
- Epic 7: After all ST + player tools are stable
