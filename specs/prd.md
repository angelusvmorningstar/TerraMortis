---
status: approved
version: "1.0"
date: "2026-03-29"
author: Angelus
projectType: web_app
projectContext: brownfield
complexity: low-medium
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - HANDOVER_v4.md
  - integration_plan.md
  - README.md
  - CLAUDE.md
  - data/schema_v2_proposal.md
workflowType: prd
---

# Product Requirements Document - TM Suite

**Author:** Angelus
**Date:** 29 March 2026

## Executive Summary

The TM Suite is the operational platform for Terra Mortis, a 30+ player Vampire: The Requiem 2nd Edition parlour LARP running monthly in Sydney. It consolidates character management, live game mechanics (dice rolling, contested rolls, resistance checks), territory tracking, downtime processing, and player access into a single browser-based application.

The current system works but does not scale. Two monolithic single-file HTML apps (~6,000 lines total) share a design language but not a codebase or data schema. All CSS, JS, and HTML are inline. Iteration is slow, collaboration produces merge conflicts, and every change risks breaking something. The first downtime cycle for 30 characters consumed a week of volunteer time. Live at game, the ST must cross-reference PDFs, character sheets, and dice manually -- each pause breaking the story's momentum.

This is a brownfield restructure: the features exist, the data exists (30+ characters, 203+ merits, 42 devotions, full VtR 2e rule encoding), and the UI works. The work is to re-architect this into a maintainable, modular codebase that two contributors can develop in parallel -- then extend it into a player-facing portal with Discord authentication.

### What Makes This Special

The TM Suite is not a generic RPG tool. It is a purpose-built rules engine that knows both VtR 2e mechanics and the specific characters, merits, disciplines, and house rules of Terra Mortis. The data corpus -- years of domain encoding -- is the core asset. Generic tools store character sheets; this tool *runs the game*. The gap between "something happens" and "here is the outcome" collapses to a tap.

The architecture is deliberately constrained: static site, no backend, single JSON data source. This eliminates server maintenance, account management, and privacy liability for a volunteer-run organisation. The constraint is a feature. The codebase is also an explicit learning environment -- every pattern must be teachable, not just functional.

## Project Classification

| Field | Value |
|---|---|
| Project Type | Web application (static SPA, no backend) |
| Domain | LARP administration / domain-specific productivity tool |
| Complexity | Low-medium (complex VtR 2e business logic, low infrastructure) |
| Context | Brownfield (two working apps, ~6,000 lines, active use in production) |
| Deployment | GitHub Pages (static, no server) |
| Data | localStorage + GitHub-hosted JSON, single v2 schema |

## Success Criteria

### User Success

- **Live game flow:** ST can look up any character, select an action, and see dice results without leaving the app or consulting external references. Current near-instant load times are preserved after restructure.
- **Downtime processing:** A full 30-character downtime cycle can be processed in a single day, down from a week of volunteer time.
- **Player self-service:** Players can view their own character sheet and relevant campaign information without going through the ST.
- **Rule iteration:** House rules, merits, and mechanical changes can be updated in the data and reflected in the app without touching multiple files or risking breakage elsewhere.

### Business Success

- **Collaborative development:** Two contributors can work on separate features in parallel without merge conflicts from monolithic files.
- **Approachable codebase:** A developer learning architecture can navigate the project, understand the structure, and make changes confidently. File names and module boundaries make the purpose of each piece obvious.
- **Operational simplicity:** Deploys as a static site with no server, no accounts, and no ongoing maintenance cost for a volunteer-run organisation.

### Technical Success

- **Single data source:** One v2 JSON schema is the sole source of truth for all character data across all views and tools.
- **No regressions:** Every feature that works today still works after restructure.
- **Performance parity:** Page loads and interactions are no slower than the current single-file implementation.
- **Shared theme:** One CSS file defines the design system. Changing a colour updates it everywhere.
- **Separation of concerns:** CSS, JS, HTML, and data are in separate files. Feature logic is modular.

### Measurable Outcomes

| Metric | Target | Current |
|---|---|---|
| Time-to-interactive | No increase | Near-instant |
| Downtime cycle duration | 1 day | ~7 days |
| Simultaneous dev merge conflicts | 0 | Frequent |
| Files touched to change theme colour | 1 | 2+ |
| Active data schemas | 1 (v2) | 2 (v1 + v2) |

## User Journeys

### Journey 1: Angelus - Live Game (Primary, Success Path)

It is 5:45pm Saturday. Angelus opens the TM Suite on his iPad. Thirty players are filing in. Game starts at 6:30pm.

A Carthian player attempts Majesty on a Lancea character. Angelus taps the Carthian's name, sees their Discipline dots and pool, taps Roll. Three successes. He taps the target, sees their Composure + Blood Potency resistance pool already calculated. One contested roll resolved. The scene continues without breaking stride.

Later, a territory dispute escalates. Angelus opens the Territory tab, sees the current holdings and influence generation. Two factions want the same zone. The mechanics are right there -- no PDFs, no cross-referencing.

**Capabilities revealed:** Character lookup, dice rolling with pre-loaded pools, contested roll workflow, territory display, resistance checks, tablet-optimised ST view.

### Journey 2: Angelus - Between Games (Primary, Admin Path)

Sunday morning after game. Angelus opens the Editor on his desktop. Last night generated consequences: a character lost territory, another gained a merit through MCI, two characters formed a coterie with shared domain.

He updates territory holdings. Adjusts the MCI merit -- derived merit grants recalculate and check prerequisites automatically. Updates the shared domain between coterie members -- sharing maths (CP + XP only, capped at 5) handles itself.

Thursday: thirty downtime submissions to process. The suite pulls up each character's relevant stats alongside their submission. What used to take a week takes a day.

**Capabilities revealed:** Character editing, merit manipulation (MCI grants, domain sharing), XP tracking, downtime processing, territory management.

### Journey 3: Marcus - Rules ST at Game (Secondary)

Marcus is an RST also playing a character. A player presents a contested Social Manoeuvre mid-scene. Marcus pulls his phone, opens the suite, finds both characters. Sees both pools, taps through the roll. Result on screen. He announces and gets back into character.

He does not need the Editor. Fast read access and a dice roller that knows the pools is sufficient.

**Capabilities revealed:** Phone-friendly read-only character access, dice rolling, pool calculation.

### Journey 4: Player - Between Games (Future, Phase 3)

Monday after game. A player logs in via Discord. They see their character sheet -- attributes, skills, merits, disciplines, XP remaining. They check their territory holdings. They submit their feeding approach for next game and downtime actions. They cannot see other players' sheets or edit their own data.

**Capabilities revealed:** Discord authentication, player-specific character view, downtime submission, feeding choice, territory visibility (own holdings only).

### Journey 5: Peter - Development (Tertiary)

Peter picks up a GitHub issue: "Add Professional Training grant system." He pulls the latest code. The file structure is clear -- `js/merits/standing.js` is obviously where standing merit logic lives. He builds the feature, tests it against 6 fake test characters. He pushes a branch. No merge conflicts because Peter was in the merits module while Angelus was in territory logic.

**Capabilities revealed:** Modular file structure, test data separation, parallel development, clear code organisation.

## Technical Architecture

### Application Model

Static SPA with client-side routing via tab/view switching. No framework, no build step, no backend server. All data loaded on init from a single JSON file. Tab switching and view changes happen without page reloads.

No build step: edit file, refresh browser. ES modules via `<script type="module">` are acceptable for modern browsers.

### Data Architecture

Character data JSON lives in the GitHub repository as the single source of truth. The Editor commits changes back to the repo (via GitHub API or direct download/upload). All ST devices at game read from the same repo-hosted JSON. No real-time sync needed -- pull latest from GitHub is sufficient.

**v2 Schema rules (from `data/chars_v2.schema.json`):**
- Attributes are always `{ dots, bonus }` objects, never bare integers
- Skills are always `{ dots, bonus, specs: [], nine_again }` objects
- Merits are a single array with a `category` field (general/influence/domain/standing/manoeuvre)
- Derived stats are never stored -- calculated at render time from stored values
- XP fields store actual XP cost; dots derived via `xpToDots(xpCost, baseBefore, costPerDot)`

### XP Cost Rates (VtR 2e flat)

| Trait | XP/dot |
|---|---|
| Attributes | 4 |
| Skills | 2 |
| Clan Disciplines | 3 |
| Out-of-clan / Ritual | 4 |
| Merits | 1 |
| Devotions | variable (per DEVOTIONS_DB) |

### Shared Accessor Layer

Rather than direct data access at 90+ call sites, all data access routes through shared functions. This is required for the Suite to read v2 format:

```js
attrDots(c, a), attrBonus(c, a), attrTotal(c, a)
skDots(c, s), skBonus(c, s), skTotal(c, s), skSpecs(c, s)
meritsByCategory(c, cat), influenceMerits(c), domainMerits(c)
influenceTotal(c), domainRating(c, name)
powersByCategory(c, cat), discDots(c, name)
```

### Responsive Design

| View | Target Device | Edit Access |
|---|---|---|
| ST Suite (Roll/Sheet/Territory/Tracker) | iPad + mobile | Read + roll only |
| Editor (list/sheet/edit) | Desktop | Full edit |
| Player portal (Phase 3) | Mobile-first | Read + submit |

### Browser Support

Modern browsers only: Chrome, Safari, Firefox. Primary targets: Safari on iPad (ST use), Safari/Chrome on mobile (Rules STs and future player access).

### Deployment

GitHub Pages. The app is a folder of static files served from the `public/` directory. CI/CD via GitHub Actions on push to `main`.

## Current State and Known Issues

### What Exists (as of HANDOVER_v4)

| File | Lines | Purpose |
|---|---|---|
| `public/tm_editor.html` | ~3,121 | Character editor: list/sheet/edit views, full v2 schema |
| `public/index.html` | ~2,900 | ST Suite: Roll/Sheet/Territory/Tracker tabs |
| `data/chars_v2.json` | -- | 30 characters in v2 format |
| `data/tm_characters.json` | -- | 30 characters in old format (Suite currently reads this) |

The Editor reads v2 natively. The Suite reads the old format. They share a design language but not a data schema or codebase.

### Known Data Issues

- **Gel and Magda:** Skills XP is 1 total, not per-skill -- will cause incorrect dot calculations
- **Kirk Grimm:** `Intelligence` XP = 5 (not divisible by 4, fractional dots result)
- **Conrad:** Discipline dot splits were manually corrected and may have errors
- **5 characters:** `features` field populated but not yet rendered

### Reference Data (baked into editor JS, to be externalised)

- `MERITS_DB`: 203+ entries with prerequisites and descriptions
- `DEVOTIONS_DB`: 42 entries (31 general + 11 bloodline-exclusive)
- `MAN_DB`: manoeuvre definitions
- `CLAN_BANES`, `BLOODLINE_DISCS`: clan and bloodline reference

## Project Scoping and Phased Delivery

### Phase 1 -- Foundation Restructure (MVP)

**Goal:** Same functionality, maintainable architecture. Two developers can work in parallel.

| Sub-phase | Deliverable | Value delivered |
|---|---|---|
| 1a | File separation (CSS, JS, data extracted from monoliths) | Can find and edit code without fear |
| 1b | Shared theme CSS | Change a colour once, updates everywhere |
| 1c | Unified v2 JSON data layer, accessor functions | One schema, one source of truth |
| 1d | Merge Editor and Suite into single SPA | One app, one codebase |

Each sub-phase delivers standalone value and does not depend on a later one.

### Phase 2 -- Operational Enhancement

**Goal:** Reduce ST workload for downtime and game administration.

- Downtime capture and processing system (soft deadline: 8 April 2026)
- Automated feeding rolls, territory bidding, contested roll workflows
- MCI benefit_grants wired on test characters
- Professional Training grant system
- Status and BP/Humanity editing UI
- `features` field rendering
- Print character sheet generation
- GitHub API integration (Editor commits changes back to repo)

### Phase 3 -- Player Portal (Vision)

**Goal:** Player self-service. Remove ST as bottleneck for information access.

- Discord-based player authentication
- Player-facing character sheet (read-only)
- Downtime submission (feeding, actions, XP spend requests)
- Territory visibility (own holdings)
- Mobile-first design
- Forkable architecture for other VtR 2e chronicles

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Regression during restructure | Medium | High | Incremental sub-phases; test against 6 fake characters before advancing |
| Territory tab React-to-vanilla rewrite stalls | Low | Low | ~248 lines, isolated. Keep React temporarily if needed |
| Schema migration breaks known-bad data | High | Medium | Document Gel/Magda/Kirk/Conrad edge cases; test explicitly |
| Downtime Phase 2 deadline (8 April) pulled into MVP | Medium | Medium | Interim Google Form continues to work; do not let deadline inflate MVP scope |
| Peter unavailability | Low | Medium | Document architecture and patterns so Angelus can continue solo |

## Functional Requirements

### Epic 1: Foundation Restructure

See: `specs/prd/epic-1-foundation-restructure.md`

### Epic 2: Operational Enhancement

See: `specs/prd/epic-2-operational-enhancement.md`

### Epic 3: Player Portal

See: `specs/prd/epic-3-player-portal.md`

## Non-Functional Requirements

### Performance

- NFR1: Tab/view switching completes in under 100ms (current baseline is near-instant)
- NFR2: Character lookup and sheet rendering completes in under 500ms
- NFR3: Dice roll results display within 200ms of tap
- NFR4: Initial app load (including JSON data fetch) completes in under 3 seconds on a standard connection
- NFR5: Restructured multi-file app performs no worse than current single-file implementation on any interaction

### Security

- NFR6: Real character data (30+ characters) is not included in the deployed application during development; only test data is deployed
- NFR7: No credentials, API keys, or sensitive configuration are stored in the repository
- NFR8: Future player portal phase must ensure players can only access their own character data

### Accessibility

- NFR9: All interactive elements are keyboard-navigable
- NFR10: Colour contrast meets WCAG 2.1 AA minimum ratios (existing dark theme with gold on dark surfaces to be verified)
- NFR11: Semantic HTML used for structure (headings, lists, buttons -- not just divs)

### Integration

- NFR12: Application reads character data from a JSON file in the GitHub repository
- NFR13: Editor saves/exports character data in v2 JSON schema format compatible with the repository source
- NFR14: Application loads Google Fonts (Cinzel, Cinzel Decorative, Lora) from CDN

### Maintainability

- NFR15: No single JS file exceeds 500 lines (enforcing modular decomposition)
- NFR16: CSS custom properties (design tokens) are defined in one file and used throughout -- no hardcoded colour values outside the theme file
- NFR17: Reference data (MERITS_DB, DEVOTIONS_DB, MAN_DB) stored as separate JSON files, not inline in JS
- NFR18: Code organisation follows a predictable, documented file structure that a learning developer can navigate without guidance

### Conventions

- British English throughout: Defence, Armour, Vigour, Honour, Socialise
- No em-dashes in output text
- Dots display: `'●'.repeat(n)` using U+25CF filled circle
- Gold accent: `#E0C47A` (CSS var `--gold2`)
- Font stack: Cinzel / Cinzel Decorative for headings, Lora for body (Google Fonts CDN)
- CSS custom properties on `:root`: dark theme with `--bg: #0D0B09`, `--surf*` surface tiers, `--gold*` accent tiers, `--crim: #8B0000` for damage states
