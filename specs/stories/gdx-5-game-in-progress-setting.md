# Story gdx.5: `game_in_progress` setting — app_settings key, admin toggle, player-readable GET, WS push

Status: done

## Story

As a Storyteller running Terra Mortis,
I want a single global flag that says whether a game session is currently live, readable by any
authenticated player and toggleable only by an ST, that propagates to every open player tab without
a reload,
so that game-day features gated to "only while a session is actually happening" — starting with
gdx.7's vitae/willpower one-tap roll spend — have one real signal to gate on, instead of nothing.

## Why this story exists

Angelus asked directly (2026-08-15) whether the player dice roller lets players click to spend Vitae
or Willpower. It does not — confirmed by reading `public/js/suite/roll.js` and `roll-v2.js`, neither
of which mentions Vitae or Willpower at all. That feature is real and already scoped: **GDX-7**
(GitHub #988), "apply vitae/WP costs on roll during `game_in_progress` (one-tap confirm)" — the roll
button becomes "Roll & spend N Vitae[, M WP]", deducts through the existing tracker, and a WP(+3)
chip also deducts 1 WP when used, all gated on a `game_in_progress` flag so the auto-spend only fires
during an actual live session (never during downtime prep, when nothing should be draining).

GDX-7 depends on two prerequisites (GitHub #981's own sequencing: `986 ∥ 987 → 988 → 989`):
**GDX-6** (#987, structured `vitae_cost`/`willpower_cost` fields on powers — currently free text like
`"1 V"` that nothing can read programmatically) and **this story, GDX-5** (#986, the flag itself: an
`app_settings` key, an admin toggle, an open-to-all-players GET, and a live WS push so the flag
doesn't need a page reload to take effect at the table).

This story is the smaller, independent half of that pair — no dependency on GDX-6, and GDX-7 cannot
start meaningfully without it. Picked up first for that reason.

## What this story is NOT

- NOT the roll-spend feature itself. This story adds no vitae/willpower behaviour anywhere — it adds
  one boolean flag and the plumbing to read/write/broadcast it. GDX-7 is the story that reads this
  flag and changes roll behaviour.
- NOT the structured cost fields on powers (GDX-6, #987) — a separate, unrelated prerequisite for
  GDX-7 that this story does not touch.
- NOT a change to how `st_mods_enabled` (the one existing `app_settings` key) behaves today, beyond
  the side effect of AC4 below (see Dev Notes — Existing Behaviour Change, Not Just an Addition).
- NOT the "roller locks on game day until the player has signed in" attendance-gate concept from the
  25 Jul meeting notes (`2026-07-25_meeting-lessons.md` §2.8). That is a *different* mechanism
  (attendance/sign-in-based) from this flag (an ST-set on/off switch for "is a session live right
  now"). Do not conflate them or try to derive one from the other.
- NOT a new admin sidebar domain. The epic's own issue text says "Admin toggle (Engine domain)" —
  stale: `public/js/admin.js:313` shows the Engine domain was already removed ("Engine tab removed —
  dice, feeding, session tracker were Engine-only tools"). See Dev Notes — Toggle Placement for where
  this story puts the control instead, and why.

## Acceptance Criteria

1. `server/routes/app-settings.js`'s `ALLOWED_KEYS`/`VALIDATORS`/`defaultSettings()` gain
   `game_in_progress` (boolean, default `false`) — same shape as the existing `st_mods_enabled` key,
   added alongside it, not replacing it.
2. `GET /api/settings` is opened to **any authenticated role**, not ST-only. Remove the route-level
   `requireRole('st')` from the `GET /` handler only (`server/routes/app-settings.js`); the mount-level
   `requireAuth` in `server/index.js:196` already covers "must be logged in" and needs no change.
   `PATCH /api/settings` keeps its existing `requireRole('st')` — writes stay ST-only.
3. A new `broadcastSettingsUpdate()` function in `server/ws.js`, following `broadcastCatalogueUpdate`'s
   exact shape (lines 123-135: iterate `_wss.clients`, send a small typed JSON frame to every OPEN
   socket, no-op if `_wss` is null). Frame shape: `{ type: 'settings' }` — no payload needed, since the
   client's job on receipt is just "refetch the whole settings doc", mirroring the catalogue frame's
   own minimalism (`{ type: 'catalogue', item_id, op }` still triggers a full refetch on the client
   side, not a partial patch).
4. `PATCH /api/settings` calls `broadcastSettingsUpdate()` once, after a successful write (any
   successful PATCH, not just a `game_in_progress` change — the whole settings doc is small enough
   that broadcasting on any key change and letting the client refetch is simpler and safer than
   tracking which key changed, and it is a strict improvement for `st_mods_enabled` too, which today
   has no live-broadcast path at all — see Dev Notes).
5. Client: `public/js/data/ws.js` gains an `onSettingsUpdate` callback (mirroring `onCatalogueUpdate`
   exactly — see `_handleCatalogueMsg`, lines 192-195) and a `'settings'` case in `onmessage`'s type
   dispatch.
6. Client: `public/js/app.js`'s existing `initWS({...})` call (around line 1502) gains
   `onSettingsUpdate: () => { loadGlobalSettings(); }`, reusing the *existing*
   `public/js/data/app-settings.js` cache module unchanged — `loadGlobalSettings()` already
   refetches and re-caches the whole doc; this story does not touch that function's own logic, only
   what triggers it.
7. `public/js/data/app-settings.js`'s header comment (lines 1-12) is corrected: it currently states
   "No live polling... this is a debug/emergency lever, not a live broadcast" as a deliberate design
   choice. That statement becomes false the moment AC4/AC6 land — update it to describe the new
   WS-driven refetch instead of leaving stale, contradicted documentation in place.
8. Admin toggle: a second toggle row in `public/js/admin/st-mods-panel.js`, next to the existing
   `st_mods_enabled` master-switch toggle (lines ~114-123), wired the same way (`data-*` attribute,
   change listener, `apiPatch('/api/settings', { game_in_progress: newValue })` — mirrors line 361's
   existing call exactly). See Dev Notes — Toggle Placement for why this file, not a new domain.
9. Real test coverage: server-side auth-boundary tests (GET now 200 for a player, not 403; PATCH still
   403 for a player), the new `broadcastSettingsUpdate` emission on PATCH (mirroring
   `stm-9-ws-broadcast.test.js`'s `vi.spyOn(wsModule, 'broadcastStModUpdate')` pattern applied to the
   new function), and the existing `server/tests/api-app-settings.test.js`'s own
   `'403 on GET as player'` test **updated to expect 200**, not left red or silently deleted — see Dev
   Notes — A Test Asserts the Behaviour This Story Changes.

## Tasks / Subtasks

- [x] Task 1 — Server: open the flag + the read (AC: 1, 2)
  - [x] Add `game_in_progress` to `ALLOWED_KEYS`, `VALIDATORS`, and `defaultSettings()` in
        `server/routes/app-settings.js`.
  - [x] Remove `requireRole('st')` from the `GET /` route handler only. Confirm `PATCH /` keeps it.
  - [x] Update `server/tests/api-app-settings.test.js`'s `'403 on GET as player'` test (under the
        `AC#4 — auth` describe block) to assert `200`, not `403`. Do not touch the PATCH-as-player
        test — that one stays `403`, unchanged.
- [x] Task 2 — Server: WS broadcast (AC: 3, 4)
  - [x] `broadcastSettingsUpdate()` in `server/ws.js`, modelled on `broadcastCatalogueUpdate` (same
        file, lines 123-135) — `{ type: 'settings' }`, no payload.
  - [x] Call it from `PATCH /` in `app-settings.js`, after the `findOneAndUpdate` succeeds, for any
        successful patch (not conditional on which key changed).
  - [x] New test file or an addition to `api-app-settings.test.js`: `vi.spyOn(wsModule,
        'broadcastSettingsUpdate')`, assert it fires once on a successful PATCH and not at all on a
        rejected one (unknown key / bad type) — same shape as `stm-9-ws-broadcast.test.js`'s own
        "failed write does NOT emit" case.
- [x] Task 3 — Client: WS handler + cache wiring (AC: 5, 6, 7)
  - [x] `public/js/data/ws.js`: `_onSettingsUpdate` module-level var, `opts.onSettingsUpdate` in
        `initWS`, `'settings'` branch in `onmessage`'s dispatch, and a `_handleSettingsMsg(msg)`
        function mirroring `_handleCatalogueMsg`'s one-liner shape (call the callback, no echo
        suppression needed — a settings refetch is cheap and idempotent, unlike per-field tracker
        state).
  - [x] `public/js/app.js`: add `onSettingsUpdate: () => { loadGlobalSettings(); }` to the existing
        `initWS({...})` call. Import `loadGlobalSettings` from `./data/app-settings.js` if not already
        imported in this file's scope (it is already imported in `admin.js`; confirm `app.js`'s own
        import list before assuming). Confirmed already imported at `app.js:106`.
  - [x] Correct `public/js/data/app-settings.js`'s header comment (the "No live polling... not a live
        broadcast" paragraph) to describe the new WS-driven refetch path this story adds.
- [x] Task 4 — Admin toggle (AC: 8)
  - [x] Second toggle row in `public/js/admin/st-mods-panel.js`, next to the existing
        `st_mods_enabled` one. Reuse the same `.stm-toggle` markup/class, a new `data-stm-toggle`
        value (e.g. `"game-in-progress"`), a hint line explaining what it gates ("On while a game
        session is live — gates game-day features like roll-spend automation. Off otherwise.").
  - [x] Change handler mirrors the existing one at line ~361: `apiPatch('/api/settings', {
        game_in_progress: newValue })`.
- [x] Task 5 — Full changed-area regression (AC: 9)
  - [x] Run `server/tests/api-app-settings.test.js` (updated), the new/extended WS-broadcast test, and
        `server/tests/stm-9-ws-broadcast.test.js` (unrelated but same module, sanity check nothing in
        `ws.js` regressed). 38/38 across api-app-settings (16), stm-9-ws-broadcast, and stm-10-lifecycle.
  - [x] Confirm no other file references `app-settings.js`'s old header comment's claims (grep for
        "not a live broadcast" / "No live polling" to be sure nothing else quotes it as still true).
        Found one real hit beyond this story's own files: `specs/architecture/adr-004-st-mods-overlay.md`
        §D2, the actual source ADR the old comment cited — added a dated "Superseded 2026-08-15"
        addendum there rather than silently rewriting the original decision text.

### Review Findings

Internal 3-layer review (Blind Hunter, Edge Case Hunter, Acceptance Auditor), 2026-08-15. 22 raw
findings across the three layers, deduplicated to 12 unique issues.

- [x] [Review][Patch] Admin app's own `initWS({...})` call is never wired with `onSettingsUpdate` — the toggle's OWN panel doesn't get the live update it promises [public/js/admin.js:223-246]. Fixed: new exported `refreshStModsPanelSettings()` in `st-mods-panel.js` (no-op unless the panel is open with a character selected), wired into `admin.js`'s own `initWS({...})` alongside `loadGlobalSettings()`.
- [x] [Review][Patch] `GET /api/settings` returns a partially-shaped doc verbatim instead of backfilling missing default keys (a pre-existing live doc, or one upserted by a PATCH-before-any-GET, can be missing `game_in_progress` or `st_mods_enabled` entirely) [server/routes/app-settings.js:57-64, 103-107]. Fixed: GET now merges any `ALLOWED_KEYS` missing from the stored doc with `defaultSettings()`'s value before responding — response-only, never written back; audit fields untouched. Prove-discriminated (reverted, watched the new test fail `undefined`≠`false`, restored, watched it pass) and covered by a new test with a hand-seeded partial doc.
- [x] [Review][Patch] Test cleanup/reset statements run after assertions, not in try/finally — a failing assertion leaves the shared `global` doc mutated for later tests in the file [server/tests/api-app-settings.test.js — AC#4 GET-as-player test, gdx.5 AC1 PATCH test]. Fixed: both wrapped in try/finally.
- [x] [Review][Patch] Toggle placed after the unrelated per-character `suppress` toggle instead of next to the `st_mods_enabled` master switch, per AC8's literal wording [public/js/admin/st-mods-panel.js:~123]. Fixed: reordered so both global settings toggles are adjacent, `suppress` (per-character) moved after them.
- [x] [Review][Patch] New gdx.5 test `describe` blocks are out of AC-numeric order in the file (reads 4,1,3 instead of 1,3,4) — cosmetic [server/tests/api-app-settings.test.js]. Fixed: reordered so `gdx.5 AC1` precedes `gdx.5 AC3/AC4`.
- [x] [Review][Patch] ADR-004 addendum states "a strict improvement, not a regression" as settled fact rather than a judgement call — soften wording [specs/architecture/adr-004-st-mods-overlay.md]. Fixed: reworded to name it as a reasoned intent, not a settled, unchallengeable fact.
- [x] [Review][Defer] `broadcastSettingsUpdate` has no try/catch around `ws.send` in its client loop [server/ws.js] — deferred, identical to the pre-existing shape of `broadcastCatalogueUpdate`/`broadcastStModUpdate`/`broadcastTrackerUpdate` in the same file; fixing one alone would be inconsistent, belongs in a dedicated hardening pass across all four
- [x] [Review][Defer] No UI feedback beyond `console.error` on toggle PATCH failure, no guard against rapid double-toggle races [public/js/admin/st-mods-panel.js, `_onGameInProgressToggle`] — deferred, mirrors `_onGlobalToggle`'s own existing behaviour exactly, which AC8 explicitly instructed this code to copy
- [x] [Review][Defer] Rapid successive settings PATCHes can trigger out-of-order concurrent client refetches (response arrival order, not request order) [public/js/data/ws.js `_handleSettingsMsg`, public/js/data/app-settings.js `loadGlobalSettings`] — deferred, same unguarded-refetch class of risk as the pre-existing `onCatalogueUpdate` pattern, not unique to or introduced by this story

**Dismissed (7, noise or already-deliberate):** unhandled-rejection claim on `onSettingsUpdate`/`_handleSettingsMsg` (false positive — `loadGlobalSettings()` already try/catches internally and never rejects, verified by reading the function); GET auth removal "widens exposure beyond stated need" (already named and accepted in this story's own "Minor Disclosure Widening" Dev Note, and the Acceptance Auditor — which had spec access — found no AC violation); broadcast firing on no-op PATCHes (deliberate, AC4's own explicit behaviour, tested by name); ambiguous `AC1` vs `AC#1` test-block naming (already visually distinguished by the `gdx.5` prefix); redundant ON/OFF label text (mirrors the master toggle's own established convention, per AC8's "wired the same way" instruction); zero-granularity broadcast payload (deliberate, reasoned through in this story's own Dev Notes).

## Dev Notes

### Minor Disclosure Widening, Worth a Deliberate Look

Opening GET to all authenticated roles (AC2) also opens `updated_by` (the last-editing ST's
`discord_id`/`discord_name`, per `creatorFromUser()`) to every player, where today only STs can see
it. Low severity in this app's context — STs are not anonymous to players in any other surface — but
it is a real, if small, disclosure widening a player didn't have yesterday, so name it rather than let
it pass unnoticed. No action required unless the dev agent judges it worth trimming `updated_by` from
the player-visible response; if so, that is a `GET /` response-shaping change, not a schema change.

### Existing Behaviour Change, Not Just an Addition

This story is not purely additive. AC4's "broadcast on any successful PATCH" means
`st_mods_enabled` — which today has **no live-broadcast path at all** (its own header comment states
this explicitly as a deliberate STM-era choice: "the player app picks up flips on next reload... this
is a debug/emergency lever, not a live broadcast") — becomes live-broadcast too, as a side effect of
this story rather than its own goal. This is a real, deliberate behaviour change to existing
functionality, not scope creep to avoid: scoping the broadcast to `game_in_progress` only would mean
either a second, narrower broadcast function (real duplication for no benefit — the client-side
handler already just refetches the whole doc either way) or threading "which key changed" through the
PATCH handler for no consumer that needs it. Broadcasting on every settings PATCH is simpler, and
making `st_mods_enabled` live too is a strict improvement, not a regression — call it out in the
Dev Agent Record and in AC4 itself so it isn't mistaken for an accidental scope change at review time.

### Toggle Placement

The parent GitHub issue (#986) says "Admin toggle (Engine domain)". That domain does not exist in the
current app — `public/js/admin.js:313` shows it as an empty stub with the comment "Engine tab
removed — dice, feeding, session tracker were Engine-only tools". `CLAUDE.md`'s own architecture
section still lists "Engine (session log)" as a sidebar domain, which is equally stale relative to the
real code; do not trust it here.

The only existing UI that edits `/api/settings` today is the ST Mods panel
(`public/js/admin/st-mods-panel.js`), which already has exactly the toggle shape this story needs (a
checkbox, a change listener, an `apiPatch('/api/settings', {...})` call — lines ~114-123 and 361).
It is a slightly odd home topically (a global game-day flag living inside the ST-mods workbench), but
it is the *only* real settings-editing surface that exists, it already has the right markup/CSS
classes to extend, and inventing a new admin domain or panel for one checkbox is disproportionate.
Put the toggle there. If a dedicated "Settings" admin domain gets built later for other reasons, this
toggle (and `st_mods_enabled`'s) can move together — not this story's job.

### A Test Asserts the Behaviour This Story Changes

`server/tests/api-app-settings.test.js`'s existing `AC#4 — auth` block has:
```js
it('403 on GET as player', async () => {
  const res = await request(app).get('/api/settings').set('X-Test-User', playerUser());
  expect(res.status).toBe(403);
});
```
This is not a bug to work around — it is a real, currently-correct test of the current (about-to-change)
behaviour, written when GET was ST-only. AC2 makes GET open to any authenticated role, so this
specific assertion must flip to `200`, not be quietly deleted or left red. The sibling
`'403 on PATCH as player'` test directly below it is untouched — PATCH stays ST-only. This is the same
shape of "update the test that codified the old behaviour, don't just patch around it" this project
has hit twice already today (`issue-1141-office-tab-render.test.js`'s merit-dots-visibility test, and
`feature.691.hos-city-status-power.test.js`'s literal gate regex) — treat it the same way: change the
assertion deliberately, note why in the Dev Agent Record, don't leave a false negative.

### Project Structure Notes

- Modified files: `server/routes/app-settings.js`, `server/ws.js`, `public/js/data/ws.js`,
  `public/js/app.js`, `public/js/data/app-settings.js` (comment only), `public/js/admin/st-mods-panel.js`,
  `server/tests/api-app-settings.test.js`.
- No new files expected — every piece of this story extends an existing module with an established
  precedent to mirror (`st_mods_enabled` for the settings key shape, `broadcastCatalogueUpdate` for
  the WS frame, `onCatalogueUpdate`/`_handleCatalogueMsg` for the client handler,
  `refetchEquipmentCatalogue`-style cache-invalidation-on-broadcast for the client wiring).
- Does not touch `server/lib/office-seat-resolve.js`, `office-actions.js`, `cycle-phase.js`, or
  anything downtime-cycle-phase-related — `game_in_progress` is a deliberately separate concept from
  a downtime cycle's own `phase === 'game'` state (used by Status Actions' `currentCycleInGamePhase`
  gate). Do not merge the two ideas; a future story may relate them, this one does not.

### References

- [Source: server/routes/app-settings.js] — the whole file; `ALLOWED_KEYS`/`VALIDATORS`/
  `defaultSettings()` (lines 22-34), `GET /` (47-64, currently `requireRole('st')` at line 47),
  `PATCH /` (66-99, `requireRole('st')` at line 71, unchanged by this story).
- [Source: server/index.js:196] — `/api/settings` mount: `requireAuth, noCache()` only at mount level;
  the route-level `requireRole('st')` on GET (being removed) is `app-settings.js`'s own, not the
  mount's.
- [Source: server/ws.js:123-135] — `broadcastCatalogueUpdate`, the exact shape to mirror.
- [Source: public/js/data/ws.js:1-65, 97-104, 192-195] — `initWS` opts shape, `onmessage` dispatch,
  `_handleCatalogueMsg` (the no-echo-suppression precedent to mirror, not `_handleStModMsg`'s
  echo-suppressed one — this settings flag has no concept of "the client's own recent write" worth
  suppressing).
- [Source: public/js/app.js:61-65, 1500-1525] — the equipment-catalogue cache-refetch-on-broadcast
  precedent (`onCatalogueUpdate: () => { refetchEquipmentCatalogue(); }`), the exact pattern this
  story's `onSettingsUpdate` wiring copies.
- [Source: public/js/data/app-settings.js] — the whole file; `loadGlobalSettings()`/
  `getGlobalSettings()` need no logic change, only the header comment (lines 1-12) correcting its
  now-false "not a live broadcast" claim.
- [Source: public/js/admin/st-mods-panel.js:100-123, 355-367] — the existing `st_mods_enabled` toggle
  markup and its `apiPatch('/api/settings', {...})` change handler, the shape to duplicate for
  `game_in_progress`.
- [Source: public/js/admin.js:313] — proof the "Engine domain" the parent issue names is stale (the
  domain branch is an empty stub with a removal comment).
- [Source: server/tests/api-app-settings.test.js] — full existing coverage; the `'403 on GET as
  player'` test (lines 43-46) that AC9/Task 1 requires flipping to 200.
- [Source: server/tests/stm-9-ws-broadcast.test.js:22-51] — the `vi.spyOn(wsModule,
  'broadcastStModUpdate')` test pattern this story's own WS-broadcast test (Task 2) mirrors.
- [Source: D:\Terra Mortis\2026-07-25_meeting-lessons.md §2.8, §2.13] — the original "Roller redesign"
  and "ST game cockpit" decision text: vitae/willpower auto-deduct on roll with ST-gated refunds,
  damage always ST-adjudicated (never automated), reliquaries/blood fruits/influence stay physical.
  Originally recorded "Peter-owned" — superseded, see `CLAUDE.md`'s branching section on Peter
  stepping back 2026-08-09.
- [Source: D:\Terra Mortis\2026-07-25_meeting-decisions-log.md] — read in full for this story; no
  ruling in it concerns the roller redesign directly (it covers TM Wiki/Cockpit-side items from the
  same meeting), included here only to record that it was checked, not skipped.
- [Source: GitHub #981 (Epic GDX), #986 (GDX-5), #987 (GDX-6), #988 (GDX-7)] — issue text for AC/scope
  cross-reference; `gh issue view <n>` to re-read verbatim if needed.

## Dev Agent Record

### Implementation Plan

Followed the story's own precedent citations exactly, no deviation: `st_mods_enabled`'s shape for the
new key, `broadcastCatalogueUpdate` for the WS frame, `onCatalogueUpdate`/`_handleCatalogueMsg` for
the client handler, the equipment-catalogue refetch-on-broadcast wiring in `app.js`, and
`stm-9-ws-broadcast.test.js`'s `vi.spyOn(wsModule, ...)` pattern for the broadcast test. Tasks 1-2
(server) were implemented together since they touch the same two files in one coherent change, then
tests were written/run to prove both — not strict single-task TDD, but every assertion was run RED
before the corresponding code existed (see below) and GREEN after.

### Debug Log

- RED confirmed before implementation: added the three gdx.5 test assertions (`200` on GET-as-player,
  `game_in_progress: false` default, `game_in_progress` PATCH acceptance) against the *unmodified*
  route first — ran `npx vitest run tests/api-app-settings.test.js`, got exactly 3 failures (403≠200,
  `undefined`≠`false`, 400≠200), confirming the tests were real and the route hadn't already changed.
- One self-inflicted test-ordering bug found and fixed during GREEN: the new "200 on GET as player"
  test (in the `AC#4 — auth` block, which runs before `AC#1 — GET auto-seeds...` in file order) started
  auto-seeding the `global` doc as a side effect once GET stopped 403'ing before reaching the handler —
  something a player-role GET could never do before this story. That broke AC#1's own "doc absent"
  precondition on a subsequent run. Fixed by having the new test clean up its own seed
  (`deleteOne({ _id: 'global' })`) rather than relying on file-level `beforeAll`/`afterAll` alone, since
  test *order within* a file isn't otherwise reset between individual `it` blocks.
- No `--apply`/live-write concern — this story is pure application code (routes, WS, client), touches
  no migration script and no live `tm_suite` data.

### Completion Notes

- All 9 ACs satisfied, all 5 tasks complete.
- Server: `game_in_progress` added to `app-settings.js`'s whitelist/validators/defaults;
  `GET /api/settings` opened to any authenticated role (route-level `requireRole('st')` removed,
  `PATCH` keeps it); `broadcastSettingsUpdate()` added to `ws.js` and wired into the PATCH handler,
  firing on any successful write (both flags), never on a rejected one.
- Client: `ws.js` gained the `onSettingsUpdate` callback/dispatch/handler (mirrors the catalogue
  pattern exactly, no echo suppression — a settings refetch is cheap and idempotent); `app.js`'s
  `initWS({...})` wired to `loadGlobalSettings()` on receipt; `app-settings.js`'s header comment
  corrected (it asserted "not a live broadcast" as a deliberate design choice — that's now false, and
  the comment says so).
- Admin toggle: a second `.stm-toggle` row in `st-mods-panel.js`, `data-stm-toggle="game-in-progress"`,
  `_onGameInProgressToggle` mirroring `_onGlobalToggle` exactly (PATCH → refresh cache → re-render →
  revert-on-failure).
- **Deliberate behaviour change, not an accident** (flagged in the story's own Dev Notes and worth
  restating here for the reviewer): `st_mods_enabled` is now live-broadcast too, as a side effect of
  broadcasting on *any* successful settings PATCH rather than building a second, narrower broadcast
  path. Strict improvement — it previously had no live-broadcast path at all (see the ADR-004
  correction below).
- **Doc correction beyond the story's own file list**: `specs/architecture/adr-004-st-mods-overlay.md`
  §D2 was the actual source of the "not a live broadcast" design claim the code comment quoted. Added
  a dated "Superseded 2026-08-15" addendum there (not a silent rewrite) so a reader who checks the ADR
  directly, not just the code comment, sees the current truth.
- **Test-drift pattern hit a third time today**: `api-app-settings.test.js`'s `'403 on GET as player'`
  test asserted exactly the behaviour AC2 changes. Flipped to `200` deliberately, per the story's own
  Dev Notes instruction, not silently deleted.
- Regression: 39/39 across `api-app-settings.test.js` (17, up from 10), `stm-9-ws-broadcast.test.js`,
  `stm-10-lifecycle.test.js`. `node --check` clean on all 8 modified files. No Playwright/e2e coverage
  exists for `st-mods-panel.js`/`ws.js`/`admin.js` client rendering today (confirmed by glob search
  before starting) — consistent with the equipment-catalogue precedent this story mirrors, which also
  has no dedicated client-side test file for its own WS wiring.

### Post-Review Patch Round (2026-08-15)

Internal 3-layer review found 6 real, unambiguous `patch` findings (see Review Findings above) — all
applied. The two worth flagging beyond the checklist:

- **`admin.js` had no `onSettingsUpdate` wiring at all.** Genuinely missed in the original
  implementation — `app.js` (the player/suite app) was wired per AC6, but `admin.js` is a *second*,
  separate `initWS({...})` call for the ST-only admin surface, and the toggle this story built lives
  *inside* that surface. Without the fix, an ST's own ST Mods panel wouldn't see another ST's remote
  toggle live, directly contradicting the toggle's own hint text. Fixed with a new exported
  `refreshStModsPanelSettings()` (no-op unless the panel is open with a character selected) rather than
  blindly re-invoking `initStModsPanel`, which needs a rootEl/character and could paint over an unrelated
  view.
- **GET's backfill fix is a real behavioural change, not cosmetic** — prove-discriminated (reverted,
  confirmed the new test fails `undefined`≠`false`, restored, confirmed it passes) and covered by a new
  test using a hand-seeded partial doc, proving both that the backfill happens and that it never writes
  back to the stored document.

Regression after the patch round: 39/39 (was 39, +1 new backfill-proof test count already reflected
above — no test lost or skipped across the round).

### File List

- `server/routes/app-settings.js` — MODIFIED (game_in_progress key; GET opened; broadcast call;
  post-review: GET backfills missing ALLOWED_KEYS on a partial doc, response-only)
- `server/ws.js` — MODIFIED (new `broadcastSettingsUpdate()`)
- `server/tests/api-app-settings.test.js` — MODIFIED (403→200 flip, new game_in_progress coverage,
  new broadcast-spy coverage; post-review: try/finally on both reset/cleanup tests, new backfill-proof
  test, describe-block reorder)
- `public/js/data/ws.js` — MODIFIED (`onSettingsUpdate` callback, `'settings'` dispatch,
  `_handleSettingsMsg`)
- `public/js/app.js` — MODIFIED (`onSettingsUpdate` wired into `initWS({...})`)
- `public/js/admin.js` — MODIFIED (post-review: `onSettingsUpdate` wired into its own, separate
  `initWS({...})` call; imports `refreshStModsPanelSettings`)
- `public/js/data/app-settings.js` — MODIFIED (header comment only, no logic change)
- `public/js/admin/st-mods-panel.js` — MODIFIED (new toggle row, dispatch branch,
  `_onGameInProgressToggle`; post-review: toggle reordered next to the master switch, new exported
  `refreshStModsPanelSettings()`)
- `specs/architecture/adr-004-st-mods-overlay.md` — MODIFIED (dated addendum correcting §D2's
  "not a live broadcast" claim; post-review: softened "strict improvement" wording)
- `specs/stories/sprint-status.yaml` — MODIFIED (epic-gdx block added; gdx-5 tracked through its
  status lifecycle)
- `specs/stories/deferred-work.md` — MODIFIED (3 deferred review findings logged)

### Change Log

- 2026-08-15: Story implemented end to end in one session. All 5 tasks, all 9 ACs. 38/38 targeted
  regression. Status: ready-for-dev → review.
- 2026-08-15: Internal 3-layer code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor).
  0 decision-needed, 6 patch (all applied), 3 defer (logged to deferred-work.md), 7 dismissed. 39/39
  regression after patches. Status: review → done.
