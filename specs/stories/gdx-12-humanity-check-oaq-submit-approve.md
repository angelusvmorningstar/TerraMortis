# Story gdx.12: Humanity Check via Epic OAQ's submit/approve pattern

Status: done

## Story

As an ST running a live game (and, on the same shared surface, any player whose character faces a
breaking point),
I want a "Humanity Check" tile that lets the player submit a pending request when their character
hits a breaking point, which I then review and accept from the existing Approval Queue — at which
point the dice-per-level table and touchstone modifier are computed for me automatically,
so that the arithmetic (Humanity level → dice, touchstone count → modifier) stops being manual
table-lookup-and-addition under table pressure, while the judgement call of *whether* a breaking
point fires, and what happens after the roll (Humanity loss, Conditions, banes), stays entirely
with me.

## Why this story exists

Carved out of `gdx-11-vampire-mechanics-quick-actions.md` on 2026-08-19 — read that story's
"Grounding against the 25 July 2026 planning meeting" section (point 2) and "What this story is
NOT" (first bullet) before starting here; both explain the carve-out reasoning in full and must not
be re-litigated. Summary: `D:\Terra Mortis\2026-07-25_meeting-lessons.md` §2.9 ruled "breaking point
checks stay fully manual with the ST, judged too rare and intricate to automate." gdx-11 originally
specced Humanity Check as an immediate, symmetric quick-action tile (former AC4) — discussed with
Angelus directly, and reconciled as: automate the *arithmetic* only, and route every check through
an ST accept step so the ST's judgement call is never bypassed. The agreed mechanism is to reuse
Epic OAQ's existing submit/approve pattern rather than build a parallel one.

This is Epic GDX ("Game-Day Experience") Group B, continuing directly from gdx-11.

## Epic OAQ's real submit/approve pattern — read before touching scope

This is grounded against the actual OAQ code (oaq.2/oaq.3), not just the sprint-status.yaml
one-line summary that named it. Cite these facts directly rather than re-deriving:

- **Collection:** `contested_roll_requests` already holds two discriminated document shapes side
  by side, keyed by a `request_type` field — player-vs-player challenges (no `request_type` field
  at all, the original/default shape, `server/schemas/contested_roll_request.schema.js`) and
  `request_type: 'status_action'` (Status raise/lower/grant/strip, `server/schemas/office_action.schema.js`).
  Each shape has its **own** POST/accept/decline route file and its own Express-level schema
  validated only at that route — there is **no MongoDB collection-level `$jsonSchema` validator** on
  `contested_roll_requests` (grepped: neither schema file is passed to a collection validator
  anywhere in `server/`). A third discriminator value, `request_type: 'humanity_check'`, can be
  added the same way with zero risk to the other two.
- **`server/routes/contested-rolls.js`** (player-vs-player) explicitly excludes both other
  discriminators from its own queries (`request_type: { $ne: 'status_action' }` in `_findChallenge`
  and the `void` route) so they don't collide. `humanity_check` records must be excluded from those
  same two queries too, or a player-challenge ST-void could accidentally match a pending Humanity
  Check.
- **`server/routes/office-actions.js`** (`request_type: 'status_action'`) is the closer structural
  precedent for THIS story, not `contested-rolls.js` — it is submit-then-ST-reviews, not
  submit-then-target-accepts. Its `GET /pending` route (`requireRole('st')`, sorted oldest-first) is
  what powers the Approval Queue tab today, filtered to `request_type: 'status_action'` only. This
  story **widens that same filter** to `request_type: { $in: ['status_action', 'humanity_check'] }`
  rather than adding a second GET endpoint — `public/js/suite/office-approvals.js` only calls this
  one route already; a second endpoint would force the client to merge two fetches for no benefit.
- **`public/js/suite/office-approvals.js`** (the Approval Queue tab, `initOfficeApprovals`, reachable
  from the main game app's nav — ST-only) already keys its row rendering off `request_type` and its
  own file header comment says exactly this: "a second pending-item type... can add its own label
  later without restructuring this module." This story is that second type. Its 10-second poll
  (`_pollTick`/`_refetchAndRender`), generation guard (`_fetchGen`, prevents a stale in-flight
  response resurrecting an already-resolved row), and delegated single-listener click handling
  (`_attachDelegatedHandlers`) are all **existing infrastructure to reuse as-is** — do not duplicate
  or fork them for Humanity Check rows.
- **Not needed here, unlike `office-actions.js`'s accept route:** no MongoDB transaction, no budget
  claim, no compare-and-swap character write. Accepting a Humanity Check computes and stores a
  number; it does not mutate `characters` or any budget collection. `contested-rolls.js`'s plain
  (non-transactional) `PUT /:id/accept` — `updateOne` the pending record, done — is the closer
  precedent for the accept route's *transaction weight*, even though its *trigger* (ST review, not
  target accept) matches `office-actions.js`.

## The rulebook mechanic being automated

`st-working/reference/Vampire the Requiem 2e Rulebook.md` p.107-108, "Breaking Points" /
"Detachment" (verified by direct read this session, cite these numbers directly — do not
re-derive or approximate them):

- **Dice-per-breaking-point-level table** (the ST already judges and hand-picks the level per the
  meeting ruling — this story does not touch that judgement, only the lookup once the ST has
  named a level):

  | Level | Dice | Level | Dice |
  |-------|------|-------|------|
  | 10    | 5    | 5     | 3    |
  | 9     | 5    | 4     | 2    |
  | 8     | 4    | 3     | 2    |
  | 7     | 4    | 2     | 1    |
  | 6     | 3    | 1     | 0    |

  Not a formula (`floor`/`ceil` on level/2 both disagree with level 1's "Zero Dice" entry) — encode
  as an explicit lookup object.
- **Touchstone modifier**, p.108 "Suggested Modifiers for Detachment Rolls": attached Touchstone
  +2, multiple attached Touchstones +3, no [attached] Touchstones −2. Map from
  `attachedTouchstoneCount(char)` (new accessor, see below): `0 → -2`, `1 → +2`, `>=2 → +3`.
- **Pool** = `max(0, base_dice + touchstone_mod)`.
- **"Willpower may not be spent to improve this dice pool"** — literal rulebook text, p.108. This is
  `pi.noWP = true` in this codebase's existing vocabulary (gdx-11 AC6, `effPool()`/`updPool()` in
  `public/js/suite/roll-v2.js`), reused unmodified. Unlike gdx-11's Blood Bond Resistance, the
  rulebook does **not** describe a 1-WP cost to attempt a breaking point roll — so, unlike Blood
  Bond, `willpower_cost` stays `0`/unset. Do not copy Blood Bond's `willpower_cost: 1` pattern here;
  it does not apply to this mechanic.
- **What stays manual, deliberately not built here:** the actual Roll Results table (Dramatic
  Failure/Failure/Success/Exceptional Success → Humanity loss, Conditions gained, banes) is never
  read or applied by this story. The ST reads the dice result off the existing roller and edits the
  character's `humanity` field via the existing sheet editor, exactly as they do today for every
  other roll in this app — this story only gets the correct pool loaded and ready to roll.

## What this story is NOT

- **NOT the Roll Results table.** Humanity loss, Conditions, and bane application are 100% ST
  judgement, applied through the existing character sheet editor. This story never writes to
  `character.humanity` or any Conditions field.
- **NOT auto-navigation to the Roll tab.** Accepting a Humanity Check in the Approval Queue computes
  and stores the pool; it does not switch tabs. The queue's own resolved row gets a "Load Pool"
  button (enabled only when the SAME character is already the currently-loaded roll-tab character —
  see AC7/Dev Notes for why), but the ST/player still switches to the Roll tab themselves the same
  way they always do. Building a cross-tab jump would require exporting `app.js`'s private `goTab()`
  and coupling two otherwise-independent UI modules for a one-tap convenience this story's own
  charter ("automate the arithmetic") does not require.
- **NOT a server-side automatic dice roll.** Unlike `contested-rolls.js`'s player-vs-player accept
  (which rolls dice server-side for both sides), accepting a Humanity Check only computes the pool
  number. The actual roll fires through the existing client-side roller (`doRoll()` in
  `roll-v2.js`), identically to every other Vampire Mechanics quick action from gdx-11 — reusing
  that plumbing, not duplicating `contested-rolls.js`'s separate server-dice-roll machinery.
- **NOT a game_in_progress gate on submission.** gdx-11's Vampire Mechanics section itself carries
  no such gate (only the manual Vitae/WP spend buttons inside the roller do); a breaking point can
  be judged relevant by the ST regardless of live/table status, and gating submission would be new
  scope this story wasn't asked to add.
- **NOT a schema change to `character.schema.js`.** `humanity` and `touchstones` already exist.
  Only a new request-body schema for the new POST route (mirroring `office_action.schema.js`'s
  shape, not a document schema for the whole collection).
- **NOT a change to `contested-rolls.js`'s or `office-actions.js`'s own accept/decline routes**
  beyond the two `request_type` exclusion guards named above. Their existing behaviour for
  `status_action` and player-vs-player challenges must be unaffected.

## Acceptance Criteria

1. **`attachedTouchstoneCount(char)`** added to `public/js/data/accessors.js`, next to the other
   simple derived accessors (e.g. `discDots`). Formula: `(char.touchstones || []).filter(t =>
   (char.humanity || 0) >= t.humanity).length` — verified to agree with all 4 existing inline sites
   using the identical `humanity >= t.humanity` predicate (`public/js/suite/sheet.js:268`;
   `public/js/editor/sheet.js:428,451`; `public/js/admin/downtime-story.js:1698,1765,1897`); none of
   those call sites are changed to use the new accessor (out of scope — they render full
   Attached/Detached lists per-touchstone, this accessor only needs the count).
2. **New schema + route file** `server/schemas/humanity_check_request.schema.js` (mirrors
   `office_action.schema.js`'s shape: `type:'object', additionalProperties:false`) requiring only
   `character_id: {type:'string', minLength:1}`. New `server/routes/humanity-check.js`:
   - `POST /` — inserts `{ request_type: 'humanity_check', character_id, character_name, status:
     'pending', outcome: null, created_at, updated_at }` into `contested_roll_requests`. Caller must
     own `character_id` (`req.user.character_ids` includes it) OR be ST (`isStRole(req.user)`,
     `server/middleware/auth.js`) — same allowance shape as `office-actions.js`'s POST. Rejects
     (409) if a `status:'pending'` Humanity Check already exists for the same `character_id` (plain
     `findOne` pre-check; a real Mongo unique index is not needed here — this is a single player
     tapping their own button, not a multi-actor budget race like `office_action_budgets`).
   - `GET /pending` — **not a new route.** Instead, widen `office-actions.js`'s existing `GET
     /pending` filter from `{ request_type: 'status_action', status: 'pending' }` to `{
     request_type: { $in: ['status_action', 'humanity_check'] }, status: 'pending' }`, still
     `requireRole('st')`, still sorted `created_at: 1`.
   - `PUT /:id/accept` (ST-only) — body `{ breaking_point_level: integer 1-10 }` (validate inline;
     reject 400 outside 1-10). Re-reads the character live (`getCollection('characters').findOne`),
     computes `attachedTouchstoneCount`, looks up base dice from the table above, computes
     `touchstone_mod` from the count, `pool = Math.max(0, base_dice + touchstone_mod)`. Plain
     `updateOne({ _id, request_type: 'humanity_check', status: 'pending' }, { $set: { status:
     'resolved', outcome: { breaking_point_level, base_dice, touchstone_count, touchstone_mod,
     pool }, resolved_by: req.user.username, updated_at } })` — 409 if `matchedCount === 0` (already
     resolved/declined by someone else), 404 if the id doesn't resolve to a pending
     `humanity_check` doc at all. No transaction (see Grounding section above for why).
   - `PUT /:id/decline` (ST-only) — same shape as `contested-rolls.js`'s decline: `updateOne` to
     `status: 'declined'`, 409 on `matchedCount === 0`.
   - Mount in `server/index.js`: `app.use('/api/humanity_check_requests', requireAuth, noCache(),
     humanityCheckRouter)`, alongside the other `contested_roll_requests`-family mounts.
3. **`contested-rolls.js`'s existing `request_type: { $ne: 'status_action' }` guards** (in
   `_findChallenge` and the `void` route) are widened to `request_type: { $nin: ['status_action',
   'humanity_check'] }` so a player-vs-player accept/decline/void can never match a pending or
   resolved Humanity Check record.
4. **Player-side submit tile.** `public/js/game/char-pools.js`'s Vampire Mechanics section (gdx-11)
   gains a "Humanity Check" tile, v2-gated identically to the rest of that section (`isV2` check,
   already established). Tapping it does **not** open a panel and does **not** load a pool — it
   POSTs to `/api/humanity_check_requests` for the currently-loaded character, disables itself
   immediately (mirrors `challenge-initiation.js`'s `submitEl.disabled = true` pattern) to prevent
   double-submit, and shows a toast ("Humanity Check submitted — awaiting ST review" on success, the
   server's error message — including the 409 dedupe case — on failure). Implemented as a third tile
   kind alongside the existing `{opensPanel}`/immediate-pool kinds: pushes `{ submitAction:
   'humanity_check' }`; the onTap callback at all three `renderCharPools()` call sites in `app.js`
   (same three gdx-11 Task 8 touched) gets a new first branch — `if (p.submitAction ===
   'humanity_check') { submitHumanityCheck(char); return; }` — calling a new exported function from
   a new small module, `public/js/game/humanity-check.js`, that owns the POST + toast logic (kept
   out of `char-pools.js` itself, which only renders tiles and never makes network calls today).
5. **Approval Queue rendering.** `public/js/suite/office-approvals.js` renders `request_type:
   'humanity_check'` rows distinctly from `status_action` rows (its own header comment already
   anticipates this extension point — do not restructure `_renderRow`, add a sibling
   `_renderHumanityCheckRow` and branch on `request_type` in `_renderBody`'s `.map()`):
   - **Pending row:** character name, an inline breaking-point level `<select>` (1-10, no default
     selected), and an Accept button **disabled until a level is chosen** (`state.levelByRequestId`,
     a new `Map` alongside the existing `busyIds`/`errorById`, keyed by request id — persists the
     ST's in-progress choice across the 10-second poll's re-renders). A `change` listener on the
     `<select>` (new delegated listener, `data-oaq-level-select`, added alongside the existing
     delegated `click` listener in `_attachDelegatedHandlers`) updates the map and re-renders just
     that row's Accept button state. Accept sends `PUT
     /api/humanity_check_requests/:id/accept` with `{ breaking_point_level: <chosen level> }`.
     Decline behaves identically to a `status_action` row's Decline (no level needed).
   - **Resolved-but-visible-this-poll row (briefly, before the next `_refetchAndRender` drops it —
     matches existing `status_action` behaviour, not new):** not required to render specially;
     existing removal flow (filter by id, refetch) applies unchanged.
6. **A resolved Humanity Check is removed from the Approval Queue immediately**, via the existing
   `_resolve()` flow, identically to a resolved `status_action` — no special-cased "keep it visible"
   behaviour. The Approval Queue's job ends at computing and storing the pool; surfacing it for
   rolling is AC7's job, on the Roll tab, not here.
7. **"Load Pool" surfacing.** Add a lightweight poll (reuse the same 10-second interval concept, or
   a simple on-tab-activate fetch — dev's call, document the choice) in the Roll tab's own character
   context: when the currently-loaded roll character (`state.rollChar` in `roll-v2.js`) has a
   `status: 'resolved'` Humanity Check whose `outcome` has not yet been loaded into the roller this
   session, surface a "Load Humanity Check (N dice)" affordance near the Vampire Mechanics tiles.
   Tapping it calls the existing exported `loadPool(total, name, pi)` (`roll-v2.js`) with `pi = {
   total: pool, attr: null, attrV: 0, skill: null, skillV: 0, discName: null, discV: 0, resistance:
   null, noWP: true }` (verified safe: `updPool()`'s effline branch at `roll-v2.js:333`,
   `if (!pi || !pi.attr)`, already degrades to a plain "Effective pool: N dice" line with no
   attr/skill breakdown — no new null-guard needed there). `GET
   /api/humanity_check_requests/mine?character_id=<id>` (or equivalent — dev's call on the exact
   query shape) is the read path; scope it to the loaded character only, not every resolved request
   in the collection.
8. **Existing behaviour unaffected:** `status_action` rows in the Approval Queue render/behave
   identically (verify by loading the queue with at least one real pending Status Action present,
   or a targeted test asserting `_renderRow`'s output is byte-identical pre/post this story for a
   `status_action`-shaped input). Player-vs-player challenges (`contested-rolls.js`, no
   `request_type` field) still submit/accept/decline/void correctly. `roll.js` (v1) is untouched —
   the new tile is v2-gated exactly like the rest of gdx-11's Vampire Mechanics section.

## Tasks / Subtasks

- [x] Task 1 (AC1) — `public/js/data/accessors.js`: add `attachedTouchstoneCount(char)`. Verify
  against the 4 cited inline sites before writing (read each, confirm identical formula — already
  done during story creation, re-confirm at dev time since this is the precondition the whole
  touchstone-modifier calculation depends on). DONE — added next to `discDots`, 5 tests in
  `server/tests/gdx-12-humanity-check-oaq-submit-approve.test.js`, red before/green after.
- [x] Task 2 (AC2) — `server/schemas/humanity_check_request.schema.js` (new) +
  `server/routes/humanity-check.js` (new): POST, PUT `:id/accept`, PUT `:id/decline`. Widen
  `office-actions.js`'s `GET /pending` filter (one-line change, `$in` instead of an implicit single
  value). Mount the new router in `server/index.js`. DONE, with one real pre-existing bug found and
  fixed: `middleware/validate.js` caches compiled Ajv validators keyed by `schema.title`, and
  `office_action.schema.js` has no `title` field, so it compiles under cache key `undefined`. The
  new `humanityCheckRequestSchema` also had no `title` at first, collided on the same `undefined`
  key, and every POST to the new route was silently validated against `officeActionSchema` instead
  (visible as an unexplained 400 on a schema-valid payload) — fixed by giving the new schema a
  `title` (`'TM Humanity Check Request'`), matching `contested_roll_request.schema.js`'s own
  convention. `office_action.schema.js` itself is still title-less and remains latently vulnerable
  to the same collision against any FUTURE title-less schema — out of this story's scope to fix
  broadly, logged to `deferred-work.md`.
- [x] Task 3 (AC3) — `server/routes/contested-rolls.js`: widen the two `request_type: { $ne:
  'status_action' }` guards to `$nin: ['status_action', 'humanity_check']`. DONE, prove-discriminated
  (both new regression tests failed red before the widening, green after).
- [x] Task 4 (AC4) — `public/js/game/humanity-check.js` (new): `submitHumanityCheck(char, tileEl)` —
  POST + disable-tile + toast. DONE, with one correction from the story's own draft: uses the
  canonical `toast()` from `suite/toast.js` (already imported/used throughout `app.js` and this
  exact game/roll-tab area), not `challenge-initiation.js`'s bespoke `_showSentToast()` div (a
  different, one-off pattern local to the header challenge modal — the story's own Dev Notes flagged
  this as needing a check before choosing; checked, canonical toast wins). `public/js/game/
  char-pools.js`: new `{ submitAction: 'humanity_check' }` tile (own `submitBtn()` renderer, not
  `choiceBtn()` reused as-is — "tap to choose" would have been wrong copy for a tile that submits
  immediately rather than opening a panel); `onTap` callback signature widened to `(pool, btn)` so
  the tapped element can be disabled without `char-pools.js` itself making a network call.
  `public/js/app.js`: new first branch (before `goTab('dice')`/`opensPanel`) in all three
  `renderCharPools()` onTap callbacks. 3 new unit tests (fetch-mocked, no-jsdom shim per gdx-7/gdx-11
  precedent) — submit success, server-error toast + tile re-enable (409 dedupe case), no-op on a
  missing `_id`.
- [x] Task 5 (AC5) — `public/js/suite/office-approvals.js`: `_renderHumanityCheckRow`, level
  `<select>` + `state.levelByRequestId` Map, new delegated `change` listener, branch in
  `_renderBody`. Reuse existing poll/generation-guard/busy/error infrastructure unchanged. DONE.
  `_resolve()` also widened to route per `request_type` (status_action -> `/api/office_actions`,
  humanity_check -> `/api/humanity_check_requests`) with a defence-in-depth guard refusing accept
  with no level chosen even if called directly. Two existing `oaq-3-approval-queue.test.js`
  assertions updated to match the new (still-correct-for-status_action) shape: the hardcoded
  single-endpoint `apiRaw` literal is now a routed `${endpoint}` template, and "exactly one
  `addEventListener` call" is now "both delegated listeners live inside
  `_attachDelegatedHandlers`, none outside it" — the real invariant (no per-row handlers) preserved,
  not just the old literal count. 4 new static-analysis tests added (this project's own established
  pattern for this module, per oaq-3's own header comment) plus the full 24-test oaq-3 suite
  re-verified green.
- [x] Task 6 (AC7) — `public/js/suite/roll-v2.js` (or a small new module it calls into, dev's
  call): "Load Humanity Check" affordance for the currently-loaded roll character, wired to the new
  `GET /api/humanity_check_requests/mine?character_id=` read and the existing `loadPool()` export.
  DONE — implemented as `checkForResolvedHumanityCheck(char, containerEl)` in `humanity-check.js`
  itself (not `roll-v2.js` — kept the network-call/DOM-banner concern in the same module as
  `submitHumanityCheck`, `roll-v2.js` only supplies the imported `loadPool()`), called from
  `app.js`'s `pickChar()` right after `renderCharPools(rollPoolsEl, ...)` — fire-and-forget, not
  blocking character load on a network round-trip. Session-only `_loadedRequestIds` Set (a page
  reload re-surfaces the banner, the safe default) plus a generation guard mirroring
  `office-approvals.js`'s own `_fetchGen` pattern (a stale response from a fast character-switch
  can't paint the wrong character's banner). 4 new tests using a hand-rolled fake DOM for the
  banner/button (same no-jsdom technique this project's own oxp-3 review established), including a
  real click-through of the Load Pool button.
- [x] Task 7 — Tests: `server/tests/gdx-12-humanity-check-oaq-submit-approve.test.js` — dice-table
  lookup (all 10 levels), touchstone-modifier mapping (0/1/2+ attached), pool floor at 0, the two
  `contested-rolls.js` guard widenings (existing `status_action`/challenge behaviour unaffected —
  regression, not new behaviour), `attachedTouchstoneCount` against fixture characters with mixed
  attached/detached touchstones. Prove-discriminated per this project's own convention (revert →
  confirmed red → restored → confirmed green) for every testable fix. DONE — 37 tests in the one
  consolidated file (pure functions, DB-backed Supertest routes, client-side fetch-mocked
  submit/load flows, office-approvals.js static-analysis), every one written and run red before its
  implementation landed, all green after. Targeted regression across all 11 touched-module test
  files (352 tests) also green — see Dev Agent Record.
- [x] Task 8 — Manual/live verification pass, matching gdx-11's own disclosed-partial pattern:
  submit as a player, accept (with a chosen level) and decline as ST, confirm the queue row
  disappears correctly, confirm `status_action` rows are visually/functionally unaffected, confirm
  the Load Pool affordance appears only for the matching loaded character and produces the correct
  dice count end to end against a real character with real touchstones. DONE — full pass against
  live `tm_suite` via Chrome browser automation + the `local-test-token` bypass, three real
  characters covering all three touchstone-modifier buckets: Cyrus Reynolds (2 attached, level 5 →
  base 3 + mod +3 = 6 dice, matches hand calc), Charles Mercer-Willows (0 attached, level 3 → base 2
  + mod −2 = pool floors at 0, the AC floor case), Eve Lockridge (1 attached, submitted then
  declined — row disappeared, `outcome` stayed `null`, no pool computed). Queue rendered all three
  oldest-first with Accept correctly gated on a chosen level (disabled/muted until picked, matching
  the defence-in-depth guard). Load Pool banner appeared only for Cyrus (the matching loaded
  character) reading "Humanity Check ready — 6 dice", loaded into the roll builder as base 6/mod 0,
  and toggling the WP(+3) chip afterwards left the pool at 6 (not 9) — `noWP` suppression confirmed
  live, not just by the unit test. Switching to an unrelated character (Doc) confirmed no banner
  renders for a character with no resolved request. Zero real console errors across the whole pass
  — the only console exceptions seen were the pre-existing, already-documented
  `[EXCEPTION] ... message channel closed before a response was received` browser-extension
  artifact (memory `feedback-local-browser-verification-technique.md`), not app code, not new.
  **AC8 caveat, disclosed rather than silently skipped:** no `status_action` row existed live to
  co-render next to a Humanity Check row at verification time (queue was empty before this pass);
  AC8 is covered by the existing 24-test `oaq-3-approval-queue.test.js` suite (re-run green this
  session, see below) but was not eyeballed side-by-side live. **Test-harness note, not an app
  defect:** two early submit attempts (switching character via a scripted `change` event then
  immediately clicking a `find()`-returned element reference) silently no-op'd with no network call
  and no DB write, while every attempt that screenshotted the re-rendered tile before a real
  coordinate click succeeded (confirmed via direct `contested_roll_requests` reads and
  `read_network_requests`) — a stale-accessibility-ref artifact of the automation approach, not
  reproducible via genuine visible-element interaction, and not a code change.

### Review Findings

Internal 3-layer review (Blind Hunter, Edge Case Hunter, Acceptance Auditor two-pass), 2026-08-20.
Codex unavailable until 2pm that day. 21 raw findings triaged to 6 patch, 6 defer, 9 dismissed —
detail below; the two most consequential catches were: `AC2`'s own text explicitly rules out a
unique index for the duplicate-pending race both Blind Hunter and Edge Case Hunter flagged
independently (a spec-sanctioned dismiss, not a gap), and Edge Case Hunter's v1/v2 roller-gating
finding turned out to be a real `AC8` compliance gap once checked against the spec, not just a
hygiene nit.

- [x] [Review][Patch] `GET /mine`'s `character_id` query param was used unvalidated. Edge Case
  Hunter's originally-flagged vector (`?character_id[$ne]=x` parsing to a Mongo-operator-shaped
  object) does **not** actually reach this route — verified empirically against this app's real
  Express 5 runtime, whose default `'simple'` query parser (unlike Express 4's `'extended'`
  default) does not support bracket/nested notation at all; `req.query.character_id` comes back
  `undefined` for that input, not an object. The genuinely reachable non-string vector is a
  **repeated query key** (`?character_id=a&character_id=b`), which Express 5 does turn into an
  array. Fixed with `typeof character_id !== 'string'`, which closes both the originally-imagined
  and the actually-reachable case. Prove-discriminated: reverted, the new test failed (200 instead
  of 400 for a repeated key), restored, green again.
  [server/routes/humanity-check.js:83]
- [x] [Review][Patch] `checkForResolvedHumanityCheck` was called unconditionally from `pickChar()`,
  not gated behind `tm-use-new-dice-roller` the way the sibling submit tile is (`char-pools.js`'s
  own `isV2` check) — an actual `AC8` violation, not just a hygiene nit: AC8 requires the whole
  feature to be "v2-gated exactly like the rest of gdx-11's Vampire Mechanics section," and a
  v1-roller player/device (still the *default* on many devices per gdx-7's own live-test finding)
  could see the "Load Pool" banner and have it call `loadPool()` from `roll-v2.js` against DOM that
  v1's `roll.js` may not provide in the same shape. Fixed: wrapped the call in
  `if (USE_NEW_ROLLER)`, the module's own existing constant, matching every other v2-only branch in
  this file. Prove-discriminated: reverted, the new static-analysis test failed, restored, green.
  [public/js/app.js:1303]
- [x] [Review][Patch] `_resolve()`'s stale-row lookup (`state.rows.find(...)`) silently defaulted
  `isHumanityCheck` to `false` if the row wasn't present in the current in-memory snapshot (e.g. the
  10s poll evicted it, or a double-click race), then routed to `/api/office_actions/...` for what
  may actually be a `humanity_check` id — not data-corrupting (the two collections share one
  underlying store but the office-actions route's own `request_type: 'status_action'` filter means
  it simply won't match), but produced a confusing 404/409 instead of a clear "this request changed,
  refresh" message. Fixed: a missing row now short-circuits straight to `_refetchAndRender()`
  instead of guessing an endpoint. Prove-discriminated: reverted, the new static-analysis test
  failed, restored, green.
  [public/js/suite/office-approvals.js:176-183]
- [x] [Review][Patch] `submitHumanityCheck` silently no-op'd with no toast if `char._id` was
  missing — a genuinely-broken tap (e.g. a stale/unloaded character reference) gave the player no
  feedback at all. Fixed: toasts "No character selected" before returning. Prove-discriminated: the
  existing test for this path (renamed to describe the fix) reverted red, restored green.
  [public/js/game/humanity-check.js:25]
- [x] [Review][Patch] This story's own Task 6 completion note claimed "8 new tests" for
  `checkForResolvedHumanityCheck()`; only 4 `it()` blocks actually exist in that test's `describe`
  block. The "including a real click-through of the Load Pool button" part of the claim is true —
  only the count was overstated by 2x. Fixed: Task 6's own text corrected to "4 new tests."
  [specs/stories/gdx-12-humanity-check-oaq-submit-approve.md Task 6 /
  server/tests/gdx-12-humanity-check-oaq-submit-approve.test.js:241-311]
- [x] [Review][Patch] AC8 specifies two acceptable verification methods for "existing
  `status_action` behaviour unaffected" — loading the queue with a real pending Status Action
  present, **or** a targeted test asserting `_renderRow`'s output is byte-identical pre/post this
  story. Neither had happened: no live Status Action existed at Task 8 verification time, and no
  test performed a byte-identical `_renderRow` check. The story's own Task 8 note's "AC8 is covered
  by the existing 24-test `oaq-3-approval-queue.test.js` suite" overstated what that suite actually
  checks for this specific AC (confirmed 24/24 pass, but none of the 24 do the byte-identical
  comparison AC8 itself specifies). Fixed: added a targeted static-analysis test isolating
  `_renderRow`'s own function body from source and asserting it carries none of this story's new
  Humanity Check vocabulary — proving the shared status_action renderer wasn't touched by this diff
  (confirmed directly against the diff too: the hunk boundaries show zero lines changed inside
  `_renderRow` itself, only new code appended after it). Prove-discriminated: a temporary marker
  string injected into `_renderRow`'s body made the new test fail as expected; removed, green again.
  [specs/stories/gdx-12-humanity-check-oaq-submit-approve.md AC8 / Task 8 /
  server/tests/gdx-12-humanity-check-oaq-submit-approve.test.js:350-359]
- [x] [Review][Defer] `PUT /:id/accept` and `PUT /:id/decline` bypass the Ajv `validate()`
  middleware/schema pattern the `POST /` route in the same file uses, relying on manual inline
  validation instead (correct today for the one field `accept` needs; `decline` needs none) —
  inconsistent with this route file's own established convention, not a functional gap. — deferred,
  pre-existing convention drift, not unique to this story
  [server/routes/humanity-check.js:100-106]
- [x] [Review][Defer] The "Load Pool" banner uses a hardcoded `id="gcp-hc-load-banner"` rather than
  a per-container-scoped id. Not currently triggered — `checkForResolvedHumanityCheck` has exactly
  one call site today (`app.js:1303`, the roll tab's pools element) — but would produce duplicate
  DOM ids if a future call site (e.g. the Sheet tab's own pools panel) ever renders it too. — 
  deferred, latent risk only, no second call site exists yet
  [public/js/game/humanity-check.js:78]
- [x] [Review][Defer] Resolved `humanity_check` documents (`GET /mine`, unbounded query) and the
  ST's session-local `state.levelByRequestId` Map (no eviction when a row is removed by another
  ST's poll) both grow unbounded with no cleanup path — the same accumulation pattern this project
  already accepts elsewhere for resolved/declined records at this campaign's scale, not a new class
  of problem. — deferred, matches existing accepted pattern, campaign-scale volume is low
  [server/routes/humanity-check.js (GET /mine) / public/js/suite/office-approvals.js
  (levelByRequestId)]
- [x] [Review][Defer] `.oaq-queue-row:has(.oaq-hc-level-select)` has no `@supports` fallback for
  browsers lacking `:has()` support — the rule prevents the actions row from overflowing on narrow
  phone widths; without it that overflow returns silently on an unsupported browser. — deferred, low
  likelihood given this campaign's known device set, worth a follow-up if a report ever surfaces it
  [public/css/suite.css]
- [x] [Review][Defer] The Approval Queue's 10-second poll re-render can interrupt an ST mid-choice
  on an open breaking-point `<select>`. — deferred, shares the same re-render-on-poll shape as the
  rest of this file's existing rows, not a new pattern introduced by this story
  [public/js/suite/office-approvals.js]
- [x] [Review][Defer] The `middleware/validate.js` Ajv-cache title-collision landmine
  (`office_action.schema.js` still has no `title`, still latently vulnerable to the identical
  collision against any future title-less schema) is real but was already found, fixed for THIS
  story's own schema, and filed in `deferred-work.md` during Task 2 — re-confirmed here as already
  tracked, not a new gap. — deferred, already logged
  [server/middleware/validate.js:21-24]

**Dismissed (9):** missing unique index on the duplicate-pending check (AC2's own text explicitly
rules this out — "a real Mongo unique index is not needed here... not a multi-actor budget race" —
spec-sanctioned, not a gap); the server route importing `public/js/data/accessors.js` (an
already-established, tested pattern since BL-2 made that module safely importable outside a
browser — `attachedTouchstoneCount` is directly unit-tested from the route file); raw `err.message`
surfaced via `toast()` (matches the exact precedent in `challenge-initiation.js:140` this story
explicitly modeled itself on, not a deviation); the `character_name` fallback to a raw ObjectId
(unreachable in practice — the character schema requires `name`); the breaking-point level list's
descending order (stylistic, not a defect); the session-local "loaded" banner dedupe re-surfacing on
reload (explicitly documented in the code's own comment as the deliberate, safe-default design
choice); and three Acceptance Auditor "verified true" notes (the `validate.js` bug write-up, the
canonical-toast-import claim, and the exact regression-count claims) which were confirmations, not
findings, and need no action.

## Dev Notes

- **Data-shape verifications already done this session — do not re-derive, cite these:**
  - `contested_roll_requests` has no MongoDB collection-level `$jsonSchema` validator anywhere in
    `server/` (grepped) — safe to add a third `request_type` value without any migration.
  - `character.touchstones` is `[{ humanity: 1-10 required, name required, desc optional }]`
    (`server/schemas/character.schema.js:260-274`), free-text, no `edge_id` link (DBO-8 retired
    that). All 4 existing "Attached/Detached" render sites use the exact same
    `char.humanity >= t.humanity` predicate — confirmed by direct read of all 4, not assumed.
  - `loadPool()` (`roll-v2.js:180`) reads `state.rollChar.name` directly and requires
    `state.rollChar` to already be the loaded character — this is why AC7's "Load Pool" affordance
    is scoped to "the currently-loaded roll character" rather than any resolved Humanity Check
    anywhere; there is no existing mechanism to load an arbitrary character from outside the roll
    tab's own character-select flow, and building one is out of this story's scope (see "What this
    story is NOT").
  - `updPool()`'s effline rendering (`roll-v2.js:330-340`) already has a `!pi.attr` fallback branch
    — a `pi` with `attr: null` renders a plain dice-count line, no crash, no new guard needed.
  - `office-actions.js`'s `_findPending`/`_conflictBody` helpers are ST-approval-queue-specific
    (`request_type: 'status_action'` hardcoded into the query) — do not try to generalize or reuse
    them for the new route; write `humanity-check.js`'s own equivalent, mirroring the shape but
    literal to `request_type: 'humanity_check'`, same as `contested-rolls.js`'s own separate
    `_findChallenge` already does for its own discriminator.
- **Reuse, do not reinvent:** `pi.noWP` (gdx-11, `effPool()`/`updPool()` in `roll-v2.js`) already
  forces `wpBonus` to 0 regardless of the WP chip state — zero changes needed to that plumbing, only
  setting `noWP: true` in the new `pi` object this story builds.
- **Toast pattern:** `challenge-initiation.js`'s `_showSentToast()` (a plain `div.ch-toast` appended
  to `document.body`, auto-removed after 2.5s) is the existing precedent for a submit-confirmation
  toast in this exact part of the app — reuse the class/shape, do not invent a new toast mechanism
  (note this is distinct from `public/js/suite/toast.js`, the sheet/tracker toast helper — check
  which one is actually imported by files near `char-pools.js`/`app.js` before choosing).
- **CSS:** per `specs/project-context.md`, reuse `.gcp-*`/`.oaq-*`/`.ch-*` classes already
  established by gdx-11 and oaq.3 — no bare hex, no inline `style="..."` (the one exception already
  in this codebase, `office-approvals.js`'s inline `color:` on the attached/detached span in
  `sheet.js`/`editor/sheet.js`, predates this story and is not a precedent to copy).

### Project Structure Notes

- Server: two new files (`schemas/humanity_check_request.schema.js`,
  `routes/humanity-check.js`), one new mount line in `index.js`, small guard-widening edits to
  `office-actions.js` (`GET /pending` filter) and `contested-rolls.js` (two `$nin` guards). No
  schema change to `character.schema.js`.
- Client: one new file (`public/js/game/humanity-check.js`), edits to `char-pools.js` (new tile),
  `app.js` (three onTap branches), `office-approvals.js` (new row renderer + state map + listener),
  `roll-v2.js` (or a small sibling module) for the Load Pool affordance. `accessors.js` gains one
  function. No changes to `roll.js` (v1).
- No conflicts detected with other in-flight epic-gdx siblings (gdx-8/gdx-9 still
  backlog/unstoried, neither touches these files).

### References

- `gdx-11-vampire-mechanics-quick-actions.md` — the carve-out source; its Grounding section, "What
  this story is NOT", Dev Notes, and Task 8/9 (the `openPanel`/onTap routing this story's Task 4
  extends) are direct prerequisites for reading this story correctly.
- `server/routes/office-actions.js`, `server/routes/contested-rolls.js`,
  `public/js/suite/office-approvals.js`, `public/js/game/challenge-initiation.js` — read in full
  during story creation; cited throughout above.
- Rulebook: `st-working/reference/Vampire the Requiem 2e Rulebook.md` p.107-108, "Breaking Points" /
  "Detachment" / "Suggested Modifiers for Detachment Rolls".
- Meeting-decision grounding: `D:\Terra Mortis\2026-07-25_meeting-lessons.md` §2.9.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5, direct in-session (not delegated to a subagent) — same explicit, disclosed
deviation from the `/bmad-loop` Opus invariant that gdx-11 recorded, for the same reason (this
session's own model).

### Debug Log References

- **Real pre-existing bug found and fixed during Task 2**: `middleware/validate.js` caches compiled
  Ajv validators keyed by `schema.title`; `office_action.schema.js` has no `title`, so it compiled
  under cache key `undefined`. The new `humanity_check_request.schema.js` originally had no `title`
  either, collided on the same key, and every POST to `/api/humanity_check_requests` was silently
  validated against `officeActionSchema` instead — visible as an unexplained 400 on a schema-valid
  payload (10 of 26 tests failed identically with `400` where `201`/`403`/`200` were expected).
  Fixed by giving the new schema a `title` (`'TM Humanity Check Request'`). `office_action.schema.js`
  itself is unchanged and still latently vulnerable — logged to `deferred-work.md`.
- **Static-vs-dynamic import ordering, found writing Task 6's own tests**: a static
  `import { submitHumanityCheck, checkForResolvedHumanityCheck } from
  '../../public/js/game/humanity-check.js'` at the top of the test file threw `location is not
  defined` — `humanity-check.js` imports `roll-v2.js`, whose own import chain
  (`data/app-settings.js`) reads `location` at MODULE TOP LEVEL, and a static import is hoisted and
  evaluated before the test file's own no-jsdom shim runs, regardless of source position. Fixed by
  switching to `await import(...)` (a dynamic import executes in place, not hoisted) — the same
  reason gdx-11's own test file uses `await import(...)` for `roll-v2.js` rather than a static
  import; this session initially missed that this was WHY gdx-11 did it that way, not just a style
  choice, until reproducing the crash directly.

### Completion Notes List

- **Tasks 1-8 all done.** Task 8 (manual/live verification) completed this session via Chrome
  browser automation against local servers (`npx http-server public -p 8080` + a plain
  `node server/index.js`, **not** `npm run dev` — its `--watch` flag crash-looped repeatedly with no
  visible error in this environment; a plain `node index.js` run stayed up cleanly) pointed at the
  real live `tm_suite` Atlas database, using the `local-test-token` bypass as ST. Full detail of what
  was driven and confirmed is in Task 8's own checklist entry above. **Story Status moves to
  `review`**; `sprint-status.yaml`'s `gdx-12-humanity-check-oaq-submit-approve` row updated to match.
- **Targeted regression re-run this session** (post-Task-8, confirming nothing regressed since Task
  7's own pass — no code changed in this session, only manual verification): the 7 most directly
  touched suites — `gdx-12-humanity-check-oaq-submit-approve`, `oaq-3-approval-queue`,
  `oaq-2-pending-status-actions`, `otc-2-office-actions-api`, `issue-1143-office-actions-auth-safety`,
  `gdx-11-vampire-mechanics-quick-actions`, `gdx-7-apply-costs-on-roll` — **150/150 passed, 0
  failed, 0 skipped**. Per `specs/project-context.md`'s own standing instruction ("targeted tests
  only for the changed area; never the full suite for a small change"), a full untargeted run was
  deliberately not re-triggered.
- **Live `tm_suite` writes did happen this session, deliberately** — Task 8 is a live-verification
  pass by design (see its own resumption note, this file, and memory
  `feedback-local-browser-verification-technique.md`: "real production Atlas data comes through...
  genuine live verification, not a mock"). Three real, live `contested_roll_requests` documents were
  created and resolved/declined against three real characters (Cyrus Reynolds, Charles
  Mercer-Willows, Eve Lockridge) during verification. **Cleaned up after verification, with
  Angelus's explicit go-ahead**: all three deleted by `_id`
  (`6a8619e7e6c34fb599adf40d`/`6a861b10e6c34fb599adf40e`/`6a861b38e6c34fb599adf40f`) via a direct
  MongoDB `delete-many` scoped to exactly those three ids, confirmed empty afterward
  (`{request_type: 'humanity_check'}` returns 0 documents in live `tm_suite` as of this note) — no
  stray "Load Pool" banner will surface to Cyrus's or Charles's real players.

### File List

- `public/js/data/accessors.js` — added `attachedTouchstoneCount(char)`
- `server/schemas/humanity_check_request.schema.js` — new
- `server/routes/humanity-check.js` — new (POST/accept/decline + exported pure
  `BASE_DICE_BY_LEVEL`/`touchstoneModifier`/`computeHumanityCheckPool`)
- `server/routes/office-actions.js` — `GET /pending` filter widened to `request_type: { $in:
  ['status_action', 'humanity_check'] }`
- `server/routes/contested-rolls.js` — both `request_type` exclusion guards widened from `$ne` to
  `$nin: ['status_action', 'humanity_check']`
- `server/index.js` — mounted `humanityCheckRouter` at `/api/humanity_check_requests`
- `server/tests/helpers/test-app.js` — mounted the same router for the test app
- `public/js/game/humanity-check.js` — new (`submitHumanityCheck`, `checkForResolvedHumanityCheck`)
- `public/js/game/char-pools.js` — new Humanity Check submit tile (`submitBtn()` helper), `onTap`
  callback signature widened to `(pool, btn)`
- `public/js/app.js` — new `submitHumanityCheck` import + `checkForResolvedHumanityCheck` import;
  new first branch in all three `renderCharPools()` onTap callbacks; `pickChar()` calls
  `checkForResolvedHumanityCheck` after rendering the roll tab's pools
- `public/js/suite/office-approvals.js` — `_renderHumanityCheckRow`, `state.levelByRequestId`, new
  delegated `change` listener, `_resolve()` routes per `request_type`, header/scaffold comment
  updates
- `public/css/suite.css` — `.oaq-hc-level-select`, `.gcp-hc-load-banner`, a `:has()` wrap rule for
  the level-picker row
- `server/tests/gdx-12-humanity-check-oaq-submit-approve.test.js` — new, 42 tests (37 dev-story + 5
  from the code-review patch round)
- `server/tests/oaq-3-approval-queue.test.js` — 2 assertions updated to match `_resolve()`'s new
  per-request_type routing shape (still correct for `status_action`, not a behaviour change)
- `specs/deferred-work.md` — 7 entries added (1 from Task 2's `validate.js` title-collision
  landmine, 6 from the code-review deferred findings)

## Senior Developer Review (AI)

**Date:** 2026-08-20. **Mode:** LOCAL/internal, 3 subagents this session (Blind Hunter, Edge Case
Hunter, Acceptance Auditor two-pass) — Codex unavailable until 2pm that day. **Outcome:** all 6
`patch` findings fixed and prove-discriminated (single-change revert → red → restore → green, for
every code-level patch); all 6 `defer` findings logged to `deferred-work.md`; 9 dismissed with
evidence, most notably the missing-unique-index race both Blind Hunter and Edge Case Hunter flagged
independently, which `AC2`'s own text explicitly rules out as unnecessary — a spec-sanctioned
dismiss, not a gap either reviewer could have known without the story file (Blind Hunter had none by
design; Edge Case Hunter had repo access but not the spec).

One finding was independently re-investigated during triage rather than taken at face value: Edge
Case Hunter's `GET /mine` character_id-injection concern named the wrong attack vector for this
app's actual runtime (Express 5's default `'simple'` query parser doesn't support the bracket
notation it assumed — verified empirically, not from memory) — the underlying hygiene gap was real,
just reachable a different way (a repeated query key, not nested-object injection), and the fix and
its test were corrected to match reality before being applied.

Full detail, findings, and prove-discrimination notes are in the `### Review Findings` subsection
under Tasks/Subtasks above. Final regression: the 7 most directly touched suites — 155/155 passed, 0
failed, 0 skipped (gdx-12's own suite: 42/42).
