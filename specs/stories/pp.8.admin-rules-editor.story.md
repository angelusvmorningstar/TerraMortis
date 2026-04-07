# Story PP.8: Admin Rules Editor

## Status: Approved

## Story

**As an** ST,
**I want** to browse, search, and edit game rules (merits, disciplines, devotions, manoeuvres) from the admin panel,
**so that** I can update game data without requiring a code deploy.

## Acceptance Criteria

1. New "Rules" domain in admin sidebar with icon and count badge
2. Searchable, filterable table of all ~620 powers
3. Category filter tabs or dropdown (attribute, skill, discipline, merit, devotion, rite, manoeuvre)
4. Text search across name and description
5. Each row expands to an inline edit form
6. Editable fields: `description`, `prereq` (JSON tree editor), `rating_range`, `special`, `exclusive`, `bloodline`, `xp_fixed`
7. Read-only fields displayed: `key`, `name`, `category`, `parent`, `rank`, `pool`, `resistance`, `cost`, `action`, `duration`
8. Save via `PUT /api/rules/:key` — persists immediately
9. Edits visible to players on next page load (client cache refresh)
10. No code deploy required to change game rules data

## Tasks / Subtasks

- [ ] Task 1: Add Rules domain to admin sidebar (AC: 1)
  - [ ] Add "Rules" button to sidebar in `public/admin.html`
  - [ ] Add Rules content container div
  - [ ] Wire sidebar click to `switchDomain('rules')` in `admin.js`
  - [ ] Import and call `initRulesView()` when domain selected

- [ ] Task 2: Create admin/rules-view.js (AC: 2, 3, 4)
  - [ ] Create `public/js/admin/rules-view.js`
  - [ ] Export `initRulesView()` that fetches from `/api/rules` and renders the table
  - [ ] Category filter: row of buttons or dropdown filtering by `category` field
  - [ ] Search input: filters by `name` and `description` (case-insensitive substring)
  - [ ] Table columns: Name, Category, Parent, Rating, Prereq summary
  - [ ] Count badge showing filtered/total (e.g. "189 / 620")
  - [ ] Sort by name within category

- [ ] Task 3: Expandable row with edit form (AC: 5, 6, 7)
  - [ ] Click row to expand inline edit panel below
  - [ ] Display read-only fields: key, category, parent, rank, pool breakdown, resistance, cost, action, duration
  - [ ] Editable textarea for `description`
  - [ ] Editable inputs for `rating_range` (two number inputs: min, max)
  - [ ] Editable inputs for `special`, `exclusive`, `bloodline`
  - [ ] Editable number input for `xp_fixed` (shown only when category === 'devotion')
  - [ ] Prereq editor: display current prereq tree as formatted JSON, editable textarea with JSON validation on blur

- [ ] Task 4: Save handler (AC: 8, 9)
  - [ ] Save button calls `PUT /api/rules/:key` with edited fields
  - [ ] On success: update the local rules cache, show success toast
  - [ ] On validation error: show error toast with details
  - [ ] On save, invalidate localStorage `tm_rules_db` so next page load fetches fresh

- [ ] Task 5: Styling (AC: 2)
  - [ ] Follow existing admin panel styles from `admin-layout.css`
  - [ ] Table rows: hover highlight, alternating backgrounds
  - [ ] Expanded edit panel: card-style with border, padding
  - [ ] Category filter buttons: pill style matching existing domain tab buttons
  - [ ] Search input: match existing admin search patterns
  - [ ] Gold accent for headings, crimson for required markers

## Dev Notes

### Admin domain wiring pattern
Follow the existing pattern: domain button in sidebar HTML, `switchDomain()` in `admin.js`, `initXxxView()` function called on domain switch.
[Source: public/js/admin.js:150-165 for domain switching pattern]

### API endpoints available
- `GET /api/rules` — full collection (with `?category=` filter)
- `GET /api/rules/:key` — single power
- `PUT /api/rules/:key` — update (ST only, schema validated)
[Source: PP-2 story, server/routes/rules.js]

### Prereq editor approach
For MVP: display prereq as formatted JSON in a textarea. Validate on blur by parsing JSON and checking structure. Future enhancement: visual tree editor with add/remove nodes.

### Cache invalidation
On save, delete `localStorage.getItem('tm_rules_db')` so the next page load (by any user) fetches fresh from API. The save response can also update the in-memory rules cache for immediate local feedback.

### CSS location
Add styles to `public/css/admin-layout.css` following existing section patterns.
[Source: public/css/admin-layout.css]

### Testing

- Verify Rules domain appears in sidebar
- Verify table loads all ~620 entries
- Verify category filter reduces table to correct subset
- Verify search filters by name and description
- Verify row expand/collapse
- Verify edit + save persists changes
- Verify saved changes appear for players on next load
- Verify validation errors display for invalid prereq JSON

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-07 | 1.0 | Initial draft | Bob (SM) |

## Dev Agent Record

### Agent Model Used
_TBD_

### Debug Log References
_TBD_

### Completion Notes List
_TBD_

### File List
_TBD_

## QA Results
_Pending implementation_
