---
issue: 708
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/708
branch: ms/issue-708-cycle-tab-game-phase
epic: CYCLE — Game Cycle Management Tab
story: 2 of 6
status: review
---

# Epic CYCLE — Story 2: Cycle Tab Shell

## Story

**As an** ST,
**I want** a dedicated "Cycle" entry in the admin sidebar that renders a shell UI showing the chapter list and downtime cycle list,
**so that** I have a single place to manage the game cycle lifecycle, replacing the scattered controls across the admin app.

---

## Epic Context

Story 2 of 6. Story 1 delivered the schema + API (chapters collection, `game_phase` field, `deriveCycleStatus` guard). This story adds the admin UI shell and wires it up — chapters CRUD list, and a cycle list showing each cycle's `game_phase`.

Stories 3–6 will add phase controls, DT prep access, publish pipeline, and attendance/XP within this same shell.

---

## Acceptance Criteria

- [ ] AC-1: A "Cycle" sidebar button exists in `admin.html` (between Downtime and Ordeals, `data-domain="cycle"`).
- [ ] AC-2: Clicking "Cycle" activates the corresponding domain section (`id="d-cycle"`) and calls `initCycleView(chars)`.
- [ ] AC-3: The Cycle domain section renders a **Chapters panel** listing all chapters (fetched from `GET /api/chapters`) sorted by number, with a "New Chapter" button.
- [ ] AC-4: "New Chapter" opens an inline form; submitting creates the chapter via `POST /api/chapters` and refreshes the list.
- [ ] AC-5: Each chapter row has a delete button; clicking it calls `DELETE /api/chapters/:id`. If the server returns 409 CHAPTER_IN_USE, the UI shows a human-readable error (e.g. "Chapter is linked to N cycle(s) — unlink them first"). Otherwise the chapter is removed from the list.
- [ ] AC-6: The Cycle domain section renders a **Game Cycles panel** listing existing downtime cycles fetched from `GET /api/downtime_cycles`, showing label, `game_phase` (or "legacy" if null), and `chapter_id` association.
- [ ] AC-7: All fetch errors are caught and display a user-readable error message inside the relevant panel — no unhandled rejections.
- [ ] AC-8: A new file `public/js/admin/cycle-views.js` exports `initCycleView(charList)` and contains all Cycle tab rendering logic.
- [ ] AC-9: Contract test (`server/tests/epic.708.2-cycle-tab-shell.test.js`) passes: asserts the new sidebar button, domain section, and `initCycleView` import/call exist in the relevant source files.

---

## Dev Notes

### File changes

**New:**
- `public/js/admin/cycle-views.js` — `export async function initCycleView(charList) { ... }`

**Modified:**
- `public/admin.html` — add sidebar button + domain section
- `public/js/admin.js` — import `initCycleView`, add domain switch case

**Test:**
- `server/tests/epic.708.2-cycle-tab-shell.test.js` — static-grep contract tests

### Sidebar button placement

In `admin.html`, add after the `data-domain="downtime"` button and before `data-domain="ordeals"`:
```html
<button class="sidebar-btn" data-domain="cycle">Cycle</button>
```

### Domain section in admin.html

Add after the Downtime section (`</section>` closing `id="d-downtime"`):
```html
<!-- Cycle domain (#708) -->
<section id="d-cycle" class="domain">
  <div class="domain-header"><h2>Cycle</h2></div>
  <div id="cycle-content"></div>
</section>
```

### admin.js wiring

Import at top of `public/js/admin.js` (alongside the other admin/* imports):
```js
import { initCycleView } from './admin/cycle-views.js';
```

In `switchDomain()` (around line 280, after the `if (domain === 'downtime')` block):
```js
if (domain === 'cycle') initCycleView(chars);
```

### cycle-views.js structure

```js
const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://tm-suite-api.onrender.com';

export async function initCycleView(charList) {
  const el = document.getElementById('cycle-content');
  el.innerHTML = '<p class="loading-msg">Loading…</p>';
  try {
    const [chapters, cycles] = await Promise.all([
      fetch(`${API}/api/chapters`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API}/api/downtime_cycles`, { credentials: 'include' }).then(r => r.json()),
    ]);
    el.innerHTML = '';
    el.appendChild(renderChaptersPanel(chapters));
    el.appendChild(renderCyclesPanel(cycles));
  } catch (err) {
    el.innerHTML = `<p class="error-msg">Failed to load cycle data: ${err.message}</p>`;
  }
}
```

**Auth pattern:** The admin app uses a `credentials: 'include'` fetch pattern throughout. Follow the same pattern — no Authorization header (session cookie auth).

**API base URL pattern:** Look at how other admin/*.js files determine the API origin. The pattern is:
```js
const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://tm-suite-api.onrender.com';
```
Use this exact form.

### Chapters panel

- Title: "Chapters" (h3 or `.panel-title`)
- Table/list of chapter rows: `#N — Label [Delete]`
- "New Chapter" button toggles an inline form: number field + label field + Save button
- POST to `/api/chapters`, then re-fetch the list and re-render
- DELETE 409: show inline error "Chapter is linked to N cycle(s) — remove the link before deleting"
- DELETE 200: remove row from DOM

### Cycles panel

- Title: "Game Cycles" (h3 or `.panel-title`)
- List of cycle rows showing: label, game_phase display (map: `game`→`Game`, `downtime`→`Downtime`, `processing`→`Processing`, `null`→`legacy`), chapter association (show chapter label if `chapter_id` is set and matches a loaded chapter, else "—")
- Read-only in this story — phase controls come in Story 3

### CSS

- No new CSS tokens. Use existing `.domain-header`, `.panel-title`, `.error-msg`, `.loading-msg` classes.
- For the chapter table: a plain `<table class="data-table">` if that class exists in admin-layout.css; otherwise a `<ul>` with existing list styling. Audit admin-layout.css first.
- For the inline new-chapter form: `.inline-form` if it exists; plain flex row otherwise.

### API base — don't duplicate

Check `public/js/admin/attendance.js` or `public/js/admin/downtime-views.js` for the exact API base URL constant they use. Use the same pattern; do not invent a new one.

### Test file pattern

Static-grep tests only (read files with `fs.readFileSync`, assert `toContain`/`toMatch`). No supertest needed for this story — it's a pure client-side story. Paths relative to `server/` cwd:

```js
const ADMIN_HTML   = fs.readFileSync('../public/admin.html', 'utf8');
const ADMIN_JS     = fs.readFileSync('../public/js/admin.js', 'utf8');
const CYCLE_VIEWS  = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
```

Required assertions (≥9):
- `ADMIN_HTML` contains `data-domain="cycle"`
- `ADMIN_HTML` contains `id="d-cycle"`
- `ADMIN_HTML` contains `id="cycle-content"`
- `ADMIN_JS` contains `initCycleView`
- `ADMIN_JS` contains `cycle-views.js`
- `ADMIN_JS` contains `domain === 'cycle'`
- `CYCLE_VIEWS` contains `initCycleView`
- `CYCLE_VIEWS` contains `/api/chapters`
- `CYCLE_VIEWS` contains `/api/downtime_cycles`

---

## Tasks

- [x] **Task 1** — Add Cycle sidebar button to `public/admin.html` (between Downtime and Ordeals)
- [x] **Task 2** — Add Cycle domain section to `public/admin.html` (after Downtime section)
- [x] **Task 3** — Create `public/js/admin/cycle-views.js` with `initCycleView(charList)` — chapters panel + cycles panel
- [x] **Task 4** — Update `public/js/admin.js`: import `initCycleView`, add domain switch case
- [x] **Task 5** — Create `server/tests/epic.708.2-cycle-tab-shell.test.js` with ≥9 static-grep assertions; run and confirm all pass

---

## File List

**New:**
- `public/js/admin/cycle-views.js`
- `server/tests/epic.708.2-cycle-tab-shell.test.js`

**Modified:**
- `public/admin.html`
- `public/js/admin.js`

---

## Dev Agent Record

### Debug Log
_Empty_

### Completion Notes
- Added "Cycle" sidebar button in `admin.html` between Downtime and Ordeals
- Added `id="d-cycle"` domain section with `id="cycle-content"` target
- Created `public/js/admin/cycle-views.js`: `initCycleView(charList)` fetches chapters + cycles in parallel, renders Chapters panel (list + inline create form + delete with 409 guard) and Game Cycles panel (read-only list showing label, game_phase, chapter association)
- Used `apiGet`/`apiPost`/`apiDelete` from `public/js/data/api.js` — no raw fetch
- Updated `admin.js`: import + `if (domain === 'cycle') initCycleView(chars);` in `switchDomain()`
- 15 static-grep contract tests — all pass

### Change Log
- 2026-06-11: Story implemented — Cycle tab shell with chapters CRUD panel and cycles list; 15 passing contract tests
