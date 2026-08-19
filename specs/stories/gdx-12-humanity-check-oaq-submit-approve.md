# Story gdx.12: Humanity Check via Epic OAQ's submit/approve pattern

Status: ready-for-dev

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

- [ ] Task 1 (AC1) — `public/js/data/accessors.js`: add `attachedTouchstoneCount(char)`. Verify
  against the 4 cited inline sites before writing (read each, confirm identical formula — already
  done during story creation, re-confirm at dev time since this is the precondition the whole
  touchstone-modifier calculation depends on).
- [ ] Task 2 (AC2) — `server/schemas/humanity_check_request.schema.js` (new) +
  `server/routes/humanity-check.js` (new): POST, PUT `:id/accept`, PUT `:id/decline`. Widen
  `office-actions.js`'s `GET /pending` filter (one-line change, `$in` instead of an implicit single
  value). Mount the new router in `server/index.js`.
- [ ] Task 3 (AC3) — `server/routes/contested-rolls.js`: widen the two `request_type: { $ne:
  'status_action' }` guards to `$nin: ['status_action', 'humanity_check']`.
- [ ] Task 4 (AC4) — `public/js/game/humanity-check.js` (new): `submitHumanityCheck(char)` — POST +
  disable-tile + toast, mirroring `challenge-initiation.js`'s submit/toast pattern (not its modal —
  no modal needed here, single-tap submit). `public/js/game/char-pools.js`: new tile in the Vampire
  Mechanics section, `{ submitAction: 'humanity_check' }`. `public/js/app.js`: new first branch in
  all three `renderCharPools()` onTap callbacks routing `submitAction` to the new module.
- [ ] Task 5 (AC5) — `public/js/suite/office-approvals.js`: `_renderHumanityCheckRow`, level
  `<select>` + `state.levelByRequestId` Map, new delegated `change` listener, branch in
  `_renderBody`. Reuse existing poll/generation-guard/busy/error infrastructure unchanged.
- [ ] Task 6 (AC7) — `public/js/suite/roll-v2.js` (or a small new module it calls into, dev's
  call): "Load Humanity Check" affordance for the currently-loaded roll character, wired to the new
  `GET /api/humanity_check_requests/mine?character_id=` read and the existing `loadPool()` export.
- [ ] Task 7 — Tests: `server/tests/gdx-12-humanity-check-oaq-submit-approve.test.js` — dice-table
  lookup (all 10 levels), touchstone-modifier mapping (0/1/2+ attached), pool floor at 0, the two
  `contested-rolls.js` guard widenings (existing `status_action`/challenge behaviour unaffected —
  regression, not new behaviour), `attachedTouchstoneCount` against fixture characters with mixed
  attached/detached touchstones. Prove-discriminated per this project's own convention (revert →
  confirmed red → restored → confirmed green) for every testable fix.
- [ ] Task 8 — Manual/live verification pass, matching gdx-11's own disclosed-partial pattern:
  submit as a player, accept (with a chosen level) and decline as ST, confirm the queue row
  disappears correctly, confirm `status_action` rows are visually/functionally unaffected, confirm
  the Load Pool affordance appears only for the matching loaded character and produces the correct
  dice count end to end against a real character with real touchstones.

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

### Debug Log References

### Completion Notes List

### File List
