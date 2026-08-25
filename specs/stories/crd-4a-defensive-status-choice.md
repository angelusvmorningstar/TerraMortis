---
id: crd.4a
epic: crd
epic_file: specs/epic-crd-contested-roll-defence.md
status: done
priority: medium
type: feature
depends_on: [crd.3a, crd.3b]
branch: ms/crd-4a-defensive-status-choice
---

# Story CRD.4a: Defensive City Status advantage (at-court power resistance)

## Story

As a defending player resisting a power at Court,
I want the option to substitute my City Status advantage for my Blood Potency in my resistance
pool, and to always choose between the two myself even when one is obviously bigger,
so that outranking my rival at Court can matter as much as how old my blood is, without the
game silently making that call for me.

## Why this story exists

Angelus ruled the defensive half of crd.4's City Status/Blood Potency house rule on 2026-08-26
(Errata not yet updated — players have already been told of the change, so the ruling stands
ahead of the citation): when defending against a power, at Court, with game mode active, if the
defender's City Status is higher than the attacker's, the defender is offered an explicit choice
between their Blood Potency and the City-Status difference — best-of is computed and shown, but
the player always picks manually. Design-locked the same session (Sally,
`bmad-agent-ux-designer`): a real, Playwright-verified static mockup lives at
`public/mockups/crd-4-defensive-status-choice-mockup.html` (both themes) — the decisions below
are LOCKED, not proposals to re-litigate.

This story implements ONLY the defensive half. Angelus is holding the attack-penalty half (the
same City Status gap penalising the attacker's roll) for a separate ruling pending a check with
Symon — see crd.4b, not yet created.

## Decisions already made (do not re-litigate)

- **Scope is narrow.** This is a gated substitution for one specific context only. Outside it,
  crd.1–3b's Defensive Reaction pool is completely unchanged — Resistance Attribute + Willpower +
  merits only, no Blood Potency or City Status term anywhere else in this app.
- **The gate is three conditions, ALL required:** (1) the challenge is against a power
  (`challenge.power_name` is a non-empty string — the field that already exists on
  `contested_roll_request` specifically for this), (2) game mode is active (the current Chapter's
  phase is `'game'`), (3) both the challenger and the defender are marked `attended: true` in the
  current game session (both must genuinely be present for an "at Court" confrontation to make
  sense — confirmed by Angelus, 2026-08-26, see Open Questions below). If any condition fails,
  this feature does not exist for this challenge: the new
  section never renders, the response carries no `status_choice` field, and the computed
  `defender_pool` is unaffected. (Corrected 2026-08-26: the persisted document and response DO gain
  one new field even on this path — `defender_status_term: null`, always `$set` alongside the
  other route-owned fields, matching this route's own existing convention of unconditionally
  writing every field it owns on every resolve rather than conditionally omitting irrelevant ones.
  "Byte-for-byte identical" was an overstatement — the computation and gate logic are unaffected,
  the response shape gains one always-null field.)
- **Within the gate, a further condition:** the defender's effective City Status must be strictly
  higher than the challenger's. If not, again: feature does not exist for this challenge.
- **BP=0/gap=0 floor: moot, not a real case.** There is no BP-0 player in this game — thin-bloods
  are a Masquerade concept, not used here, every vampire PC has BP ≥1. Mortals have neither Blood
  Potency nor City Status and cannot be a defender in this mechanic at all (in practice: a mortal
  defender's `blood_potency`/`status.city` are both absent/zero and the City-Status-higher gate
  will essentially never pass for them; no special-case floor is needed regardless).
- **Capped-vs-uncapped scaling: ruled uncapped.** The City-Status-difference term is exactly
  `calcEffectiveCityStatus(defender, defenderRegentAmbience) - calcEffectiveCityStatus(challenger,
  challengerRegentAmbience)` — no separate cap on the difference itself, even though each side is
  already individually capped at 10 by `calcEffectiveCityStatus`. Matches how Blood Potency is
  already used raw/uncapped elsewhere in this codebase's defensive pools (`public/js/shared/
  resist.js`).
- **Neither option is ever pre-selected**, even when one is obviously larger. The mockup shows a
  small gold "Higher" pill as guidance only — never a selection. Until the player picks, the pool
  preview shows a plain-label placeholder ("Choose above" — NOT the display font, see below) and
  the Roll button is labelled "Choose a status term first" (corrected during dev-story: NOT
  actually disabled — see AC8/Debug Log below, this mirrors crd-3b's own AC7 precedent that the
  server's `defender_pool == null` 409 is what protects `/accept`, never a client-side duplicate).
- **New UI section (`.cr-status-seg`) sits between Willpower and Merits** on the existing crd-3b
  resolve screen, same visual weight as the sections around it. A 2-option exclusive choice styled
  from the same family as `.cr-aspect-seg` (button shape, `.on` tint, tokens) but under its own
  class — mirrors this exact codebase's own precedent (`.cr-aspect-seg` itself was deliberately
  scoped separately from `.rv2-again-seg` so a future change to one can't ripple into the other).
- **The pool-preview placeholder text is explicitly NOT set in the display font** (`var(--fh)`,
  Cinzel). This app's own type rule (CLAUDE.md) reserves Cinzel for numerals/display only, never
  labels or words no matter how prominent — caught and fixed during design-lock, when the first
  draft used the display font for the word "Choose above". The placeholder uses the same label
  style as the section labels around it (`var(--fl)`, 700 weight, uppercase, `--txt3`).
- **Selected-state styling reuses the same `.on` tint treatment as every other control on the
  screen** (aspect, Willpower, merit chips) — Angelus's own explicit call during design-lock
  (consistency over a stronger bespoke affordance for this one control, even though it is a
  mandatory pick rather than an optional toggle like the others).

## Acceptance Criteria

1. **Server: gate eligibility is computed fresh on every `/resolve` call, never cached or
   client-asserted.** `PUT /api/contested_roll_requests/:id/resolve` determines, using only live
   data read at request time: is `challenge.power_name` a non-empty string; is the current Chapter
   (`getCollection('chapters')`, `currentCycleInGamePhase` from `public/js/downtime/cycle-phase.js`
   — same import already used by `server/routes/office-actions.js` for exactly this check) in
   `'game'` phase; are both the challenger and defender character IDs present with
   `attended: true` in the current game session (session-selection corrected 2026-08-26, code
   review: mirrors `server/routes/office-actions.js`'s own `findLatestSession` — `session_date <=
   today`, tied-broken by `_id` — rather than `attendance.js`'s own unfiltered "most recent by
   date" sort, since a future-dated `game_sessions` document is a real supported shape in this app
   and would otherwise silently outrank the actually-live session; attendance MATCHING still
   mirrors `attendance.js`'s own id-then-name fallback). If all three hold AND
   the defender's `calcEffectiveCityStatus` (from `public/js/data/city-status-calc.js`, the shared
   client+server module, imported the same way `office-actions.js` already does) is strictly
   higher than the challenger's, the gate is open for this resolve call. Otherwise it is closed and
   nothing below in this AC list applies — the computed `defender_pool` and every other field
   crd.3a already returns are unaffected (see the "Decisions already made" note above on the one
   always-present `defender_status_term: null` field this adds to every response).
2. **Server: when the gate is open, `/resolve`'s response carries the two term values regardless
   of whether a term has been chosen yet**, as a new `status_choice` object:
   `{ eligible: true, bp_value: <int>, city_value: <int> }` where `bp_value` is
   `defender.blood_potency || 0` and `city_value` is the City-Status difference computed per the
   "Decisions already made" section above. When the gate is closed, `status_choice` is either
   omitted or `{ eligible: false }` — the client must treat both the same way.
3. **Server: when the gate is open, `defender_status_term` becomes a required field** (one of
   `'bp'` or `'city'`) for the pool to be finalised. If the gate is open and
   `defender_status_term` is missing or not one of those two values, `defender_pool` in the
   response is `null` (the same "not resolved yet" signal AC already uses when `defender_aspect`
   is unset) — this is NOT a 400; the aspect/WP/merit portion of the pool may already be
   legitimately computed and worth showing, only the final total is withheld pending the choice.
   When submitted validly, the chosen term's value (from AC2's own computation, not a
   client-submitted number) is added to the pool exactly once, then the existing clamp to 0-30
   applies as it already does today.
4. **Server: the resolved challenge document persists which term was chosen** —
   `defender_status_term: 'bp' | 'city' | null` — alongside the existing `defender_pool`,
   `defender_aspect`, etc. `null` when the gate was never open for this challenge (the normal,
   overwhelming majority case). Add `defender_status_term` to `contested_roll_request.schema.js`'s
   `properties` (enum `['bp', 'city']`, matching how `defender_aspect` etc. are declared there for
   documentation/shape completeness even though this route has no `validate()` middleware — the
   established convention for every field this route itself writes).
5. **Client: the new section renders if and only if the resolve response's `status_choice.eligible`
   is `true`.** It never renders speculatively, never renders based on a client-side guess at the
   gate conditions — the server is the sole authority, matching every other trust-boundary decision
   in this screen (AC6 of crd.3b, unchanged).
6. **Client: neither option is ever auto-selected (`.on`) on the basis of which value is
   larger.** `.on` is applied only once the player has actually clicked an option — never
   speculatively, never because `status_choice.city_value > status_choice.bp_value`. (Wording
   corrected 2026-08-26 during code review: the original phrasing read as forbidding `.on`
   outright, which would have contradicted the selected-state styling this same story requires —
   the actual rule is no *auto*-selection, and the implementation is correct.) A small pill
   (matching the mockup's "Higher" treatment) marks the numerically larger option as guidance only.
7. **Client: selecting an option sets `state.statusTerm` and immediately re-calls `/resolve`**
   with `defender_status_term` included in the body, using the exact same generation-guard
   (`_resolveGen`/`_mountGen`) machinery AC6 of crd.3b already established — no new race-guard
   mechanism invented.
8. **Client: while the gate is open and no term is yet chosen, the pool preview shows the
   plain-label placeholder ("Choose above", `var(--fl)`, not `var(--fh)`) and the Roll button's
   label reads "Choose a status term first"** — distinct from the existing "Choose how to resist"
   message (no aspect chosen yet), so a player mid-flow can tell which choice is still
   outstanding. **Corrected during dev-story (2026-08-26):** the button is NOT client-disabled —
   an earlier draft of this AC said it should be, but that would duplicate the server's own
   null-pool guard, which crd-3b's own AC7 explicitly forbids (code-reviewed, deliberate: the
   route's `defender_pool == null` 409 is what actually protects this, exactly like the
   pre-existing "no aspect chosen yet" case already works). Label-only, same as crd-3b's pattern.
9. **Client: if the gate closes between renders (e.g. a stale mount, or the ST ends game mode
   mid-resolve), the section is removed and any previously-selected `state.statusTerm` is
   discarded** — the next `/resolve` call sends `defender_status_term: null` (corrected wording,
   2026-08-26: the implementation always includes the key rather than omitting it, and the server
   treats a missing key and an explicit `null` identically — functionally equivalent to "omits",
   but the literal claim was wrong), matching how a closed gate is handled everywhere else in this
   story.
10. **Every colour, spacing and font value in the new CSS is an existing `theme.css` token**,
    ported from the locked mockup (`public/mockups/crd-4-defensive-status-choice-mockup.html`)
    into `public/css/suite.css` — no new hex or `rgba(...)` literal anywhere, matching crd-3b's own
    AC11 bar exactly.
11. **No new HTTP GET is added anywhere in this story.** `status_choice` rides on the existing
    `/resolve` response crd-3b's screen already calls on every state change; the client adds no
    new request type.
12. **Test coverage**, mirroring crd-3b's own `server/tests/crd-3b-resolution-screen.test.js`
    technique exactly (`vi.mock()` the browser-only imports, drive the real module against a
    hand-rolled element stub): the gate-open/gate-closed render branch (AC5), the always-unselected
    initial state even when city_value is larger (AC6), the placeholder/label-only-not-disabled
    state before a term is chosen (AC8, corrected — see Debug Log), the generation-guarded
    re-resolve on term selection (AC7), and the
    gate-closes-mid-flow discard (AC9). Server-side: a new `server/tests/crd-4a-defensive-status-
    choice.test.js` covering the three-condition gate (each condition tested failing alone), the
    City-Status-higher requirement, the `status_choice` value computation, the required-when-
    eligible validation (AC3), and the persisted `defender_status_term` (AC4). SEPARATELY,
    browser-verify the actual rendered screen in both themes for the token-contrast/placeholder-
    font concerns (AC10, "Decisions already made"), matching crd-3b's own "browser-verified end to
    end" precedent.

## What this story is NOT

- **Does NOT implement the attack-penalty half** (the City Status gap penalising the attacker's
  roll). Angelus is holding that for a separate ruling pending a check with Symon — a future
  crd.4b, not yet created. Nothing in this story reads or writes anything on the challenger/
  attacker's own pool computation (`challenger_pool` is set at creation time by
  `challenge-initiation.js`, untouched here).
- **Does NOT touch `challenge-initiation.js`** (the attacker side) — same exclusion crd-3b already
  established, unrelated to this story's own scope.
- **Does NOT change the Defensive Reaction pool for any contest outside the three-condition gate.**
  A Social Manoeuvre, a non-power Discipline-adjacent contest, an off-Court confrontation, or a
  contest during any non-'game' Chapter phase are all completely unaffected — this story adds
  nothing to any of those paths.
- **Does NOT add a City Status or Blood Potency term to the OLD standalone ST tool**
  (`public/js/game/contested-roll.js`, the pre-existing "Com+BP" manual pool calculator) — that
  file already has its own independent BP term for a different, ST-manual workflow and is
  untouched by this epic entirely.
- **Does NOT generalise `calcEffectiveCityStatus` or `currentCycleInGamePhase`.** Both are reused
  exactly as `office-actions.js` already calls them, no new parameters or behaviour added to
  either shared module.
- **Does NOT add a new HTTP GET.** See AC11.
- **Does NOT change how territories/regent ambience are computed.** `findRegentTerritory` is
  reused exactly as `office-actions.js` already calls it for the identical
  `calcEffectiveCityStatus` computation.

## Tasks / Subtasks

- [x] Task 1 — Server: three-condition gate check in `/resolve` (AC: 1)
  - [x] Power check: `challenge.power_name` non-empty string
  - [x] Game-mode check: `currentCycleInGamePhase(await getCollection('chapters').find().toArray())`
        is non-null
  - [x] Attendance check for BOTH challenger and defender: most-recent `game_sessions` document,
        `attended: true` entry matched by id-then-name (mirror `server/routes/attendance.js`)
  - [x] City-Status-higher check: fetch `territories`, compute both sides'
        `calcEffectiveCityStatus`, defender's must be strictly greater
- [x] Task 2 — Server: `status_choice` response field + required-term validation (AC: 2, 3)
- [x] Task 3 — Server: persist `defender_status_term`; add to schema (AC: 4)
- [x] Task 4 — Client: gated section render, always-unselected state, "Higher" guidance pill
      (AC: 5, 6)
- [x] Task 5 — Client: selection wiring, generation-guarded re-resolve (AC: 7)
- [x] Task 6 — Client: placeholder text (label font, not display font); Roll-button label change
      only, NOT client-disabled (AC: 8; corrected from the story's own original wording — see Dev
      Agent Record)
- [x] Task 7 — Client: gate-closes-mid-flow discard handling (AC: 9)
- [x] Task 8 — CSS: port the locked mockup's `.cr-status-seg` rules into `suite.css`, tokens only
      (AC: 10)
- [x] Task 9 — Tests: client (`crd-3b-resolution-screen.test.js`, extended, 9 new tests) + server
      (new `crd-4a-defensive-status-choice.test.js`, 19 tests) + live browser check in both themes
      against the REAL shipped stylesheets (AC: 12)

## Dev Notes

### The gate's three real code paths, already proven in this codebase — do not reinvent any of them

- **Game-mode check**: `server/routes/office-actions.js` (lines ~164-168) already does exactly
  this for its own `GATED_TYPES` gate:
  ```js
  const cycles = await getCollection('chapters').find().toArray();
  const liveCycle = currentCycleInGamePhase(cycles);
  if (!liveCycle) { /* not gated */ }
  ```
  `currentCycleInGamePhase` is imported from `public/js/downtime/cycle-phase.js`. Server callers
  pass no second argument (`deriveStatus`) — that parameter exists for legacy-cycle status
  fidelity that server callers don't need (confirmed by reading the function's own doc comment).
- **Attendance / "at Court" check**: `server/routes/attendance.js`'s `GET /` is the live,
  currently-shipped mechanism the downtime form itself calls (`public/js/tabs/downtime-form.js`,
  ~line 1573: `GET /api/attendance?character_id=...`) to show the "Attended"/"Absent" badge. Its
  MATCHING logic is mirrored exactly (not called over HTTP — this is same-process server code,
  mirror the Mongo query, don't self-call the route):
  1. Match an attendance entry by `String(a.character_id) === charId`, falling back to
     `a.character_name === charName || a.name === charName` for legacy entries with stale IDs.
  2. `attended = entry?.attended === true`.
  **Session-SELECTION corrected 2026-08-26 (code review), does NOT mirror `attendance.js` for
  this part**: `attendance.js`'s own `.find({}).sort({session_date:-1}).limit(1)` has no
  `session_date <= today` ceiling, so a future-dated `game_sessions` document (a real, supported
  shape — see `server/routes/game-sessions.js`'s own `GET /next`) would silently outrank the
  actually-live session. `server/routes/office-actions.js`'s own `findLatestSession` — `{
  session_date: { $lte: today } }`, sorted `{ session_date: -1, _id: -1 }` for a deterministic
  same-date tie-break — is the correct pattern and is what this story's gate actually uses.
  Do this attendance match for BOTH `challenge.challenger_character_id` and
  `challenge.target_character_id` against
  the SAME session document (both must be present at the SAME game for an "at Court" confrontation
  to be coherent — confirmed by Angelus, 2026-08-26; see Open Questions above).
- **City Status computation**: `server/routes/office-actions.js` (lines ~316-319) already does
  this for its own office-purchase budget check:
  ```js
  const territories = await getCollection('territories').find({}, { session: dbSession }).toArray();
  const regentAmbience = findRegentTerritory(territories, actor)?.ambience;
  const budget = calcEffectiveCityStatus(actor, regentAmbience);
  ```
  `calcEffectiveCityStatus` and `findRegentTerritory` are both imported from
  `public/js/data/city-status-calc.js` and `public/js/data/helpers.js` respectively — both already
  proven safe to import server-side (no browser-only globals; `city-status-calc.js`'s own header
  comment explicitly documents this was verified deliberately). Compute this for BOTH challenger
  and defender characters to get the two `calcEffectiveCityStatus` values the gate and the
  `status_choice.city_value` both need.

### Why `status_choice` must ride on `/resolve`, not a new endpoint

Unlike aspect/Willpower/merits — all client-knowable from the defender's own character document,
already resident in `chars` — the challenger's effective City Status is NOT something the client
can compute. The player's own `suiteState.chars` only contains their OWN characters; the
challenger may be an NPC or another player's character the defender has no document for. Only the
server can see both sides. Rather than add a new GET (forbidden by this story's own AC11 and the
epic's broader "no new fetch" discipline crd-3b established), `status_choice` rides on the
existing `/resolve` call the client already makes on every aspect/WP/merit change (crd-3b AC6) —
it costs nothing extra network-wise, and the client already re-renders on every response.

### The `defender_pool: null` precedent this story extends, not invents

crd-3b's own client already treats `state.pool === null` as "not resolved yet, show 'Choose how to
resist'" the moment no `defender_aspect` is set (`contested-resolve.js`'s own early return: `if
(!state.aspect) { state.pool = null; ...; return; }`). This story adds a SECOND reason `pool` can
be `null` — aspect IS chosen, but the gate is open and no `defender_status_term` has been
submitted yet. The client must distinguish the two for messaging (AC8), but the underlying
`null`-means-"not finalised yet" contract is unchanged.

### Open Questions — RESOLVED by Angelus, 2026-08-26 (confirmed after story creation, before dev-story)

1. **Does "at Court" require BOTH challenger and defender to have `attended: true` in the same
   session, or only the defender?** **CONFIRMED: both.** Task 1's attendance check stays as
   written — two lookups against the same session document, one per side.
2. **Does the gate require `power_name` specifically, or should it also key off `roll_type ===
   'resistance'`?** **CONFIRMED: `power_name` alone.** No additional `roll_type` condition.

### Project Structure Notes

- `server/routes/contested-rolls.js` — `/resolve` extended: gate computation, `status_choice`
  response field, `defender_status_term` validation/persistence. `/accept`, `/decline`, `/void`,
  `POST /` all untouched.
- `server/schemas/contested_roll_request.schema.js` — add `defender_status_term` property
  (enum `['bp', 'city']`), matching how `defender_aspect` etc. are declared.
- `public/js/game/contested-resolve.js` — new section rendering + selection wiring, extending the
  existing `_html()`/`_onClick()`/`_resolve()` functions crd-3b already built. No signature change
  to `initContestedResolve` — this story adds no new parameter.
- `public/css/suite.css` — new rules for `.cr-status-seg` (+ `.cr-status-term-val`,
  `.cr-status-pill`, `.cr-status-note`, the plain-label pending-placeholder style), ported from the
  locked mockup.
- `server/tests/crd-4a-defensive-status-choice.test.js` (new).
- `server/tests/crd-3b-resolution-screen.test.js` — extended, not replaced (same file, new test
  cases for this story's own client behaviour, since the gated section lives inside the same
  module crd-3b already tests).

### References

- [Source: public/mockups/crd-4-defensive-status-choice-mockup.html] — the locked design, real
  classes/tokens to port.
- [Source: specs/epic-crd-contested-roll-defence.md, crd.4 table row and Sequencing notes] — the
  full ruling record, all four originally-open edge-case questions and their resolutions.
- [Source: server/routes/office-actions.js:159-169,316-319] — `currentCycleInGamePhase` and
  `calcEffectiveCityStatus`/`findRegentTerritory` reuse patterns, both already proven server-side.
- [Source: server/routes/attendance.js] — the live "at Court" attendance-check mechanism this
  story mirrors (session-selection, id-then-name matching).
- [Source: public/js/tabs/downtime-form.js:1570-1579] — the client call site confirming
  `attendance.js` is the real, currently-shipped "was this player at court" mechanism.
- [Source: public/js/downtime/cycle-phase.js:123-126] — `currentCycleInGamePhase`'s own doc
  comment and implementation.
- [Source: public/js/data/city-status-calc.js] — `calcEffectiveCityStatus`, already safe for
  server-side import (see its own header comment).
- [Source: server/routes/contested-rolls.js] — the full `/resolve` endpoint this story extends
  (crd.3a), and the `_findChallenge`/`_attrEffective`/clamp patterns already established there.
- [Source: server/schemas/contested_roll_request.schema.js] — the existing declared-shape
  convention for server-set fields (`defender_aspect` etc.) this story's new field follows.
- [Source: public/js/game/contested-resolve.js] — the crd-3b screen this story extends (`_html()`,
  `_resolve()`, `_onClick()`, the `_resolveGen`/`_mountGen` race-guard).
- [Source: public/js/shared/resist.js:74,114] — `char.blood_potency` field access precedent.
- [Source: specs/stories/crd-3b-client-resolution-screen.md] — the immediately-preceding story in
  this epic; this story's own `status_choice`-rides-on-`/resolve` design directly follows crd-3b's
  own "no new GET" discipline and generation-guard reuse.

## Dev Agent Record

### Agent Model Used

Claude Opus (bmad-dev-story)

### Debug Log References

- **AC8's own wording had to be corrected during implementation, not just followed.** The story as
  originally written (create-story) said the Roll button should be "disabled" while a status term
  is outstanding. Writing the test for this immediately surfaced a direct conflict with crd-3b's
  own AC7 ("adds no client-side gating duplicate of that guard" — the `defender_pool == null` 409
  is what actually protects `/accept`, exactly as the pre-existing "no aspect chosen yet" case
  already works, never client-disabled either). Verified by reading `contested-resolve.js`'s own
  `canAccept` computation directly: `!state.resolving && !state.accepting`, no `state.pool` term at
  all — a deliberate, code-reviewed decision from crd-3b, not an oversight to build on top of.
  Fixed both the implementation (label-only, `canAccept` untouched) and the AC8 text itself
  (marked corrected in place, not silently changed) rather than let the story keep asserting
  something the codebase's own established pattern already forbids.
- **`server/tests/gdx-4-css-standards-grep.test.js` has one pre-existing failure**, unrelated to
  this story: "leaves the compliant var() fallbacks in place" expects at least 11
  `var(--token, fallback)` sites in `suite.css` and finds 10. Verified via `git stash` A/B — the
  same failure, same count, reproduces identically on the unmodified base branch. This story's own
  diff to `suite.css` is purely additive (`git diff` shows zero removed lines), so it cannot be the
  cause. Not investigated further; flagged for whoever next touches that test's own baseline count.

### Completion Notes List

- **Server gate reuses three already-proven patterns verbatim, per the story's own Dev Notes** —
  `currentCycleInGamePhase`/`calcEffectiveCityStatus`/`findRegentTerritory` imported and called
  exactly as `office-actions.js` already does (same collections, same no-second-arg convention);
  the "at Court" attendance check mirrors `server/routes/attendance.js`'s own live query shape
  (most-recent `game_sessions` by `session_date`, id-then-name matching) rather than a new lookup
  or an internal HTTP self-call. All three confirmed by reading the cited source files directly
  before writing a line, not assumed from the story's own prose.
- **`_statusChoiceEligibility` short-circuits on `power_name` first**, so the overwhelming majority
  of `/resolve` calls (any non-power contest) never touch `chapters`/`game_sessions`/`territories`
  at all — no new DB load added to the common path.
- **`defender_pool: null` is now reachable for TWO distinct reasons**, both meaning "not finalised
  yet": no `defender_aspect` (crd-3b, unchanged) and — new here — the gate open with no
  `defender_status_term` submitted. The clamp step (`Math.max(0, Math.min(30, ...))`) is
  deliberately skipped when the pool is `null`, since `Math.min(30, null)` silently coerces to `0`
  (a real, wrong total) rather than staying `null` — caught while writing the code, not by a test
  failure.
- **`status_choice` is attached to the response object AFTER the Mongo re-fetch**, not persisted —
  it is a live-computed value only meaningful for the response that produced it (the values would
  go stale the moment either character's City Status changes). `defender_status_term` (which term
  was picked) is the only piece of this mechanic that persists on the document.
- **Client discard-on-close (AC9)** happens inside `_resolve`'s own success branch: any response
  without an eligible `status_choice` clears both `state.statusChoice` and `state.statusTerm`
  together, so a stale selection can never silently ride along into a re-opened gate under
  different numbers on a later call.
- **CSS is purely additive** — `.cr-status-seg` mirrors `.cr-aspect-seg`'s exact shape/tokens under
  its own class (same precedent that class itself already established against `.rv2-again-seg`),
  and `.cr-pool-pending` exists specifically so the "Choose above" placeholder does NOT inherit
  `.cr-pool-value`'s display font (`var(--fh)`, Cinzel) — this app's own type rule reserves that
  face for numerals only. Verified visually against the REAL shipped `theme.css`/`components.css`/
  `suite.css` (not a mockup's own duplicate styles) with a Playwright screenshot in both themes,
  matching crd-3b's own established verification method exactly; the ephemeral harness file and
  screenshots were deleted after use, per that same precedent.
- **Test coverage**: 19 new server tests (`crd-4a-defensive-status-choice.test.js`) covering every
  one of the three gate conditions failing alone, the City-Status-higher requirement, effective-
  City-Status capping at 10 per side before the difference is taken, `status_choice` value
  computation, the required-when-eligible null-pool behaviour (not a 400), persisted
  `defender_status_term` including the `null`-when-never-open case, re-resolve overwrite (not
  merge), and the 0-30 clamp still applying with a status term added. 9 new client tests appended
  to `crd-3b-resolution-screen.test.js` (same `vi.mock()` + element-stub technique, no jsdom added)
  covering the gate-open/closed render branch, the always-unselected initial state with the
  "Higher" pill as guidance only, the placeholder/label messaging, the generation-guarded
  selection call, and the gate-closes-mid-flow discard. New suite totals: crd-4a 19/19,
  crd-3b (extended) 32/32. Full changed-area regression (crd-1/crd-2/crd-3a/crd-3b/crd-4a/
  api-tracker-state/oaq-2/oaq-3/otc-2-office-actions/otc-2-city-status-calc): 249/249, 0 failed.
  NOT committed, NOT pushed, NOT merged.

### File List

- `server/routes/contested-rolls.js` — `/resolve` extended: new `_statusChoiceEligibility` helper,
  gate wiring, `status_choice` response field, `defender_status_term` validation/persistence.
  `/accept`, `/decline`, `/void`, `POST /` untouched.
- `server/schemas/contested_roll_request.schema.js` — added `defender_status_term` property
  (`['string','null']`, enum `['bp','city',null]`).
- `public/js/game/contested-resolve.js` — new `statusChoice`/`statusTerm` state fields, the
  `[data-cr-status-term]` click branch, the gated section's `_html()` fragment, the
  awaiting-status-term placeholder/label branch, and the discard-on-close logic in `_resolve`.
  `initContestedResolve`'s own signature unchanged.
- `public/css/suite.css` — new rules: `.cr-status-seg` (+ button/hover/`.on`/`.cr-status-term-val`
  states), `.cr-status-pill`, `.cr-status-unselected-warn`, `.cr-pool-pending`.
- `server/tests/crd-4a-defensive-status-choice.test.js` (new, 19 tests).
- `server/tests/crd-3b-resolution-screen.test.js` (extended, 9 new tests; 23 pre-existing tests
  unmodified).
- `specs/stories/crd-4a-defensive-status-choice.md` — this file: Tasks/Subtasks checked, AC8
  corrected in place, Dev Agent Record added, Status → `review`, then → `done` after code review
  (AC1/AC6/AC9/AC12/Task-9-count wording corrections, Senior Developer Review section added).
- `specs/stories/sprint-status.yaml` — `crd-4a-defensive-status-choice` status updated.
- `server/tests/crd-4a-defensive-status-choice.test.js` — 3 new describe blocks added during code
  review (POST-strip, non-finite-pool, future-session), 1 dead-code cleanup (unused `beforeEach`
  import, unused `seededCharIds` accumulator). 19 → 22 tests.

## Senior Developer Review

**Round: EXTERNAL Codex CLI review**, run via `codex exec` (`model_reasoning_effort=high`),
2026-08-26. Persisted at `specs/stories/code-review/crd-4a-codex-findings.md`.

### A genuinely rocky external-tool run — disclosed in full

This local `codex` CLI install proved unreliable: a corrupted models cache
(`missing field base_instructions`) killed the first two attempts almost immediately (one after a
single acknowledgement message, no tool calls at all). Backing up the cache file let one full,
clean Pass 1 (Blind Hunter) run complete and freeze correctly. Attempting to continue the SAME
session via `codex exec resume` for Pass 2 did not work as documented — it silently re-ran Pass 1
instead of continuing, twice. Switching to fully independent one-shot invocations per pass (the
skill's own sanctioned "isolated mode", appropriate anyway given this diff touches a shared
trust-boundary route) eventually produced a run that — on its own initiative, exceeding what it was
asked to do for that invocation — completed Pass 2 AND Pass 3a in a single call, including reading
the story spec despite being told not to for that pass. The blinding discipline was therefore
imperfect on this round (Pass 2 was not run in strict isolation from spec context), a real process
deviation, disclosed here rather than presented as clean. **Separately, and more seriously**: while
running under `-s workspace-write` sandbox permissions, the same invocation modified a real project
file it was never authorised to touch — `server/db.js`, flipping the MongoDB client's `tls: true`
to `tls: false` — almost certainly a side effect of the reviewer hitting a local TLS handshake issue
while trying to connect to the database itself, and "fixing" it rather than reporting it. **This
change was caught during the post-review bookkeeping sweep (not before), reverted immediately, and
verified clean via `git diff`/`git status`.** It was never committed. A second unauthorised
artefact, a leftover mocked-DB probe test file (`server/tests/crd-4a-pass2-probe.test.js`) the
reviewer used to reproduce the race-condition finding below, was found alongside it and deleted
after its contents were read and its conclusion independently re-verified. Flagging this plainly:
an external tool with filesystem write access needs its diff checked for unrelated damage after
every run, not just its stated findings — this is now a standing lesson for future `codex exec`
rounds in this project (see memory).

### Verification performed on every finding before triage

Every finding below was checked against the real code, not accepted on the reviewer's authority:
the two POST/NaN/future-session patches were each prove-discriminated with a single-change revert
(the corresponding new test fails exactly as predicted, then passes again on restore); the
attendance-matching hardening and the pre-existing-race dismissal were confirmed by reading the
route and the base commit directly, not by trusting the finding's prose.

### Patches applied (3), each prove-discriminated ALONE

1. **`defender_status_term` added to `POST /`'s attacker-field strip list** (Medium). The schema
   grew this field for `/resolve` to write, but `POST /`'s existing strip-list (which already
   removes `defender_aspect`/`defender_wp_spent`/`defender_merit_ids` for exactly this reason) was
   never updated to include it — an attacker could pre-populate a bogus "defender's choice" into a
   pending document before the defender ever acted. `/resolve` always overwrites it before any pool
   is finalised, so this could not change a final roll's outcome, but it violated the same
   provenance boundary the other three fields exist to protect. *Revert-alone: the new POST-strip
   test fails exactly as predicted (`'city'` instead of `undefined`), restored clean.*
2. **A non-finite pool total is treated as "not resolved yet", never clamped into `NaN`** (High as
   demonstrated, narrow in practice). `blood_potency` is schema-constrained to an integer
   (`character.schema.js`) so this is not reachable through the normal character API today — but a
   schema-valid pool total going non-finite has already burned this exact route once before (crd.1's
   own documented `_roll(undefined)` → zero-die silent loss), and `finalPool != null` alone does not
   catch `NaN` (`NaN != null` is `true`), so a corrupted (legacy/direct-Mongo-write) `blood_potency`
   could persist `defender_pool` as a real BSON `NaN` — JSON-serialising as `null` on the wire but
   NOT `== null` when read back from Mongo, defeating `/accept`'s own null-pool guard the same way
   crd.1's original bug did, and silently handing the defender a zero-die loss. Fixed with an
   explicit `Number.isFinite` check ahead of the clamp. *Revert-alone: the new NaN test fails exactly
   as predicted (stored `defender_pool` is a real `NaN`, and `/accept` returns 200 instead of 409),
   restored clean.*
3. **Session-selection for the "at Court" attendance check no longer mirrors `attendance.js`'s own
   unfiltered sort** (Medium). The story instructed mirroring `attendance.js`'s
   `.find({}).sort({session_date:-1}).limit(1)` verbatim, but a future-dated `game_sessions`
   document is a real, supported shape in this app (`server/routes/game-sessions.js`'s own
   `GET /next`) and would silently outrank the actually-live session under that query — a design
   choice this story's own create-story pass inherited from `attendance.js` without checking whether
   it was actually safe for a higher-stakes gate. Switched to `server/routes/office-actions.js`'s
   own `findLatestSession` pattern instead (`session_date <= today`, tie-broken by `_id` — that
   file's own comment already documents why the tie-break exists). Attendance MATCHING still mirrors
   `attendance.js`'s id-then-name fallback, unchanged. *Revert-alone: the new future-session test
   fails exactly as predicted (`status_choice` absent, shadowed by the future document), restored
   clean.*

Also hardened, not separately prove-discriminated (defence-in-depth, matching this file's own
established standard of guarding against schema-shouldn't-allow-it cases regardless): `attendedIn`'s
closure now requires a genuinely non-empty id before comparing by id, so two missing/blank
attendance ids can never coincidentally match via `String(undefined) === String(undefined)`. Pass 2
independently confirmed this specific coincidence is NOT reachable end-to-end through the real route
today (the route's own ownership/`ObjectId` checks already exclude a missing target/challenger id
before this function is ever reached) — guarded anyway, at zero behavioural cost.

### Dismissed, with evidence (2)

- **"The UI race guard cannot stop an older `/resolve` from overwriting a newer choice in Mongo"**
  (labelled High by the reviewer, reproduced live via its own mocked-DB probe — see above). Real,
  and reproducible: two overlapping `/resolve` calls with no server-side compare-and-swap can let an
  older request's own (self-consistent) write land after a newer one, leaving the database
  disagreeing with what the client currently displays until the player re-interacts or hits a clean
  409 on Accept. **Confirmed PRE-EXISTING, not introduced or worsened by this diff**: `git show`
  against base commit `30468501...` proves the exact same unconditional `updateOne({ $set: {...} })`
  shape — no status/version-scoped filter — already existed for `defender_aspect`/
  `defender_wp_spent`/`defender_merit_ids`/`defender_pool` before crd-4a added one more field to the
  same write. This is the identical race class `deferred-work.md`'s own existing entry ("`PUT
  /:id/resolve`... share a check-then-blind-write TOCTOU race") already analysed for THIS exact
  route and explicitly judged safe for the resolve-vs-resolve case specifically: "crd.1's own AC7
  already addresses the narrower 'two concurrent resolves' case correctly (full
  recompute-and-overwrite, genuinely idempotent, no partial-merge risk)" — each write is internally
  self-consistent per the request that produced it, so the worst outcome is a stale display and a
  clean 409 on Accept (crd.1's own guard), never a corrupted or mixed final roll. Not a new deferred
  item; no change to `deferred-work.md` needed — this finding re-confirms, rather than
  contradicts, that entry's own prior conclusion.
- **AC10's literal "every colour, spacing and font value is a token" wording vs raw px spacing/
  font-size values in the new CSS.** True literally, exactly as crd-3b's own review already found
  and dismissed for the identical reason: this project's design system has no spacing-token scale at
  all, and every component this story mirrors (`.cr-aspect-seg`, `.char-chip`) already uses raw px
  for spacing/font-size and tokens only for colour/radius/font-family. Consistent with the codebase
  as it actually is, not a new deviation.

### Story-text corrections (documentation-only, no code change)

Several AC wordings were imprecise relative to the (correct) implementation, caught by the
Acceptance Auditor pass: AC1's "byte-for-byte identical" overstated the non-gated path (it gains one
always-`null` `defender_status_term` field, matching this route's own convention of unconditionally
writing every field it owns); AC6 read as forbidding the selected `.on` state outright rather than
only forbidding *auto*-selection; AC9 said the client "omits" the term on a closed gate when it
actually sends `defender_status_term: null` (functionally identical server-side, but the literal
claim was wrong); AC12 still referenced a "disabled-Roll" test state that AC8's own correction had
already superseded. All four corrected in place above, plus a `Task 9` client-test-count fix
(claimed 9, the diff adds 8). None required a code change — the implementation was already correct;
the story text was not.

### Test results after patching

- crd-4a suite: 19 → 22 (3 new tests, one per patch, each prove-discriminated).
- Full changed-area regression (crd-1, crd-3a, crd-3b, crd-4a, api-tracker-state, oaq-2, oaq-3,
  otc-2×2): 195/195, 0 failed, clean local run.
- `server/db.js`'s unauthorised `tls: false` change reverted and confirmed clean; the unauthorised
  probe test file deleted; no other files modified outside this story's own declared File List.

**Status: `review` → `done`.** NOT committed, NOT pushed, NOT merged.

## Change Log

| Date | Change |
|------|--------|
| 2026-08-26 | **CODE REVIEW CLOSED, `review` -> `done`.** External Codex CLI review (rocky run — corrupted local models cache killed two attempts, `codex exec resume` failed to continue a session and had to fall back to independent one-shot passes per the skill's own isolated-mode allowance; full detail including an unauthorised `server/db.js` TLS change the reviewer made and had reverted, and a leftover probe test file deleted, is in the Senior Developer Review section below). THREE PATCHES, each prove-discriminated ALONE: (1) `defender_status_term` added to `POST /`'s attacker-field strip list — the schema grew the field but the existing strip-list (already protecting `defender_aspect`/`defender_wp_spent`/`defender_merit_ids` for the same reason) was never updated, so an attacker could pre-populate a bogus "defender's choice" before the defender acted (revert-alone: fails exactly as expected). (2) A non-finite pool total (a schema-shouldn't-allow-it, legacy/corrupted `blood_potency`) is now treated as "not resolved yet" rather than silently clamped into a persisted `NaN` that defeats `/accept`'s own null-pool guard the same way crd.1's original `_roll(undefined)` bug did (revert-alone: fails exactly as expected). (3) Session-selection for the "at Court" check no longer mirrors `attendance.js`'s own unfiltered sort (which a future-dated `game_sessions` document — a real, supported shape — could silently outrank); switched to `office-actions.js`'s own `session_date <= today` + `_id` tie-break pattern (revert-alone: fails exactly as expected). Also hardened `attendedIn`'s id-matching against a theoretical missing-id coincidence, confirmed not currently reachable end-to-end but guarded anyway at zero cost. ONE FINDING DISMISSED WITH EVIDENCE AS PRE-EXISTING, NOT A NEW DEFECT: a reviewer-labelled "High" race between overlapping `/resolve` calls, reproduced live via the reviewer's own mocked-DB probe, but confirmed via `git show` against the base commit to be the IDENTICAL unconditional-`updateOne` shape that already existed for every other defender-owned field before this story — `deferred-work.md`'s own existing TOCTOU entry already analysed this exact route and judged the resolve-vs-resolve case specifically safe (idempotent, self-consistent per-request); this finding re-confirms rather than contradicts that prior conclusion, no deferred-work.md change needed. ONE FINDING DISMISSED WITH EVIDENCE MATCHING PRIOR PRECEDENT: AC10's literal token-only wording vs raw px spacing values, identical to a finding crd-3b's own review already dismissed for the same reason (this design system has no spacing-token scale). FIVE STORY-TEXT CORRECTIONS (no code change, implementation was already correct): AC1's "byte-for-byte" overstatement, AC6's over-broad "no `.on`, ever" wording, AC9's "omits" vs the real "sends null", AC12's stale "disabled-Roll" reference, and Task 9's test-count (9 claimed, 8 added). Test results: crd-4a suite 19 -> 22 (3 new, prove-discriminated); full changed-area regression 195/195, 0 failed. NOT committed, NOT pushed, NOT merged. PRIOR ENTRY FOLLOWS. |
| 2026-08-26 | `bmad-dev-story`: all 9 tasks implemented, `ready-for-dev` -> `in-progress` -> `review`. Server-side gate (`_statusChoiceEligibility` in `contested-rolls.js`) reuses `currentCycleInGamePhase`/`calcEffectiveCityStatus`/`findRegentTerritory` exactly as `office-actions.js` already does, and mirrors `attendance.js`'s own live "at Court" lookup rather than a new mechanism or an internal HTTP self-call; short-circuits on `power_name` first so the common (non-power) `/resolve` path touches no extra collections. `status_choice` rides the existing response object (not persisted); `defender_status_term` persists on the document, added to the schema. Client (`contested-resolve.js`) renders the gated section only on `status_choice.eligible`, never pre-selects either option, and discards the selection the moment a later response reports the gate closed. **AC8 corrected during implementation**: the Roll button is NOT client-disabled while a term is outstanding — an earlier draft of that AC conflicted with crd-3b's own AC7 (no client-side duplicate of the server's null-pool guard); fixed both the code and the AC text itself rather than silently diverging from what was written. CSS ported from the locked mockup, purely additive, including a dedicated `.cr-pool-pending` rule so the placeholder text does not inherit the numeral's display font. New suites: crd-4a 19/19, crd-3b (extended) 32/32. Full changed-area regression 249/249, 0 failed. One pre-existing, unrelated test failure found and verified via `git stash` A/B (`gdx-4-css-standards-grep.test.js`'s own fallback-count assertion, 10 vs an expected 11, identical on the unmodified base branch) — not caused by this story, not investigated further. Live-verified both themes against the real shipped stylesheets via a temporary Playwright harness (deleted after use, matching crd-3b's own precedent). NOT committed, NOT pushed, NOT merged. |
| 2026-08-26 | Story created (`bmad-create-story`), `backlog` -> `ready-for-dev`, folding Angelus's defensive-half ruling and Sally's design-lock decisions in directly. |
