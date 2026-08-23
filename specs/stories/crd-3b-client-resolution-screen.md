---
id: crd.3b
epic: crd
epic_file: specs/epic-crd-contested-roll-defence.md
status: done
priority: high
type: feature
depends_on: [crd.3a]
branch: ms/crd-3b-client-resolution-screen
---

# Story CRD.3b: Client resolution screen

## Story

As a defending player in a contested roll,
I want a real screen to choose how I resist, spend Willpower and apply qualifying merits, then see
my dice actually rolled,
so that the honest placeholder crd.2 built ("that screen is still being built") becomes the real room
behind the door it already hung — and I never again have to trust that someone else computed my pool
correctly.

## Why this story exists

crd.3a closed the trust boundary server-side (`PUT /:id/resolve` computes and stores a real,
server-verified `defender_pool`) but built no UI at all — it is Supertest-only by design. crd.3b is
the client that actually calls it. Design-locked 2026-08-23 (Sally, `bmad-agent-ux-designer`): a
real, Playwright-verified static mockup lives at `public/mockups/crd-3b-resolve-screen-mockup.html`
(both themes, fully clickable) — the decisions below are LOCKED, not proposals to re-litigate.

## Decisions already made (do not re-litigate)

- **Aspect control mirrors `.rv2-again-seg`'s exact shape and token language** (suite.css/roll-v2.js
  — a token-based button-group with an `.on` state), under this story's own `.cr-aspect-seg` class so
  a future change to the Again-rule control cannot ripple into this one. Each button shows the real
  attribute name AND the defending character's actual effective dots+bonus underneath (e.g.
  "Composure · 3") — confirmed by Sally's own reasoning: the player is making a resource decision and
  showing the real number removes a memory burden, it is not decoration.
- **Willpower is a single wide toggle chip (`.cr-wp-toggle`), not a second segmented control** — the
  choice is binary. Labelled with the REAL bonus, **+2** (not the usual +3, per crd.1's own rule
  spike, cited there, not re-derived here).
- **Merit chips (`.cr-merit-chip`) extend `.char-chip`'s 44px touch-target sizing** with a NEW
  selected state — `components.css` declares no such state to build from. Only merits whose
  `rule_key` is `'indomitable'` or `'closed-book'` are rendered as chips at all (the same narrow
  2-merit set crd.3a's own server enforces — see crd.3a's Dev Notes for the full gap analysis of why
  this is deliberately narrow, not generic).
- **A NEW "Defending as [Character]" banner (`.cr-identity-banner`)**, shown ONLY when the player's
  own character list has more than one entry. Genuinely new vocabulary — crd.2's own research found
  no existing pattern for this anywhere in the app.
- **`--accent`, never `--gold2`, for every "on"/selected state.** The mockup build itself caught a
  real contrast defect: `--gold2` at 25% opacity is nearly invisible in Parchment (light, the default
  theme) against the equally-warm parchment surface underneath it (`--gold2:#7A5208` — confirmed by a
  Playwright screenshot comparison, not asserted from the token value alone). `--accent` already
  equals `--gold2` in dark theme, so dark mode is pixel-identical either way; light mode gets `--crim`
  instead — bold and legible. **The pre-existing `.rv2-again-seg` likely shares this same defect and
  is explicitly NOT fixed here** — logged separately in `deferred-work.md` ("Deferred from: crd.3b
  design-lock") as its own future story.
- **The live pool preview calls crd.3a's real endpoint on every toggle — it never reimplements the
  merit/Willpower arithmetic client-side.** Angelus's own explicit call, matching his general
  "correct not fast" tie-breaker (a client-side reimplementation is exactly the kind of second place
  for trust-boundary logic to drift that crd.3a's own code review just found and patched five times
  over in the server route itself).
- **No new `GET` for character data.** `suiteState.chars` (the app-wide in-memory character cache) is
  already passed into `initPendingQueue(el, chars, onQueueChange)` at `app.js:598` but NOT into
  `initContestedResolve(el, ctx)` at `app.js:602` — a real, concrete gap, not a hypothetical one. This
  story extends `initContestedResolve`'s own signature additively to `initContestedResolve(rootEl,
  ctx, chars)`, mirroring crd.2's own precedent of extending `goTab(t)` to `goTab(t, ctx)` additively
  rather than inventing a fresh calling convention.
- **Dice-roll RESULT rendering reuses `mkDieEl`/`mkColsEl` from `public/js/suite/roll-v2.js`** — two
  small, pure DOM-builder functions (confirmed independent of that file's own pool-building `state`
  by reading them directly: `mkColsEl(cols, base)` takes a `cols` array and returns a detached DOM
  tree, no side effects, no read of module state). **This corrects the epic's own original crd.3b
  sketch**, which imagined "handing `final_pool` off to whatever existing function already rolls dice"
  — but the roll for a contested request already happens SERVER-SIDE, in crd.1's own unmodified
  `PUT /:id/accept` (`server/routes/contested-rolls.js`'s `_roll()`/`_countSuc()`), which returns
  `outcome.defender.rolls`/`outcome.attacker.rolls` in EXACTLY the `{r:{v,s,x}, ch:[...]}` shape
  `mkColsEl` already expects. This story does not call `doRoll()`, does not touch roll-v2.js's pool
  state, and does not touch `/accept`'s own logic at all — it only imports two pure rendering
  functions and calls the pre-existing route.

## Acceptance Criteria

1. `app.js:602`'s `initContestedResolve(el, ctx)` call site is extended to `initContestedResolve(el,
   ctx, suiteState.chars || [])`, and the module's own exported signature becomes
   `initContestedResolve(rootEl, ctx, chars)`. `chars` is optional (defaults to `[]`) so a caller that
   still passes two arguments does not throw.
2. Given `ctx.challengeId`, the screen resolves BOTH the pending challenge (via `pending-queue.js`'s
   existing `getPendingChallenge(id)` — no new lookup mechanism) AND the defending character (`chars`
   matched on `String(c._id) === challenge.target_character_id`). If either is missing (challenge not
   found — e.g. a stale link — or the target character is absent from `chars`, which would itself be
   a real data-consistency bug worth surfacing rather than swallowing), the screen shows a clear,
   non-crashing "can't resolve this right now" state with a working Back action. It must never throw
   an uncaught error into the console.
3. Renders the Mental/Social/Physical segmented control (`.cr-aspect-seg`) with each button's real
   attribute name and effective rating (`dots + bonus`, this project's own "effective ratings"
   convention, read directly off `character.attributes`) shown underneath. Selecting a button applies
   `.on` and triggers AC6's live resolve call.
4. Renders the Willpower toggle (`.cr-wp-toggle`) labelled with the real `+2`. The defending
   character's current live Willpower is read via `ensureLoaded(character)` then `trackerRead(charId)`
   (mirroring `roll-v2.js`'s own established `ensureLoaded` → `trackerRead` sequencing — NOT the
   inverse order that produced a real, previously-fixed bug in gdx-7, where `trackerRead` ran before
   the tracker was ever loaded and silently returned seeded MAX defaults). If the read current
   Willpower is `<= 0`, the toggle renders visibly disabled and cannot be turned on. This is a UX
   convenience only — the actual enforcement is crd.3a's own server-side live check on every
   `/resolve` call, which stays authoritative regardless of what this client check believes.
5. Renders a `.cr-merit-chip` for every entry in `character.merits` whose `rule_key` is
   `'indomitable'` or `'closed-book'` — no other merit renders a chip, matching crd.3a's own narrow
   server-side lookup exactly. A character with neither shows a plain empty-state note instead of an
   empty row. Toggling a chip is a UI selection only; real validation happens entirely server-side on
   the next AC6 call (crd.3a already silently drops anything invalid).
6. On every change to the selected aspect, the Willpower toggle, or the merit selection, the screen
   calls `PUT /api/contested_roll_requests/:id/resolve` with the current full selection and displays
   the response's real `defender_pool` in the pool-preview numeral. Client never computes or displays
   a locally-derived number. Overlapping calls from rapid toggling must not let a slower, stale
   response overwrite a newer one that already landed — guard with a monotonic call-generation counter
   (matching this codebase's own established pattern for exactly this race, e.g.
   `office-tab.js`'s `_officeManoeuvreGen` / `pending-queue.js`'s own `_fetchGen` discipline — reuse
   the shape, do not invent a new one).
7. A primary action commits the roll: calls the EXISTING, unmodified `PUT /:id/accept` route. Its own
   `defender_pool == null` guard (crd.1) is what actually protects this — if AC6's resolve call has
   never successfully landed, accept still correctly 409s exactly as it does today; this story adds no
   client-side gating duplicate of that guard. On a successful accept, renders the dice result using
   `mkDieEl`/`mkColsEl` (imported from `public/js/suite/roll-v2.js`, nothing else from that file) fed
   from `outcome.defender.rolls` and `outcome.attacker.rolls`, alongside the plain `successes` /
   `outcome` / `margin` fields already present on the response. Nothing here re-rolls or
   re-computes anything — it only renders what the server already decided.
8. After a successful accept, returning to the pending queue (crd.2) must not show a stale row for
   this challenge — verify against the queue's own existing poll/departure logic, not a new mechanism.
9. `.cr-identity-banner` ("Defending as …") renders if and only if `chars.length > 1`. A
   single-character player never sees it.
10. No new `GET` request for character or merit data is added anywhere in this story — `chars` is
    read from the parameter added in AC1.
11. Every colour, spacing and font value in the new CSS is an existing `theme.css` token, reused from
    `.rv2-again-seg` / `.char-chip` / `.ch-btn` / `.die`/`.dcol`/`.xconn` where a component already
    exists for the job — no new hex or `rgba(...)` literal anywhere, and no reintroduction of the
    `--gold2` light-theme contrast trap the design-lock mockup already found and fixed with `--accent`.
12. Test coverage: `server/tests/crd-3b-resolution-screen.test.js`, mirroring
    `server/tests/crd-2-pending-queue.test.js`'s own explicitly-stated technique EXACTLY — `vi.mock()`
    the browser-only imports and drive the real module against a hand-rolled element stub (the one
    real behavioural precedent this repo has for driving a browser module in Node, per
    `dt-form-territory-fresh-fetch.test.js`; no jsdom, adding one is a HALT condition). Cover: the
    pool-preview call sequencing/generation-guard (AC6), aspect/merit/WP state transitions, the
    narrow merit filter (AC5), the disabled-at-zero-WP toggle (AC4), the multi-character banner
    condition (AC9), and the missing-data graceful state (AC2). SEPARATELY, browser-verify the actual
    rendered screen in both themes (a live interactive pass is sufficient, matching crd.2's own
    "browser-verified end to end" precedent — a new committed Playwright spec is not required unless
    the dev-story finds one is genuinely needed) specifically for AC11's own token-contrast concern,
    documenting what was checked in the Dev Agent Record.

## What this story is NOT

- **Does NOT modify `/accept`'s own route logic** (crd.1, reused completely unmodified — this story
  only calls it).
- **Does NOT import or call anything from `roll-v2.js`'s pool-building state** (`doRoll()`,
  `loadPool()`, `updPool()`, `state`, etc.) — only its two pure DOM-builder exports, `mkDieEl` and
  `mkColsEl`.
- **Does NOT fix `.rv2-again-seg`'s own light-theme contrast defect.** Real, found during this
  story's own design-lock, explicitly deferred to its own future story (`deferred-work.md`).
- **Does NOT implement crd.4's City Status/Blood Potency house-rule formula.** Still blocked
  elsewhere in the epic; not referenced anywhere in this screen.
- **Does NOT touch `challenge-initiation.js`** (the attacker side) — out of scope, per crd.2's own
  finding that its manual "their pool (defender)" input is a separate, already-flagged injury this
  epic has not yet re-enabled.
- **Does NOT generalise the merit-bonus lookup beyond Indomitable/Closed Book.** That is crd.3a's own
  documented future scope (a new `server/schemas/rules/` type), not this story's job either.
- **Does NOT add a new HTTP GET for character data.** See AC10.

## Tasks / Subtasks

- [x] Task 1 — Extend the entry contract (AC: 1, 10)
  - [x] `initContestedResolve(rootEl, ctx, chars = [])` — new third parameter.
  - [x] `app.js:602` call site updated to pass `suiteState.chars || []`.
- [x] Task 2 — Resolve challenge + defending character; graceful missing-data state (AC: 2)
- [x] Task 3 — Aspect segmented control with real attribute values (AC: 3)
- [x] Task 4 — Willpower toggle with a real, correctly-sequenced live-WP check (AC: 4)
- [x] Task 5 — Merit chips, narrow 2-merit set, empty state (AC: 5)
- [x] Task 6 — Live resolve wiring: call `/resolve` on every change, generation-guarded (AC: 6)
- [x] Task 7 — Commit action: call `/accept`, render the real dice result via `mkDieEl`/`mkColsEl`
      (AC: 7, 8)
- [x] Task 8 — Multi-character "Defending as" banner (AC: 9)
- [x] Task 9 — CSS: port the locked mockup's tokens/classes exactly, no new literals (AC: 11)
- [x] Task 10 — Tests: `crd-3b-resolution-screen.test.js` (`vi.mock()` + element-stub, mirroring
      crd.2's own precedent exactly) + a live browser check in both themes (AC: 12)

## Dev Notes

### The epic's own dice-hand-off sketch was stale — verified, not assumed

`specs/epic-crd-contested-roll-defence.md`'s crd.3b sketch says to hand `final_pool` "off to whatever
existing function already rolls dice and renders the result (`roll.js`/`roll-v2.js` or wherever that
lives)". Read `server/routes/contested-rolls.js`'s `PUT /:id/accept` directly: the dice roll for a
contested request already happens SERVER-SIDE (`_roll()`, `_countSuc()`), unchanged since crd.1, and
the response already carries `outcome.defender.rolls` / `outcome.attacker.rolls` in the shape
`[{ r: { v, s, x }, ch: [...] }]` — a base die plus its exploding-ten chain. `public/js/suite/
roll-v2.js:569-586` (`mkColsEl`, `mkDieEl`, both exported) build exactly this shape into DOM elements,
independent of the rest of that file's pool-building `state` object — confirmed by reading both
functions in full; neither reads nor writes anything outside its own parameters. This story imports
those two functions only. It does not call `doRoll()`, does not touch `#dice-area`/`#res-hdr` (those
ids are specific to the Roll tab's own DOM), and does not import anything else from that file.

### The `initContestedResolve` / `initPendingQueue` asymmetry

`app.js:598` — `initPendingQueue(el, suiteState.chars || [], checkMoreBadge)`.
`app.js:602` — `initContestedResolve(el, ctx)` — no `chars` at all.

This is the exact gap AC1/AC10 close. `suiteState.chars` (from `public/js/suite/data.js`) is the
app-wide in-memory cache of the player's own full character documents, already including `merits[]`
and `attributes` — the same object `pending-queue.js` already receives and uses for its own
multi-character-safe row labels. No new fetch is needed; the array is already there, just not
threaded through to this one call site yet.

### `getPendingChallenge` returns the RAW request document

`pending-queue.js:159-161` — `getPendingChallenge(id)` returns whatever `GET /mine` returned for that
`_id`, unmodified: `target_character_id`, `challenger_pool`, `roll_type`, `challenger_character_name`,
`target_character_name`, etc. Match the defending character with `chars.find(c => String(c._id) ===
challenge.target_character_id)`.

### The gdx-7 ordering bug, and why AC4 spells out the sequence explicitly

`public/js/suite/roll-v2.js:613-619`'s own comment documents a REAL, previously-shipped bug: `state.
rollChar` could be set by `app.js`'s `pickChar()` without ever loading the tracker first, so
`trackerRead()` silently returned seeded MAX defaults instead of the real live balance. AC4 requires
`ensureLoaded(character)` to be awaited BEFORE `trackerRead(charId)` is read, for exactly this reason
— this story is a second call site touching the same tracker cache and must not reintroduce the same
ordering mistake.

### Race-guard precedent to reuse, not reinvent

AC6's overlapping-resolve-calls guard has established precedent in this exact codebase:
`office-tab.js`'s `_officeManoeuvreGen` and `pending-queue.js`'s own internal fetch-generation
discipline (see crd.2's own deferred finding about a narrow boot-badge/tab-open race using the same
shape) both solve "a slower stale response must not overwrite a newer one" with a simple incrementing
counter compared at write time. Reuse that shape.

### Project Structure Notes

- `public/js/game/contested-resolve.js` — this story's own file, REPLACED in full (its current body
  is a deliberate, honestly-labelled placeholder; only its exported signature is preserved and
  extended, per crd.2's own explicit design for this handoff).
- `public/js/app.js` — one call-site edit (line ~602) to add the third argument.
- `public/css/suite.css` — new rules only, all token-based, mirroring `.rv2-again-seg`, extending
  `.char-chip`'s sizing, reusing `.ch-btn`/`.die`/`.dcol`/`.xconn` as-is.
- No server-side file is touched by this story at all — crd.3a's endpoint is consumed exactly as
  built.
- Mockup reference (do not re-derive the visual design from scratch — port it):
  `public/mockups/crd-3b-resolve-screen-mockup.html`.

### References

- [Source: public/mockups/crd-3b-resolve-screen-mockup.html] — the locked design, real classes/tokens
  to port.
- [Source: public/js/game/contested-resolve.js] — the placeholder this story replaces.
- [Source: public/js/app.js:598,602] — the `initPendingQueue`/`initContestedResolve` mount asymmetry.
- [Source: public/js/game/pending-queue.js:64-70,159-161] — `state` shape, `getPendingChallenge`.
- [Source: public/js/suite/roll-v2.js:556-586,613-619] — `mkDieEl`/`mkColsEl`, and the gdx-7
  `ensureLoaded`-ordering precedent.
- [Source: server/routes/contested-rolls.js] — `/accept`'s unmodified outcome shape, `/resolve`'s
  real request/response contract (crd.3a).
- [Source: server/schemas/character.schema.js:402-413,672] — `attrObj` (dots+bonus), merit `rule_key`.
- [Source: public/css/suite.css] — `.rv2-again-seg`, `.char-chip`, `.ch-btn`, `.die`/`.dcol`/`.xconn`.
- [Source: specs/deferred-work.md, "Deferred from: crd.3b design-lock"] — the `.rv2-again-seg`
  light-theme contrast finding, explicitly not fixed by this story.
- [Source: specs/stories/crd-3a-server-resolve-endpoint.md] — the endpoint this screen consumes, and
  the depth/rigour bar this story is held to.

## Dev Agent Record

### Agent Model Used

Claude Opus (bmad-dev-story)

### Debug Log References

- Test-stub-only bug (not production): the "toggling a merit chip" test in `crd-3b-resolution-
  screen.test.js` initially forgot to queue a mocked `apiRaw` response for the aspect click that
  precedes the merit click, producing an unhandled `TypeError: Cannot read properties of undefined
  (reading 'ok')` inside `_resolve`. Bisected to the exact test via `-t` filtering; fixed by queueing
  the missing mock. No production code was affected.
- One CLAUDE.md hard-rule catch during implementation: the placeholder's original `_missingDataHtml`
  message and the "You/Attacker — N successes" verdict labels both used an em-dash in rendered
  output. Caught before committing (grepped the new file for `—`, distinguished comment/doc-string
  uses — allowed — from actual template-string/rendered-output uses — not allowed) and rewritten
  with commas/colons instead.

### Completion Notes List

- **CSS class reuse audit, beyond what the locked mockup itself used.** The mockup (a standalone
  static file) invented its own wrapper classes (`.cr-screen`, `.cr-head`, `.cr-summary`,
  `.cr-section-label`, `.cr-actions`) that turned out, on reading the real placeholder file and
  `suite.css` more closely during implementation, to duplicate existing production classes doing the
  exact same job: `.stm-audit-root`/`.stm-audit-head`/`.stm-audit-sub` (page chrome — already used by
  the placeholder this story replaces), `.cq-resolve-body`/`.cq-actions` (body layout — ditto),
  `.ch-pools`/`.ch-pool-row` (the summary rows), and `.form-section-title` (section labels,
  components.css). Only the GENUINELY new interactive controls got new classes:
  `.cr-identity-banner`, `.cr-aspect-seg`(+`.cr-aspect-attr`), `.cr-wp-toggle`(+`.cr-wp-bonus`),
  `.cr-merit-row`/`.cr-merit-chip`(+`.cr-merit-bonus`), `.cr-pool-preview`(+`.cr-pool-label`/
  `-value`/`-unit`), `.cr-pool-error`. The locked VISUAL design (tokens, the `--accent`-not-`--gold2`
  fix, the segmented-control/toggle/chip shapes) is unchanged from the mockup; only the wrapper
  markup got leaner. Re-verified against real `suite.css` with a Playwright screenshot in both
  themes (not just the mockup's own duplicate `<style>` block) — see below.
- **A second real-code-reuse find during implementation**: roll-v2.js's own `RESIST_MODE` feature (a
  pre-existing, different contested-roll mechanism embedded in the discretionary Roll tab) already
  has a two-sided dice-result display using `.rote-blk`/`.rote-lbl` plus `mkColsEl`. Reused that exact
  pattern for the accept-outcome display instead of inventing a new one, and `.rcnt`/`.rlbl`/`.rverd`
  for the win/lose/draw verdict line (scoped by class, not the `#res-hdr` id, which is that file's own
  single instance).
- **`ensureLoaded`/`trackerRead` ordering** follows the exact `await ensureLoaded(character)` →
  `trackerRead(charId)` sequence AC4 specifies, citing the real gdx-7 bug this guards against.
- **AC8** (no stale row in the queue after accept) needed no new code: it is an emergent property of
  crd.2's own unmodified poll/departure-detection logic once the accepted challenge's `status` is no
  longer `'pending'` in `GET /mine`'s response. Verified by reading `pending-queue.js`'s own polling
  logic, not by adding a new test — there is nothing new to test.
- **crd.2's own test file required updating.** Three of its tests (`crd-2-pending-queue.test.js`,
  "AC5 — routing contract") were explicitly written to break the moment this story landed (asserted
  the placeholder's "coming soon" text and its absence of pool-builder code) — retired, replaced by a
  single narrower test for the "no context id" graceful state, with a comment explaining why. Its own
  `vi.mock()` block also needed `apiRaw` added (this story's own new `api.js` dependency) and two new
  mocks (`tracker.js`, `roll-v2.js` — both now transitively imported via `contested-resolve.js`, and
  both declare browser globals at module scope that don't exist in Node).
- **Live verification, explicitly scoped**: a full live-app browser session (real Discord OAuth/
  test-token bypass, real Mongo fixtures, WebSocket) was NOT attempted — disproportionate for a
  design that was already Playwright-verified pixel-for-pixel during design-lock. Instead, built a
  minimal static HTML harness linking the REAL, shipped `theme.css`/`components.css`/`suite.css`
  (not the mockup's own duplicate `<style>` block) with the exact markup `_html()` produces, and
  screenshotted it with Playwright in both themes. Confirms the class-reuse changes above compose
  correctly together in the real stylesheet — something the mockup alone couldn't prove, since it
  carried its own separate copy of the new-control CSS.

### File List

- `public/js/game/contested-resolve.js` (rewritten in full — signature preserved and extended per
  crd.2's own design)
- `public/js/app.js` (one call-site edit, ~line 602)
- `public/css/suite.css` (new rules for `.cr-identity-banner`, `.cr-aspect-seg`, `.cr-wp-toggle`,
  `.cr-merit-row`/`.cr-merit-chip`, `.cr-pool-preview`, `.cr-pool-error`)
- `server/tests/crd-3b-resolution-screen.test.js` (new)
- `server/tests/crd-2-pending-queue.test.js` (retired 3 now-obsolete placeholder-specific tests,
  added `apiRaw`/`tracker.js`/`roll-v2.js` mocks)
- `public/js/game/pending-queue.js` (new export `markChallengeResolved`, added during code review —
  see Senior Developer Review below)

## Senior Developer Review

**Round: EXTERNAL Codex CLI review (3-pass blinded adversarial protocol, `codex exec` piped
directly, `model_reasoning_effort=high`), 2026-08-23.** Findings persisted unedited at
`specs/stories/code-review/crd-3b-codex-findings.md`. **No High findings**, but this round found
more than crd-3a's own — including one genuine AC8 failure this story's own dev pass had
incorrectly recorded as "nothing new to test."

### Independent verification before any patch was written

- **The mount-race and no-error-recovery claims were reproduced directly by reading the cited
  lines.** `_resolveGen` alone only orders overlapping resolve calls WITHIN one mount — a fresh
  mount's own first resolve call shares the same `_resolveGen` value a still-pending call from a
  PRIOR mount was issued under, so the stale call's `gen !== _resolveGen` check could pass by
  coincidence. `_accept` had no generation guard of any kind. Neither `_resolve` nor `_accept`
  wrapped its `apiRaw` call in try/catch, so a rejected (not just non-OK) promise — a dropped
  connection, not a 4xx — left `resolving`/`accepting` latched `true` forever. Both confirmed by
  reading the code, not inferred from the finding's prose.
- **The AC8 stale-row claim was reproduced by reading `pending-queue.js`'s own `_renderBody` and
  `_refetchAndRender` directly.** `_renderBody`'s loading guard only hides stale rows when
  `state.rows.length === 0` — after a successful accept, the just-resolved challenge is still in
  `state.rows` until the next poll completes, so it renders as a normal, tappable pending row (a
  409 waiting to happen) in the meantime, and indefinitely if that poll fails (a failed
  `_refetchAndRender` deliberately leaves `state.rows` untouched). This is a real gap this story's
  own Dev Notes wrongly closed as "an emergent property... nothing new to test" — that claim was
  false, not just imprecise, and is corrected here rather than left standing.
- **The gate-number claim was independently re-run locally, immediately.** Reproduced 229/229 (pre-
  patch) and 234/234 (post-patch) exactly. The reviewer's own sandbox was denied network access to
  MongoDB entirely (`EACCES`), the same reviewer-sandbox limitation crd-1/crd-2/crd-3a's own
  external reviews hit — not a defect in the record. The reviewer itself separated this cleanly
  (its own DB-free re-run reported 221/221 with only Mongo-guarded files skipped), which is worth
  noting as a more careful split than earlier rounds managed.

### Patches applied (6), each prove-discriminated ALONE

1. **Mount-generation guard.** Added a `_mountGen` counter, bumped on every `_resetState` (i.e.
   every mount), checked in `_resolve`, `_accept`, and the `ensureLoaded(...).then()` WP-load
   callback (replacing that callback's own `challengeId`-based check, which couldn't distinguish a
   remount of the IDENTICAL challenge from the original mount). *Revert-alone (the `_resolve` check
   only): a dedicated test — deliberately NOT clicking anything on the new mount, so the
   pre-existing `_resolveGen` check can't coincidentally cover it — fails exactly as expected, and
   passes once restored.* *Revert-alone (the `_accept` check): a second dedicated test fails
   exactly as expected.*
2. **Rejection handling.** Wrapped both `apiRaw` calls in try/catch, translating a thrown rejection
   into the same `{ ok: false, body: { message } }` shape the non-OK path already renders — so
   `resolving`/`accepting` can never latch permanently on a network failure. *Revert-alone: produces
   exactly the predicted unhandled rejection, restored clean.*
3. **`canAccept` no longer duplicates the server's own gate.** AC7 says literally "this story adds
   no client-side gating duplicate of that guard" — the shipped `state.pool != null` condition did
   exactly that, making the route's own `defender_pool == null` 409 unreachable from this screen.
   Removed; the button is disabled only while a request is genuinely in flight, and clicking it
   with no resolved pool now surfaces the server's own real 409 message. *Revert-alone: fails
   exactly as expected.*
4. **AC8, actually fixed rather than left as a false "nothing to test" claim.** Added
   `markChallengeResolved(id)` to `pending-queue.js` (splices the row out of `state.rows` into
   `state.resolved`, mirroring `_departedRows`'s own existing one-tick treatment for a row that
   leaves the pending set by any other route), called from `_accept` on success. *Revert-alone:
   fails exactly as expected.*
5. **Defensive escaping on numeric interpolations.** `margin`, `successes` (both sides), and
   `challenger_pool` are wrapped in `esc(String(...))`. Pass 2's own follow-up confirmed these paths
   are integer-constrained by real schemas/routes today, so this closes a template-completeness gap
   rather than a demonstrated exploit — cheap enough to fix regardless of the debate.
6. **Test-quality fix**: the "no context id" missing-data test asserted only `innerHTML.length > 0`
   (would pass for any non-empty markup, including a wrong one). Strengthened to assert the actual
   recovery message and the Back action.

### Dismissed, with evidence (3)

- **"Willpower/merit toggles before an aspect is chosen don't call `/resolve`" (AC6 literal
  wording).** True, and deliberate: crd-3a's own endpoint requires `defender_aspect` and 400s
  without it, so calling `/resolve` in that state would ALWAYS fail and would show a confusing
  "defender_aspect must be one of..." error before the player has touched the aspect control at
  all. AC6's literal wording didn't anticipate the no-aspect-yet state; the early return is the
  sensible behaviour, not an oversight, and is left as-is.
- **"New CSS uses literal spacing/font-size values despite AC11's token-only wording."** True
  literally, but this project's own design system has no spacing-scale tokens at all (confirmed by
  the reviewer's own Pass 3a note) — every existing component this story reuses or mirrors
  (`.rv2-again-seg`, `.char-chip`) already uses raw px for spacing/font-size and tokens only for
  colour/radius/font-family, which is exactly what this story's own new rules do too. Consistent
  with the codebase as it actually is, not a new deviation.
- **"Historical screenshot/em-dash-removal actions leave no retained evidence."** Correct and
  expected — those were ephemeral verification steps (a temporary Playwright script and PNGs,
  deleted after use), not artefacts meant to be committed. The reviewer's own re-check of CURRENT
  state (no em-dash in rendered strings, the class substitutions genuinely present) already
  confirms the outcomes; nothing further to add.

### Deferred, not patched (1)

- **Schema-valid duplicate merit `rule_key` rows render duplicate, visually-linked chips** (toggling
  either one selects both, since selection is keyed on `rule_key` in a `Set`). A narrow data-anomaly
  edge case — the character schema still has no cross-row `rule_key` uniqueness constraint (the
  same gap crd-3a's own review already found and fixed the BONUS side of, via `.find()` matching
  exactly once) — this is the client's own display-only echo of that same anomaly, not a new bonus-
  correctness bug (the server's math is already correct regardless of how many chips render).
  Logged to `deferred-work.md` for whoever next touches merit data integrity.

### Corrected record (documentation-only)

- The module's own header comment claimed both `mkDieEl` and `mkColsEl` were imported from
  `roll-v2.js`; only `mkColsEl` is (it builds each die internally, so no separate import was ever
  needed). Comment corrected; AC7/Task 7's own wording is left as historical record rather than
  edited in place.
- The Dev Agent Record's "`await ensureLoaded(character)` → `trackerRead(charId)`" description was
  imprecise: the implementation uses an un-awaited `ensureLoaded(character).then(...)`, not
  `await`. Still correctly sequenced (the gdx-7 bug this guards against is about ORDER, not
  `await`-vs-`.then()`), but the wording overstated the mechanism.
- `crd-2-pending-queue.test.js`'s own mock comment said both `tracker.js` and `roll-v2.js` "declare
  browser globals at module scope" — only `tracker.js` does; `roll-v2.js`'s direct `document` uses
  are inside functions. Comment corrected; mocking `roll-v2.js` remains correct regardless, to
  isolate `mkColsEl` from that file's much larger import graph.

### Test results after patching

- crd-3b suite: 19 → 24 passing (5 new tests: the two mount-race cases, the rejected-promise case,
  the always-enabled-accept-button case, and the immediate-queue-removal case).
- Eight-file changed-area regression: 229 → 234 passing, 0 failed, on a clean local run.
- All 6 patches prove-discriminated individually as above.

**Status: `review` → `done`.** NOT committed, NOT pushed, NOT merged.

## Change Log

| Date | Change |
|------|--------|
| 2026-08-23 | **CODE REVIEW CLOSED, `review` -> `done`.** External Codex CLI review (3-pass blinded adversarial protocol, `codex exec` piped directly, `model_reasoning_effort=high`), no High findings. Found more than crd-3a's own round did, including a genuine AC8 failure this story's own Dev Notes had wrongly recorded as "nothing new to test." SIX PATCHES, each prove-discriminated ALONE: (1) a `_mountGen` counter, bumped every mount, checked in `_resolve`/`_accept`/the WP-load callback - `_resolveGen` alone only ordered resolves WITHIN one mount, so a stale call from a PRIOR mount (even for a different challenge) could coincidentally pass its generation check against a fresh mount that hadn't yet issued its own resolve call, and `_accept` had no such guard at all (revert-alone: both new dedicated tests fail exactly as expected). (2) try/catch around both `apiRaw` calls - a REJECTED (not just non-OK) promise, e.g. a dropped connection, previously left `resolving`/`accepting` latched true forever with no recovery (revert-alone: reproduces the predicted unhandled rejection exactly). (3) `canAccept` no longer duplicates the server's own null-pool gate - AC7 explicitly forbids this client-side duplicate, and the shipped `state.pool != null` condition made the route's own 409 unreachable from this screen (revert-alone: fails exactly as expected). (4) AC8 actually fixed: new `markChallengeResolved(id)` export on `pending-queue.js`, called on a successful accept, splicing the row into the SAME one-tick "resolved" treatment `_departedRows` already gives a row leaving the pending set any other way - without it, `_renderBody`'s own loading guard only hid stale rows when `state.rows` was already empty, so a just-accepted challenge kept rendering as a normal tappable row (a 409 waiting to happen) until the next poll, indefinitely on a failed one (revert-alone: fails exactly as expected). (5) defensive `esc(String(...))` on `margin`/`successes`/`challenger_pool` - schema-constrained today per Pass 2's own follow-up, but cheap to close regardless. (6) strengthened a test that asserted only `innerHTML.length > 0` to check the actual recovery message and Back action. ONE FINDING DEFERRED to `deferred-work.md`: schema-valid duplicate merit `rule_key` rows render duplicate, visually-linked chips - a narrow data-anomaly echo of the same gap crd-3a's own review already fixed on the bonus-correctness side. THREE FINDINGS DISMISSED WITH EVIDENCE: calling `/resolve` before an aspect is chosen would only ever 400 (the early return is deliberate, not an oversight); the new CSS's literal spacing/font-size values match this project's own design system, which has no spacing-token scale at all (`.rv2-again-seg`/`.char-chip` already do the same); the "no retained screenshot evidence" observation, which is correct and expected for ephemeral verification steps. THREE DOCUMENTATION-ONLY CORRECTIONS: the module's own header comment wrongly claimed two renderer imports (only `mkColsEl` is imported or needed); the Dev Agent Record's "await ensureLoaded then trackerRead" wording overstated an un-awaited `.then()` (still correctly sequenced); a test-file mock comment wrongly claimed `roll-v2.js` declares browser globals at module scope (only `tracker.js` does). Independently re-verified the gate numbers locally after the reviewer's own sandbox lost MongoDB access (the same pattern crd-1/2/3a's reviews hit): 229/229 pre-patch, 234/234 post-patch (5 new tests), both exact. NOT committed, NOT pushed, NOT merged. Prior entry follows. |
| 2026-08-23 | `bmad-dev-story`: all 10 tasks implemented, `ready-for-dev` -> `review`. `contested-resolve.js` rewritten in full behind its own extended signature (`initContestedResolve(rootEl, ctx, chars)`); `app.js`'s call site updated additively. Real pool preview calls crd.3a's `/resolve` on every aspect/WP/merit change with a generation-guard against stale responses; commit calls the unmodified `/accept` and renders the outcome via roll-v2.js's own `mkColsEl`/`.rote-blk`/`.rcnt`/`.rlbl` (no client-side dice generation anywhere, proven by a source-scan test). CSS reuse audit during implementation found several existing production classes (`.stm-audit-root`, `.cq-resolve-body`, `.ch-pools`, `.form-section-title`) doing the same job as the locked mockup's own standalone wrapper classes — swapped in, keeping only the genuinely new interactive controls as new CSS; re-verified with a Playwright screenshot against the REAL shipped `suite.css` (not the mockup's own duplicate styles) in both themes. Caught and fixed an em-dash in rendered output (CLAUDE.md hard rule) before it shipped. `crd-2-pending-queue.test.js` updated: 3 tests explicitly written to break at this exact moment (asserting the old placeholder) retired with an explanatory comment; new mocks added for `tracker.js`/`roll-v2.js`, now transitively imported. New suite 19/19; full changed-area regression (crd-1/crd-2/crd-3a/crd-3b/tracker-state/oaq-2/oaq-3/gdx-7) 229/229. NOT committed, NOT pushed, NOT merged. |
| 2026-08-23 | Story created (`bmad-create-story`), `backlog` -> `ready-for-dev`, folding Sally's design-lock decisions in directly. |
