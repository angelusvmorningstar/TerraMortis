# Story 1.1: Unify Auth, Routing, and Theme Default

Status: review

## Story

As an authenticated user (player or ST),
I want a single URL to open the Terra Mortis game app with the correct theme and role-appropriate content,
So that I don't need to know which of two apps to open and the app looks right from the first render.

## Background

**Architectural decision (resolved):** Evolve `index.html` as the single entry point. Absorb `player.html`'s functionality progressively. `player.html` becomes a redirect once migration is complete. Desktop-oriented features (DT Submission, Ordeals) live in the unified app; responsive behaviour handles viewport differences, no separate URL.

**Theme correctness (not polish):** `index.html` defaults dark (`if t !== 'light'`). `player.html` defaults light (`if t === 'dark'`). These are opposite — a player moving between the two apps gets a jarring flip. This story fixes the default: dark unless user has saved `'light'`. The user-controlled toggle is Story 3.2.

**Parallel with Story 1.4** — both run as discovery before Stories 1.2 and 1.3 begin.

## Acceptance Criteria

1. **Given** a player logs in at `index.html` **When** auth completes **Then** the app renders with player-appropriate nav and content
2. **Given** an ST logs in at `index.html` **When** auth completes **Then** the app renders with ST nav and additional tabs visible
3. **Given** `player.html` is accessed directly **When** the page loads **Then** it redirects to `index.html` (or renders identically)
4. **Given** any user opens the app for the first time (no saved preference) **When** the app loads **Then** dark theme is applied before first render — no flash of wrong theme
5. **Given** a user has previously saved `'light'` in localStorage **When** the app loads **Then** parchment theme is applied before first render

## Tasks / Subtasks

- [x] Audit current auth init in `index.html` vs `player.html` (AC: #1, #2)
  - [x] Document which API calls each makes on load
  - [x] Identify what `player.html` does that `index.html` does not yet do
- [x] Reconcile theme init logic (AC: #4, #5)
  - [x] Update `index.html` theme init script: dark if no preference OR preference is `'dark'`; parchment if preference is `'light'`
  - [x] Confirm no flash — theme applied before body renders
- [x] Add redirect to `player.html` (AC: #3)
  - [x] `player.html` JS redirect to `/` preserving OAuth callback params
- [x] Verify role-aware rendering still works after auth reconciliation (AC: #1, #2)
  - [x] ST login → ST tabs visible
  - [x] Player login → player tabs visible, ST tabs hidden

## Dev Notes

- `public/index.html` — current theme init at lines 17–21: `if(t !== 'light') setAttribute('dark')`
- `public/player.html` — current theme init: `if(t==='dark') setAttribute('dark')` — opposite default
- `public/js/app.js` — `applyRoleRestrictions()` controls tab visibility — already working, do not break
- `public/js/auth/discord.js` — `getRole()`, `isSTRole()`, `getPlayerInfo()` — use these for role checks
- **No new API endpoints needed** — auth uses existing `requireAuth` middleware
- CSS: theme tokens already work in both themes throughout all components — this is init logic only
- Do NOT add user toggle in this story — that is Story 3.2

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: specs/ux-design-unified-nav.md#Theme Support]
- [Source: public/mockups/font-test.html] — token definitions for both themes

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- `index.html` theme init was already correct (`if t !== 'light'` → dark default) — no change needed
- `player.html` theme init was opposite (`if t==='dark'`) — fixed to match
- OAuth redirect URI is `/admin` in `discord.js` — player.html redirect doesn't interfere
- Smoke test passes (pre-existing `ordeals.filter` console error unrelated to this story)

### Completion Notes List
- `index.html` theme init: already correct, no change made
- `player.html` theme init: fixed from `if(t==='dark')` to `if(t !== 'light')` — now dark default
- `player.html` redirect: JS redirect to `/` preserving `search` and `hash` params for OAuth compatibility
- Role-aware rendering: `applyRoleRestrictions()` in `app.js` unchanged and working

### File List
- public/player.html
