# Story 2.4: Admin App Shell

**Status:** review

## Story

As an ST,
I want a desktop-oriented admin app with sidebar navigation,
so that I can manage the game from my desktop with all four domains accessible.

## Acceptance Criteria

1. `admin.html` loads in a browser and displays a sidebar with four domain sections: Player, City, Downtime, Engine
2. Clicking a sidebar domain switches the visible content area
3. Player domain displays a character list fetched from the API (`/api/characters`)
4. Desktop-first layout: sidebar + content area, no max-width constraint
5. Shared theme CSS (`theme.css`, `components.css`) is reused — same look and feel as the game app
6. New `admin-layout.css` handles the sidebar + content desktop layout
7. Character cards in the Player domain reuse the existing `.char-card` component styling

## Tasks / Subtasks

- [x] Task 1: Create admin.html (AC: #1, #4, #5)
  - [x] HTML shell with sidebar nav and content area
  - [x] Load shared CSS (theme, components) + new admin-layout.css
  - [x] Load admin.js as entry point module
- [x] Task 2: Create admin-layout.css (AC: #4, #6)
  - [x] Sidebar + content area flexbox layout
  - [x] Sidebar styling (fixed width, domain sections, active state)
  - [x] No max-width constraint — fills available desktop width
- [x] Task 3: Create admin.js entry point (AC: #1, #2, #3)
  - [x] Domain switching (Player/City/Downtime/Engine)
  - [x] On init: fetch characters from API, render Player domain character list
  - [x] Reuse character card rendering pattern from list.js
- [x] Task 4: Verify (AC: #1-7)
  - [x] admin.html loads, sidebar shows four domains
  - [x] Clicking domains switches content
  - [x] Player domain shows character cards from API

## Dev Notes

### Architecture

Two HTML entry points sharing JS modules. `admin.html` is desktop-first with sidebar nav. `index.html` (game app) remains unchanged.

### File Structure

```
public/
├── admin.html              # NEW
├── css/
│   └── admin-layout.css    # NEW
└── js/
    └── admin.js            # NEW (entry point for admin app)
```

### Sidebar Domains

| Domain | Icon/Label | Content |
|---|---|---|
| Player | Player | Character list, sheet, edit (future) |
| City | City | Territory management (future) |
| Downtime | Downtime | Downtime dashboard (future) |
| Engine | Engine | Dice roller, session log (future) |

Only Player domain has content in this story. Other domains show placeholder text.

### Character List

Fetch from API via `apiGet('/api/characters')`. Render using the same `.char-card` / `.char-grid` pattern from `components.css`. Can import helpers (`clanIcon`, `covIcon`, `xpLeft`) from existing modules.

### What This Story Does NOT Do

- No character sheet view (click-through to sheet comes later)
- No edit functionality in admin
- No City/Downtime/Engine content (placeholders only)
- No changes to index.html (game app)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Node `--check` doesn't work on ES module files when root package.json is CommonJS. Browser serves fine via `<script type="module">`.

### Completion Notes List

- admin.html with sidebar nav (Player/City/Downtime/Engine) and content area
- Desktop-first flexbox layout, no max-width constraint
- Sidebar: 220px fixed width, gold active state, hover effects
- Player domain fetches characters from API and renders using existing .char-card pattern
- Imports shared helpers (clanIcon, covIcon, xpLeft, xpEarned) from existing modules
- City/Downtime/Engine show placeholder text for now
- Graceful error handling if API is unreachable

### File List

- `public/admin.html` — NEW
- `public/css/admin-layout.css` — NEW
- `public/js/admin.js` — NEW
