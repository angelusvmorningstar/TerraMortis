# Story prax.2: Praxis claim board UI

## Story

As the ST running Praxis night,
I want a live tap-to-assign board for the Head of State claim, built on prax-1's routes,
So that I can open claims, assign/reassign supporters, and watch the City-Status-weighted tally
update in real time, without a spreadsheet or a paper tally sheet.

## Why this story exists

Full epic context: `specs/epic-prax-praxis-claim-harpy-vote.md` (this story's own row is the
authoritative scope statement). This is the first of the two board UIs (prax-3 adds the Harpy tab
+ segmented control on top of this story's own component). It is pure client work — every route it
calls already shipped in prax-1 (`server/routes/praxis-sessions.js`, verified done); this story
adds no server code at all.

### Design-lock (locked 2026-08-29, confirmed by Angelus)

`specs/mockups/prax-2-claim-board/index.html` — rendered and click-tested before lock (tap a pool
chip → bottom sheet opens → tap a claimant → chip moves into their card, sheet closes). Three
states shown: empty board, populated board, and the bottom sheet pinned open for detail review.
Build to this mockup; a deviation from it is itself a finding, not a free implementation choice.

**One thing the mockup answers that the epic doc left open, confirmed at lock:** the epic doc
describes the tap→sheet→assign flow for *supporting* a claimant but never says how a claim itself
opens. The locked answer folds both into the same sheet — tapping any pool attendee's chip opens a
sheet with "Open a Praxis claim for X instead" as the first row, above the claimant list. One tap
target, one sheet, still two taps total either way. Do not invent a second gesture for opening a
claim.

## Locked rulings this story must honour (see prax-1's own story + the epic doc, do not re-litigate)

- **Never player-visible.** This entire module is reached only through admin.html's existing
  ST-only sidebar/auth gate — same posture as every other admin domain. No new client-side
  role-check is needed or wanted; this line records the constraint for a reviewer, not a TODO.
- **Live tally, never a stored score.** The board persists only claims + support assignments
  (prax-1's own schema). Every tally shown on screen is computed at render time from live character
  + territory data via `calcCityStatus()` (`public/js/data/accessors.js`), never read off the
  document.
- **A character may claim in both tallies at once** — irrelevant to this story specifically (it
  only ever sends `tally: 'praxis'`), but do not add a client-side check that would block it; prax-3
  reuses this exact component for `tally: 'harpy'` and depends on that absence.
- **Withdrawing a claimant returns their supporters to the pool, cascaded server-side** in the same
  write (prax-1 AC6). This story's job is to call the route and re-render from its response
  (`supporters_released`), not to reimplement the cascade client-side.
- **WS-synced.** A `praxis_session` frame from another ST's tab (or this ST's own second tab) must
  refetch and re-render the open board within the existing WS reconnect/backoff behaviour, mirroring
  `roll-feed.js`'s own "no-op until this domain has been opened at least once this session" guard.

## What this story is NOT

- **Not** the Harpy tab or the segmented Praxis/Harpy control — prax-3's own addition, built by
  reusing this story's component with a second weighting function. Nothing here should hard-code
  `'praxis'` in a way that blocks that reuse (the tally literal should be a parameter/constant at
  the top of the module, not inlined at every call site).
- **Not** resolve logic, an undo-toast, or a confirm modal for winning — prax-4a/4b's own job. This
  story never calls a `resolve-*` route because none exists yet.
- **Not** a change to any prax-1 server route, `praxis_session.schema.js`, or `broadcastPraxisUpdate`
  — all already shipped and independently verified. This story is a pure consumer.
- **Not** a change to `city-status-calc.js`, `calcCityStatus`, or any other accessor — reused as-is.
- **Not** a session-live gate or a fuzzed player view — out of scope for the whole epic.

## Acceptance Criteria

**Admin shell wiring**

1. New sidebar button in `public/admin.html`, `<button class="sidebar-btn" data-domain="praxis">Praxis</button>`,
   placed among the city/session-adjacent domains (near `city`/`attendance`, not buried at the
   bottom). A new `<section id="d-praxis" class="domain"><div class="domain-header"><h2>Praxis</h2></div><div id="praxis-content"></div></section>`,
   matching the existing `d-city` section's shape exactly (`public/admin.html:105-108`).
2. `public/js/admin.js`'s `switchDomain()` gets a new `if (domain === 'praxis') initPraxisView();`
   line in the same `if` chain as `initCityView()`/`initSpheresView()` (`admin.js:340-386`).

**Client WS wiring (`public/js/data/ws.js`) — new message type, does not exist today**

3. A new `_onPraxisUpdate` module-local callback slot, `opts.onPraxisUpdate` accepted by `initWS()`
   and assigned the same way `opts.onRollLogged` is (`ws.js:81-93`). A new dispatch branch in
   `_ws.onmessage`: `else if (msg.type === 'praxis_session') _handlePraxisMsg(msg)`. A new
   `_handlePraxisMsg(msg)` function extracts `session_id` and calls `_onPraxisUpdate?.(session_id)`
   — no echo suppression, mirroring `_handleCatalogueMsg`/`_handleSettingsMsg`/`_handleBloodlineMsg`'s
   own "cheap refetch regardless of origin" reasoning (`ws.js:218-247`), not `_handleTrackerMsg`'s
   local-write dedupe (that pattern exists for high-frequency per-field state, not an infrequent
   ST-only board write).
4. `public/js/admin.js`'s existing `initWS({...})` call (`admin.js:232-283`) gets a new
   `onPraxisUpdate: (sessionId) => { _onPraxisUpdateFeed(sessionId); },` entry, alongside the
   existing `onRollLogged`/`onReconnect` entries. `_onPraxisUpdateFeed` is exported from the new
   `praxis-tab.js` module (AC5) and no-ops if the Praxis domain has never been opened this session
   — same guard `roll-feed.js`'s own `onRollLogged` uses.

**New module: `public/js/admin/praxis-tab.js`**

5. `export async function initPraxisView()` — entry point called from `switchDomain`. Resolves the
   current chapter by re-implementing the same selection `cycle-views.js`'s module-local
   `declaresPhase`/game_number-desc sort already uses (declared-phase chapter first if one exists,
   else the most recent non-closed chapter by `game_number`) — duplicated locally, not imported,
   matching this repo's own established pattern of small per-view-module selection logic rather than
   a shared cross-file import for a few lines of filter/sort. If no chapter resolves at all (empty
   `chapters` collection), render a plain "No chapter to open a Praxis board against" placeholder —
   no crash, no dead button.
6. `GET /api/praxis_sessions?chapter_id=<resolved id>`. A `null` response renders the empty state
   (mockup variant 1): "No Praxis board is open for this chapter yet." + an "Open Praxis Claim"
   button.
7. "Open Praxis Claim" → `POST /api/praxis_sessions` with `{chapter_id}`. On success, re-render into
   the populated board. On a 409 (`existing_id` in the body — prax-1's own race-loser contract),
   fall straight through to `GET /api/praxis_sessions/:existing_id`-equivalent (or re-run the
   chapter-scoped GET) rather than showing an error — two STs opening the board in the same instant
   is an ordinary race, not a failure.
8. Populated board render (mockup variant 2). Needs three live data sources fetched alongside the
   board: `GET /api/characters/public` (or whatever this app's existing "chars for admin display"
   call is — reuse it, do not add a second characters endpoint), `GET /api/territories` (primed into
   `setStatusTerritories()` before any `calcCityStatus()` call — required, `calcCityStatus` reads a
   module-local cache that `setStatusTerritories` populates, see `accessors.js:401-434`), and the
   attendee pool (already resolved server-side by every prax-1 route's own attendee check, but the
   UI needs the pool too, to render the strip — fetch the linked `game_sessions` doc the same way
   `attendeePool()` does server-side, or add a thin client helper mirroring its
   `attendance[].attended === true` filter; do not duplicate ambiguous logic — read
   `server/routes/praxis-sessions.js`'s own `attendeePool()` before writing the client version so
   the two cannot silently diverge on which attendance flag they check).
9. **Pool strip**: every attendee whose id is NOT a key in `board.praxis.support`, rendered as
   `.char-chip` buttons (reused verbatim from `components.css`, per the locked mockup — do not
   invent a new chip class for this).
10. **Claimant cards**, one per `board.praxis.claims[]` entry: display name (`displayName(c)`, not
    raw `character_id`), a live tally computed as `calcCityStatus(claimant)` plus
    `calcCityStatus(supporter)` for every `board.praxis.support` entry whose value equals this
    claimant's id, a muted secondary-line badge — `"Primogen · keeps seat"` (neutral tone) if
    `claimant.court_category === 'Primogen'`, `"People's Harpy · vacates on win"` (amber tone) if the
    claimant currently holds the seat labelled People's Harpy (checked live against office data, not
    stored on the board — reuse whatever existing accessor already answers "does character X hold
    office seat Y", do not hand-roll a new office lookup), no line if neither applies — and every
    currently-assigned supporter rendered as a `.support-chip` with a withdraw ("×") control.
11. Tapping a pool chip opens the bottom sheet (mockup's `.sheet-overlay`/`.sheet` component,
    ported into a real stylesheet, not left inline): "Open a Praxis claim for `<name>` instead" as
    the first row, then the list of current claimants (name + live tally) below it.
12. Tapping the "open a claim" row → `POST /api/praxis_sessions/:id/claims` with
    `{tally: 'praxis', character_id: <the tapped attendee>}`, closes the sheet, re-renders from the
    response (or a fresh GET — dev-story's call, but the re-render MUST reflect the server's state,
    never a purely local DOM patch, since the tally is server-derived and a stale local move would
    show a wrong number).
13. Tapping a claimant row in the sheet → `PUT /api/praxis_sessions/:id/support` with
    `{tally: 'praxis', supporter_character_id: <tapped pool attendee>, claimant_character_id: <tapped claimant>}`,
    closes the sheet, re-renders from the server response.
14. Each supporter chip's "×" → `PUT /api/praxis_sessions/:id/support` with
    `{tally: 'praxis', supporter_character_id: <that supporter>, claimant_character_id: null}`
    (the explicit-null unassign prax-1's AC7 requires — never omit the key), re-renders.
15. Each claimant card gets a "Withdraw claim" text action → `DELETE /api/praxis_sessions/:id/claims/:characterId?tally=praxis`,
    re-renders, and surfaces the response's `supporters_released` count in a brief status line (e.g.
    "3 supporters returned to the pool") — no confirm modal, matching this tool's own established
    "two taps, no confirm" ethos; a mis-tap is recoverable (the claim can be reopened, nothing is
    destroyed beyond what withdrawing a claim always means).
16. `_onPraxisUpdateFeed(sessionId)` (exported for AC4's wiring): if the Praxis domain has been
    opened at least once this session and the currently-rendered board's own `_id` matches
    `sessionId` (or no board is loaded yet and one now might exist — re-run the chapter-scoped GET
    either way is acceptable), refetch and re-render. No-ops otherwise.

## Acceptance Criteria — CSS

17. New classes for the claim card, support chip, and bottom sheet, added to `public/css/admin-layout.css`
    (or `components.css` if a reviewer judges the components generic enough to belong there — dev-story's
    call, but keep them in ONE file, not split), built 1:1 off the locked mockup's own inline CSS,
    translated to real `var(--token)` references throughout (the mockup's inline `:root` block was a
    hand-copy of `theme.css` for portability only — the shipped CSS must reference the real
    `theme.css` custom properties directly, never redeclare them). No bare hex, no `rgba()` literal,
    no inline `style="..."` from JS — this repo's hard CSS rule (`specs/project-context.md` §1)
    applies in full. The existing `.char-chip` class is reused unmodified, not overridden.

## Tasks / Subtasks

1. Read `public/js/admin/roll-feed.js` in full (the WS-wiring + "no-op until domain opened" shape),
   `public/js/admin/cycle-views.js`'s `declaresPhase`/chapter-selection logic, and
   `server/routes/praxis-sessions.js`'s `attendeePool()` before writing any new code (AC5, AC8).
2. Add the sidebar button + domain section to `public/admin.html` (AC1).
3. Wire `switchDomain` (AC2).
4. Extend `public/js/data/ws.js` with the new `praxis_session` message type (AC3).
5. Wire `admin.js`'s `initWS({...})` call with `onPraxisUpdate` (AC4).
6. Write `public/js/admin/praxis-tab.js`: chapter resolution, board fetch/create, pool strip,
   claimant cards, bottom sheet, all five write actions (open claim, withdraw claim, assign support,
   unassign support, WS refetch) (AC5-16).
7. Write the new CSS (AC17), matching the locked mockup exactly.
8. Write `tests/prax-2-claim-board.spec.js` (Playwright) covering: empty → open → populated;
   tap pool chip → sheet with correct name; open-claim-instead flow; assign support (chip moves,
   tally updates); unassign support; withdraw claim (status line shows the right
   `supporters_released` count); the 409-open race falls through without an error state.
9. Run the new spec plus a quick sanity pass on `tests/dtui-*`/`tests/*admin*` for a regression
   check on the sidebar/domain-switching shell (a new sidebar button changes DOM order other specs
   may query by index rather than selector — check for that class of fragility before calling this
   done).

## Dev Notes

### Files this story touches

- `public/admin.html` — sidebar button + domain section (AC1).
- `public/js/admin.js` — `switchDomain` dispatch line, `initWS({...})` entry (AC2, AC4).
- `public/js/data/ws.js` — new `praxis_session` message type (AC3).
- `public/js/admin/praxis-tab.js` — NEW, the whole board (AC5-16).
- `public/css/admin-layout.css` (or `components.css`, pick one — AC17) — new claim-card/support-chip/
  bottom-sheet classes.
- `tests/prax-2-claim-board.spec.js` — NEW Playwright spec.

### Reuse precedents (read before writing new code)

- `specs/mockups/prax-2-claim-board/index.html` — the locked design. Build to it.
- `public/js/admin/roll-feed.js` — the only existing admin view already wired into `initWS`'s
  dispatcher; its "no-op until this domain has been opened at least once" guard is exactly what
  AC16 needs, and its comment block explains why (nothing to paint into before the domain first
  renders).
- `public/js/admin/city-views.js` / `cycle-views.js` — `apiGet`-then-render module shape, and
  `cycle-views.js`'s own `declaresPhase`/game_number-desc chapter selection (AC5).
- `public/js/data/accessors.js` — `calcCityStatus(c)` (AC10) and `setStatusTerritories(territories)`
  (AC8), the exact composed helper this story needs; do not call `city-status-calc.js`'s
  `calcEffectiveCityStatus` directly and re-derive the regent-ambience argument by hand.
- `server/routes/praxis-sessions.js`'s `attendeePool()` (AC8) — read before writing the client-side
  attendee-pool fetch so the two cannot silently check a different attendance flag.
- `public/css/components.css`'s `.char-chip` (AC9, AC17) — reused verbatim, not modified.
- `specs/stories/tbid-1-territory-bid-open-flow.md` (branch `ms/tbid-1-territory-bid-open-flow`,
  not yet merged, read via `git show` if the working tree doesn't have it) — the nearest sibling
  story for "no jsdom in this repo" testing precedent (see Testing standards below) and for its own
  "single-file, `window.*`-exposed handlers, one `render()` rebuilds `innerHTML`" module shape,
  though this story's own module is new, not a rework of an existing file the way TBID.1 was.

### Testing standards summary

- **No jsdom is configured in this repo** (confirmed precedent: TBID.1's own Dev Notes flagged this
  explicitly for `territory.js`). Any pure-logic helper this story factors out (pool-minus-support
  set math, chapter resolution, badge derivation) CAN get direct vitest coverage if written as a
  small exported function with no DOM dependency — do this where it's cheap, but do not force DOM
  rendering into a vitest suite that has no jsdom to run it against.
- **Playwright is the real coverage for this story** — `tests/prax-2-claim-board.spec.js` (AC's own
  Task 8). Boot via this repo's existing admin-login test helper (whatever other admin-domain specs
  use — grep `tests/*.spec.js` for the shared boot pattern rather than reinventing one).
- `cd server && npx vitest run` for any new pure-logic file, and
  `npx playwright test tests/prax-2-claim-board.spec.js` for the new spec — **never run two
  Playwright invocations concurrently**, they share port 8080 (root `CLAUDE.md`).
- This story adds zero server-side changes, so `server/tests/prax-1-schema-scaffold.test.js`
  (already 53/53 green) is not expected to change; re-run it only if `praxis-tab.js`'s own manual
  testing surfaces a prax-1 route behaving unexpectedly (which would itself be a prax-1 regression
  worth its own finding, not something to silently patch around client-side).

## Dev Agent Record

*(filled in during dev-story)*

## Senior Developer Review

*(filled in during the independent review pass)*

## Change Log

- 2026-08-29 — Story created (orchestrator, `/bmad-epic-loop`), design-lock done and confirmed by
  Angelus first (`specs/mockups/prax-2-claim-board/index.html`). Depends on prax-1 (done). Branch
  not yet cut.
