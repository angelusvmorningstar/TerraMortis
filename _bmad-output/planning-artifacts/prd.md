---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain-skipped', 'step-06-innovation-skipped', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
status: complete
completedDate: '2026-03-29'
classification:
  projectType: web_app
  domain: general
  complexity: low-medium
  projectContext: brownfield
inputDocuments:
  - product-brief-tm-suite.md
  - product-brief-tm-suite-distillate.md
  - CLAUDE.md
  - HANDOVER_v3.md
  - HANDOVER_v4.md
  - schema_v2_proposal.md
  - integration_plan.md
documentCounts:
  briefs: 2
  research: 0
  brainstorming: 0
  projectDocs: 5
workflowType: 'prd'
---

# Product Requirements Document - TM Suite

**Author:** Angelus
**Date:** 29 March 2026

## Executive Summary

The TM Suite is the operational platform for Terra Mortis, a 30+ player Vampire: The Requiem 2nd Edition parlour LARP running monthly in Sydney. It consolidates character management, live game mechanics (dice rolling, contested rolls, feeding, resistance checks), territory tracking, downtime processing, and player access into a single browser-based application.

The current system works but doesn't scale. Two monolithic single-file HTML apps (~6,000 lines total) share a design language but not a codebase or data schema. All CSS, JS, and HTML are inline. Iteration is slow, collaboration produces merge conflicts, and every change risks breaking something. The first downtime cycle for 30 characters consumed a week of volunteer time. Live at game, the ST must cross-reference PDFs, character sheets, and dice manually - each pause breaking the story's momentum.

This is a brownfield restructure: the features exist, the data exists (30+ characters, 203+ merits, 42 devotions, full VtR 2e rule encoding), and the UI works. The work is to re-architect this into a maintainable, modular codebase that two contributors can develop in parallel - then extend it into a player-facing portal with Discord authentication.

### What Makes This Special

The TM Suite is not a generic RPG tool or virtual tabletop. It is a purpose-built rules engine that knows both VtR 2e mechanics and the specific characters, merits, disciplines, and house rules of Terra Mortis. The data corpus - years of domain encoding - is the core asset. Generic tools store character sheets; this tool *runs the game*. Fetch a player, fetch a rule, get a result. The gap between "something happens" and "here's the outcome" collapses to a tap.

The architecture is deliberately constrained: static site, no backend, single JSON data source. This eliminates server maintenance, account management, and privacy liability for a volunteer-run organisation. The constraint is a feature. The codebase is also an explicit learning environment - every pattern chosen must be teachable, not just functional.

## Project Classification

- **Project Type:** Web application (static SPA, no backend)
- **Domain:** General (LARP administration / domain-specific productivity tool)
- **Complexity:** Low-medium (complex business logic in VtR 2e rules, low infrastructure complexity)
- **Project Context:** Brownfield (two working apps, ~6,000 lines, active use)

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
- **No regressions:** Every feature that works today (character list, sheet view, editing, dice rolling, resistance checks, territory tracking, session tracker) still works after restructure.
- **Performance parity:** Page loads and interactions are no slower than the current single-file implementation. Tab switching and character lookup remain near-instant.
- **Shared theme:** One CSS file defines the design system, consistent with the campaign website. Changing a colour updates it everywhere.
- **Separation of concerns:** CSS, JS, HTML, and data are in separate files. Feature logic (rolling, editing, territory) is modular.

### Measurable Outcomes

- Zero increase in time-to-interactive vs current single-file app
- Downtime cycle: 1 day (from ~7 days)
- Merge conflicts from simultaneous development: eliminated
- Number of files touched to change a theme colour: 1
- Number of data schemas in active use: 1 (v2)

## User Journeys

### Journey 1: Angelus - Live Game (Primary, Success Path)

It's 5:45pm on a Saturday. Angelus arrives at the venue, opens the TM Suite on his iPad. Thirty players are filing in. By 6:00pm, doors open and the sign-in rush begins.

Previously, feeding scenes were the bottleneck - each player needs their hunting roll resolved before game begins at 6:30pm. With feeding moved to downtime processing (handled before game day), sign-in is now about checking in, not resolving mechanics.

Game starts. A Carthian player approaches a Lancea character at a gathering. Words are exchanged. The Carthian tries to use Majesty. Angelus taps the Carthian's name in the suite, sees their Discipline dots and pool instantly, taps Roll. The result appears: 3 successes. He taps the target, sees their Composure + Blood Potency resistance pool already calculated. One tap, contested roll resolved. The scene continues without breaking stride.

Later, a territory dispute escalates. Angelus opens the Territory tab, sees the current holdings, the influence generation, who controls what. Two factions want the same zone. The mechanics are right there - no flipping through PDFs, no cross-referencing spreadsheets.

Three hours of game. Every rules question answered in taps. The story never stopped for admin.

**Capabilities revealed:** Character lookup, dice rolling with pre-loaded pools, contested roll workflow, territory display, resistance checks, mobile/tablet-optimised ST view.

### Journey 2: Angelus - Between Games (Primary, Admin Path)

It's Sunday morning after game. Angelus opens the TM Suite on his desktop. Last night's game generated consequences: a character lost a territory zone, another gained a merit through MCI, two characters formed a coterie with shared domain.

He opens the Editor view. Updates the territory holdings. Adjusts the merit on the MCI character - the derived merit system automatically recalculates grants and checks prerequisites. Updates the shared domain between the coterie members - the sharing maths (CP + XP only, capped at 5) handles itself.

A player messages asking about their XP spend options. Angelus pulls up their sheet, sees the breakdown: XP total, XP spent, what they can afford. Sends a quick answer.

Thursday: downtime submissions close. Thirty characters have submitted actions via the downtime system. Angelus works through them over the evening - the suite pulls up each character's relevant stats alongside their submission. What used to take a week now takes a day because the data, the rules, and the processing are all in one place.

**Capabilities revealed:** Character editing, merit manipulation (MCI grants, domain sharing), XP tracking, downtime processing, territory management.

### Journey 3: Rules ST - At Game (Secondary, Light Use)

Marcus is one of the two Rules STs. He's also playing a character tonight. A player approaches him mid-scene with a contested Social Manoeuvre. Marcus pulls his phone out, opens the suite, searches for the two characters involved. He can see both pools, taps through the roll. Result on screen. He announces the outcome and gets back into character.

He doesn't edit anything. He doesn't need the Editor. He needs fast read access to character sheets and a dice roller that knows the pools. The mobile-friendly ST Suite gives him exactly that.

**Capabilities revealed:** Phone-friendly read-only character access, dice rolling, pool calculation. No editing required.

### Journey 4: Player - Between Games (Future Phase)

It's Monday after game. A player logs in via Discord to the player portal. They can see their character sheet - attributes, skills, merits, disciplines, XP remaining. They check what happened to their territory holdings after last night's contested zone.

Downtime submissions open. They select their feeding approach for next game (resolving what used to be a 30-minute bottleneck at sign-in). They submit their downtime actions - investigating a rival's holdings, spending XP on a new merit, building influence in the Media sphere.

They can't see other players' sheets. They can't edit their own data. They can read, submit, and plan.

**Capabilities revealed:** Discord authentication, player-specific character view, downtime submission, feeding choice submission, territory visibility (own holdings). Read-only, no editing.

### Journey 5: Peter - Development (Tertiary)

Peter picks up a GitHub issue: "Add Professional Training grant system." He pulls the latest code, opens the project. The file structure is clear - `js/merits/standing.js` is obviously where standing merit logic lives. He doesn't need to search through a 3,000-line file.

He builds the feature, tests it against the 6 fake test characters (Viktor Ashwood mirrors the complexity of a real PT character). He pushes a branch. Angelus reviews. No merge conflicts because Peter was working in the merits module while Angelus was updating territory logic in a completely separate file.

**Capabilities revealed:** Modular file structure, test data separation, parallel development, clear code organisation.

### Journey Requirements Summary

| Journey | Key Capabilities |
|---------|-----------------|
| ST at game | Character lookup, pool calculation, dice rolling, contested rolls, territory view, tablet UI |
| ST between games | Character editing, merit system (MCI, domain, PT), XP tracking, downtime processing, territory management |
| Rules ST at game | Phone-friendly read access, dice rolling, pool calculation |
| Player between games | Discord auth, read-only character view, downtime submission, feeding selection |
| Developer | Modular codebase, test data, parallel development |

## Web Application Specific Requirements

### Project-Type Overview

Static Single Page Application (SPA) built with vanilla HTML/CSS/JS. No framework, no build step, no backend server. The app loads character data from a single JSON file hosted in the GitHub repo and dynamically renders all views and interactions client-side. Tab switching and view changes happen without page reloads.

### Technical Architecture Considerations

**Application Model:** SPA with client-side routing via tab/view switching (existing pattern preserved). All data loaded on init from a single JSON file. No server-side rendering.

**Data Source:** Character data JSON lives in the GitHub repository as the single source of truth. The Editor commits changes back to the repo (via GitHub API or similar). All ST devices at game read from the same repo-hosted JSON. No real-time sync needed - pull latest from GitHub is sufficient. This mirrors the current practice of a shared Excel on Dropbox.

**Browser Support:** Modern browsers only (Chrome, Safari, Firefox). No IE11 or legacy browser support. Primary targets: Safari on iPad (ST use), Safari/Chrome on mobile (Rules STs and future player access).

**Responsive Design:**
- ST Suite (Roll, Sheet, Territory, Tracker): Already mobile/tablet-friendly - preserve existing responsive behaviour
- Editor (character editing, list view): Desktop-first, tablet-friendliness not required for MVP
- Player portal (future): Must be mobile-friendly from the start

**Performance Targets:**
- Time-to-interactive: No slower than current single-file implementation
- Tab/view switching: Near-instant (current baseline)
- Character lookup: Near-instant (current baseline)
- JSON data load: Brief initial load acceptable; all subsequent interactions instant
- No build step required for development - open HTML file, refresh browser

**SEO:** Not required. Internal tool.

**Accessibility:**
- Standard web accessibility practices (semantic HTML, keyboard navigation, sufficient colour contrast)
- No specific requirements flagged yet; build with WCAG 2.1 AA as baseline to avoid retrofit

### Implementation Considerations

**No Build Step:** Edit file, refresh browser. No webpack, no bundler, no transpilation. ES modules via `<script type="module">` are acceptable for modern browsers.

**Static Deployment:** GitHub Pages. The app is a folder of files served statically.

**Offline Capability:** Not required for MVP. Consider service worker for offline access as a Vision feature.

## Project Scoping and Phased Development

### MVP Strategy and Philosophy

**MVP Approach:** Problem-solving MVP. The existing features work. The problem is the codebase - it blocks collaboration, iteration, and extension. The MVP delivers the same functionality in an architecture that two developers can work with confidently.

**Resource Requirements:** Two developers (Angelus learning, Peter mentoring). No additional resources needed. Development uses the existing toolchain: VS Code, Git/GitHub, Claude Code, BMAD.

### MVP Feature Set (Phase 1 - Restructure and Integrate)

**Core User Journeys Supported:**
- ST at game (Journey 1): All existing Roll/Sheet/Territory/Tracker functionality preserved
- ST between games (Journey 2): All existing Editor functionality preserved
- Rules ST at game (Journey 3): Phone-friendly read/roll access preserved
- Developer (Journey 5): Modular codebase enabling parallel development

**Must-Have Capabilities:**
- File separation: CSS, JS, HTML, and data in separate, well-organised files
- Shared design system: Single CSS theme file consistent with campaign website
- Unified data: Single v2 JSON schema as sole data source, hosted in GitHub repo
- Externalised reference data: MERITS_DB, DEVOTIONS_DB, MAN_DB, ICONS as separate files
- Test data separation: 6 fake test characters for development, real data in separate JSON
- Rewrite Territory tab from React to vanilla JS for codebase consistency
- All existing features preserved with no regressions
- Performance parity with current single-file implementation

**Design Decisions (confirmed):**
- Editor is a between-games desktop tool only; no tablet optimisation needed for MVP
- No character editing at live game - too easy to make bad choices in the moment
- No build step - edit file, refresh browser
- SPA architecture with tab/view switching

**Incremental Delivery (within Phase 1):**

| Sub-phase | Deliverable | Value |
|-----------|-------------|-------|
| 1a | File separation (CSS, JS, data extracted from monoliths) | Can find and edit code without fear |
| 1b | Shared theme CSS | Change a colour once, updates everywhere |
| 1c | Unified v2 JSON data layer | One schema, one source of truth |
| 1d | Merge Editor and Suite into single SPA | One app, one codebase |

Each sub-phase delivers standalone value. No sub-phase depends on a later one.

### Post-MVP Features

**Phase 2 (Growth):**
- Downtime capture and processing system (soft deadline: 8 April 2026 - Peter investigating)
- Automated feeding rolls, territory bidding, contested roll workflows
- Wire remaining MCI benefit_grants on test characters
- Professional Training grant system
- Status and BP/Humanity editing
- `features` field rendering
- Print character sheet generation
- GitHub API integration for Editor to commit changes back to repo

**Phase 3 (Vision):**
- Discord-based player authentication and portal (Journey 4)
- Player-facing character creation wizard
- Automated downtime resolution engine
- Session replay / chronicle logging
- Mobile-friendly player views
- Forkable architecture for other VtR 2e chronicles
- Offline capability via service worker

### Risk Mitigation Strategy

**Technical Risks:**
- *Regression during restructure:* Mitigate by delivering incrementally (1a/1b/1c/1d), testing each sub-phase against the 6 test characters before proceeding
- *React-to-vanilla rewrite of Territory tab:* Contained risk - ~248 lines, isolated feature. If it stalls, keep React temporarily
- *Schema migration breaks data:* Known data issues exist (Gel, Magda, Kirk Grimm, Conrad). Document and test edge cases explicitly

**Resource Risks:**
- *Single learning developer:* Peter provides mentorship and can unblock. BMAD workflow provides structure. Each sub-phase is small enough to complete independently
- *Peter's availability:* Architecture and patterns should be documented clearly enough that Angelus can continue solo if needed

**Scope Risks:**
- *Downtime deadline (8 April):* Growth feature, not MVP. If the restructure isn't done by then, the existing Google Form interim continues to work. Don't let the deadline pull scope into the MVP

## Functional Requirements

### Character Data Management

- FR1: ST can load all character data from a single v2 JSON file hosted in the GitHub repository
- FR2: ST can view a list of all characters, filterable by clan and covenant
- FR3: ST can search for a character by name
- FR4: ST can view a read-only character sheet displaying all attributes, skills, disciplines, merits, powers, touchstones, banes, aspirations, and ordeals
- FR5: ST can enter edit mode on a character to modify any field
- FR6: ST can save character changes, which persists to the data source
- FR7: System calculates and displays derived stats (size, speed, defence, health, willpower max, vitae max) at render time, never stored
- FR8: System separates test character data (6 fake characters) from real character data (30+ characters)

### XP and Creation Point Tracking

- FR9: ST can view a character's XP total, XP spent, and XP remaining
- FR10: ST can view and edit creation point allocation (CP, Free, XP, UP) for attributes, skills, disciplines, and merits
- FR11: System calculates dot values from XP costs using flat rates (Attributes: 4/dot, Skills: 2/dot, Clan Disciplines: 3/dot, Out-of-clan: 4/dot, Merits: 1/dot)
- FR12: ST can view and manage XP log (earned and spent breakdowns)

### Merit System

- FR13: ST can add, edit, and remove merits from a character
- FR14: System validates merit prerequisites against character stats before allowing selection
- FR15: ST can manage merit categories: general, influence, domain, standing, and manoeuvre
- FR16: ST can configure Mystery Cult Initiation (MCI) with per-dot-level benefit grants
- FR17: System derives merits from active MCI benefit grants at render time, checking prerequisites
- FR18: ST can suspend/activate MCI merits, hiding or showing derived grants
- FR19: ST can manage domain merits (Safe Place, Haven, Herd) with shared partner tracking
- FR20: System calculates domain merit sharing (CP + XP shareable, Free stays with owner, capped at 5)
- FR21: ST can manage Professional Training merits with asset skills
- FR22: ST can view and manage manoeuvres (fighting styles) with expandable rank details
- FR23: ST can track Unaccounted Points (UP) as a visible but mechanically inert parking spot

### Dice Rolling

- FR24: ST can construct a dice pool by selecting a character and an action (attribute + skill or other pool components)
- FR25: ST can add or subtract modifiers to a dice pool
- FR26: ST can set roll parameters: 10-again, 9-again, 8-again, rote, chance die
- FR27: System rolls the dice pool and displays individual die results with successes highlighted
- FR28: ST can perform resistance checks with pre-calculated resistance pools
- FR29: ST can perform contested rolls between two characters
- FR30: Rules ST can access dice rolling and character pools from a mobile device

### Territory Management

- FR31: ST can view current territory holdings by zone
- FR32: ST can view influence generation from territory assets
- FR33: ST can update territory ownership and contest results
- FR34: ST can manage territory bids between factions

### Session Tracking

- FR35: ST can track session data using the Tracker tab
- FR36: ST can store and retrieve tracker data per character

### Influence System

- FR37: ST can view influence generation from merits (standard merits: 1 at 3 dots, 2 at 5 dots; narrow status/MCI: 1 at 5 dots; clan/covenant status: 1 per dot)
- FR38: ST can view influence across 16 spheres (Bureaucracy, Church, Finance, Health, High Society, Industry, Legal, Media, Military, Occult, Police, Politics, Street, Transportation, Underworld, University)

### Reference Data

- FR39: System provides searchable access to merits database (203+ entries with prerequisites and descriptions)
- FR40: System provides searchable access to devotions database (42 entries: 31 general + 11 bloodline-exclusive)
- FR41: System provides access to manoeuvre definitions
- FR42: System provides clan, covenant, mask, and dirge reference data

### Data Export and Interoperability

- FR43: ST can export character data
- FR44: System can load character data from the GitHub-hosted JSON

### Design System

- FR45: System presents a consistent visual theme across all views, matching the campaign website design language
- FR46: System uses a single shared CSS theme file for all styling
- FR47: System renders correctly on tablet (ST Suite views) and desktop (Editor views)
- FR48: System renders correctly on mobile for read-only and dice rolling views

## Non-Functional Requirements

### Performance

- NFR1: Tab/view switching completes in under 100ms (current baseline is near-instant)
- NFR2: Character lookup and sheet rendering completes in under 500ms
- NFR3: Dice roll results display within 200ms of tap
- NFR4: Initial app load (including JSON data fetch) completes in under 3 seconds on a standard connection
- NFR5: Restructured multi-file app performs no worse than the current single-file implementation on any interaction

### Security

- NFR6: Real character data (30+ characters) is not included in the deployed application during development; only test data is deployed
- NFR7: No credentials, API keys, or sensitive configuration are stored in the repository
- NFR8: Future player portal phase must ensure players can only access their own character data (not applicable to MVP)

### Accessibility

- NFR9: All interactive elements are keyboard-navigable
- NFR10: Colour contrast meets WCAG 2.1 AA minimum ratios (the existing dark theme with gold on dark surfaces should be verified)
- NFR11: Semantic HTML used for structure (headings, lists, buttons, not just divs)

### Integration

- NFR12: Application reads character data from a JSON file in the GitHub repository
- NFR13: Editor saves/exports character data in v2 JSON schema format compatible with the repository source
- NFR14: Application loads Google Fonts (Cinzel, Cinzel Decorative, Lora) from CDN

### Maintainability

- NFR15: No single JS file exceeds 500 lines (enforcing modular decomposition)
- NFR16: CSS custom properties (design tokens) are defined in one file and used throughout - no hardcoded colour values outside the theme file
- NFR17: Reference data (MERITS_DB, DEVOTIONS_DB, MAN_DB) stored as separate JSON files, not inline in JS
- NFR18: Code organisation follows a predictable, documented file structure that a learning developer can navigate without guidance
