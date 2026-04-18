---
stepsCompleted: [1, 2, 3]
status: complete
date: 2026-04-19
author: Angelus
inputDocuments:
  - specs/prd.md
  - specs/architecture/system-map.md
  - Conversation: Sally UX workshopping session 2026-04-19
---

# UX Design Specification — Unified App Navigation

**Author:** Angelus
**Date:** 2026-04-19
**Status:** Decision-captured (ready for architecture and implementation planning)

---

## Executive Summary

### The Problem

Terra Mortis currently has two overlapping frontends: a game app (`index.html`) and a player portal (`player.html`). They duplicate significant functionality — feeding roll, character sheet, city view — causing maintenance burden and inconsistent experiences. Navigation in the game app uses 6–7 bottom tabs with no clear hierarchy between immediate game needs and reference tools.

The ST is standing at a venue with a phone in their hand. They need the dice roller in under two seconds. They should not have to think about which app to open.

### The Solution

**One unified app. Role determines what you see. Context determines what surfaces.**

Replace the two-app model with a single unified mobile-first application. The bottom nav carries only the reflexive game-day actions. Everything else lives in a role-aware app grid reached via a "More" tab.

---

## Three-Product Structure

| Product | Primary Device | Optimised For | Who Uses It |
|---|---|---|---|
| **Unified game app** (new `index.html`) | Phone | Mobile-first, 1-col, 44px+ tap targets | Players + STs at game and between sessions |
| **Admin portal** (`admin.html`) | Desktop | Desktop-first, tablet-aware (not phone-optimised) | STs for management and processing tasks |
| **Public website** (`website/`) | Any | Already responsive | Anyone |

### Why admin stays desktop-first

Admin portal tasks — DT processing, character editing, attendance management, city management — are inherently complex, multi-panel operations. Forcing them onto a phone would be miserable by design. An iPad on the table next to a laptop during ST processing is a realistic scenario; tablet-aware layout is appropriate. Phone is not the target.

---

## Unified Game App — Navigation Architecture

### Primary Nav (Bottom Bar — Always Visible)

Four permanent tabs. These are the reflexive game-day actions:

| Tab | Icon | What It Does | Who Sees It |
|---|---|---|---|
| **Dice** | Die face | Dice roller — custom pool builder, modifiers, history | Everyone |
| **Sheet** | Document | Character sheet — player sees own, ST gets character picker | Everyone |
| **Map** | Territory grid | City/territory map | Everyone |
| **More** | Grid / ··· | App grid launcher | Everyone — contents vary by role |

### The Role-Aware More Grid

Tapping "More" opens a full-screen grid of app icons. Visibility is determined by the user's role at login.

| App | Player | ST | Notes |
|---|---|---|---|
| Status | ✓ | ✓ | Court hierarchy, prestige ladders |
| Who's Who | ✓ | ✓ | Active character roster with affiliations |
| DT Report | ✓ | ✓ | Published downtime narrative — read-only |
| Feeding | ✓ | ✓ | See lifecycle section below |
| Primer | ✓ | ✓ | Setting overview for new/returning players |
| Game Guide | ✓ | ✓ | How to play — rules summary |
| Rules | ✓ | ✓ | Full rules database lookup |
| DT Submission | ✓ | — | Submit downtime actions |
| Ordeals | ✓ | — | Ordeal submission and progress |
| Tracker | — | ✓ | Live vitae/WP/influence for all characters |
| Sign-In | — | ✓ | Game night attendance and starting resources |
| Emergency Contacts | — | ✓ | One-tap safety information per character |

---

## Platform-Aware Character Sheet

One sheet implementation. One codebase. The sheet renders based on the viewport:

- **Phone (≤768px):** Single-column layout. Attributes, skills, disciplines stack vertically. Large touch targets. No editor controls.
- **Tablet (768–1024px):** Two-column layout where density permits.
- **Desktop (>1024px):** Full multi-column layout with editor access (if role permits).

**For players:** Sheet tab shows their own character. No editing.
**For STs:** Sheet tab opens a character picker (chips grid), then renders the selected character's sheet. ST can view any character.

This replaces the current model where character sheet exists separately in `index.html` (suite) and `player.html` (portal). One implementation, adapted by context.

---

## Lifecycle-Aware Contextual Cards

The app is aware of the current game cycle phase. Certain features surface contextually rather than occupying permanent real estate.

### Feeding (Pre-game ritual, not at-game action)

Feeding is most important in the window **after downtimes are released and before game starts**. Players rolling early prevents bottlenecks at the door.

**Behaviour by phase:**

| Cycle Phase | Feeding Surface |
|---|---|
| Downtime closed / processing | Feeding hidden |
| Outcomes published / game phase open | **"Your feeding roll is ready"** card appears on home screen or Sheet tab; Feeding icon in More grid becomes highlighted |
| Post-game / cycle closed | Feeding shows historical result only |

Feeding does **not** occupy a permanent bottom tab. It lives in the More grid and promotes contextually when active.

### Downtime Deadline

When a downtime cycle is open and approaching its deadline, a **"Downtime due [date]"** contextual card surfaces in the More grid or on a home surface.

This follows the same principle: surface what's relevant *right now*, don't permanently clutter the nav with things that are only periodically relevant.

---

## Navigation Design Principles

### 1. Reflexive primary nav
The four bottom tabs must be reachable without thought. Muscle memory. A player who has used the app three times should never have to hunt for the dice roller.

### 2. Role determines visibility, not app URL
The ST and player experience the same app, the same nav, the same sheet. Role filters the More grid and the character picker scope. No separate logins to different URLs.

### 3. Context promotes relevance
The app knows where you are in the game cycle. Feeding, downtime deadline, and sign-in surface when they matter and recede when they don't.

### 4. Desktop features stay on desktop
Long-form input (DT submission, ordeal responses, character editing) may have a simplified mobile path in the More grid, but the full-power version is desktop. Forcing complex forms onto phones is bad UX.

### 5. One implementation, many contexts
Every feature exists once. Feeding is implemented once. The sheet is implemented once. Context (role, viewport, cycle phase) changes the presentation, not the code.

---

## What Moves, What Stays, What Goes

### Unified game app inherits from both current apps:

| Feature | Current location | Unified app location |
|---|---|---|
| Dice roller | `index.html` Roll tab | Primary nav — Dice |
| Character sheet | Both apps (duplicated) | Primary nav — Sheet (one impl) |
| Territory/map | `index.html` Territory tab | Primary nav — Map |
| Feeding roll | Both apps (duplicated) | More grid — Feeding (one impl) |
| Tracker (all chars) | `index.html` Tracker tab | More grid — Tracker (ST only) |
| Status/court | `index.html` Status tab | More grid — Status |
| Rules | `index.html` Rules tab | More grid — Rules |
| City/Who's Who | `admin.html` City domain | More grid — Status + Who's Who |
| DT Report | `player.html` Story tab | More grid — DT Report |
| DT Submission | `player.html` (desktop) | More grid — DT Submission (player only) |
| Sign-In | `index.html` Sign-In tab (new) | More grid — Sign-In (ST only) |

### Admin portal retains:
- Character editor
- DT processing panel
- Attendance management
- Player management
- City/court administration
- Data portability

### Deprecated / consolidated:
- `player.html` — superseded by unified game app. May remain as desktop-optimised redirect or legacy access point.
- Duplicate feeding implementations — one remains.
- Duplicate sheet implementations — one remains.

---

## Open Questions (for future planning)

1. **`player.html` fate** — full retirement, redirect, or maintained as desktop-only DT form surface?
2. **Home screen** — does the unified app have a "home" view (lifecycle card dashboard) or does it open directly to the Dice tab?
3. **Offline / low-signal** — game venues can have poor connectivity. What degrades gracefully vs what requires network?
4. **Notification model** — how does the app alert players that feeding is open or DT is due? Push notification, in-app badge, or passive card only?

---

## Implementation Notes

This specification describes the **target UX state**. Implementation is a separate planning exercise. The primary structural work required:

- Unify `index.html` and `player.html` into a single entry point with role-aware rendering
- Implement the More grid app launcher component
- Lifecycle-phase detection to drive contextual card surfacing
- Sheet component receives viewport + role signals and adapts layout

Existing work that already supports this direction:
- Single-column sheet CSS breakpoints (EPB.2) ✓
- Character chips in game app (EPB.6) ✓
- Role-aware nav in suite app (applyRoleRestrictions) ✓
- Sign-in tab with API-backed attendance (EPC.4) ✓
- Tracker state in MongoDB (EPA.2) ✓
