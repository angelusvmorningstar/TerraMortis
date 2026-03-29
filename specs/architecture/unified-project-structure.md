# Unified Project Structure

## Target File Tree (after Epic 1d)

```
TerraMortis/
├── public/                          # GitHub Pages root (served as static site)
│   ├── index.html                   # Single SPA entry point (merged Editor + Suite)
│   ├── css/
│   │   ├── theme.css                # Design tokens (CSS custom properties) -- ONE file
│   │   ├── layout.css               # Grid/flex structural layout
│   │   ├── components.css           # Shared UI components (cards, buttons, badges)
│   │   ├── editor.css               # Editor-specific styles
│   │   └── suite.css                # Suite-specific styles
│   └── js/
│       ├── main.js                  # App entry: init, tab routing, shared state
│       ├── data/
│       │   ├── accessors.js         # ALL data access functions (v2 schema)
│       │   ├── loader.js            # JSON fetch, localStorage read/write
│       │   └── derived.js           # Derived stat calculations (speed, defence, etc.)
│       ├── editor/
│       │   ├── list.js              # renderList() -- character card grid
│       │   ├── sheet.js             # renderSheet() -- read-only sheet view
│       │   ├── edit.js              # Edit mode, shEdit(), markDirty()
│       │   ├── merits.js            # Merit add/edit/remove, prerequisite validation
│       │   ├── mci.js               # Mystery Cult Initiation benefit grant system
│       │   ├── domain.js            # Domain merit sharing maths (CP+XP, capped at 5)
│       │   ├── xp.js                # XP log, xpToDots(), creation point allocation
│       │   └── export.js            # Save/export character data
│       ├── suite/
│       │   ├── roll.js              # Dice pool construction, roll engine, modifiers
│       │   ├── sheet.js             # Suite sheet view (read-only, mobile-friendly)
│       │   ├── territory.js         # Territory tab (rewritten from React to vanilla JS)
│       │   └── tracker.js           # Session tracker tab
│       └── shared/
│           ├── dice.js              # Core dice rolling engine (10-again, rote, chance)
│           ├── influence.js         # Influence total calculation across 16 spheres
│           ├── pools.js             # getPool() -- parse pool strings to dot totals
│           └── resist.js            # Resistance check calculation (updResist)
│
├── data/
│   ├── chars_v2.json                # 30 characters -- v2 schema (REAL DATA, not deployed)
│   ├── chars_test.json              # 6 fake test characters (deployed to Pages)
│   ├── chars_v2.schema.json         # JSON Schema Draft 2020-12 (source of truth)
│   ├── merits_db.json               # 203+ merit entries (externalised from editor)
│   ├── devotions_db.json            # 42 devotion entries (externalised from editor)
│   ├── man_db.json                  # Manoeuvre definitions (externalised)
│   ├── icons.json                   # Icon mappings (externalised)
│   ├── clan_banes.json              # Clan bane definitions (externalised)
│   ├── bloodline_discs.json         # Bloodline discipline mappings (externalised)
│   ├── schema_v2_proposal.md        # Informal schema narrative (reference)
│   └── tm_characters.json           # OLD FORMAT -- retire after Epic 1c
│
├── specs/                           # BMAD project specifications
│   ├── core-config.yaml
│   ├── prd.md
│   ├── architecture.md
│   ├── prd/
│   │   ├── epic-1-foundation-restructure.md
│   │   ├── epic-2-operational-enhancement.md
│   │   └── epic-3-player-portal.md
│   ├── architecture/
│   │   ├── tech-stack.md
│   │   ├── data-models.md
│   │   ├── unified-project-structure.md  ← this file
│   │   ├── coding-standards.md
│   │   └── testing-strategy.md
│   ├── stories/                     # SM-generated story files
│   └── qa/                          # QA gate files
│
├── private/                         # Git-tracked empty folder; contents git-ignored
│   └── .gitkeep
│
├── .github/
│   └── workflows/
│       └── deploy.yml               # GitHub Pages CI/CD
│
├── CLAUDE.md                        # Claude Code project instructions
├── integration_plan.md              # Accessor functions, phase plan (reference)
├── HANDOVER_v4.md                   # Technical handover notes (reference)
└── README.md
```

## Module Boundaries and Responsibilities

### `js/data/accessors.js`
Single module for all character data reads. No module outside `data/` may read `char.attributes`, `char.skills`, `char.merits`, or `char.powers` directly. Everything goes through this API.

**Rule:** If you find yourself writing `char.attributes[name]` or `char.skills[s]` outside `accessors.js`, stop and use the accessor instead.

### `js/data/loader.js`
Handles `localStorage` and JSON fetch only. No rendering logic. Exposes:
- `loadChars()` -- fetch from GitHub JSON or fall back to localStorage
- `saveChars(chars)` -- write to localStorage
- `getTrackerData(name)` / `setTrackerData(name, data)`

### `js/data/derived.js`
Pure functions for computed stats. Input: character object. Output: numbers. No DOM access.

### `js/editor/` modules
Each handles one Editor view or subsystem. They import from `js/data/accessors.js` and `js/data/derived.js`. They export render functions and event handlers that `main.js` wires to the DOM.

### `js/suite/` modules
Same pattern as editor modules. They render Suite tabs and handle Suite interactions. After Epic 1c, all data access goes through `js/data/accessors.js` (replacing the ~25 direct access points).

### `js/shared/` modules
Framework-agnostic utilities used by both Editor and Suite. No DOM knowledge of which app is running.

### `css/theme.css`
The only file allowed to define colour values. Exports CSS custom properties:

```css
:root {
  --bg:     #0D0B09;
  --surf1:  ...;
  --surf2:  ...;
  --surf3:  ...;
  --gold1:  ...;
  --gold2:  #E0C47A;
  --gold3:  ...;
  --crim:   #8B0000;
  /* ... all design tokens */
}
```

No other CSS file may contain hex colour values. All other files use `var(--token-name)`.

## File Naming Conventions

- All files: `kebab-case.js` / `kebab-case.css`
- No uppercase in filenames (filesystem portability)
- Module files describe their primary export (`roll.js` exports roll functions, `merits.js` exports merit functions)
- No `utils.js` or `helpers.js` -- name files after their domain

## Import/Export Patterns

```js
// Named exports preferred over default exports
export function renderList(chars, container) { ... }
export function filterChars(chars, clan, covenant) { ... }

// Import only what you use
import { renderList, filterChars } from './editor/list.js';
```

No barrel files (`index.js` re-exporting everything). Import directly from the source module.

## Sub-phase Delivery Checkpoints

Epic 1 is delivered incrementally. Each sub-phase must leave the app in a deployable state:

| Sub-phase | Files produced | Files retired |
|---|---|---|
| 1a | `css/*.css`, `js/**/*.js` extracted from monoliths | Inline `<style>` and `<script>` blocks in HTML |
| 1b | `css/theme.css` with all design tokens | Hardcoded hex values in other CSS files |
| 1c | `js/data/accessors.js`, `js/data/loader.js` | `tm_characters.json` (old format) |
| 1d | `public/index.html` (merged SPA) | `public/tm_editor.html` as separate app |

After 1d, only `public/index.html` remains as the app entry point.

## Deployment Layout

Only `public/` is deployed to GitHub Pages. The `data/` directory structure is:

- `chars_test.json` is copied to `public/data/chars_test.json` for Pages deployment
- `chars_v2.json` (real data) stays in `data/` only, never in `public/`
- Reference JSON files (`merits_db.json`, etc.) are copied to `public/data/` as they are externalised

The GitHub Actions workflow (`deploy.yml`) uploads the entire `public/` directory. Sensitive data exclusion is enforced by keeping real character data outside `public/`.
