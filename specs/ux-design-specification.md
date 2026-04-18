---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - index.html
  - public/js/editor/sheet.js
  - public/css/player-layout.css
  - public/css/components.css
  - specs/prd.md
---

# UX Design Specification — TM Suite

**Author:** Angelus
**Date:** 2026-04-17

---

<!-- UX design content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

### Project Vision

A player-facing, read-only character sheet view for the Terra Mortis player portal. Single-column layout replacing the current three-column desktop editor split. The monolith `index.html` is the structural reference (top-to-bottom content flow) but all CSS, components, and design tokens come from the current suite — no monolith styles are carried forward.

A static HTML mockup will be produced for stakeholder review before any implementation begins.

### Target Users

Players on the TM Suite player portal (`player.html`), desktop-first. They are viewing their own character sheet — checking stats, merits, disciplines, and live tracks. No editing. The view must be readable at a glance without hunting across columns.

### Key Design Challenges

1. **Column collapse** — The three-column layout (Attributes | Skills | Disciplines) must be rethought for a single column. Internal sub-grids (e.g. 3×3 attribute grid, 3-column skill grid) can be preserved within the column — these are layout decisions to resolve in the mockup phase.
2. **Discipline section depth** — Without column splitting, the discipline section (expandable rows + power drawers) will be taller. The existing `.disc-tap-row` / `.disc-drawer` pattern is kept as-is; the section simply stacks vertically.
3. **Live tracks in an otherwise static view** — Vitae, Willpower, and Influence tracks are interactive (click to spend/recover). The design must make this interactive zone legible within what is otherwise a read-only display.

### Design Opportunities

1. Removing all edit affordances lets the design system breathe — gold dots, chips, and dark surface tiers become a clean character dossier rather than a form.
2. The single-column flow is naturally document-like and atmospheric, consistent with the live-game tablet context.
3. Adding the missing tracks (Vitae, Willpower, Influence) completes the character picture that was absent from the current player sheet.

---

## Core User Experience

### Defining Experience

Players open the sheet primarily to check their current state — tracks, stats, and what their character can do — before or during game, or while planning downtime. The single most important interaction is reading the character at a glance: Vitae, Willpower, Influence tracks first, then attributes and skills, then disciplines and merits as needed.

The live track interaction (spending/recovering Vitae, Willpower, Influence) is the only interactive zone in an otherwise read-only view. Everything else is display.

### Platform Strategy

Desktop web, mouse and keyboard. No offline requirement. The player portal (`player.html`) is already desktop-first; this sheet view continues that convention. No responsive breakpoints required for the initial implementation.

### Effortless Interactions

- **Track state** — Vitae, Willpower, and Influence tracks are prominent near the top; players can see and interact with them without scrolling.
- **Attribute and skill scanning** — Internal grids (3×3 attributes, 3-column skills) are preserved within the single column so density is maintained without horizontal hunting.
- **Discipline lookup at the table** — Expandable discipline drawers (existing `.disc-tap-row` / `.disc-drawer` pattern) let players tap to recall a power's cost, pool, and effect without leaving the sheet.

### Critical Success Moments

- **2-second state read** — Player opens the sheet and within 2 seconds knows their Vitae, Willpower, and current health. Tracks live near the top, not buried below stats.
- **Single scroll** — All character content is in one column; the player scrolls down for progressively more detail (attributes → skills → disciplines → merits) rather than switching tabs or scanning columns.

### Experience Principles

1. **Read first** — Every element exists to be read, not edited. Layout and typography serve legibility above all else.
2. **Tracks are live** — The interactive zone (Vitae / Willpower / Influence) is visually distinct from the static display without being jarring.
3. **Current CSS, not monolith** — The visual language is the evolved suite design system applied to a single-column context. No regression to old styles.
4. **Mockup before code** — A static HTML preview is produced and reviewed before any implementation touches the actual sheet renderer.

---

---

## Desired Emotional Response

### Primary Emotional Goals

- **Ownership** — The sheet is an identity document, not a database record. Opening it should feel like picking up your character's dossier: "This is who I am tonight."
- **Confidence** — Stats, pools, and tracks are readable at a glance. The player arrives at the table knowing their numbers without hunting.
- **Immersion** — The dark gothic aesthetic (Cinzel headings, gold dot displays, deep surface tiers) reinforces the game world rather than breaking it. It feels like the game, not a web form.
- **Calm** — Even at a busy live table, the layout is legible and uncluttered. Information is where you expect it.

### Emotional Journey Mapping

- **On open** — Immediate orientation: tracks at the top communicate current state (Vitae, Willpower, Influence) before the player has scrolled at all.
- **During use** — Smooth scroll through progressively more detailed information. Disciplines expand on demand; merits are grouped and readable without visual noise.
- **After task** — Player closes the sheet having confirmed what they needed; no residual confusion about where something was.

### Micro-Emotions

- **Confidence over confusion** — Section ordering and visual hierarchy eliminate guesswork.
- **Trust over scepticism** — Derived stats and tracks reflect correct game-state; the sheet is authoritative.
- **Belonging** — The gothic aesthetic places the player inside the game world, not outside it looking at data.

### Design Implications

- **Ownership → single scroll, no tab switching** — The whole character is one document, read top to bottom.
- **Confidence → tracks near top** — Vitae, Willpower, and Influence appear before attributes, not after.
- **Immersion → no edit affordances** — No inputs, spinners, or breakdown panels visible. The view is purely presentational.
- **Calm → existing CSS, not new design** — The suite's established visual language is already calibrated for the context; applying it consistently avoids visual surprise.

### Emotional Design Principles

1. Identity before data — the header and visual treatment communicate character identity before any number is read.
2. State before capability — tracks (current state) appear before attributes/skills/disciplines (capability).
3. No tool feeling — nothing in the view should look like a form or an editor.

---

## UX Pattern Analysis & Inspiration

### Inspiring Products Analysis

The primary design reference is the TM Suite itself. The existing suite CSS (dark theme tokens, dot displays, expandable rows, chip patterns, merit sections) is already calibrated for the game context and represents the accumulated design evolution of the project. No external competitor analysis is required — the reference points are internal:

- **Current multi-column player sheet** — structural anti-reference; content to carry forward, column architecture to discard
- **Original monolith `index.html`** — structural reference only; its single-column scrolling approach is the layout model. Its CSS is explicitly excluded.
- **Status tab and Spheres view** — recent work using chips, pyramid slots, and avatar patterns that demonstrate the design system at its current state of evolution

### Transferable UX Patterns

**Adopt directly — proven in the suite, carry forward unchanged:**
- `.disc-tap-row` / `.disc-drawer` expandable discipline rows
- Dot display system (`●○`) with `.trait-row` / `.trait-right` layout
- `.sh-sec` / `.sh-sec-title` section containers and headings
- Chip pattern (avatar + name pills) from status tab and spheres view
- Gold accent (`--gold2`) on high-value elements and dot fills

**Adapt for single-column context:**
- 3×3 attribute grid and 3-column skill grid — internal grids preserved within a single outer column; the outer column split is removed, the inner grids remain
- Stats strip — horizontal layout works as-is in single column
- Merit sections — read-only variant strips all inputs, retains grouped layout and dot displays

### Anti-Patterns to Avoid

- **Three-column editor split** — `.tab-split`, editor column containers, and any layout that assumes horizontal pane divisions
- **Edit affordances in view mode** — no `.bd-panel`, no CP/XP spinners, no add/remove buttons, no `.merit-bd-row` inputs
- **Monolith CSS regression** — no class names, inline styles, or layout patterns from the original `index.html`
- **Tab-per-section navigation** — all character content in one scrollable column; no tabbed sub-navigation within the sheet view

### Design Inspiration Strategy

**Adopt:** All current suite component CSS and design tokens. The visual language is settled; apply it consistently.

**Adapt:** Section ordering resequenced to put live tracks near the top (state before capability). Internal grids retained within a single outer column.

**Avoid:** Any pattern that introduces editing affordances, column splitting, or tab-switching into what should be a clean, single-scroll character document.

---

## Design System Foundation

### Design System Choice

TM Suite custom CSS — hand-authored, already in production. No external framework.

### Rationale for Selection

The design system is pre-existing and fully evolved. Introducing any external framework (Material, Tailwind, Chakra) would conflict with the established token vocabulary, component patterns, and gothic aesthetic. The correct decision is to extend the existing system with new layout classes only where the single-column context requires them.

### Implementation Approach

- All CSS custom properties from `:root` (dark theme tokens: `--bg`, `--surf*`, `--gold*`, `--crim`, `--txt*`, `--bdr`, `--accent`) used directly
- Typography: Cinzel / Cinzel Decorative for headings, Lora for body (loaded via Google Fonts CDN)
- Existing component classes reused: `.sh-sec`, `.sh-sec-title`, `.trait-row`, `.trait-right`, `.trait-dots`, `.disc-tap-row`, `.disc-drawer`, `.merit-list`, chip patterns
- New layout classes added only for single-column container, track zone, and any structural elements not already in the system

### Customisation Strategy

Minimal. The single-column view reuses existing classes wherever possible. New classes cover:
- Outer column container (max-width, padding, margin)
- Track zone layout (Vitae / Willpower / Influence interactive boxes)
- Any read-only display variants where edit-mode classes would cause visual confusion

---

## Core Interaction Design

### Defining Experience

"Open your sheet, know your state, scroll for detail."

The player opens their character sheet. Before scrolling, they can see their current Vitae, Willpower, and Influence tracks. They scroll through a single natural column — identity → tracks → stats → disciplines → merits — in the same order they would read a character document. If they need to recall a discipline power at the table, one tap expands the drawer.

### User Mental Model

Players already think of a character sheet as a document read top-to-bottom. The single-column layout matches that mental model directly. The current three-column editor split fights it by requiring horizontal scanning and tab switching. Removing that friction is the primary structural change.

### Success Criteria

- Live tracks (Vitae, Willpower, Influence) are visible without scrolling
- Discipline power detail is one tap away from any discipline row
- No edit affordance is visible anywhere — the sheet reads as a document, not a form
- The player can identify their character's current state within 2 seconds of opening the sheet

### Pattern Type: Established

Scrollable document with expand-on-demand detail. No novel interaction design required. The track toggle uses the already-understood tap-to-mark pattern from the existing system.

### Track Interaction Mechanics

1. **Initiation** — Player taps a track cell (Vitae / Willpower / Influence)
2. **Interaction** — Cell toggles between filled and empty state
3. **Feedback** — Immediate visual change; no confirm step
4. **Completion** — Track reflects current game state persistently

---

## Visual Design Foundation

### Colour System

All tokens inherited from existing `:root` declarations. No new colour decisions required.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0D0B09` | Page background |
| `--surf1` | `#141210` | Primary surface |
| `--surf2` | `#1C1916` | Raised surface (cards, panels) |
| `--surf3` | `#252119` | Elevated surface (inputs, badges) |
| `--gold2` | `#E0C47A` | Primary accent — dot fills, headings, borders |
| `--crim` | `#8B0000` | Damage / aggravated states |
| `--txt` | `#F0EAE0` | Primary text |
| `--txt1` | `#C8C0B0` | Secondary text |
| `--txt3` | `#8A8070` | Muted text, labels |
| `--bdr` | `#2E2A24` | Borders and dividers |

### Typography System

Inherited from existing suite. No new font decisions required.

- **Headings:** Cinzel / Cinzel Decorative (gothic serif, Google Fonts CDN)
- **Body:** Lora (readable serif, Google Fonts CDN)
- **Monospace / numeric:** System fallback where needed

Type scale follows existing `.sh-sec-title`, `.trait-row`, and label classes.

### Spacing and Layout Foundation

- **Base unit:** 8px
- **Section gaps:** 16–24px (`margin-top` on `.sh-sec`)
- **Component padding:** 6–12px internal
- **Single-column max-width:** To be confirmed in mockup — likely 720px or uncapped within the player portal's content area
- **Grid systems:** Internal 3×3 attribute grid and 3-column skill grid preserved within the column; no outer column splitting

### Accessibility

Gold-on-dark contrast maintained throughout. No new accessibility considerations introduced by the layout change.

---

### Constraints

- All CSS from the current suite (`player-layout.css`, `components.css`, `suite.css`, theme tokens) is used directly — no regression to monolith styles.
- No edit mode, no breakdown panels, no CP/XP inputs, no add/remove controls.
- Mockup is a static HTML file served via live server for review before implementation.
