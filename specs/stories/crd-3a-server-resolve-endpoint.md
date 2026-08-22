---
id: crd.3a
epic: crd
epic_file: specs/epic-crd-contested-roll-defence.md
status: done
priority: high
type: feature
depends_on: [crd.1]
branch: ms/crd-3a-server-resolve-endpoint
---

# Story CRD.3a: Server-side resolve endpoint (trust boundary)

## Story

As a defending player in a contested roll,
I want the server to compute my resistance pool from my own submitted choices (Mental/Social/Physical
aspect, Willpower spend, applicable merits) against my LIVE character sheet,
so that neither I nor the attacker can assert a dice pool the server hasn't independently verified —
closing the trust boundary crd.1 opened but couldn't finish alone.

## Why this story exists

crd.1 made `defender_pool` optional at creation and added an interim 409 guard on `PUT /:id/accept`
for any request that still has none — but nothing yet *writes* a real, server-verified
`defender_pool`. crd.3a is that write path: the actual trust boundary this epic exists to build. It
is unit-testable in complete isolation (Supertest only, no browser, no UI) — deliberate, matching
crd.1's own shape, so the highest-risk code in the epic gets adversarial test coverage before any UI
(crd.3b, a separate future story) is built on top of it.

## Decisions already made (do not re-litigate)

- **Flat fields, not a `resolution` sub-document.** The epic's original crd.3a sketch (written
  before crd.1 was actually built) proposed a `resolution` sub-document. crd.1, as implemented,
  instead added `defender_pool`, `defender_aspect`, `defender_wp_spent`, `defender_merit_ids` as
  FLAT top-level fields on `contested_roll_request.schema.js` (confirmed against the live file, not
  the epic doc's now-stale summary — see Dev Notes). crd.3a writes into that existing flat shape.
  Introducing a sub-document now would fork the shape crd.1 already built, tested (59 passing
  tests), and crd.2's queue already reads against.
- **The crd.1 accept-route 409 guard STAYS — this story does not delete it**, despite its own code
  comment ("delete this guard when crd.3a lands") suggesting otherwise. That comment is imprecise:
  the guard's real invariant — `/accept` cannot roll dice for an unresolved defender — stays true and
  necessary forever, not just during the crd.1→crd.3a gap. Nothing stops a client calling `/accept`
  directly without ever calling this story's resolve endpoint first; the guard is what stops that
  from silently rolling zero dice. AC1 below proves both halves.
- **The merit-bonus-value gap is real, confirmed against the live schema — this story does not solve
  it generically.** See Dev Notes; this is the single most load-bearing finding in this story.
- **Resolving is not accepting.** Calling this story's endpoint leaves `status: 'pending'` — it only
  populates `defender_pool`. The defender (or, per the existing `/accept` route's own auth, only the
  target character's own player) still calls the pre-existing `PUT /:id/accept` afterward to actually
  roll dice and transition to `resolved`. This is a deliberate two-step contract, matching how a
  future UI (crd.3b) would work: build/toggle your pool (calls resolve, possibly several times as the
  player experiments), then commit (calls accept once). `/accept`'s own code does not need to change
  at all for this story — it already just checks `defender_pool == null`; once resolve populates it,
  accept's existing logic proceeds unmodified.

## Acceptance Criteria

1. New route `PUT /api/contested_roll_requests/:id/resolve` (matching this file's existing verb
   convention — accept/decline/void are all `PUT`) exists in `server/routes/contested-rolls.js`.
   Reuses the existing `_findChallenge` helper (`contested-rolls.js:199-216`) for the pending-guard
   (404 on missing/wrong-type, 409 if not pending) rather than reimplementing it. Requires the
   caller's `character_ids` to include the challenge's `target_character_id` (mirrors `/accept`'s
   and `/decline`'s existing ownership check at lines 86-89/161-164).
2. Given `{ defender_aspect, defender_wp_spent, defender_merit_ids }` in the request body, the
   endpoint re-reads the DEFENDER's LIVE character document (queried fresh by
   `target_character_id`, never trusting anything about the character's stats from the request
   body) and computes the base pool as the EFFECTIVE (dots + bonus) value of the Resistance
   Attribute matching `defender_aspect` — `'mental'`→`Resolve`, `'physical'`→`Stamina`,
   `'social'`→`Composure` (`character.schema.js:161-193`, `attrObj` requires both `dots` and
   `bonus`; this project's "effective ratings" convention — CLAUDE.md — reads dots+bonus for pools).
3. If `defender_wp_spent` is true: re-check the character's CURRENT live Willpower (never a value
   cached or submitted earlier) — if it's `<= 0`, reject with 409 `CONFLICT` (mirroring the shape of
   crd.1's own accept-route guard) rather than silently granting the bonus anyway. Otherwise add
   **+2** (not +3) to the base pool — the Rulebook's general Willpower rule already cited in this
   epic's own scoping (a Resistance-trait roll gets +2, not the usual +3; see crd.1's Dev Notes for
   the full citation, not re-derived here).
4. For each id in `defender_merit_ids`, validate against the character's REAL `merits[]` array,
   matched on `rule_key` (`character.schema.js:445-707`'s `merit` object — confirmed the correct,
   stable match field per crd.1's own live spot-check; `name` is not guaranteed unique/stable). A
   submitted id the character does not actually have is silently dropped from the bonus
   calculation — not a hard validation failure; a stale or tampered client value degrades to "as if
   not selected."
5. The merit-bonus lookup (see Dev Notes' gap analysis) is narrowly scoped to exactly the two merits
   already proven correct in the disposable mockup: **Indomitable** (flat `+2`) and **Closed Book**
   (`+` the character's own `rating` for that merit). No other merit-specific branch exists. A merit
   present in `defender_merit_ids` and genuinely owned by the character, but NOT one of these two,
   contributes `0` — this is a known, deliberate, documented limitation (see Dev Notes), not
   something this story silently over-claims to solve generically.
6. On success: writes the computed `defender_pool` (integer) and the submitted
   `defender_aspect`/`defender_wp_spent`/(validated)`defender_merit_ids` onto the request document.
   `status` remains `'pending'` — this route never rolls dice or changes status.
7. Re-resolving is explicitly ALLOWED and idempotent: calling this endpoint again on the same still-
   pending request fully recomputes and overwrites `defender_pool` from the caller's current
   submitted choices and the character's current live stats. This lets a defender iterate (toggle a
   merit, reconsider Willpower) before ever calling `/accept`. Two concurrent resolve calls are not a
   data-integrity risk — each independently computes a complete fresh value and does a full `$set`,
   so last-write-wins is the correct, intended outcome (unlike `/accept`'s dice roll, which is
   genuinely irreversible and already guarded elsewhere).
8. **Prove both halves of the crd.1 guard's continued correctness**: (a) a request that has never
   been resolved still gets 409 from `/accept` exactly as crd.1 built it (no regression); (b) a
   request that has been through this story's `/resolve` endpoint successfully now accepts normally
   through the EXISTING, unmodified `/accept` route.
9. Willpower spend is capped at one point per action per the real rule already established
   elsewhere in this app (do not accept `defender_wp_spent` as anything other than a boolean — the
   schema already enforces this, crd.1 having deliberately chosen boolean over integer for exactly
   this reason; no new work needed here beyond not regressing it).
10. Real behavioural test coverage only — Supertest against the mounted app + `tm_game_test`,
    following crd.1's own established fixture/cleanup shape (`crd-1-contested-roll-request-shape.test.js`)
    exactly. No browser, no Playwright — this story has no client-visible surface.

## What this story is NOT

- **Does NOT build crd.3b's client UI.** No new HTML/CSS/client JS. crd.3b (a separate future
  story) is what calls this endpoint from a real screen.
- **Does NOT solve the merit-bonus-value gap generically.** Ships the narrow, explicitly-flagged
  2-merit lookup (AC5). Extending this project's real rule-engine (`server/schemas/rules/`) with a
  genuine "contest bonus" rule type — the actually-correct, convention-following fix — is real,
  scoped, separate future work, not folded into this story. See Dev Notes.
- **Does NOT touch `public/js/suite/roll-v2.js` or any client code.** The hardcoded `wpBonus =
  state.WP ? 3 : 0` literal crd.1's own WP-rule spike found there is a crd.3b concern (what a future
  UI's Willpower button displays), not this story's — crd.3a's own server-side arithmetic already
  applies the correct +2 regardless of what any client shows.
- **Does NOT implement crd.4's City Status/Blood Potency formula.** Still blocked (Errata citation,
  Mary's four open edge-case questions). Not referenced anywhere in this story's own pool
  arithmetic.
- **Does NOT change `/accept`'s existing code.** Its guard, written by crd.1, already does exactly
  what's needed once this story starts populating `defender_pool` for real — AC8 proves this with
  new tests, not new route logic.
- **Does NOT change `/decline` or `/void`.** Out of scope; both already correctly guard against
  `status_action` documents per crd.1's own audit.

## Tasks / Subtasks

- [x] Task 1 — Route + ownership + pending guard (AC: 1)
  - [x] Add `PUT /:id/resolve` to `contested-rolls.js`, reusing `_findChallenge`.
  - [x] Ownership check against `req.user.character_ids`, mirroring `/accept`/`/decline`.
- [x] Task 2 — Live character re-read + Resistance Attribute computation (AC: 2)
  - [x] Query the defender's live character document fresh at resolve time.
  - [x] Map `defender_aspect` → the correct effective attribute value.
- [x] Task 3 — Willpower re-check + the real +2 bonus (AC: 3, 9)
  - [x] Live Willpower check, 409 on insufficient WP.
  - [x] +2 applied, not +3, cited correctly.
- [x] Task 4 — Merit validation against real `merits[]`, keyed on `rule_key` (AC: 4, 5)
  - [x] Silent-drop of an unowned/unmatched merit id.
  - [x] The narrow, explicitly-commented 2-merit bonus lookup.
- [x] Task 5 — Write the computed pool, status unchanged (AC: 6, 7)
  - [x] Full recompute-and-overwrite on every call; no partial-merge.
- [x] Task 6 — Prove the crd.1 guard's continued correctness with real accept-flow tests (AC: 8)
- [x] Task 7 — Full test suite + changed-area regression, update Status/sprint-status.yaml

## Dev Notes

### The merit-bonus-value gap — the load-bearing finding of this story's research pass

Confirmed by reading `server/schemas/character.schema.js:445-707` (the real, complete `merit`
object schema) directly: a merit document carries `category`, `name`, `rating`, and a long tail of
narrow-purpose fields (MCI per-dot choices, territories, `granted_by`, etc.) — **no generic field
anywhere encodes a merit's mechanical bonus VALUE or WHICH stat/roll-type it modifies.**
`rule_key` (confirmed present on real merit documents, e.g. Yusuf's Indomitable entry in the dev
fixtures) identifies *which* merit it is — a stable lookup key — but nothing on the character
document says "this merit is worth +2 to a contested roll."

This project has a real, extensible typed rule-engine (`server/schemas/rules/` — confirmed by
listing the directory: `rule-derived-stat-modifier`, `rule-disc-attr`, `rule-grant`,
`rule-nine-again`, `rule-skill-bonus`, `rule-speciality-grant`, `rule-status-floor`,
`rule-tier-budget`), reachable from a merit's `rule_key` via `purchasable_powers` per Epic PP
(CLAUDE.md). **None of the existing typed rule schemas cover "adds dice to a contested/Resistance
roll."** `rule-derived-stat-modifier.schema.js`'s own `target_stat` enum is
`['size', 'speed', 'defence', 'health', 'willpower_max']` — the closest existing type, and it
doesn't include anything roll-time.

So the epic's own crd.3a sketch ("gating reads generic merit category/effect fields already on the
character document... a third merit needing a code change is the RLOG failure mode") assumed
infrastructure that does not currently exist. The genuinely correct, convention-following fix is a
new rule type in `server/schemas/rules/` (matching this project's own "new reference data defaults
to MongoDB-backed" convention) — real, scoped, buildable work, but MORE scope than a server-only
"should be quick" story like this one should absorb.

**This story's call**: ship the narrow, explicitly-named 2-merit lookup (AC5) — a small, commented,
easy-to-find function covering exactly Indomitable and Closed Book, the two merits the disposable
mockup already proved correct. Flag the rule-engine extension as real future work, not invented
scope-creep to avoid, but not this story's job either. A third merit needing this lookup extended IS
the RLOG shape the epic warned about — but the honest alternative (building a whole new rule type,
its schema, and a migration for two known cases) is a materially bigger story that deserves its own
scoping, not a silent addition to crd.3a.

### `/accept`'s guard, unmodified, and why

`server/routes/contested-rolls.js:91-112` (crd.1's interim guard) checks `challenge.defender_pool ==
null` — deliberately `==`, not `===` or truthy, so a legitimately-computed `defender_pool: 0` (this
story's own math CAN produce zero, e.g. `defender_aspect` mapping to a 0-dot attribute with no WP/
merit bonus) still accepts correctly. This story's own resolve endpoint must be able to write
`defender_pool: 0` and have `/accept` handle it exactly like any other resolved value — a real test
case, not a hypothetical.

### Precedent for live re-checks and the pending-guard shape

`server/routes/office-actions.js:52` (`computeNewStatus`) and its "check at approval, not
submission" pattern is the direct precedent for why THIS endpoint re-reads live character state
rather than trusting anything submitted earlier. `office-actions.js:94-102` (`_findPending`) is the
cross-file precedent for the pending-guard SHAPE (ObjectId parse → 404 → status-check → 409) —
`contested-rolls.js`'s own `_findChallenge` (same shape, same collection, this story's DIRECT reuse
target) is the one to actually import/call, not `_findPending` (a different file, scoped to
`status_action` specifically).

### Project Structure Notes

- New route lives in the existing `contested-rolls.js` — no new file. Matches every other
  crd.1/crd.2 precedent of extending existing files over forking new ones where one already owns
  the collection.
- New test file: `server/tests/crd-3a-resolve-endpoint.test.js`, following
  `crd-1-contested-roll-request-shape.test.js`'s exact fixture/cleanup/`describe.skipIf(!dbAvailable)`
  shape.
- No client-side files touched by this story at all.

### References

- [Source: specs/epic-crd-contested-roll-defence.md#crd.3a] — original sketch, now partially
  superseded by this story's own Decisions section above.
- [Source: server/schemas/contested_roll_request.schema.js] — live flat-field shape.
- [Source: server/routes/contested-rolls.js:81-154] — `/accept`, including crd.1's guard.
- [Source: server/schemas/character.schema.js:161-193,445-707] — attribute and merit shapes.
- [Source: server/routes/office-actions.js:52,94-102] — precedent for live re-checks and the
  pending-guard shape.
- [Source: server/schemas/rules/] — the real rule-engine, and its confirmed gap for this story's
  purposes.
- [Source: specs/stories/crd-1-data-lock-schema-hardening-wp-spike.md] — the WP+2 citation, the
  `rule_key`-not-`name` finding, and the depth/rigour bar this story is held to.

## Dev Agent Record

### Agent Model Used

Claude Opus (bmad-dev-story)

### Debug Log References

None — no HALT conditions hit, no failing runs left unresolved.

### Completion Notes List

- New route `PUT /:id/resolve` added to `contested-rolls.js` between `GET /mine` and `PUT /:id/accept`
  (resolve is the defender's action between creation and accept). Reuses `_findChallenge` unchanged
  (function declaration, hoisted, already in scope) for the 400/404/409 guards, and the same
  ownership-check shape as `/accept`/`/decline`.
- Deliberately did NOT import `public/js/data/accessors.js`'s `getAttrEffective`/`calcWillpowerMax` —
  confirmed those pull in browser-coupled state (`bloodlines-cache.js`, the rule-engine cache) that
  has no place in a server route. Wrote two tiny local helpers (`_attrEffective`, `_willpowerMax`)
  that read `dots + bonus` straight off the live character document instead, matching this project's
  "effective ratings" convention without the client coupling.
- AC3's live Willpower re-check reads `tracker_state` directly (`getCollection('tracker_state')`),
  matching `tracker.js`'s own dual-form `character_id` filter (`{ $in: [ObjectId, string] }`) since
  no server route had done this before — `st_mods.js` only documents where the CLIENT splices
  `tracker_state` in, it doesn't read the collection itself. Confirmed via `api-tracker-state.test.js`
  that `tracker_state.willpower` is the live current value (not the max) and that the field is stored
  as a plain string `character_id`, not an ObjectId.
- Added one defensive guard beyond the story's own explicit ACs: an off-enum `defender_aspect` gets a
  400 `VALIDATION_ERROR` rather than silently mapping to `undefined` and producing a `NaN`/`0` pool.
  No PUT route in this file validates its body via the JSON-schema `validate()` middleware (that's
  POST-only), so this is a small inline check, ordered AFTER the ownership check per the same
  "wrong owner still gets 403, not the narrower error" precedent crd.1's own accept-route tests
  established.
- `defender_wp_spent` is checked with `=== true` (strict), not a truthy coercion — a submitted
  `"true"` string or `1` does not grant the bonus AND does not trigger the live-WP check at all,
  proven by a dedicated test with the tracker deliberately parked at 0 WP.
- Merit bonuses are summed by walking the character's OWN `merits[]` array (filtered to rule_keys
  present in the validated `defender_merit_ids`), not by iterating the submitted id list — this
  means a duplicated id in the request body can never double-count a bonus, without needing a
  separate anti-duplication check.
- No new indexes, no schema changes, no client-side files touched, matching this story's own "What
  this story is NOT" section exactly.

**Prove-discrimination (two load-bearing patches, each reverted alone and restored):**
- Changed `pool += 2` to `pool += 3`: 3 tests failed (the direct +2 assertion, the re-resolve
  idempotency total, and — transitively — nothing else, since the "never re-checks WP" and "only
  strict boolean true" tests don't spend WP). Reverted, suite green again.
- Disabled the `currentWp <= 0` guard (`if (false)`): exactly 1 test failed (the 409-on-zero-WP
  case), and its own assertion that no `defender_pool` gets written on refusal would have caught a
  silent-success variant too. Reverted, suite green again.

**Test results:**
- New suite: `server/tests/crd-3a-resolve-endpoint.test.js`, 24/24 passing (confirmed real MongoDB,
  not skipped).
- Changed-area regression: `crd-1-contested-roll-request-shape.test.js` (42),
  `crd-2-pending-queue.test.js` (59), `crd-3a-resolve-endpoint.test.js` (24),
  `api-tracker-state.test.js` (8), `oaq-2-pending-status-actions.test.js`,
  `oaq-3-approval-queue.test.js` — 172/172 on a clean re-run. One transient timeout in crd-2's own
  `no other client module still references it` filesystem-walk test on the first combined run,
  reproduced as a pass-in-isolation and a pass on immediate re-run under the same combined set —
  a pre-existing parallel-load timing flake in a synchronous `fs.readdirSync` walk, not a regression
  from this story's changes (which touch no client file at all).

### File List

- `server/routes/contested-rolls.js` (modified — new `PUT /:id/resolve` route + three small helpers)
- `server/tests/crd-3a-resolve-endpoint.test.js` (new)

## Senior Developer Review

**Round: EXTERNAL Codex CLI review (3-pass blinded adversarial protocol, `codex exec` piped
directly, `model_reasoning_effort=high`), 2026-08-23.** Findings persisted unedited at
`specs/stories/code-review/crd-3a-codex-findings.md`. **No High findings** — every finding it
raised landed as Medium or Low, but several Mediums were genuine, literal AC violations that this
story's own dev pass missed.

### Independent verification before any patch was written

- **The prototype-key aspect bypass (`toString`/`constructor`/`__proto__` truthy on `ASPECT_ATTR`)
  was reproduced with a standalone Node one-liner**, no DB needed: `Boolean(m['toString'])` etc. all
  print `true` against a plain `{mental:...}` object. Real, and independent of any environment issue.
- **The "claimed real-Mongo green gates... unverifiable" finding was checked by re-running the exact
  six-file gate locally, right now.** It reproduced 172/172 exactly, matching the record. Codex's own
  sandbox could not reach MongoDB at all (`EACCES` to the configured host) — the same class of
  reviewer-sandbox limitation crd-1's and crd-2's own reviews hit on port 27017. **Dismissed as a
  finding about the record; the record's numbers stand.**
- **The `api-tracker-state.test.js` count was re-run and genuinely corrected**: 8 tests, not the
  Dev Agent Record's claimed 9. Bookkeeping-only; the six-file total of 172/182 (pre/post-patch) is
  unaffected.
- **Whether `/accept`, `/decline`, `/void` share this route's TOCTOU shape (check-then-blind-write,
  no `status` re-check in the final `updateOne` filter) was read directly** — they do, identically,
  and unmodified by this story. This is a pre-existing pattern across the whole file, not something
  crd.3a introduced or made worse. **Deferred, not patched** — see below.

### Patches applied (5), each prove-discriminated ALONE

Every patch was reverted on its own, the exact expected test(s) confirmed to fail, then restored and
re-confirmed green. Never combined.

1. **Prototype-key aspect bypass.** `ASPECT_ATTR[defender_aspect]` was indexed and truthy-checked
   directly — `Object.prototype` keys (`toString`, `constructor`, `__proto__`, `hasOwnProperty`)
   resolve truthily on any plain object, so each one passed the 400 guard, computed a bogus
   attribute (silently `0`), and persisted an off-enum `defender_aspect`. Fixed with an explicit
   `ASPECT_KEYS.includes(defender_aspect)` allowlist check before `ASPECT_ATTR` is ever indexed.
   *Revert-alone: exactly the 4 new prototype-key tests fail (30/34 passed).*
2. **AC9's literal wording was violated.** A non-boolean `defender_wp_spent` (e.g. the string
   `"true"`) was silently coerced to `false` and accepted with 200 — AC9 says "do not accept
   `defender_wp_spent` as anything other than a boolean." This route has no `validate()` middleware
   (POST-only), so nothing else was enforcing it. Fixed with an explicit `typeof` check, 400 on
   anything present but non-boolean; `undefined` (omitted) still means "not spending," unchanged.
   The pre-existing test that had locked in the old coercion was rewritten to assert the correct
   400. *Revert-alone: exactly 1 test fails (33/34 passed).*
3. **A `tracker_state` document that exists but omits `willpower` defeated the live-positive check.**
   `trackerDoc ? trackerDoc.willpower : max` read `undefined` off a real, partial document (the
   collection's own PUT route is an unvalidated partial upsert), and `undefined <= 0` is `false` — so
   the check silently passed regardless of the character's real Willpower. Fixed by falling through
   to the live max on a missing FIELD, not just a missing DOCUMENT: `trackerDoc?.willpower ??
   _willpowerMax(character)` (`??`, not `||`, so a genuine `willpower: 0` is still preserved
   correctly). *Revert-alone: exactly 1 test fails (33/34 passed).*
4. **Two character merit rows sharing one `rule_key` double-counted the bonus.** The bonus loop
   walked every character merit row and checked membership in the resolved id list — the character
   schema has no `uniqueItems`/cross-row `rule_key` constraint, and nothing in the write path
   deduplicates by key, so a data anomaly (two `indomitable` rows) added `+2` twice. Fixed by
   iterating the (already deduplicated) resolved rule_keys and looking up ONE merit per key via
   `.find()`, so each resolved key can only ever contribute once regardless of how many character
   rows share it. *Revert-alone: exactly 1 test fails (33/34 passed).*
5. **No clamp to the collection's own declared 0-30 pool domain.** `attrObj.bonus` and
   `merit.rating` both have NO declared maximum in `character.schema.js` — only `dots` is capped at
   10 — so a schema-valid character (e.g. a large ST-granted stat bonus) could drive the computed
   total past 30 through this route, which has no `validate()` middleware to catch it. Fixed with a
   defensive `pool = Math.max(0, Math.min(30, pool))` immediately before the write.
   *Revert-alone: exactly 1 test fails, at the hand-computed unclamped value of 47 (33/34 passed).*

### Deferred, not patched (1)

- **The TOCTOU race between `/resolve` and `/accept`/`/decline`/`/void`** (each reads the challenge,
  then writes filtered on `_id` alone with no re-check that `status` is still what was read) is
  **pre-existing across all four verbs in this file**, unmodified by crd.1 or crd.2 either — not
  something this story introduced or made worse. Fixing it correctly means adding a `status`-scoped
  filter (or equivalent) to every one of these four `updateOne` calls uniformly, which is real,
  scoped, cross-cutting work belonging to its own story, not a one-off patch to `/resolve` alone
  while leaving `/accept`/`/decline`/`/void` inconsistent. Logged to `deferred-work.md`.

### Dismissed, with evidence (2)

- **"Awaited database failures have no local error translation."** True, but Codex's own Pass 2
  investigation concluded this matches every other route in the file (`/accept`, `/decline`, `/void`
  all lack local `try/catch` around their own `await`s too) and relies on Express 5.2.1's built-in
  async-handler rejection catching — established application-wide convention, not a crd.3a-specific
  defect.
- **"Claimed real-Mongo green gates and mutation failure counts are unverifiable in this review
  environment."** Re-run locally, right now, in this session: 172/172 (pre-patch) and 182/182
  (post-patch) both reproduce exactly. The reviewer's own sandbox denied network access to MongoDB
  entirely (`EACCES`), the same reviewer-sandbox limitation already documented in crd-1's and crd-2's
  own external reviews — not a defect in the record.

### Corrected record

- `api-tracker-state.test.js` genuinely has 8 tests, not 9 as originally recorded (typo; the overall
  six-file total was and remains correct).

### Test results after patching

- crd-3a suite: 24 → 34 passing (10 new tests: the 4 prototype-key cases, the empty-body case, the
  new `status_action`-exclusion case, the corrected non-boolean-`defender_wp_spent` case, the
  partial-tracker-doc case, the duplicate-merit-row case, the pool-clamp case).
- Six-file changed-area regression: 172 → 182 passing, 0 failed, on a clean run.
- All 5 patches prove-discriminated individually as above.

**Status: `review` → `done`.** NOT committed, NOT pushed, NOT merged.

## Change Log

| Date | Change |
|------|--------|
| 2026-08-23 | **CODE REVIEW CLOSED, `review` -> `done`.** External Codex CLI review (3-pass blinded adversarial protocol, `codex exec` piped directly with `model_reasoning_effort=high`), no High findings. Every finding independently re-verified before any patch (a standalone Node probe reproduced the prototype-key bypass with no DB needed; a fresh local six-file run reproduced 172/172 exactly, settling the reviewer's own "unverifiable" claim as its sandbox losing MongoDB network access, the same pattern crd-1/crd-2's reviews hit). FIVE PATCHES, each prove-discriminated ALONE: (1) `ASPECT_ATTR[defender_aspect]`'s truthy lookup accepted inherited `Object.prototype` keys (`toString`/`constructor`/`__proto__`) as valid aspects — fixed with an explicit `ASPECT_KEYS.includes()` allowlist before indexing (revert-alone: 4 failed/30 passed). (2) A non-boolean `defender_wp_spent` was silently coerced to `false` and accepted, violating AC9's literal wording — fixed with an explicit `typeof` check, 400 on anything present but non-boolean (revert-alone: 1 failed/33 passed). (3) A `tracker_state` document existing but omitting `willpower` defeated the live-positive check (`undefined <= 0` is `false`) — fixed by falling through to the live max on a missing FIELD via `??`, not just a missing document (revert-alone: 1 failed/33 passed). (4) Two character merit rows sharing one `rule_key` (a data anomaly no schema prevents) double-counted the bonus — fixed by looking up ONE merit per resolved key via `.find()` instead of walking every character row (revert-alone: 1 failed/33 passed). (5) No clamp to the collection's own declared 0-30 `defender_pool` domain — `attrObj.bonus` and `merit.rating` both have no declared maximum, so a schema-valid character could drive the pool past 30 through this route's own `validate()`-free write path — fixed with a defensive `Math.max(0, Math.min(30, pool))` (revert-alone: 1 failed at the hand-computed unclamped value of 47, 33/34 passed). ONE FINDING DEFERRED to `deferred-work.md`: the TOCTOU race between `/resolve` and `/accept`/`/decline`/`/void` (no `status` re-check in any of the four routes' final `updateOne` filters) is pre-existing across the whole file, not introduced or worsened by this story — fixing it correctly means touching all four routes uniformly, which is its own scoped story. TWO FINDINGS DISMISSED WITH EVIDENCE: the lack of local try/catch around awaited DB calls matches every other route in the file (established convention, not a crd.3a defect); the "unverifiable gates" finding, settled by the fresh local re-run above. ONE BOOKKEEPING CORRECTION: `api-tracker-state.test.js` genuinely has 8 tests, not the originally-recorded 9 (six-file total unaffected). crd-3a suite 24 -> 34 (10 new tests); six-file changed-area regression 172 -> 182, 0 failed. NOT committed, NOT pushed, NOT merged. Prior entry follows. |
| 2026-08-22 | `bmad-dev-story`: all 7 tasks implemented, `ready-for-dev` -> `review`. New `PUT /:id/resolve` route on `contested-rolls.js`, reusing `_findChallenge` for the 404/409 guards and the same ownership-check shape as `/accept`/`/decline`. Deliberately avoided importing the client-side `getAttrEffective`/`calcWillpowerMax` accessors (confirmed browser-coupled via the bloodlines/rule-engine caches) in favour of two tiny local `dots + bonus` helpers. Live Willpower re-check reads `tracker_state` directly — the first server route to do so, mirroring `tracker.js`'s own dual-form `character_id` filter; no `tracker_state` document defaults to full (undamaged) Willpower, matching the client's own `defaults()` fallback. Merit bonuses are summed by walking the character's OWN `merits[]`, not the submitted id list, so a duplicated id can never double-count. One defensive addition beyond the story's own ACs: an off-enum `defender_aspect` gets 400 rather than silently producing a `NaN`/`0` pool. New suite 24/24; changed-area regression across crd-1/crd-2/crd-3a/tracker-state/oaq-2/oaq-3 172/172 on a clean re-run (one transient parallel-load timeout in crd-2's own filesystem-walk test, confirmed pre-existing and unrelated). Two load-bearing patches (the +2 bonus, the WP<=0 guard) prove-discriminated individually. NOT committed, NOT pushed, NOT merged. |
| 2026-08-22 | Story created (`bmad-create-story`), `backlog` -> `ready-for-dev`. |
