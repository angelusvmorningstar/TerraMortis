# Epic 1: Foundation Restructure

**Status:** In Progress
**Priority:** MVP
**Phase:** 1 (Restructure and Integrate)

## Goal

Deliver the same functionality in a maintainable, modular architecture. Two developers can work on separate features in parallel without merge conflicts. A learning developer can navigate the codebase without guidance.

## Scope

All features present in `public/tm_editor.html` and `public/index.html` are preserved with no regressions. The deliverable is identical behaviour from a modular codebase.

## Sub-phases (sequential, each independently deployable)

| Sub-phase | Deliverable |
|---|---|
| 1a | File separation: CSS, JS, and reference data extracted from monolithic HTML files |
| 1b | Shared theme CSS: single design token file, consistent across all views |
| 1c | Unified v2 data layer: Suite migrated to read v2 schema via shared accessor functions |
| 1d | Single SPA: Editor and Suite merged into one application with shared nav |

## Functional Requirements

### FR-1-01: File Separation

- FR-1-01a: All CSS is extracted from inline `<style>` blocks into separate `.css` files
- FR-1-01b: All JavaScript is extracted from inline `<script>` blocks into separate `.js` module files
- FR-1-01c: Reference data (MERITS_DB, DEVOTIONS_DB, MAN_DB) is extracted from JS into separate JSON files
- FR-1-01d: No single JS file exceeds 500 lines
- FR-1-01e: HTML files contain only structure and script/link imports

### FR-1-02: Shared Design System

- FR-1-02a: One CSS file (`css/theme.css`) defines all CSS custom properties (design tokens)
- FR-1-02b: No hardcoded colour values outside `theme.css`
- FR-1-02c: Changing a colour in `theme.css` updates all views
- FR-1-02d: Theme is consistent with the campaign website design language
- FR-1-02e: Dark theme with `--bg: #0D0B09`, `--gold2: #E0C47A`, `--crim: #8B0000` as primary design tokens

### FR-1-03: Unified v2 Data Layer

- FR-1-03a: Both Editor and Suite read from a single v2 JSON file (`data/chars_v2.json`)
- FR-1-03b: Old-format data (`data/tm_characters.json`) is retired once Suite migration is complete
- FR-1-03c: A shared accessor module (`js/data/accessors.js`) provides all data access functions
- FR-1-03d: No direct `char.attributes[name]` or `char.skills[s]` access outside the accessor module
- FR-1-03e: ~25 Suite data access points are refactored to use v2 accessors (see `integration_plan.md`)
- FR-1-03f: Test data (6 fake characters) is separated from real data (30+ characters); only test data is deployed to the public site during development

### FR-1-04: Single SPA Merge

- FR-1-04a: Editor views (list, sheet, edit) and Suite tabs (Roll, Sheet, Territory, Tracker) are accessible from a single HTML file
- FR-1-04b: Navigation between Editor and Suite is seamless (no page reload)
- FR-1-04c: All existing Editor functionality is preserved: character list (filterable by clan/covenant), sheet view, edit mode, save to localStorage
- FR-1-04d: All existing Suite functionality is preserved: Roll tab with pool construction and dice rolling, Sheet tab, Territory tab, Tracker tab
- FR-1-04e: Territory tab is rewritten from React to vanilla JS for codebase consistency (~248 lines, isolated feature)

### FR-1-05: Character Data Management (preserved from current)

- FR-1-05a: ST can load all character data from a single v2 JSON file hosted in the GitHub repository
- FR-1-05b: ST can view a list of all characters, filterable by clan and covenant, searchable by name
- FR-1-05c: ST can view a read-only character sheet displaying all attributes, skills, disciplines, merits, powers, touchstones, banes, aspirations, and ordeals
- FR-1-05d: ST can enter edit mode to modify any field on a character
- FR-1-05e: ST can save character changes to localStorage
- FR-1-05f: System calculates and displays derived stats at render time (size, speed, defence, health, willpower max, vitae max) -- never stored
- FR-1-05g: System renders all 9 attributes as `{ dots, bonus }` pairs; displays total (dots + bonus) in all roll pools

### FR-1-06: XP and Creation Point Tracking (preserved)

- FR-1-06a: ST can view a character's XP total, XP spent, and XP remaining
- FR-1-06b: ST can view and edit creation point allocation (CP, Free, XP, UP) for attributes, skills, disciplines, and merits
- FR-1-06c: System calculates dot values from XP costs using flat rates (Attributes: 4/dot, Skills: 2/dot, Clan Disciplines: 3/dot, Out-of-clan: 4/dot, Merits: 1/dot)
- FR-1-06d: ST can view and manage XP log (earned and spent breakdowns)

### FR-1-07: Merit System (preserved)

- FR-1-07a: ST can add, edit, and remove merits from a character
- FR-1-07b: System validates merit prerequisites against character stats before allowing selection
- FR-1-07c: ST can manage merit categories: general, influence, domain, standing, and manoeuvre
- FR-1-07d: ST can configure Mystery Cult Initiation (MCI) with per-dot-level benefit grants
- FR-1-07e: System derives merits from active MCI benefit grants at render time, checking prerequisites
- FR-1-07f: ST can suspend/activate MCI merits, hiding or showing derived grants
- FR-1-07g: ST can manage domain merits (Safe Place, Haven, Herd) with shared partner tracking
- FR-1-07h: System calculates domain merit sharing (CP + XP shareable, Free stays with owner, capped at 5)
- FR-1-07i: ST can manage manoeuvres (fighting styles) with expandable rank details
- FR-1-07j: ST can track Unaccounted Points (UP) as a visible but mechanically inert parking spot

### FR-1-08: Dice Rolling (preserved)

- FR-1-08a: ST can construct a dice pool by selecting a character and action (attribute + skill or other pool components)
- FR-1-08b: ST can add or subtract modifiers to a dice pool
- FR-1-08c: ST can set roll parameters: 10-again, 9-again, 8-again, rote, chance die
- FR-1-08d: System rolls the dice pool and displays individual die results with successes highlighted
- FR-1-08e: ST can perform resistance checks with pre-calculated resistance pools
- FR-1-08f: ST can perform contested rolls between two characters
- FR-1-08g: Rules ST can access dice rolling and character pools from a mobile device

### FR-1-09: Territory Management (preserved, rewritten to vanilla JS)

- FR-1-09a: ST can view current territory holdings by zone
- FR-1-09b: ST can view influence generation from territory assets
- FR-1-09c: ST can update territory ownership and contest results
- FR-1-09d: ST can manage territory bids between factions

### FR-1-10: Session Tracking (preserved)

- FR-1-10a: ST can track session data using the Tracker tab
- FR-1-10b: Tracker data is stored and retrieved per character (localStorage key: `tm_tracker_<name>`)

### FR-1-11: Influence System (preserved)

- FR-1-11a: ST can view influence generation from merits (standard merits: 1 at 3 dots, 2 at 5 dots; narrow status/MCI: 1 at 5 dots; clan/covenant status: 1 per dot)
- FR-1-11b: Influence is displayed across 16 spheres: Bureaucracy, Church, Finance, Health, High Society, Industry, Legal, Media, Military, Occult, Police, Politics, Street, Transportation, Underworld, University

### FR-1-12: Reference Data (preserved)

- FR-1-12a: System provides searchable access to merits database (203+ entries with prerequisites and descriptions), externalised to JSON
- FR-1-12b: System provides searchable access to devotions database (42 entries: 31 general + 11 bloodline-exclusive), externalised to JSON
- FR-1-12c: System provides access to manoeuvre definitions, externalised to JSON
- FR-1-12d: System provides clan (5), covenant (5), mask/dirge (26) reference data

### FR-1-13: Deployment

- FR-1-13a: App deploys to GitHub Pages on push to `main` via GitHub Actions
- FR-1-13b: Deployable artefacts live in `public/`
- FR-1-13c: App loads Google Fonts (Cinzel, Cinzel Decorative, Lora) from CDN

## Acceptance Criteria

1. All views from both current apps render correctly with identical output to current single-file versions
2. All roll calculations produce correct dice pools (verified against 6 test characters)
3. No single JS file exceeds 500 lines
4. Territory tab renders without React dependency
5. Changing `--gold2` in `theme.css` updates the colour in all views
6. ST Suite reads v2 data correctly; old-format data is no longer required
7. No regressions: character list, sheet view, editing, saving, dice rolling, resistance checks, territory tracking, session tracker all function as before
8. GitHub Pages deployment succeeds and serves the app on push to `main`

## Technical Notes

- Known data issues: Gel/Magda (Skills XP = 1 total), Kirk Grimm (Intelligence XP = 5, fractional dots), Conrad (Discipline splits). These are data issues, not schema issues. Document in test expectations; do not attempt to auto-correct.
- `features` field exists on 5 characters but is not yet rendered. Epic 1 scope: preserve the field in the data model; rendering is Epic 2.
- Professional Training (`role` field on merits) and `benefit_grants` are populated but the full PT grant system is Epic 2.
