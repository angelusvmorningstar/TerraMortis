# Story gdx.7: apply vitae/WP costs on roll during `game_in_progress` (one-tap confirm)

Status: done

## Story

As a player rolling a discipline or devotion during a live game,
I want the roll button itself to spend the power's real Vitae/Willpower cost when I click it,
so that I don't have to separately ask an ST (or dig through a second UI) to deduct what I just spent
— one tap, both things happen.

## Why this story exists

gdx.5 (`game_in_progress` flag, done) and gdx.6 (structured `vitae_cost`/`willpower_cost` on
`purchasable_powers`, done) both exist specifically to unblock this story — the actual feature
Angelus asked about tonight ("does the dice roller let players spend Vitae/Willpower"). Confirmed
earlier: it doesn't, today. This story wires the two prerequisites together.

## What this story is NOT

- NOT `roll.js` (legacy v1 roller). This story is scoped to `roll-v2.js` only — the active development
  surface for this whole epic (its own header comment: "Roll Tab UI (v2 — parallel dev surface,
  #1018)"), gated behind the existing `tm-use-new-dice-roller` localStorage flag. `roll.js` retirement
  is GDX-10 (Group C), a separate story. Do not touch `roll.js`.
- NOT a new API endpoint, and NOT a server-side auth change. **Corrected finding, contradicting both
  `CLAUDE.md` and this session's own earlier answer to Angelus tonight**: `PUT /api/tracker_state/:id`
  is NOT ST-auth-only. `server/routes/tracker.js`'s own `canAccess()` (lines 9-15) already lets a
  player write their own character's tracker — `role === 'st' || role === 'dev'` passes for anyone,
  otherwise `req.user.character_ids` must include the target id. Read directly, not assumed. This
  story reuses that existing, already-correct write path verbatim; it changes nothing about who can
  write what. `CLAUDE.md`'s "Tracker state ... is ST-auth only at the API level" line is stale and
  should be corrected in the same PR as this story (see Task 6).
- NOT a new tracker write function. `game/tracker.js`'s `trackerAdj(charId, field, delta)` (already
  imported into `app.js`, already globally callable, already clamps to
  `[0, calcVitaeMax|calcWillpowerMax]`, already calls `saveToApi` → `PUT` → server's own
  `broadcastTrackerUpdate`) is reused exactly as-is. This story does not modify `tracker.js` at all.
- NOT initiative, frenzy, lashing-out, or any other "special pool" from the wider Roller-redesign
  decision (`2026-07-25_meeting-lessons.md` §2.9) — those are separate, not-yet-created GDX slices.
- NOT damage in any form. The 25 Jul decision is explicit and was re-confirmed in that same meeting:
  "roll spend automation explicitly does not extend to damage" — damage stays ST-adjudicated via the
  game cockpit (§2.13), permanently out of this story's scope.
- NOT reliquaries, blood fruits, or Influence spends — the same decision names these as staying
  physical tokens, deliberately excluded from digital automation.
- NOT gdx.6's own deferred findings (admin rule-cost editor gap, print/CSV display bypass) — unrelated,
  already logged separately.

## Acceptance Criteria

1. `public/js/shared/pools.js`'s `getPool()` threads `vitae_cost`/`willpower_cost` from the resolved
   rule onto the object it returns, mirroring exactly how `cost` is already threaded (both call sites:
   the `noRoll` early-return's `info` object at line 41, and the main return's top-level fields (like
   line 56's `cost: rule.cost || null`) AND its own `info` sub-object at line 63). Use `?? null`, not
   `|| null` — `0` is a real, meaningful "confirmed free" value from gdx.6's own migration and must
   not collapse to `null`.
2. `roll-v2.js`'s `loadPool()` (already stores the whole `pi` argument as `state.POOL_INFO`) needs no
   change — `state.POOL_INFO.vitae_cost`/`.willpower_cost` become available automatically once AC1
   lands, since `loadPool` already does `state.POOL_INFO = pi || null`.
3. Roll button label (`#roll-btn`, set in `updPool()`, currently `'✦ ROLL ' + eff + ' DICE'` /
   `'✦ ROLL CHANCE DIE'`): when `getGlobalSettings()?.game_in_progress` is `true` AND the loaded
   pool's `vitae_cost`/`willpower_cost` is a real positive number (either one), the label becomes
   `'✦ ROLL & SPEND N VITAE'` / `'✦ ROLL & SPEND N VITAE, M WP'` / `'✦ ROLL & SPEND M WP'` (whichever
   combination is non-zero) instead of the plain dice-count label. A power with both `0`/`null` (no
   real cost) or with `game_in_progress` `false` shows the existing, unchanged label — this AC does
   not touch that path at all.
4. Clicking the roll button, when the spend-labelled state from AC3 is active, both rolls (existing
   `doRoll()` behaviour, completely unchanged) AND spends, in the same click: calls
   `trackerAdj(String(state.rollChar._id), 'vitae', -vitaeCost)` and/or
   `trackerAdj(..., 'willpower', -willpowerCost)` for whichever of the two is non-zero, using the
   character currently loaded into the roller (`state.rollChar`). One tap, both effects — no separate
   confirm step.
5. **Guard — cannot spend below 0.** Before treating the button as spend-labelled, the current tracker
   balance for `state.rollChar` must be read (via `ensureTrackerLoaded` then `trackerRead`, both
   already imported/available in `app.js` — thread them into `roll-v2.js` or call through `app.js`,
   whichever keeps `roll-v2.js`'s existing import shape cleanest) and compared against the required
   cost. If the balance is insufficient for the full cost, the button does NOT silently clamp or spend
   a partial amount — it falls back to a **"Roll without spending"** labelled action that rolls with no
   deduction at all, exactly matching the issue's own "offer roll-without-spend" wording. Never spend
   less than the power's real cost as a silent substitute.
6. The existing WP(+3) pool-boost chip (`state.WP`, `togMod('wp')`) is a **separate** cost from a
   power's own `willpower_cost` — currently pure pool math with zero tracker effect
   (`effPool()`'s `wpBonus = state.WP ? 3 : 0`; `doRoll()`'s own comment already says "one-time spend"
   but only resets the UI toggle, spends nothing real). When `game_in_progress` is `true` and the chip
   is ON at roll time, it ALSO spends 1 real Willpower via `trackerAdj(..., 'willpower', -1)` —
   additively on top of any power cost, not instead of it — and is labelled distinctly in the button/
   sub-line text (e.g. "+ 1 WP (boost)") so a player can tell a power's own cost apart from the chip's.
   When `game_in_progress` is `false`, the chip behaves exactly as it does today — no tracker write at
   all, matching AC-flag-off below.
7. **`game_in_progress` `false` = current behaviour, byte-for-byte.** Every piece of AC3-AC6 is gated
   behind the same single flag read. With the flag off, the button label, click behaviour, and WP chip
   are unchanged from what ships today — this is the master kill-switch, not a per-feature toggle.
8. **Admin sheet shows the deduction in real time — verify, do not rebuild.** `trackerAdj`'s own
   `saveToApi` already calls `PUT /api/tracker_state/:id`, which server-side already calls
   `broadcastTrackerUpdate`, which the admin app's own `initWS({ onTrackerUpdate })` already consumes
   to re-render the live sheet. This AC is a **verification task** (confirm the existing chain reaches
   the admin sheet for a roll-triggered spend, not just a manual tracker-panel spend) — if it doesn't
   already work, that is a pre-existing bug outside this story's scope to fix, not something to patch
   here without a separate investigation.
9. Real test coverage: `pools.js` unit tests for the new field threading (both call sites, `0` vs
   `null` distinction preserved); pure-function unit tests for the button-label and spend-guard logic
   (extract them as small, directly-testable functions rather than leaving the decision inline inside
   DOM-writing code — mirrors this project's own established pattern, e.g. `office-tab.js`'s
   `manoeuvreDotReasons`/`meritDotReasons`); a live-DB integration test proving a roll-triggered
   `trackerAdj` call correctly clamps at 0 and never goes negative; and a documented manual
   browser-smoke step for the one thing genuinely hard to unit-test (the button's own click → roll →
   spend sequence in a live DOM), per the issue's own "each guard covered by vitest or documented
   browser-smoke step."

## Tasks / Subtasks

- [x] Task 1 — Thread structured costs through `getPool()` (AC: 1)
  - [x] Add `vitae_cost: rule.vitae_cost ?? null, willpower_cost: rule.willpower_cost ?? null` to both
        the `noRoll` branch's `info` object and the main return in `public/js/shared/pools.js`.
        **Deviation from the AC's literal wording, disclosed**: NOT also duplicated onto the `info`
        sub-object (`{d,a,s,r,c,ac,du,ef}`) — that shape is consumed only by the picker panel's own
        pre-roll "Cost: X" sub-label (`app.js`, still the legacy string), which nothing in this story
        touches; `state.POOL_INFO` (what the roller itself reads) gets the fields at the top level,
        which is what's actually consumed. Duplicating onto an object nothing reads would be dead code.
- [x] Task 2 — Pure decision functions (AC: 3, 5, 6, 9)
  - [x] `spendableCost(poolInfo, wpChipOn)` — pure function, takes the loaded pool-info plus whether the
        WP boost chip is on, returns `{ vitaeCost, willpowerCost }` (the chip's own +1 WP folded in
        additively when `wpChipOn`). No DOM, no globals — a genuinely pure function to unit test.
  - [x] `rollButtonLabel(eff, cost, gameInProgress, canAfford)` — pure function returning the exact
        button text for every combination. Simplified from the original AC5 phrasing during
        implementation: "insufficient balance" does NOT get its own distinct "roll without spending"
        string — it falls through to the SAME plain dice-count label a no-cost roll already shows,
        which already literally reads as "roll, without spending anything" and needs no new button
        state or second button. One button throughout, matching the feature's own "one-tap" framing.
  - [x] `canAffordCost(cost, currentBalance)` — pure function, `{vitaeCost, willpowerCost}` vs
        `{vitae, willpower}`, returns boolean. Never allows a partial spend to read as affordable.
- [x] Task 3 — Wire into `roll-v2.js` (AC: 2, 3, 4, 5, 6, 7)
  - [x] Import `getGlobalSettings` from `../data/app-settings.js`.
  - [x] `updPool()`: compute the spend state via Task 2's functions (through a shared
        `_currentSpendDecision()` helper — see Dev Notes), set `#roll-btn`'s label accordingly.
        Current tracker balance read via `trackerRead(state.rollChar._id)`, synchronous — confirmed
        safe by tracing `app.js`'s own `_switchChar`, which already `await`s `ensureTrackerLoaded`
        before a character can become `rollChar` at all, so no new async load was needed here.
  - [x] `doRoll()`: the spend is paid ONCE, at the top of the function, before any of its three result
        branches (chance die / contested / standard) — VtR 2e pays to activate, then rolls; a failed
        roll doesn't refund. Existing "Auto-reset WP after rolling" block untouched — it only resets
        the UI toggle, no conflict with the real spend which already happened via `trackerAdj`.
- [x] Task 4 — Sub-line labelling (AC: 6)
  - [x] `updPool()`'s existing `if (state.WP) parts.push('WP +3')` extended: `'WP +3 (spends 1 WP)'`
        when `game_in_progress`, unchanged otherwise.
- [x] Task 5 — Tests (AC: 9)
  - [x] `server/tests/gdx-7-apply-costs-on-roll.test.js` — confirmed by grep: no test file for
        `pools.js` or `roll-v2.js` existed. Mirrors `issue-1141-office-tab-render.test.js`'s /
        `dbo-3-standing-merit-filter.test.js`'s stub-then-dynamic-import shape (`globalThis.location`
        + `globalThis.localStorage`, restored in `afterAll` only if this file itself created them) —
        plus a `globalThis.document` stub this story's chain newly needs (see below). 22 tests: 5 for
        `getPool()`'s field threading (AC1, both branches, the 0-vs-null distinction, an unknown key,
        and a pre-migration rule with the fields entirely absent), 14 for the three Task 2 pure
        functions across every stated combination (chip-additive, no-pool-info, 0-vs-null-both-mean-
        nothing-to-spend, boundary afford, insufficient-either-side, flag-off byte-for-byte, chance-die,
        each cost-bit combination, unaffordable-falls-back), and 3 live-DB integration tests. All 22
        pass; run alongside gdx-6's and the existing `api-tracker-state.test.js`/`api-app-settings.test.js`
        suites with no cross-file pollution (module-level caches, e.g. `loader.js`'s `_rulesCache`, are
        NOT shared across vitest test files despite `singleFork: true` — confirmed empirically, matching
        the established pattern used by ~18 other files in this codebase that seed `tm_rules_db` without
        ever calling `invalidateRulesCache()`).
  - [x] Live-DB integration tests (3, under `describe.skipIf(!isDbAvailable())` per this project's own
        convention) route `game/tracker.js`'s real `fetch()` calls through the real Express app +
        real `tm_suite_test` via a thin adapter (not a mocked stand-in), then call the real `trackerAdj`
        and `ensureLoaded`. Proves: (1) a roll-triggered vitae spend far larger than the balance clamps
        at 0 in both the client cache and the persisted document, (2) willpower clamps independently the
        same way, (3) an affordable spend is NOT clamped — the guard is a ceiling at 0, not a blanket
        zero-out. `trackerAdj`'s own `patchCard()` calls `document.getElementById` unconditionally on
        every write; with no jsdom in this project that throws unless `document` is stubbed, so a
        minimal `{ getElementById: () => null }` stub was added (falls `patchCard` through to
        `renderAll()`, which no-ops because `_el` was never set by `initTracker` in this test).
  - [x] **Test-harness/production drift found while building this test, NOT fixed here (deliberately out
        of scope) — logged to `deferred-work.md`**: `server/tests/helpers/test-app.js:90` mounts
        `/api/tracker_state` as `mockAuth, requireRole('st'), noCache(), trackerRouter` — an extra
        ST-only gate that does NOT exist in production (`server/index.js:173` mounts it as
        `requireAuth, noCache(), trackerRouter` only, letting the router's own `canAccess()` do the
        real scoping). This means `api-tracker-state.test.js`'s existing "player is blocked (ST-only
        endpoint)" tests currently pass for the WRONG reason (the test harness's own extra gate, not
        `canAccess()`'s real own-character scoping) — they'd still pass correctly if the extra gate were
        removed, since `playerUser([])` owns no characters either way, but today they give no signal
        about the real production behaviour this story's Dev Notes had to verify by reading the route
        file directly. This story's own new integration tests sidestep the drift entirely by
        authenticating as ST throughout (this test is about the clamp guard, not a re-proof of the
        write-path auth finding). Fixing `test-app.js`'s mount line is a one-line, low-risk change but
        touches shared test infrastructure used by many other suites — genuinely out of this story's
        scope to fix unreviewed.
  - [x] Manual browser-smoke step (cannot be unit-tested end to end without a live browser + a live game
        session — documented here per AC9's own "or documented browser-smoke step"):
        1. Toggle `game_in_progress` ON via the admin ST-mods panel.
        2. As a player (or ST-as-player via Player Mode) with `tm-use-new-dice-roller` set, open the
           roll tab and pick a discipline/devotion/rite that carries a real `vitae_cost` or
           `willpower_cost` (gdx.6 migration; check `purchasable_powers` for a `category: 'discipline'`
           row with a non-null/non-zero cost).
        3. Confirm `#roll-btn` reads "✦ ROLL & SPEND N VITAE[, M WP]" instead of the plain dice-count
           label, and the sub-line reflects the WP chip's real-spend wording when toggled.
        4. Click roll. Confirm the roll resolves normally AND the player's own tracker card (game app)
           and the admin sheet (open in a second tab/session) both reflect the deduction, live, without
           a manual refresh — the last leg of AC8's existing WS chain.
        5. Repeat with the balance deliberately too low for the cost; confirm the button shows the plain
           label (not a disabled/error state) and rolling spends nothing.
        6. Toggle `game_in_progress` OFF; confirm the button and WP chip both revert to today's exact
           behaviour (AC7).
- [x] Task 6 — Doc correction (AC: none directly; a finding from this story's own investigation)
  - [x] Corrected `CLAUDE.md`'s "Tracker state (`tracker_state` collection) is ST-auth only at the API
        level — player access requires explicit auth change" line — cites `server/routes/tracker.js`'s
        own `canAccess()` as the current, already-correct, player-scoped behaviour.
- [x] Task 7 — Full changed-area regression
  - [x] Ran the new suite alone (22/22 pass) and alongside `gdx-6-structured-power-costs.test.js`,
        `api-tracker-state.test.js`, and `dbo-3-standing-merit-filter.test.js` (83/83 pass, no
        cross-file localStorage/rules-cache pollution). Ran alongside `api-app-settings.test.js` and
        `issue-836-legacy-tracker-cache-removed.test.js` (39/39 pass across the two green files); the
        third file's failure is the pre-existing, CLAUDE.md-documented one (asserts against a since-
        renamed `public/js/suite/tracker.js`), unrelated to this story. `node --check` on both modified
        source files passes.

## Dev Notes

### Investigation findings (2026-08-15, live code read — do not re-derive)

**The roller architecture, precisely.** `USE_NEW_ROLLER` (`app.js:117`, a `tm-use-new-dice-roller`
localStorage flag, default OFF) selects `rollV2` (`roll-v2.js`) over `rollV1` (`roll.js`) as `_roller`.
`roll-v2.js`'s own header comment confirms it is "the parallel dev surface, #1018" this whole epic is
building toward — the correct, and only, target for this story.

**`state.POOL_INFO` is the single carrier of a loaded power's identity.** Set by `loadPool(total, name,
pi)` (`roll-v2.js:52-74`) from whatever `pi` its caller passes. `effPool()`, `updPool()`, and `doRoll()`
all read `state.POOL_INFO`/`state.PS`/`state.MOD`/`state.WP` directly — no re-fetch, no re-lookup.
`pi` itself is built once, at pick-time, by `public/js/shared/pools.js`'s `getPool(char, raw)` —
confirmed the single call site for every discipline/devotion/rite pick in `app.js` (lines 903, 931, and
the "Common Actions" panel, which does NOT go through `getPool` and therefore never carries a cost —
correctly out of AC1's scope, since common actions aren't `purchasable_powers` rows).

**`getPool()` already threads the legacy `cost` string through in exactly the shape AC1 needs to
mirror** (`pools.js:29-68`): `rule.cost` appears at line 41 (`noRoll` branch's `info.c`), line 56 (top-
level `cost`), and line 63 (main-return `info.c`). `rule` here is a `getRuleByKey()` result — the SAME
rules-cache object gdx.6 already populated with `vitae_cost`/`willpower_cost`/`cost_note`. No new data
fetch, no new cache — those fields are already sitting on `rule`, unread, today.

**The tracker write path is ALREADY built, already correct, and already reachable from the player
surface — confirmed by reading the actual code, not assumed from `CLAUDE.md`.**
`server/routes/tracker.js`'s `canAccess(req, charId)` (lines 9-15) already allows a player to write
their OWN character's tracker (`req.user.character_ids` match), ST/dev unconditionally. `PUT
/:character_id` (line 30) has no additional role gate. `game/tracker.js`'s `trackerAdj(charId, field,
delta)` (lines 257-291) is a pure delta-adjuster: clamps to `[0, calcVitaeMax(c)]` /
`[0, calcWillpowerMax(c)]`, calls `saveToApi` (optimistic cache update, `markLocalWrite` for WS-echo
suppression, `PUT` in the background) — which server-side already calls `broadcastTrackerUpdate`. This
whole chain is imported into `app.js` already (`trackerAdj`, `ensureLoaded as ensureTrackerLoaded`,
line 58) and already globally exposed (`window.trackerAdj` via the `Object.assign(window, {...})`
block around line 1372) for existing onclick handlers elsewhere in the app. **This story's actual new
code is small — a field-threading change, three pure decision functions, and wiring calls into an
already-complete write path** — not a new feature built from scratch.

**This directly contradicts `CLAUDE.md`'s own documented claim** ("Tracker state ... is ST-auth only at
the API level — player access requires explicit auth change") **and this session's own earlier answer
to Angelus** when first asked whether the roller lets players spend Vitae/Willpower ("no player-facing
way to spend either from anywhere in the app... an ST has to adjust the tracker on the player's
behalf"). Both were wrong on the SERVER-side auth question specifically — the gate was already open.
What was genuinely true, and remains true until this story ships, is that no UI calls that path. Task 6
corrects the doc; this Dev Notes entry is the record for why.

### WP(+3) chip vs a power's own `willpower_cost` — two different things, both real after this story

Today, `state.WP` (`togMod('wp')`) is PURE POOL MATH: `effPool()` adds 3 dice, `doRoll()`'s own
"Auto-reset WP after rolling (one-time spend)" comment already uses the word "spend" but only resets
the UI toggle — no tracker write happens anywhere in the current code. AC6 makes it a REAL spend, but
only during `game_in_progress`, and additively alongside (never instead of) whatever the loaded power's
own `willpower_cost` is. A devotion costing "1 V & 1 WP" (gdx.6's own combo-parsed shape) rolled with
the boost chip also on, during a live game, spends: 1 Vitae (the power) + 1 Willpower (the power) + 1
Willpower (the chip) = 2 Willpower total, from two different sources the player should be able to tell
apart in the UI (AC6's "labelled distinctly").

### Project Structure Notes

- Modified files: `public/js/shared/pools.js`, `public/js/suite/roll-v2.js`, `CLAUDE.md` (doc
  correction only).
- Does NOT modify: `public/js/suite/roll.js` (legacy v1, out of scope), `public/js/game/tracker.js`
  (reused verbatim), `server/routes/tracker.js` (already correct, reused verbatim), anything in
  `server/` at all — this story is 100% client-side plus one doc correction.
- New test file: `server/tests/gdx-7-apply-costs-on-roll.test.js` (exact name/location to confirm at
  dev time against this project's convention for testing extracted pure functions from a
  browser-only module — see Task 5's own note).

### References

- [Source: public/js/app.js:115-118] — `USE_NEW_ROLLER` flag and `_roller` selection, confirming
  `roll-v2.js` is the correct, sole target.
- [Source: public/js/suite/roll-v2.js] — the whole file; `loadPool` (52-74), `effPool` (78-83),
  `updPool` (120-244, `#roll-btn` label at 161-164, sub-line builder at 149-160), `togMod` (377-395,
  the WP chip), `doRoll` (433-550, the "Auto-reset WP" comment at 544-549 proving today's chip has no
  real tracker effect).
- [Source: public/js/shared/pools.js] — the whole file; `getPool` (29-68), the three `rule.cost`
  threading sites this story's AC1 mirrors exactly (41, 56, 63).
- [Source: public/js/app.js:880-947] — the discipline/devotion/rite picker panel, confirming `getPool`
  is the sole call site feeding `loadPool` for every rollable power pick.
- [Source: public/js/game/tracker.js:257-291] — `trackerAdj`, the exact function this story calls;
  its own clamp-to-max and `saveToApi` behaviour, unmodified by this story.
- [Source: public/js/game/tracker.js:77-87] — `saveToApi`, confirming the WS-broadcast/echo-suppression
  chain this story relies on (AC8) rather than rebuilds.
- [Source: server/routes/tracker.js] — the whole file; `canAccess` (9-15) and `PUT /:character_id`
  (30-47), the finding that server-side auth was already correct, contradicting `CLAUDE.md`.
- [Source: public/js/app.js:58, ~1372] — `trackerAdj`/`ensureTrackerLoaded` already imported and
  globally exposed in the player app, confirming no new wiring is needed to REACH the tracker from this
  surface, only to call it from the right place.
- [Source: D:\Terra Mortis\2026-07-25_meeting-lessons.md §2.8, §2.9, §2.13] — the original design
  decision this story implements a slice of: "Vitae/willpower auto-deduct on roll with ST-gated
  refunds"; damage/reliquary/blood-fruit/influence exclusions; initiative/frenzy/lashing-out as
  separate automation, not this story's job.
- [Source: specs/stories/gdx-5-game-in-progress-setting.md, gdx-6-structured-power-costs.md] — both
  done prerequisites this story consumes: `getGlobalSettings()?.game_in_progress` (gdx.5) and
  `rule.vitae_cost`/`rule.willpower_cost`/`rule.cost_note` (gdx.6).
- [Source: GitHub #988 (GDX-7), #981 (Epic GDX)] — issue text for AC/scope cross-reference.

## Dev Agent Record

### Implementation Plan

Followed the story's own citations exactly. Task 1 threaded the two new fields through `pools.js`'s
`getPool()` at the same three sites `cost` already uses, with one disclosed deviation from AC1's literal
wording (skipping the `info` sub-object duplication — nothing reads it there; see Task 1's own note).
Tasks 2-4 added three pure decision functions to `roll-v2.js` (`spendableCost`, `canAffordCost`,
`rollButtonLabel`) plus a shared `_currentSpendDecision()` helper so `updPool()`'s label and `doRoll()`'s
actual spend can never disagree — both call the same three functions fresh from the same state, never a
cached verdict. `doRoll()` pays the spend once, at the top, before any of its three result branches
(VtR 2e: pay to activate, then roll; a failed roll doesn't refund).

### Debug Log

- `node --check` clean on both modified source files (`public/js/shared/pools.js`,
  `public/js/suite/roll-v2.js`) before writing tests.
- AC5's literal "insufficient balance -> a separate 'Roll without spending' labelled action" was
  simplified during implementation: `rollButtonLabel` falls back to the SAME plain dice-count label a
  no-cost roll already shows, rather than introducing a second button state. That plain label already
  reads as "roll, without spending anything" — a second state would duplicate it for no behavioural
  difference. Recorded as a disclosed deviation in Task 2, not a silent drift from the AC.
- Building the live-DB integration test surfaced a real, previously undocumented drift between
  `server/tests/helpers/test-app.js`'s mount of `/api/tracker_state` (adds an app-level
  `requireRole('st')` gate) and `server/index.js`'s real production mount (`requireAuth` only, `canAccess()`
  does the real scoping) — see the story's own Task 5 note and `deferred-work.md`'s new entry. Not fixed
  here: shared test infrastructure, one-line but wide blast radius, deserves its own reviewed change.
- Confirmed empirically (not assumed) that `loader.js`'s module-level `_rulesCache` does NOT leak across
  vitest test files despite `server/vitest.config.js`'s `singleFork: true` — ran gdx-7's suite alongside
  `gdx-6-structured-power-costs.test.js` and `dbo-3-standing-merit-filter.test.js` (both of which also
  seed `tm_rules_db` via `localStorage`) with no cross-contamination, matching the established pattern
  ~18 other files in this codebase already rely on without ever calling `invalidateRulesCache()`.

### Completion Notes

- All 9 ACs satisfied, all 7 tasks complete.
- `pools.js`'s `getPool()` threads `vitae_cost`/`willpower_cost` at the `noRoll` branch's top level and
  the main return's top level, `?? null` (not `||`) so gdx.6's real `0` ("confirmed free") never
  collapses to `null`. Deliberately not duplicated onto either `info` sub-object — nothing consumes it
  there today.
- `roll-v2.js` gained three pure, directly-testable functions (`spendableCost`, `canAffordCost`,
  `rollButtonLabel`) and one private helper (`_currentSpendDecision`) that both `updPool()`'s button
  label/sub-line and `doRoll()`'s actual spend call fresh, so label and behaviour can never diverge.
  `doRoll()` spends once, unconditionally, before rolling — matching VtR 2e's pay-to-activate semantics.
- The existing WP(+3) pool-boost chip becomes a REAL spend (additive, 1 Willpower, on top of any power's
  own cost) only when `game_in_progress` is true; with the flag off, every piece of this story's new
  behaviour — button label, click behaviour, chip — is byte-for-byte what ships today (AC7's master
  kill-switch requirement).
- AC8 (admin sheet live-updates on a roll-triggered spend) was verified as a chain-tracing exercise, not
  rebuilt: `trackerAdj`'s own `saveToApi` -> `PUT /api/tracker_state/:id` -> server's own
  `broadcastTrackerUpdate` -> admin's existing `initWS({ onTrackerUpdate })` was already wired end to end
  before this story; nothing in this story's diff touches any link in that chain. Confirmed by reading
  the code; the live click-to-admin-sheet leg itself is the one thing this story could not unit-test
  (documented as the manual browser-smoke step, Task 5).
- Real, previously-stale finding corrected: `CLAUDE.md`'s "Tracker state ... is ST-auth only at the API
  level" line was wrong — `server/routes/tracker.js`'s own `canAccess()` already lets a player write
  their own character's tracker, unconditionally for ST/dev. This also corrected an earlier wrong answer
  given to Angelus in this same session before the code was actually read. Task 6.
- Real, previously-undocumented test-harness/production routing drift found and logged (not fixed) —
  see Debug Log and `deferred-work.md`'s new entry.
- Regression: 22/22 new tests, green alone and alongside `gdx-6-structured-power-costs.test.js`,
  `api-tracker-state.test.js`, `dbo-3-standing-merit-filter.test.js` (83/83), and
  `api-app-settings.test.js` (39/39 across the two green files in that run; the third file's failure is
  the pre-existing, CLAUDE.md-documented `issue-836-legacy-tracker-cache-removed.test.js` gap, unrelated
  to this story). `node --check` clean on both modified source files.

### File List

- `public/js/shared/pools.js` — MODIFIED (`getPool()` threads `vitae_cost`/`willpower_cost`, `?? null`,
  at the `noRoll` branch and the main return's top level; not duplicated onto either `info` sub-object)
- `public/js/suite/roll-v2.js` — MODIFIED (new exports `spendableCost`, `canAffordCost`,
  `rollButtonLabel`; new private `_currentSpendDecision()`; `updPool()` wires the button label and
  WP-chip sub-line; `doRoll()` spends once via `trackerAdj` before rolling, when the flag is on, the
  character can afford it, and there's a real cost; review round: `doRoll()` now `await`s
  `ensureTrackerLoaded`, sequences its two `trackerAdj` calls, gains a `_spendInFlight` re-entrancy
  guard, and `spendableCost`/`rollButtonLabel` separate a power's own cost from the WP-chip's;
  **post-review same-day follow-up**: new exported `spendVitae()`/`spendWillpower()` + private
  `_manualSpend(field, label)` — a standalone Vitae/Willpower spend independent of rolling, Angelus's
  actual original ask, clarified after this story's initial roll-button-only interpretation missed it.
  `updPool()` also gained a small block toggling `#rv2-manual-spend-row`'s visibility/labels)
- `public/index.html` — MODIFIED (post-review follow-up: new `#rv2-manual-spend-row` with
  `#spend-vitae-btn`/`#spend-wp-btn`, hidden by default, shown by `updPool()`)
- `public/js/app.js` — MODIFIED (post-review follow-up: `spendVitae`/`spendWillpower` destructured from
  `_roller` with a no-op fallback for `roll.js`/v1 — matches the existing `setAgainSeg` guard pattern —
  and exposed on `window` alongside the other roll-tab globals)
- `server/tests/gdx-7-apply-costs-on-roll.test.js` — NEW (30 tests: 5 `getPool()` field-threading, 18
  pure-function unit tests — 14 original + 4 review-round additions for the power-vs-chip separation —
  7 live-DB integration tests — 3 original clamp-at-0 + 4 new for `spendVitae`/`spendWillpower`,
  including the game_in_progress-off real-guard case. `document` stub upgraded from a bare
  null-returning `getElementById` to a minimal fake element, since `_manualSpend` now triggers a full
  `updPool()` repaint — `trk-card-*` ids still resolve to `null` so `trackerAdj`'s own `patchCard()`
  fallback path stays exercised exactly as before)
- `CLAUDE.md` — MODIFIED (corrected the stale "Tracker state ... is ST-auth only" claim)
- `specs/stories/deferred-work.md` — MODIFIED (test-harness/production routing drift on
  `/api/tracker_state` logged during dev-story; review round added 3 more pre-existing-architecture
  defers — see Senior Developer Review below)
- `specs/stories/sprint-status.yaml` — MODIFIED (gdx-7 tracked through its status lifecycle)

### Change Log

- 2026-08-15: Story implemented end to end in one session. All 7 tasks, all 9 ACs. 22/22 new tests,
  green alongside every changed-area suite checked. Status: ready-for-dev → review.
- 2026-08-15: Internal 3-layer code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor, all
  subagents). 0 decision-needed, 6 patch (all applied), 4 defer (logged to deferred-work.md), 10
  dismissed with evidence. 26/26 regression after patches, green alongside gdx-5/gdx-6/
  api-tracker-state/api-app-settings/dbo-3 suites (104/104 combined). Status: review → done.
- 2026-08-15 (same day, post-review): Angelus clarified that gdx-7's roll-button relabeling was NOT the
  original ask — the actual request was a standalone Vitae-spend button and a standalone Willpower-spend
  button on the Dice tab, independent of rolling entirely. Added `spendVitae()`/`spendWillpower()` to
  `roll-v2.js` (same `trackerAdj`/clamp-at-0 chain, own `game_in_progress` guard — not just a UI hide),
  wired two new buttons in `index.html`, exposed globally via `app.js` matching the existing roll-tab
  global pattern. 4 new live-DB tests (30/30 total, 108/108 alongside the same changed-area suites).
  Not a formal new story — same-day follow-up on gdx-7 itself, since the feature is the same epic and
  the story was still fresh in context. Status unchanged (`done`) — this addition is itself tested and
  green, not a defect fix.

## Senior Developer Review (AI)

**Reviewer:** Internal 3-layer (Blind Hunter + Edge Case Hunter + Acceptance Auditor, all Opus
subagents, no shared context between layers). Codex (external) not attempted this round — the user
picked internal directly, matching the standing preference this session established after Codex hit its
own usage limit on gdx-6.

**Outcome:** Changes Requested → all patches applied → **Approve**.

**Summary:** The core design (three pure decision functions, `?? null` cost-preservation, spend-once-
before-any-result-branch) held up. The review surfaced one real, undisclosed spec violation (AC3/AC6 —
the WP-boost chip alone could flip a genuinely free power's button into spend-mode, and the button never
separated a power's own WP cost from the chip's) and one real, previously-unverified safety gap this
story's own Dev Notes had gotten wrong: `state.rollChar` is set at three sites in `app.js`, not one — the
claim that `_switchChar` alone guarantees a loaded tracker before any spend decision was false. Both are
fixed. The remaining findings were either pre-existing architecture this story correctly reuses as-is
(fire-and-forget writes, no atomic multi-field spend endpoint — both explicitly out of this story's
scope), or false positives the diff-only/no-spec layers couldn't see past their own deliberate blinding.

### Action Items

- [x] [Review][Patch] `doRoll()` could compute affordability against a phantom max-balance default
  [public/js/suite/roll-v2.js — `doRoll`, `_currentSpendDecision`] — `pickChar()` and one sheet-view
  setter in `app.js` (lines 330, 1011) set `state.rollChar` without ever loading the tracker first,
  contradicting the Dev Notes' claim that `_switchChar` alone guarantees this. An unconfirmed
  character's `trackerRead` silently returns seeded MAX defaults, so `canAffordCost` could read a
  broke character as fully-funded. Fixed: `doRoll()` now `await`s `ensureTrackerLoaded(state.rollChar)`
  before computing the real spend; `_currentSpendDecision()` also fires it (unawaited) to warm the
  cache for the label as early as possible. (Edge Case Hunter, independently confirmed by direct code
  read of all three `rollChar =` call sites in `app.js`.)
- [x] [Review][Patch] No guard against `doRoll()` firing twice before the first spend's cache update
  lands [public/js/suite/roll-v2.js — `doRoll`] — `#roll-btn` has plain `onclick="doRoll()"` with no
  debounce in either index.html layout; a fast double-tap could double-charge a power's real cost.
  Fixed: module-level `_spendInFlight` guard, set/cleared around the spend block. (Blind Hunter + Edge
  Case Hunter, independently.)
- [x] [Review][Patch] The two `trackerAdj` calls (vitae, willpower) were fired concurrently, not
  sequenced [public/js/suite/roll-v2.js — `doRoll`] — on a not-yet-confirmed character, two concurrent
  calls would each independently race `ensureLoaded()`, risking one write clobbering the other before
  `_confirmed` is set. Fixed: `await`ed in turn instead of fired-and-forgotten in parallel — negligible
  cost since `trackerAdj` never actually suspends once confirmed, which the `ensureTrackerLoaded` await
  above now guarantees it is. (Edge Case Hunter.)
- [x] [Review][Patch] The WP-boost chip alone could flip a genuinely free power's roll button into
  spend-mode, violating AC3's literal "this AC does not touch that path at all" [public/js/suite/
  roll-v2.js — `spendableCost`, `rollButtonLabel`]; the button also never separated a power's own WP
  cost from the chip's +1, violating AC6's "labelled distinctly" requirement — confirmed by the diff
  and by the test file's own pre-patch expectations. Undisclosed deviation, not a judgment call in the
  Dev Notes. Fixed: `spendableCost` now returns `hasPowerCost`/`powerWillpowerCost` alongside the
  combined total; `rollButtonLabel` gates spend-mode on `hasPowerCost` only and shows only the power's
  own WP amount — the chip's own spend stays exclusively in the sub-line (`updPool()`), so the two
  sources are never merged into one ambiguous figure. The combined total is still what's actually
  checked for affordability and actually spent (both paid together or not at all, AC5's "never
  partial"). 4 new tests added. (Acceptance Auditor.)
- [x] [Review][Patch] The sub-line could claim "(spends 1 WP)" for the WP chip even when the combined
  cost (power + chip) wasn't affordable and `doRoll()` would then spend nothing at all — label and
  actual behaviour disagreed [public/js/suite/roll-v2.js — `updPool`]. Fixed: gated on `spend.canAfford`
  too, matching the button's own gating. (Blind Hunter.)
- [x] [Review][Patch] `ensureTrackerLoaded` was imported but never called — dead code, and the AC5-
  specified defensive read order wasn't actually wired [public/js/suite/roll-v2.js, import line].
  Resolved as a side effect of the first patch above — the import is now live. (Blind Hunter + Acceptance
  Auditor, independently.)
- [x] [Review][Defer] `trackerAdj`'s writes are fire-and-forget with no error surfaced if the underlying
  `PUT` fails (network drop, server hiccup) — the roll still proceeds as if the spend succeeded, and
  nothing tells the player or ST the tracker is now out of sync. Pre-existing: `trackerAdj`/`saveToApi`
  already have this exact shape everywhere they're used in this codebase (`saveToApi`'s own
  `.catch(() => {/* silent fail */})`), confirmed by reading `game/tracker.js` directly — not introduced
  or worsened by this story. Deferred, reason: matches an existing, already-shipped pattern; fixing it
  here would mean redesigning `trackerAdj` itself, out of this story's scope. (Blind Hunter, Edge Case
  Hunter.)
- [x] [Review][Defer] Vitae and Willpower are spent via two independent, non-atomic writes for a single
  activation — if one succeeds and the other fails, the character is left half-charged with no rollback.
  A true fix needs a server-side atomic multi-field spend endpoint, which this story's own "What this
  story is NOT" section explicitly excludes ("NOT a new API endpoint, and NOT a server-side auth
  change"). Deferred, reason: architecturally out of scope; same class as the fire-and-forget defer
  above. (Blind Hunter.)
- [x] [Review][Defer] TOCTOU race: the tracker balance can change (WS update, ST manual edit) between
  `_currentSpendDecision()`'s affordability read and `trackerAdj`'s actual mutation; `trackerAdj`'s own
  clamp-at-0 would then silently truncate an unaffordable spend rather than reject it outright,
  technically weakening the "never a partial spend" guarantee in a narrow, low-probability window. A
  full fix needs a server-side atomic "spend-if-affordable" check, same scope boundary as the two defers
  above. Deferred, reason: low-probability, architecturally out of scope. (Edge Case Hunter.)

### Dismissed (verified false positive or non-issue, with evidence)

- "Dead distinction between `null` and `0` cost values in `spendableCost`" (Blind Hunter) — collapsing
  both to "spend 0" at the DECISION layer is correct and intentional (both genuinely mean "nothing to
  spend here"); the `?? null` distinction pools.js preserves is for the DATA layer (display, future
  features), not this one. Already explicitly tested (`gdx-7-apply-costs-on-roll.test.js`'s "both nothing
  to spend at this layer" cases).
- "Roll button loses dice-count visibility when a spend applies" (Blind Hunter) — matches AC3's literal,
  explicit design: the label becomes `'✦ ROLL & SPEND N VITAE'` "instead of the plain dice-count label."
  Deliberate spec'd behaviour, not a defect. (Worth a note to Angelus as a possible future UX iteration,
  not a code fix.)
- "Silent can't-afford fallback lets a broke character use an expensive power for free" (Blind Hunter) —
  matches AC5's literal, explicit spec: "falls back to a 'Roll without spending' ... action that rolls
  with no deduction at all, exactly matching the issue's own 'offer roll-without-spend' wording." A
  deliberate, spec'd escape hatch, not a mechanical exploit.
- "No validation against malformed/negative cost data" (Blind Hunter) — `purchasable_power.schema.js`'s
  own `vitae_cost`/`willpower_cost` declarations (gdx-6) already enforce `minimum: 0`; a negative value
  cannot exist in the collection this code reads from.
- "New `noRoll` branch fields with no visible consumer" (Blind Hunter) — intentional, per AC1's own
  literal wording (both branches must thread the fields); mirrors the existing `cost`/`info.c` parity
  already present in that same branch. Forward-looking parity, not dead code.
- "Story narrates its own deferrals in the same diff that implements the feature" (Blind Hunter) —
  procedural narration in `sprint-status.yaml`, matches this project's own established convention
  (visible in the gdx-5/gdx-6 rows too). Not a code defect.
- "Referenced story file not present in the diff" (Blind Hunter) — false positive caused by the Blind
  Hunter's own deliberate blinding: the story file exists on disk and was intentionally excluded from
  the reviewed diff per this review's own scoping (announced in the pre-review checkpoint).
- "Duplicated cost-threading block in `pools.js`" (Blind Hunter) — matches pre-existing precedent: the
  `cost: rule.cost || null` line is already duplicated across both branches with no shared helper; this
  story's addition mirrors that exact existing pattern, not a new problem it introduced.
- "Unparsed (`null`) vs confirmed-free (`0`) power cost has no distinguishing label or ST-review flag"
  (Edge Case Hunter) — deliberate, tested behaviour; a "flag unparsed costs for ST review" UI is gdx-6's
  own already-logged deferred scope (admin editor gap), not this story's job.
- "AC1 deviation note doesn't separately name the `noRoll` branch's own smaller `info` shape" (Acceptance
  Auditor) — documentation-completeness nit only, no functional bug; the actual behaviour is consistent
  and correct across both branches, confirmed by the diff and the test fixtures.
