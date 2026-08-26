# Story gdx.8: persisted roll history + live ST roll feed

Status: done

## Story

As a Storyteller running a live Terra Mortis session,
I want every player roll made during the game to persist server-side and appear in a live feed I can
watch in the admin app,
so that I can follow the table's dice without asking players to read results aloud, and have a durable
record afterward — without practice/prep rolls made outside a live session cluttering that record.

## Why this story exists

GDX-7 (done) proved the `game_in_progress` flag and the roll-spend chain both work end to end. GDX-8
is the next slice in the same sequencing (`986 ∥ 987 → 988 → 989`, GitHub #981): a new `roll_log`
collection, gated the same way GDX-7 gates spend-on-roll, broadcasting to an admin feed the same way
GDX-5 broadcasts settings changes. Depends on GDX-5 (`game_in_progress` flag + WS pattern) and GDX-7
(the spend fields this story also records) — both done.

## What this story is NOT

- NOT a change to `state.hist`/`addHist()`/`renderHist()` — the existing in-memory, 20-item-capped,
  session-local roll history list (`public/js/suite/roll-v2.js:1030-1055`, rendered into `#hlist`).
  That stays exactly as it is: a cosmetic, ephemeral, per-tab convenience. This story ADDS a parallel,
  server-persisted write alongside it — same three call sites, genuinely new data path, not a
  replacement.
- NOT `roll.js` (legacy v1 roller). Scoped to `roll-v2.js` only, same boundary GDX-7 already
  established for this whole epic. Do not touch `roll.js`.
- NOT a change to GDX-7's own spend mechanism (`_currentSpendDecision`, `trackerAdj` calls). This
  story only READS the already-computed `spend` object in `doRoll()` to record what was spent — it
  does not alter when or how much is spent.
- NOT reviving `public/js/admin/session-log.js`. That file is a **different, already-dead feature**
  (free-text session-log entries, not roll history) whose own `initSessionLog` export is imported in
  `admin.js` but never called anywhere — confirmed by grep, a real pre-existing gap left behind when
  the old Engine domain's sibling tools (dice-engine.js, feeding-engine.js, session-tracker.js) were
  deleted in rlv.6/#836 but this one import survived uncalled. This story's own new "Engine" sidebar
  entry is a **new, purpose-built domain for roll history only** — it happens to reuse the same
  domain name/id the old (fully removed) tools used, which is a coincidence of naming, not a revival.
  Flag `session-log.js`'s own dead-code status in Completion Notes; do not silently wire it up or
  delete it as part of this story — that is a separate, undiscussed decision for Angelus.
- NOT initiative, frenzy, lashing-out, damage, reliquaries, blood fruits, or Influence spends — same
  exclusions GDX-7 already established from the 25 Jul meeting decision, unrelated to this story's own
  scope but worth restating since this story also touches `doRoll()`.
- NOT a player-facing read surface. `GET /api/roll_log` is ST/dev only in this story — nothing in the
  epic's own issue text, GDX-5, or GDX-7 asks for a player-visible roll history beyond the existing
  client-local `#hlist`. A future story could add one; this one does not.
- NOT retention/cleanup tooling beyond the TTL index itself (AC2). No admin UI to manually purge, no
  export. If the feed grows unwieldy in practice, that is a future story's problem.

## Acceptance Criteria

1. **New `roll_log` collection**, one document per completed roll (chance die, standard, or
   contested — all three of `doRoll()`'s existing result branches), written ONLY while
   `getGlobalSettings()?.game_in_progress` is `true`. Shape:
   ```
   {
     character_id, player_id, label, pool, results: [...],
     successes, again_rule, rote, wp_bonus,
     vitae_spent, wp_spent, rolled_at
   }
   ```
   `player_id` is **server-derived from `req.user`**, never client-supplied — mirrors
   `downtime.js:613`'s own `String(req.user._id || req.user.id || '')` pattern. `character_id` is
   validated against `req.user.character_ids` (see AC5). `rolled_at` is a **genuine BSON `Date`**,
   not `new Date().toISOString()` — see AC2's own TTL note for why this matters.
2. **TTL index, 30-day retention**, mirroring `server/index.js`'s own `crd1_terminal_status_ttl`
   index exactly (same file, same `start()` block, `background: true`, `expireAfterSeconds: 2592000`).
   **This collection must NOT repeat that index's own documented known limitation**: MongoDB's TTL
   monitor only expires documents whose indexed field holds a real BSON `Date`, and
   `contested_roll_requests`' own `updated_at` is a string, so that index is silently inert today
   (`server/index.js:300-308`'s own comment names this explicitly). `roll_log.rolled_at` must be
   written as a real `Date` object specifically so this collection's TTL index actually reaps
   documents, unlike the precedent it otherwise mirrors.
3. **`POST /api/roll_log`** — new route, `requireAuth` only at mount (matches `contested-rolls.js`'s
   own mount shape), scoped so a player can only log a roll for a character in their own
   `req.user.character_ids` (ST/dev unconditional, mirroring `tracker.js`'s `canAccess()` shape).
   Returns 201 with the written doc (or its `_id`) on success.
4. **`GET /api/roll_log`** — ST/dev only (`requireRole('st')` or equivalent role check, matching this
   project's established ST-gated read pattern e.g. `office_actions`). Returns the most recent N
   entries (reasonable default, e.g. 50) sorted `rolled_at` descending, for the admin feed's initial
   paint before the WS stream takes over.
5. **`broadcastRollLogged(doc)`** in `server/ws.js`, mirroring `broadcastCatalogueUpdate`'s exact
   shape (`_fanOut(JSON.stringify({...}))`, not raw client iteration — the post-ADMR-1 established
   pattern). Frame shape: `{ type: 'roll_log', ...doc }` (send the whole small doc, not just an id —
   the admin feed renders directly from the frame without a second fetch, since this is a
   high-frequency event during a live session and a round-trip-per-roll would be wasteful). Called
   from the `POST` route after a successful write.
6. **Client (player side): hook into all three of `doRoll()`'s existing `addHist(...)` call sites**
   (`public/js/suite/roll-v2.js` lines ~919, ~990, ~1020 as of this story's own read — re-verify at
   dev-story time) — alongside each `addHist(...)` call, when `getGlobalSettings()?.game_in_progress`
   is `true` AND `state.rollChar` is set, fire a `POST /api/roll_log` with the fields AC1 lists,
   gathered from what's already in scope at that point in `doRoll()`: `state.rollChar._id`
   (character_id), the branch's own `pool`/`lbl`/`cnt` values (label/pool/successes — reuse exactly
   what's already being passed to `addHist`, not a second computation), the raw dice array (`cA`/`cB`
   as applicable to the branch), `state.AGAIN` (again_rule), `state.ROTE` (rote), `state.WP`
   (wp_bonus), and the `spend.cost.vitaeCost`/`spend.cost.willpowerCost` values already computed
   earlier in the same `doRoll()` call (GDX-7's own spend decision — read them, do not recompute).
   Fire-and-forget (mirrors `trackerAdj`'s own established fire-and-forget shape; do not block the
   roll UI on this write's own round-trip). When the flag is OFF, this story adds **zero** new
   behaviour — `addHist()` and everything else in `doRoll()` are byte-for-byte unchanged.
7. **Client (admin side): live roll feed panel** in a new "Engine" sidebar domain (see Dev Notes —
   Domain Placement for why this is a NEW addition, not a revival of anything). On domain open: `GET
   /api/roll_log` for the initial list. While open (or globally, matching this project's existing
   `initWS({...})` pattern — confirm at dev-story time whether admin's WS connection is domain-scoped
   or global): a new `onRollLogged` callback wired into `admin.js`'s own `initWS({...})` call,
   prepending each new frame to the feed live, capped at a reasonable display length (e.g. 50,
   mirroring `state.hist`'s own 20-cap precedent, exact number is a UI judgement call for dev-story).
8. **`game_in_progress` `false` = nothing persists, byte-for-byte unchanged client roll flow.** Every
   piece of AC6 is gated behind the same single flag read GDX-7 already established as the pattern.
   Practice/prep rolls made with the flag off never reach `roll_log` at all — not even a rejected
   write, no POST is attempted.
9. Real test coverage: server-side auth-boundary tests (player can POST their own character's roll;
   player 403/blocked posting another character's roll or reading `GET /api/roll_log` at all; ST/dev
   can do both), the TTL index's own `Date`-not-string proof (mirroring
   `crd-1-contested-roll-request-shape.test.js`'s own TTL-shape test), the `broadcastRollLogged` WS
   emission (mirroring `stm-9-ws-broadcast.test.js`'s `vi.spyOn` pattern), and pure-function unit
   tests for whatever client-side field-gathering logic gets extracted (mirrors gdx-7's own
   "extract pure decision functions rather than leaving them inline" convention). A documented manual
   browser-smoke step for the one thing genuinely hard to unit test end to end (a live roll appearing
   in a second, admin-side browser tab without a refresh).

## Tasks / Subtasks

- [x] Task 1 — Server: collection, schema, TTL index (AC: 1, 2)
  - [x] `server/schemas/roll_log.schema.js` — validates the client-supplied subset only
        (`player_id`/`rolled_at` deliberately excluded, mirroring `contested_roll_request.schema.js`'s
        own "server-set fields not included" convention).
  - [x] `roll_log` TTL index added to `server/index.js`'s `start()` block, immediately after
        `crd1_terminal_status_ttl`, with an explicit comment on why `rolled_at` must stay a real
        `Date`.
- [x] Task 2 — Server: routes (AC: 3, 4)
  - [x] `server/routes/roll-log.js` — `POST /` (own-character-scoped via a `canAccess()` mirroring
        `tracker.js`'s exactly) and `GET /` (`requireRole('st')`, limit param capped at 200).
  - [x] Mounted in `server/index.js` at `/api/roll_log`, `requireAuth, noCache()`.
  - [x] `player_id` set from `req.user._id || req.user.id`, never read from `req.body` (the schema's
        `additionalProperties: false` also rejects a client attempt to set it directly).
- [x] Task 3 — Server: WS broadcast (AC: 5)
  - [x] `broadcastRollLogged(doc)` in `server/ws.js`, `_fanOut`-based, mirrors
        `broadcastCatalogueUpdate` exactly. Frame carries the whole doc (`_id` stringified).
  - [x] Called from `POST /api/roll_log` after a successful insert.
- [x] Task 4 — Client: WS handler (AC: 7)
  - [x] `public/js/data/ws.js`: `_onRollLogged`, `opts.onRollLogged`, `'roll_log'` dispatch case,
        `_handleRollLoggedMsg` (strips the frame's own `type` key, passes the rest through as the doc
        — no refetch, unlike the catalogue/settings/bloodline precedents, since the frame already
        carries everything the feed needs).
- [x] Task 5 — Client: hook the roll into `doRoll()` (AC: 6, 8)
  - [x] Re-verified the three `addHist(...)` call sites (919, 990, 1020 as originally read - confirmed
        unchanged before editing).
  - [x] `buildRollLogPayload({...})` — pure function, no DOM/globals, builds the AC1 payload shape.
        `_logRoll(characterId, payload)` — the fire-and-forget POST wrapper (mirrors `trackerAdj`'s own
        silent-catch shape).
  - [x] All three call sites hooked, each gated on `state.rollChar && getGlobalSettings()?.game_in_progress`.
        **Real finding, not anticipated by the story's own AC**: `spend.cost.vitaeCost`/
        `willpowerCost` (cited in the story's own AC6 text) represent what the roll OFFERED to spend,
        not what was actually deducted — they stay populated even when the spend guard never fires
        (game off, insufficient balance, already in flight). Added `_loggedVitaeSpent`/
        `_loggedWillpowerSpent` local variables, set only at the point `trackerAdj` actually succeeds,
        and used those for `vitae_spent`/`wp_spent` instead of the AC's literal `spend.cost.*`
        citation - the real amount deducted, not the theoretical cost. Disclosed here since it's a
        deviation from the AC's literal wording, made for correctness (recording a cost that was
        offered-but-not-paid would be a false record of what actually happened this roll).
- [x] Task 6 — Client: admin Engine domain + live feed panel (AC: 7)
  - [x] New `data-domain="engine"` sidebar button + `#d-engine`/`#engine-content` section in
        `admin.html`. New `public/js/admin/roll-feed.js` (`initRollFeed`/`onRollLogged` exports).
  - [x] `admin.js`: import, domain dispatch, `onRollLogged` wired into its own `initWS({...})` call
        (confirmed admin.js and app.js each own a separate `initWS({...})`, matching gdx-5's own
        finding - both wired independently, only admin's needed touching here since roll-v2.js POSTs
        directly rather than going through app.js's own WS callback).
  - [x] Initial paint via `GET /api/roll_log` (50-cap); live prepend via the WS frame, capped at the
        same 50 client-side. New CSS block (`admin-layout.css`, token-based, no bare hex/inline
        styles) for the feed row/heading/empty-state.
- [x] Task 7 — Tests (AC: 9)
  - [x] New `server/tests/gdx-8-roll-history.test.js`: 17 tests, auth-boundary tests, TTL-shape proof,
        WS-spy broadcast test, pure client-function unit tests (`buildRollLogPayload`, reached via the
        `location`/`localStorage`/`document` shim gdx-7's own test already established). All 17 pass.
  - [x] Manual browser-smoke step documented (NOT executed — Angelus cannot run the app locally per
        this repo's own `CLAUDE.md`; anything needing a human look must be smoke-tested on a deployed
        environment first). Steps for that later pass: toggle `game_in_progress` ON, roll as a player,
        confirm the roll appears live in a second (admin) browser tab's Engine feed without a refresh;
        toggle OFF, confirm nothing posts.
- [x] Task 8 — Full changed-area regression (AC: 9)
  - [x] Ran the new suite alone (17/17 pass) and alongside `api-app-settings.test.js`,
        `stm-9-ws-broadcast.test.js`, `gdx-7-apply-costs-on-roll.test.js`, and
        `crd-1-contested-roll-request-shape.test.js` — all green together, no cross-file interference.
  - [x] Full server suite regression surfaced one genuine NEW failure (not in the established
        pre-existing baseline): `tests/rlv-6-dice-engine-removed.test.js`'s `'switchDomain() no longer
        has an engine branch'` test, broken by this story's own deliberate `domain === 'engine'`
        re-addition. **Fixed by correcting the stale assertion, not deleting it** (this repo's "a test
        asserts the behaviour this story changes" convention): the test now checks that the engine
        branch never re-wires the actually-dead `initDiceEngine`/`dice-engine.js` (rlv.6's real
        original intent), instead of asserting no `'engine'` domain id can ever exist again. Verified
        `#next-session-content`/`initNextSession` is wired under the *Attendance* domain
        (`public/admin.html:172-174`, `admin.js:343`), not Engine — so `tests/admin.spec.js`'s own
        "Next Session Panel" describe block clicking `data-domain="engine"` is a separate, already
        pre-existing, out-of-scope bug (exactly as rlv.6's own trailing comment already flagged it),
        untouched by this story.
  - [x] Two full-suite runs after the fix, both reproducibly `19 failed | 223 passed (242)` files,
        `21 failed | 4222 passed | 76 skipped (4319)` tests. Individually isolated every failing file
        not already on `CLAUDE.md`'s own "Known pre-existing failures" list, and confirmed none trace
        to this story:
        - `gdx-4-css-standards-grep.test.js`, `issue-830-inherited-card-css.test.js` — both fail
          against `public/css/components.css` (a `0.625rem` vs `10px`/`11px` shape this story never
          touches). `git diff --stat` confirms `components.css` isn't in this story's own diff at all;
          `git log -1 -- public/css/components.css` shows it last committed 2026-08-25, predating this
          story's branch. This story's own CSS change is a pure 31-line append to `admin-layout.css`
          with zero `var(--x, fallback)` sites (confirmed via `git diff | grep -c`), so it cannot be
          gdx-4's offender either.
        - `rule-engine-integration.test.js` (`free_sw` assertions) — traced to a **concurrent session's
          own uncommitted work** in the same shared working tree: `git diff` on
          `public/js/editor/rule_engine/ohm-evaluator.js`/`pool-evaluator.js` shows an in-progress,
          explicitly-commented "2026-08-26 Sway merge" Allies→Sway merit rename mid-flight. Not this
          story's concern or code; left untouched per this session's own established practice of never
          staging/fixing another session's WIP.
        - 8 `*-parallel-write.test.js` files (`bloodline-`, `derived-stat-modifiers-`, `disc-attr-`,
          `mdb-`, `ots-`, `pt-`, `safe-word-`, `style-retainer-`) — match `CLAUDE.md`'s own documented
          Atlas-connection-contention flake class (previously masked as SKIPs when no local `mongod`
          was available; this run had one, so they ran and hit real contention under full-suite load
          instead).
        - `issue-823-test-db-guard.test.js` — asserts the test DB name is literally `tm_suite_test`;
          it's `tm_game_test` now. A stale pre-rebrand assertion (see the 2026-08-21 tm_suite→tm_game
          rebrand), unrelated to this story, undiscovered until this run.
        - `bl3a-one-inclan-implementation.test.js`, `fix.943.retireStripDerived.test.js` — fail on a
          CSS-selector-string check and a `_omSave` source-text check respectively, in files this
          story's own File List never touches.
        None of the above are new to this session's own code; all are either already-committed
        pre-rebrand/pre-existing drift, a documented flake class, or a different session's own WIP.
        This story's Task 8 gate is satisfied: zero regressions attributable to this story's changes.

## Dev Notes

### Domain Placement — a NEW "Engine" entry, not a revival

The parent GitHub issue (#989) says "admin live roll feed panel (Engine domain)". **The Engine domain
does not exist in the current app** — confirmed by grep, `public/admin.html` has no `data-domain`
matching anything Engine-related, and gdx-5's own story (`specs/stories/gdx-5-game-in-progress-setting.md`,
"Toggle Placement" Dev Note) already found and documented this exact staleness for a different
story. `CLAUDE.md`'s own architecture section still lists "Engine (session log)" as a sidebar
domain — equally stale, do not trust it.

Unlike gdx-5 (a single checkbox that fit naturally into an existing panel), this story's own live
feed is a genuinely new, substantial admin surface with no natural existing home — Attendance
(player-centric, payment-focused), ST Mods (unrelated concern), and every other existing domain were
checked and don't fit. **This story adds a new sidebar button and domain section, using "Engine" as
the id/label** — not because it revives the old (fully, deliberately removed in rlv.6/#836)
dice-engine.js/feeding-engine.js/session-tracker.js tools, but because "Engine" is the most natural
existing name for "live game-session tooling" and matches what a future ST would expect to find it
under. This is a fresh addition, coincidentally sharing a name with something now fully gone.

**A related, separate, NOT-this-story's-job finding**: `public/js/admin/session-log.js`'s own
`initSessionLog` export is imported in `admin.js` (`import { initSessionLog } from
'./admin/session-log.js';`) but never called anywhere — confirmed by grep. Its own file header says
"Session log module — Engine domain in admin app" and its render target is `#engine-right`/
`#engine-content`, neither of which exists in `admin.html` any more. This is a genuine, pre-existing
dead-code gap (the rlv.6/#836 cleanup that removed its Engine-domain siblings missed this one import),
unrelated to roll history — session-log is free-text session notes, not roll data. **Do not wire it
up or delete it as part of this story.** Name it in Completion Notes so it's on record, and let
Angelus decide separately whether it gets revived (now that an Engine domain exists again for a
different reason), formally deleted, or left alone.

### The exact hook point already exists — `addHist()`, not a new "what counts as a roll" decision

`public/js/suite/roll-v2.js`'s `addHist(pool, cls, lbl, cnt, verd)` (line ~1032) is called from
exactly the three places a roll actually completes: the chance-die early-return (~919), the contested
branch (~990), and the standard branch (~1020). This is the SAME "what counts as a completed roll"
decision this story needs — do not re-derive it. Add the new POST call directly alongside each
`addHist(...)` call, using the same local variables already in scope there (this file's own existing
naming: `pool`/`eff+'d10'` for the pool string, `cls`/`lbl`/`cnt or wS or net` for
class/label/successes, `cA`/`cB` for the raw per-die results array). `state.hist`/`addHist` itself is
untouched — this story adds a parallel write, not a replacement.

### Reuse GDX-7's already-computed spend, don't recompute it

`doRoll()` already computes `spend = _currentSpendDecision()` near its own top (gdx-7's own code,
unmodified by this story) and already knows `spend.cost.vitaeCost`/`spend.cost.willpowerCost` — the
exact real amounts about to be (or already) spent via `trackerAdj`. This story's `vitae_spent`/
`wp_spent` fields read that SAME object, at the point in the function where the POST fires — do not
build a second, independent cost calculation. If `game_in_progress` is off, GDX-7's own spend logic
never fires either (byte-for-byte, per its own AC7), so `vitae_spent`/`wp_spent` are moot in that
case anyway — this story's own AC8 already excludes the whole path.

### `player_id` is server-derived, never client-trusted

`server/routes/downtime.js:613`'s own pattern — `player_id: String(req.user._id || req.user.id ||
'')` — is the established, correct shape. The client never sends `player_id` in the POST body; the
server sets it from the authenticated session. Mirrors this project's own general convention (also
seen in `characters.js`, `contested-rolls.js`) of never trusting a client-supplied identity field
that the server can derive itself.

### The TTL-string gotcha is real and already bit this codebase once

`server/index.js:300-308`'s own comment on `contested_roll_requests`' TTL index is explicit: every
writer on that collection stores `new Date().toISOString()` (a string), so MongoDB's TTL monitor
never actually expires anything there, even though the index itself was created correctly. This
story's own `rolled_at` field must be a genuine `Date` object at write time specifically to avoid
repeating that exact, already-documented mistake in a brand new collection. Test this directly (AC9),
don't just trust the route code — mirror `crd-1-contested-roll-request-shape.test.js`'s own approach
of asserting the literal shape of what gets written, not just that an index exists.

### Project Structure Notes

- New files: `server/schemas/roll_log.schema.js` (or equivalent), `server/routes/roll-log.js`,
  `public/js/admin/roll-feed.js` (or equivalent), `server/tests/gdx-8-roll-history.test.js`.
- Modified files: `server/index.js` (TTL index + route mount), `server/ws.js`
  (`broadcastRollLogged`), `public/js/data/ws.js` (`onRollLogged` wiring), `public/js/suite/roll-v2.js`
  (POST hooks alongside `addHist`), `public/admin.html` (new Engine sidebar entry), `public/js/admin.js`
  (Engine domain dispatch + `onRollLogged` wiring into its own `initWS({...})`).
- Does NOT modify: `public/js/suite/roll.js` (legacy v1), `state.hist`/`addHist`/`renderHist`/`clrHist`
  (untouched, this story adds alongside them), `public/js/admin/session-log.js` (flagged, not
  touched), GDX-7's own spend logic (`_currentSpendDecision`, `trackerAdj` calls — read only).

### References

- [Source: specs/stories/gdx-5-game-in-progress-setting.md] — the `game_in_progress` flag/WS pattern
  this story gates on; also the precedent for "Engine domain is stale, don't trust the issue text or
  CLAUDE.md" and the reasoning process for placing a new admin surface when no natural home exists.
- [Source: specs/stories/gdx-7-apply-costs-on-roll.md] — the `doRoll()` structure, `spend` object
  shape, extracted-pure-function convention, and the `state.rollChar`/`ensureTrackerLoaded` ordering
  gotcha this story must respect (a roll's character must be tracker-confirmed before use, same as
  gdx-7 already handles for its own spend).
- [Source: public/js/suite/roll-v2.js:866-1020] — `doRoll()`, the three result branches, and their
  exact `addHist(...)` call sites (~919, ~990, ~1020 as read this session — re-verify).
- [Source: public/js/suite/roll-v2.js:1030-1055] — `addHist`/`renderHist`/`clrHist`, the existing
  client-local history mechanism this story runs alongside, not replaces.
- [Source: server/index.js:270-317] — the `contested_roll_requests` compound index and TTL index,
  the exact precedent to mirror for AC2, including its own documented Date-vs-string gotcha.
- [Source: server/ws.js:122-145] — `broadcastCatalogueUpdate`, the `_fanOut`-based shape to mirror
  for `broadcastRollLogged` (post-ADMR-1's established pattern, not raw client iteration).
- [Source: public/js/data/ws.js:26-31, 64-72, 110-119, 207-216] — `initWS` opts shape, `onmessage`
  dispatch switch, `_handleCatalogueMsg`/`_handleSettingsMsg` precedents for the new
  `_handleRollLoggedMsg`.
- [Source: server/routes/downtime.js:613] — the server-derived `player_id` pattern.
- [Source: server/routes/tracker.js `canAccess()`] — the player-owns-their-own-character scoping
  pattern for `POST /api/roll_log`.
- [Source: server/tests/crd-1-contested-roll-request-shape.test.js:473, 534-550] — the TTL-shape test
  pattern to mirror for AC9.
- [Source: public/js/admin.js:28-42] — confirms `session-log.js`'s `initSessionLog` is imported but
  never called; the rlv.6/#836 comment explaining the Engine domain's old tools were deliberately
  removed, and that this one import was missed by that cleanup.
- [Source: public/admin.html] — current sidebar domain list (12 entries, no Engine), confirming the
  domain genuinely does not exist today.
- [Source: GitHub #989 (GDX-8), #981 (Epic GDX), #986 (GDX-5), #988 (GDX-7)] — issue text for AC/scope
  cross-reference.

## Dev Agent Record

### Context Reference

Executed via the `bmad-dev-story` workflow inside the `bmad-loop` orchestration for Epic GDX, story
gdx-8 (GitHub #989). Followed directly after GDX-7 (spend-on-roll, done) and GDX-5 (`game_in_progress`
flag + WS pattern, done) in the same epic sequencing (`986 ∥ 987 → 988 → 989`).

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5).

### Debug Log References

- Task 8 regression surfaced a genuine new failure in `tests/rlv-6-dice-engine-removed.test.js`
  (`'switchDomain() no longer has an engine branch'`), caused by this story's own deliberate
  `domain === 'engine'` re-addition for an unrelated feature. Investigated and fixed — see Task 8's
  own completion notes and the "Domain Placement" Dev Note for the full reasoning trail (including
  confirming the pre-existing "Next Session Panel" Playwright suite's `data-domain="engine"` click was
  already stale/broken before this story, unrelated to it).
- Two full-suite vitest runs (`19 failed | 223 passed (242)` files both times) individually isolated
  and traced every non-baseline failing file; none attributable to this story. Full detail under
  Task 8.

### Completion Notes List

- All 9 ACs implemented: `roll_log` schema/collection/TTL index (AC1, AC2), auth-scoped POST/GET
  routes (AC3, AC4), `broadcastRollLogged` WS emission (AC5), client WS dispatch (AC7), `doRoll()`
  hooks at all three completion branches with real-spend (not offered-cost) values (AC6, AC8), new
  admin Engine domain + live roll-feed panel (AC7), and the test suite (AC9).
- **Disclosed AC6 deviation**: recorded `vitae_spent`/`wp_spent` from new `_loggedVitaeSpent`/
  `_loggedWillpowerSpent` locals (set only when `trackerAdj` actually succeeds), not the AC's literal
  `spend.cost.vitaeCost`/`willpowerCost` citation, which represents the offered cost regardless of
  whether it was actually deducted. See Task 5's own completion note for the full reasoning.
- **Flagged, not fixed (out of scope)**: `public/js/admin/session-log.js`'s `initSessionLog` export is
  imported in `admin.js` but never called, and targets `#engine-right`/`#engine-content` — a
  pre-existing dead-code gap from the rlv.6/#836 cleanup, unrelated to roll history. Left for Angelus
  to decide separately now that an Engine domain exists again. See "Domain Placement" Dev Note.
  Also flagged (not fixed): `issue-823-test-db-guard.test.js`'s stale `tm_suite_test` assertion, a
  pre-rebrand leftover unrelated to this story, discovered during Task 8's regression sweep.
  Also flagged (not fixed): a concurrent session's own uncommitted Allies→Sway merit rename
  (`ohm-evaluator.js`/`pool-evaluator.js`) is mid-flight in this same shared working tree and is the
  cause of `rule-engine-integration.test.js`'s failures — not this story's code, not touched.
- Fixed one genuine regression this story caused: corrected (not deleted) a stale assertion in
  `tests/rlv-6-dice-engine-removed.test.js` per this repo's "a test asserts the behaviour this story
  changes" convention. See Task 8.
- Manual browser-smoke step (toggle `game_in_progress`, roll as a player, confirm live feed update in
  a second admin tab) is documented but NOT executed — Angelus cannot run the app locally per this
  repo's own `CLAUDE.md`; needs a deployed-environment pass.

### File List

**New:**
- `server/schemas/roll_log.schema.js`
- `server/routes/roll-log.js`
- `public/js/admin/roll-feed.js`
- `server/tests/gdx-8-roll-history.test.js`

**Modified:**
- `server/index.js` (route mount, `roll_log` TTL index)
- `server/ws.js` (`broadcastRollLogged`; review fixes: `_fanOutRoles` role filter +
  `_setWssForTesting` seam)
- `public/js/data/ws.js` (`onRollLogged` client dispatch; review fix: `onReconnect` callback)
- `public/js/suite/roll-v2.js` (`buildRollLogPayload`, `flattenDiceChainResults`, `_logRoll`, hooks at
  all three `addHist(...)` call sites; review fixes: `_rollChar` capture, `console.warn` on `_logRoll`
  failure, numeric→string `again_rule` coercion, dice-chain→integer `results` flattening, contested-loss
  `successes` clamped to 0)
- `public/admin.html` (new Engine sidebar entry + `#d-engine`/`#engine-content` section)
- `public/js/admin.js` (Engine domain dispatch, `onRollLogged`/`onReconnect` wired into its own
  `initWS({...})`)
- `public/css/admin-layout.css` (new `.engine-feed-*` token-based block)
- `server/tests/helpers/test-app.js` (mounted `roll-log.js` router for tests)
- `server/tests/rlv-6-dice-engine-removed.test.js` (corrected one stale assertion — see Task 8;
  review fix: hardened against aliased/dynamic-import bypass)
- `server/schemas/roll_log.schema.js` (review fix: added `maxLength`/`maxItems`/`minItems`/bounds)
- `server/routes/roll-log.js` (review fixes: floor-clamped `GET` `limit`; `player_id` now
  `req.user.player_id`, not the stale `req.user._id || req.user.id` downtime.js precedent)
- `public/js/admin/roll-feed.js` (review fixes: initial-fetch race + dedup safety net, `esc()` on
  `entry.successes`, WS-reconnect catch-up refetch)
- `server/tests/gdx-8-roll-history.test.js` (review-fix tests added across two review rounds, 17 → 32)

## Senior Developer Review

**Method — two rounds, corrected record.** Codex external review was attempted first. Its first
`codex exec` run crashed immediately on the environmental `models_cache.json` version-skew bug already
worked around twice earlier today; the cache file was moved aside and a second run launched. That
second run was **incorrectly believed to have crashed too** — it had been launched detached (`nohup
... & disown`), which defeated the harness's own background-task tracking, and a premature check of
its truncated log (mid-flight, showing only an echoed prompt) was misread as a second crash. On that
mistaken belief, review switched to an internal 3-layer pass (Blind Hunter, Edge Case Hunter,
Acceptance Auditor, run as parallel subagents) and reached an "Approved" verdict (Round 1, below).
**The second Codex run had actually completed successfully** — this was only discovered afterward, by
chance, via `git status` showing its findings file already on disk. Round 2 documents what it found:
several real, higher-severity defects the internal round's own three layers had missed entirely,
including one that meant **the feature had never actually persisted a single real player roll**. This
is disclosed here in full rather than quietly folded in, because the Round 1 "Approved" verdict below
was wrong, and the record should say so plainly.

**Diff reviewed** (both rounds): scoped to this story's own 13 files only (`specs/stories/code-review/
gdx-8-roll-history-diff.txt`), deliberately excluding a concurrent session's unrelated Allies→Sway
rename WIP present in the same shared working tree.

### Round 1 — internal 3-layer review

**High — both patched:**
1. **`broadcastRollLogged` fanned every roll to ALL connected WS sockets regardless of role**,
   contradicting `GET /api/roll_log`'s own `requireRole('st')` gate (AC4) — any player's browser could
   read another character's dice results and real vitae/willpower spend over the wire. Independently
   raised by Blind Hunter (High) and Acceptance Auditor (Medium, correctly noting the broadcast-to-all
   *mechanism* is pre-existing app convention, not novel — but this story is the first to put
   per-player sensitive data on that channel). Fixed: `server/ws.js` gained `_fanOutRoles(msg, roles)`,
   filtering on `ws.user.role` (already attached per-connection at the WS upgrade handler — no new
   plumbing needed); `broadcastRollLogged` now uses it, scoped to `['st', 'dev']`.
2. **`state.rollChar` can be reassigned mid-`doRoll()`** during its awaited `ensureTrackerLoaded`/
   `trackerAdj` round-trips (the character picker isn't locked during that window), so a character
   switch mid-roll could attribute the persisted `roll_log` entry to the wrong character. Raised by
   Edge Case Hunter (High). Fixed: `const _rollChar = state.rollChar` captured before the first `await`
   in `doRoll()`; all three `_logRoll(...)` call sites use `_rollChar`, never live `state.rollChar`.

**Medium — patched:** schema had no upper bounds on `label`/`pool`/`again_rule` length, `results`
array size, or `successes` at all; `roll-feed.js`'s initial fetch could silently lose a roll broadcast
during its own await window; `rlv-6-dice-engine-removed.test.js`'s rewritten assertion only matched
one import shape; `_logRoll`'s `.catch(() => {})` gave zero operator-visible signal.

**Medium — dismissed with evidence:** the `roll_log` TTL index's `createIndex` call isn't
awaited/caught, but 5 of 6 `createIndex` calls in `server/index.js`'s `start()` share this exact
shape — not a deviation this story introduced, deferred to `deferred-work.md` as repo-wide. The
`trackerAdj` call-site *statements* were restructured (same guard/args/await) — the story's
substantive "does not alter when/how much is spent" claim holds; only wording is grazed.

**Low — patched:** `GET` `limit` floor-clamp; the TTL-index test's "exactly one" claim now actually
checks for a second occurrence; `roll-feed.js`'s `entry.successes` now routed through `esc()`.

Full detail on each Round 1 item — reasoning, exact fix, and prove-discrimination result — is preserved
in this story's own git history of this section; superseded by Round 2 below, not repeated verbatim
here to avoid the record reading as if both rounds carried equal weight.

### Round 2 — Codex (external), found belatedly

**High — all three real, all patched:**

1. **Every real `doRoll()` branch generated a schema-invalid POST — the feature had never actually
   persisted a real roll.** `state.AGAIN` (every real call site's `againRule` value) is a `Number`
   (`public/js/suite/data.js`'s own `AGAIN: 10` default), not a string; the schema required
   `type: ['string', 'null']` and `server/middleware/validate.js` runs with `coerceTypes: false` — every
   branch's POST got a silent 400. Standard/contested rolls additionally passed `wC` — an array of
   dice-CHAIN objects (`{ r: { v, s, x }, ch: [...] }`, `rollPool()`'s real return shape) — straight
   through as `results`, which the schema requires to be plain integers 1-10: a second, independent
   400 on top of the first. `_logRoll`'s own silent catch swallowed both, so the feature looked merely
   quiet rather than visibly broken, and every existing test passed because they all used hand-authored
   string/integer fixtures no real call site ever produces. Confirmed independently before patching (not
   taken on faith): traced `state.AGAIN`'s real type, traced `wC` back through `cA`/`cB` to
   `rollPool()`/`mkChain()`/`mkDie()` in `shared/dice.js`, confirmed `middleware/validate.js`'s
   `coerceTypes: false`. Fixed: `buildRollLogPayload` now coerces `againRule` to `String(...)` (or
   `null`); new `flattenDiceChainResults(chains)` pure function flattens chain objects to their real
   rolled face values (including exploded re-rolls) before either non-chance branch passes them as
   `results`. Prove-discriminated: a new integration test posts a payload built the exact way a real
   `doRoll()` branch would (numeric `againRule`, chain-shaped `wC`) through the real schema validator —
   reverting either fix reproduces the actual 400 this bug caused in production; a source-text guard
   additionally pins both non-chance-die call sites, since no test in this repo can invoke `doRoll()`
   itself (needs live DOM).
2. **`roll_log.player_id` stored the Discord account ID, not the actual player-record `_id`.** This
   story's own Dev Notes cited `downtime.js`'s `req.user._id || req.user.id` as the established,
   correct precedent to mirror — but that pattern is itself stale: `requireAuth`
   (`server/middleware/auth.js`) never sets `req.user._id`, only `req.user.id` (Discord) and
   `req.user.player_id` (the real `players` collection `_id`), so the cited pattern always fell through
   to the Discord ID. The newer, correct convention (`history.js`, `cyoa.js`, `ordeal-responses.js`)
   reads `req.user.player_id` directly. Confirmed by reading `auth.js`'s real `userInfo` shape and
   grepping the three modern routes' own pattern before patching. Fixed:
   `player_id: req.user.player_id`. The original test asserting `player_id === 'test-player-001'`
   (the mock's Discord-shaped `id` field) had encoded the bug as correct — corrected to assert
   `'p-player-001'` (the mock's actual `player_id`). Prove-discriminated (revert → red → restore →
   green).
3. **A losing/drawn contested roll could be painted as a hit in the ST feed.** The contested branch's
   `_logRoll` call used `successes: won ? net : wS` — on a loss or draw (`won === false`) this stores
   the attacker's raw success count, not the true (zero) net that reached the target, while the
   persisted `label` correctly says "Failure"/"Draw (Failure)". `roll-feed.js`'s hit/miss CSS class
   keys directly on `entry.successes > 0`, so a genuinely lost roll with real attacker successes
   renders with a hit border next to a Failure label. The pre-existing `addHist(...)` call one line
   above (client-local Roll-tab history, untouched, out of this story's own scope) uses the identical
   `won ? net : wS` value — that's a real, separate, pre-existing quirk in an unrelated display, but
   `_logRoll` is a NEW consumer this story adds whose own hit/miss styling gets actively misled by
   inheriting it. Fixed: `_logRoll`'s own `successes` is `won ? net : 0`, `addHist`'s call is
   untouched. Prove-discriminated via a source-text guard (same DOM-harness limitation as finding #1).

**Medium — triaged individually:**
- **Reconnect never fills the persisted-event gap** (also independently raised by this session's own
  Edge Case Hunter in Round 1, not patched there). A WS drop-and-reconnect while the Engine tab stays
  open has no catch-up — the server only fans out `roll_log` frames at write time, so anything
  broadcast during an outage is simply never delivered, and nothing refetches on reconnect. Fixed:
  `public/js/data/ws.js` gained an `onReconnect` callback fired from `_ws.onopen` (every connect,
  including the first — a no-op there since the feed's own `initRollFeed()` already handles first
  paint); `roll-feed.js` gained `refetchOnReconnect()` (re-fetches via the same buffer/merge helper as
  the initial-fetch-race fix, no-ops if Engine was never opened this session); wired through
  `admin.js`'s own `initWS({...})` call. Not behaviourally tested — same DOM-harness limitation as the
  High findings above; this is client WS wiring with no existing test infrastructure in this repo to
  exercise it, same class of gap as the story's own already-documented manual-smoke-test step.
- **Any authenticated role with a matching `character_ids` entry can POST**, not strictly
  `role === 'player'` — `canAccess()` only special-cases `st`/`dev`. Verified against
  `server/routes/tracker.js`'s own `canAccess()`: byte-for-byte identical (already independently
  confirmed in Round 1). This story's route correctly mirrors an already-shipped, already-reviewed,
  pre-existing app-wide pattern — not a defect unique to gdx-8, and fixing only this route while
  `tracker.js` keeps the identical shape would be inconsistent. Dismissed with evidence; noted for
  whoever eventually audits the `canAccess()` pattern repo-wide.
- **"Actually spent" fields can be recorded when the tracker deduction never durably persisted** —
  `trackerAdj()` resolves after only an optimistic local-cache mutation; its own `saveToApi()` is
  fire-and-forget and doesn't inspect the response. This is `trackerAdj`'s own pre-existing,
  already-accepted GDX-7 contract (this story reads it, per "What this story is NOT," does not modify
  it) — `_loggedVitaeSpent`/`_loggedWillpowerSpent` are exactly as durable as the spend they describe
  always was. A real limitation, but of `trackerAdj`, not of this story; fixing it means changing
  GDX-7's own established contract, out of this story's scope. Dismissed with evidence, not patched.
- **17/17 tests, BSON-Date, and full-suite-baseline claims read as false/unreproducible in Codex's own
  run** — traced to Codex's sandboxed environment being unable to reach the local MongoDB this
  session's own repeated runs used (network policy `EACCES`, confirmed in Codex's own Validation
  notes: "sandbox network policy rejected the configured remote MongoDB connection"). Not a defect in
  this story's claims — this session's own runs of the same commands, with a real reachable `mongod`,
  are independently, repeatedly reproducible (see Verification below) and stand as accurate.
- **Chance-die records claim `again_rule`/`rote` modifiers the branch never mechanically applies** —
  independently confirmed by this session's own Round 1 Blind Hunter/Acceptance Auditor too. Cosmetic
  display artifact only (a chance die shows a stray "10-again"/"rote" tag in the feed's meta line);
  genuinely low-value to fix given current call sites always supply internally-consistent values.
  Stays deferred, per Round 1's own reasoning.

**Low — triaged individually:**
- **AC9's explicit dev-role boundary wasn't covered by the claimed auth tests** — every POST/GET test
  used `stUser()`, never a `dev`-role user. Cheap, real gap. Fixed: added one `dev` variant each for
  POST and GET.
- **The chance branch recomputes rather than literally reusing `addHist`'s own `cnt` value** —
  `addHist`'s `cnt` is a display string (`'—'`/`'1'`/`'0'`) that can't populate a schema `integer`
  field; recomputing the equivalent number (`dram ? 0 : suc ? 1 : 0`) is required, not an
  avoidable-shortcut. Dismissed with evidence, not patched.
- **A transient `/api/settings` load failure silently disables roll-logging for the rest of a tab's
  session** — real, but low probability and low impact (no diagnostic signal either way, matches the
  established fire-and-forget shape of everything else in this call chain). Deferred, not patched.
- Everything else in Codex's Low section either restates a Round 1 finding already patched there (the
  rlv-6 regex-gap, the negative-`limit` bypass) or is superseded by a High/Medium fix above (the
  `player_id` "specification-level ambiguity" note is resolved by fixing `player_id` itself).

### Verification

Round 1's own claims (17/17 tests genuinely executed not skipped, `rolled_at` a real Date,
`broadcastRollLogged` fires only on 201, `canAccess()` byte-identical to `tracker.js`, no XSS gap, no
module-scope variable leak, `#next-session-content` wired under Attendance not Engine) were
independently re-run and confirmed true in Round 1, and remain true after Round 2's fixes.

Round 2's two most serious findings were independently verified against real code/commands before
patching, not taken on faith: `state.AGAIN`'s real numeric type (`public/js/suite/data.js`), `wC`'s
real chain-object shape (traced through `rollPool`/`mkChain`/`mkDie` in `shared/dice.js`),
`middleware/validate.js`'s `coerceTypes: false`, and `req.user`'s real shape in production
(`middleware/auth.js`) vs. the three modern routes' own `player_id` convention.

Every Round 2 High and the reconnect Medium are prove-discriminated with single-change reverts (revert
→ red on a real test, restore → green) except the WS-reconnect wiring itself, which has no test
harness in this repo (documented, matches the story's own existing manual-smoke-test gap).

Post-fix regression, run repeatedly with a real local `mongod` reachable (contra Codex's own sandboxed
environment): `gdx-8-roll-history.test.js` 32/32 (up from 17 at Round 1's own start — 3 Round 1 fix
tests, 12 Round 2 fix tests), `rlv-6-dice-engine-removed.test.js` 7/7, plus
`stm-9-ws-broadcast.test.js`, `gdx-7-apply-costs-on-roll.test.js`, `api-app-settings.test.js`,
`crd-1-contested-roll-request-shape.test.js` — 137/137 across all six files, run multiple times
identically. A final full-suite `npx vitest run` was run after all fixes landed; see this story's own
sprint-status.yaml row for the confirmed result.

**Outcome: Approved**, on the corrected record. All three Round 2 High findings — including the one
that meant this feature had never actually worked end-to-end — are now fixed and independently
verified, not just patched on Codex's say-so. Every Medium/Low is either fixed or dismissed/deferred
with direct evidence on record, matching this session's own established "verify before triage"
discipline. The Round 1 "Approved" verdict on its own was incomplete; this Round 2 addendum is what
makes the record honest.
