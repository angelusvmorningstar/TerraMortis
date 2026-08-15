# Story xpl.1: XP ledger — write hook + ST read view

Status: done

## Story

As a Storyteller running Terra Mortis,
I want every XP-affecting write to a character's sheet to leave a dated, attributable record,
so that a correction like the Majesty-4 incident (a downtime-purchased dot that silently failed to
write, patched by hand with no trace anywhere) is never invisible again.

## Why this story exists

A player's downtime-purchased merit dot (Majesty 4) silently failed to write during downtime
processing; the player noticed the discrepancy and DM'd the ST directly, who manually patched the
sheet with zero trace anywhere of what changed, when, or why. Angelus named the underlying gap
directly: TM Suite has no register of XP expenditure, only a live derived total. Scoped via
`bmad-party-mode` (Dana/Winston/John/Sally/Quinn, 2026-08-15), then verified against real code and
live data via `bmad-data-lock` the same day — full findings in `D:\Terra Mortis\data-map.md`'s TM
Suite section. Two of the party-mode design's working assumptions were corrected by that
verification pass before this story was written (see Dev Notes — both matter to how this story is
built).

## What this story is NOT

- NOT a change to how `xpEarned()`/`xpSpent()`/`xpLeft()` are computed (`public/js/editor/xp.js`).
  Those stay fully derived from the live `.xp` fields exactly as today — the ledger is a parallel
  audit trail alongside the total, never a new source of truth for it.
- NOT covering `bp_creation.xp` (Blood Potency), `humanity_xp`, or `xp_log.spent.willpower`/
  `.special`. Those are real XP-spend categories (see `xpSpentSpecial()`) but sit outside the four
  trait-object categories (`attributes`/`skills`/`disciplines`/`merits`) this story's incident and
  design scope named explicitly. A future story can extend the same hook to them if wanted.
- NOT a change to the four client-side editor mutators (`shEditAttrPt`/`shEditSkillPt`/
  `shEditDiscPt`/`shEditMeritPt` in `public/js/editor/edit.js`) or to the downtime form's
  `project_N_xp_rows`/`responses.xp_spend` fields. Both stay exactly as they are.
- NOT a player-facing surface of any kind. No new tab, no player-visible history, no link from the
  downtime form into a ledger entry — all named by Angelus as later, uncommitted ideas.
- NOT historic reconciliation (backfilling ledger rows for DT1-DT6's already-happened purchases).
  That is Epic XPL's own Story 2 (`xpl.2`, backlog), deliberately sequenced after this one lands.
- NOT a transactional guarantee between the character write and the ledger write. See Dev Notes —
  Design Decisions for the reasoning; a missed ledger row on rare failure is an accepted risk for
  this story, not a defect to solve here.

## Acceptance Criteria

1. A new `xp_ledger` collection (schema: `server/schemas/xp_ledger.schema.js`) stores one document
   per detected per-trait XP delta. Required fields: `character_id` (ObjectId), `category` (enum:
   `attribute` | `skill` | `discipline` | `merit`), `trait_name` (string — the attribute/skill/
   discipline name, or the merit's `name`), `delta` (integer, non-zero), `new_total` (integer, the
   resulting `.xp` value), `at` (ISO date string), `st_username` (string, from `req.user.username`).
   Optional: `reason` (string).
2. `reason` is REQUIRED (400 if absent/blank) on a `PUT /api/characters/:id` request whose body
   includes a top-level `xp_ledger_reason` string — this is how the ST-editor UI marks "this save is
   an ad-hoc correction, not a downtime-driven purchase" (see AC5). When `xp_ledger_reason` is
   absent, any ledger rows created by that save have `reason` omitted.
3. `PUT /api/characters/:id` (`server/routes/characters.js:448`), for a request whose body includes
   any of `attributes`/`skills`/`disciplines`/`merits`, fetches the character's PRE-UPDATE `.xp`
   state for exactly those four categories (extending the existing pre-fetch pattern at line 497),
   diffs each trait's `.xp` in the incoming body against its pre-update value, and inserts one
   `xp_ledger` row per trait whose `.xp` changed (zero-delta traits produce no row). Merits are
   matched old-vs-new by `.name` (see Dev Notes — Design Decisions for the known limitation on
   duplicate-named merits).
4. The ledger insert happens AFTER the character document write succeeds (`findOneAndUpdate` at
   line 503-507 returns a non-null result) and does not block or fail the character save if the
   ledger insert itself errors — the response and status code for the character PUT are unaffected
   either way; a ledger-insert failure is logged server-side, not surfaced to the client.
5. New `GET /api/characters/:id/xp_ledger` (ST-only, same `requireRole('st')` as the PUT route)
   returns that character's ledger rows sorted newest-first.
6. The admin sheet editor's existing XP breakdown (`.sh-xp-breakdown`, `public/js/editor/sheet.js`
   around line 3149, inside `renderSheet`'s `editMode` branch) gains a plain, read-only history list
   below the breakdown table: date, category, trait name, delta (signed), and reason if present.
   Follows the established reserve-a-slot-then-patch-async pattern this file already documents for
   the exact same shape of problem (`shRenderOfficeMerits`/`patchOfficeMerits`, lines 1756-1815) —
   do not invent a new async-render idiom.
7. No regression to the existing `PUT /api/characters/:id` behaviour for requests that touch none of
   the four trait categories (e.g. a name-only edit) — no ledger rows, no new required fields, no
   change to response shape or status codes.
8. Real behavioural test coverage: the diff-and-insert logic (unit-level against the pure diff
   function) and at least one live HTTP round-trip proving a real attribute-dot purchase produces
   exactly one ledger row with the correct delta — not source-text/regex contract assertions alone.

## Tasks / Subtasks

- [x] Task 1 — `xp_ledger` schema + collection (AC: 1)
  - [x] `server/schemas/xp_ledger.schema.js`, following `office_action.schema.js`'s minimal shape
        (`type: 'object'`, `required`, `additionalProperties: false`, flat `properties`).
  - [x] No new route file or router mount needed — both new endpoints live in `characters.js`
        (Task 2/3), matching how `GET /:id/cascade-preview` already sits alongside the PUT handler.
- [x] Task 2 — Diff-and-insert hook inside the PUT handler (AC: 2, 3, 4, 7)
  - [x] Write a pure, exported, unit-testable diff function (e.g. `diffXpLedgerRows(before, after)`
        in a small new module, NOT inlined in the route — needed for Task 5's unit coverage without
        a live DB) that takes the pre-fetch document's `attributes`/`skills`/`disciplines`/`merits`
        and the incoming `updates` object, and returns the array of ledger rows to insert.
  - [x] Attribute/skill/discipline diff: for each key present in `updates.<category>`, compare
        `updates.<category>[key].xp` against `existing.<category>?.[key]?.xp ?? 0`; non-zero
        difference → one row (`category`, `trait_name` = key, `delta`, `new_total`).
  - [x] Merit diff: match `updates.merits[]` to `existing.merits[]` by `.name` (exact, case-sensitive);
        for each matched pair, same non-zero-`.xp`-difference rule; a merit present in `updates` but
        absent from `existing` (freshly added this save) diffs against an implicit 0.
  - [x] In the route: only run the pre-fetch + diff when the incoming body has at least one of
        `attributes`/`skills`/`disciplines`/`merits` (AC7 — a name-only edit does no extra work).
        Pre-fetch via `col().findOne({_id: oid}, {projection: {attributes:1, skills:1,
        disciplines:1, merits:1}})`, mirroring the existing touchstones pre-fetch's shape
        (`characters.js:497`) but its own projection.
  - [x] `reason` handling (AC2): read `req.body.xp_ledger_reason` (do NOT let it flow into
        `updates` and get `$set` onto the character document — strip it before the `{_id, willpower,
        ...updates}` destructure, or destructure it out explicitly alongside `_id`/`willpower`).
        400 if the diff produces at least one row AND `xp_ledger_reason` was sent as an empty/
        whitespace string (present-but-blank is treated as a mistake, not "no reason given"). Absent
        entirely is valid (rows insert with no `reason` field). **DEVIATION, found during dev**:
        `xp_ledger_reason` cannot be destructured from `req.body` inside the handler and stay valid —
        `validateCharacterPartial` (middleware, runs BEFORE the handler) rejects it as an unknown
        property under the character schema's `additionalProperties: false` root, 400ing before the
        handler is ever reached. Fixed by extending `stripEphemeral` (which already runs first in the
        middleware chain, before validation) to pull `xp_ledger_reason` off `req.body` onto
        `req.xpLedgerReason`, same as its existing `_`-prefix stripping. The handler reads
        `req.xpLedgerReason` instead of destructuring the body. Caught by the integration test
        itself (red before the fix, green after) — see Debug Log References.
  - [x] After `findOneAndUpdate` returns non-null (line 509's existing null-check), call the ledger
        insert in a `try/catch` that only logs on failure — never throws past the response send.
- [x] Task 3 — `GET /:id/xp_ledger` read route (AC: 5)
  - [x] `requireRole('st')`, sorts by `at` descending, no pagination needed at current data volumes
        (single-character history, not the whole collection).
- [x] Task 4 — Admin sheet editor read view (AC: 6)
  - [x] New small module or a function added to `sheet.js` alongside `shRenderOfficeMerits`/
        `patchOfficeMerits` — same shape: a synchronous placeholder slot written into the
        `.sh-xp-breakdown` block, an un-awaited async patch function called right after, its own
        module-scoped generation counter to guard a stale response race (mirrors `_officeMeritsGen`
        exactly, per this file's own documented convention). DEVIATION: unlike `patchOfficeMerits`,
        `patchXpLedger` DOES render a "Could not load" state on fetch failure rather than staying
        silently empty — this is ST-facing audit tooling, not player-facing content, so a load
        failure is worth surfacing rather than hiding (documented in the function's own comment).
  - [x] Plain list, no editing affordance — matches this story's own "not a player-facing surface,
        not a new interaction model" scope; reuse existing typography/table classes already used by
        `.sh-xp-breakdown`'s table (reused the class itself, plus the pre-existing `.sh-track-empty`
        muted-text class for the empty/failure states), no new bare styling and no new CSS file
        edits needed at all.
- [x] Task 5 — Tests (AC: 8)
  - [x] `server/tests/xpl-1-xp-ledger-diff.test.js` (unit, 10 tests) + `server/tests/
        xpl-1-xp-ledger-api.test.js` (live integration, 7 tests) — split per the
        `otc-2-city-status-calc.test.js` / `otc-2-office-actions-api.test.js` precedent. Unit suite
        covers every case the task lists: single attribute/skill/discipline/merit delta, a
        brand-new merit, a zero-delta no-op, an untouched trait with no prior xp, multiple
        simultaneous deltas across categories, a missing "before" document, and a body with none of
        the four trait keys present.
  - [x] Live HTTP integration tests via `server/tests/helpers/test-app.js` (already mounts
        `charactersRouter` — verified before assuming, no change needed there): a real attribute-xp
        purchase produces exactly one ledger row with the correct delta; a second purchase on the
        same trait produces a row for the DELTA only, not the new total; a reason persists onto the
        row and never round-trips onto the character document; a blank `xp_ledger_reason` on a real
        delta gets 400 AND the character document is confirmed unwritten (validation runs before the
        write); `GET /:id/xp_ledger` returns rows newest-first; the GET route is confirmed ST-only
        (403 for `playerUser()`).
  - [x] Regression: a name-only `PUT` inserts zero ledger rows (`AC7`, count-before/count-after
        assertion, not just "no error").
- [x] Task 6 — Full changed-area regression (AC: 7)
  - [x] Ran the two new suites plus every existing suite that PUTs to `/api/characters/:id`
        (`equipment.test.js`, `api-touchstone-edges.test.js`, `n5-trap-door-anchor.test.js`,
        `n4-white-ants-territory.test.js`, `api-characters-crud.test.js`) and the POST-heavy
        `oath-b-d6-api-roundtrip.test.js` (exercises the same `stripEphemeral` → validation chain
        Task 2's fix touches). 128/128 passing across 8 files, zero regressions.

## Dev Notes

### Design Decisions (read before Task 2)

- **Every save round-trips the WHOLE trait objects, not a per-field patch.** `buildSaveBody(c)`
  (`public/js/admin.js:964-991`) serialises essentially every top-level field on the in-memory
  character — including the FULL `attributes`/`skills`/`disciplines`/`merits` objects — on every
  single "Save to DB," whether or not a given trait actually changed. This means the diff MUST
  compare the incoming full objects against the pre-fetched existing document (Task 2's approach),
  not assume the PUT body only carries what changed. Confirmed by reading the function directly,
  not assumed from its name.
- **Why no transaction (What this story is NOT, last bullet):** the character write is the
  operation players and the ST actually depend on; the ledger is an audit trail. Blocking or rolling
  back a real sheet save because a secondary audit insert failed would be worse than an occasional
  missed ledger row — same risk trade-off this project already accepts elsewhere for
  best-effort logging. AC4 makes this explicit and testable (character write succeeds regardless of
  ledger outcome).
- **Why `reason` is conditionally required, not always required:** every write today is ST-authored
  (players never self-edit — `requireRole('st')` on the route is the enforcement), so there is no
  way to structurally distinguish "this was a downtime-driven purchase the ST is transcribing" from
  "this is an ad-hoc correction" other than asking the ST to say so for the latter. Making `reason`
  unconditionally required would force busywork on the common case (routine downtime processing);
  making it always optional would repeat the Majesty-4 problem (a correction with no trace of why).
  AC2's `xp_ledger_reason` flag is the ST editor's own signal for which case this save is — Task 4's
  UI work is expected to surface a simple "this is a correction, not from a submission" checkbox or
  equivalent that sets it, though the exact UI affordance is left to the dev agent's judgement within
  this story's minimal-UI scope.
- **Merit matching by `.name` is a known, accepted limitation.** Merits have no stable per-entry id
  (Known Drift Pattern #11 in `data-map.md` — positional identifiers mistaken for stable ones
  applies here too, one level removed: name is more stable than array position, but still not a
  true id). If one character somehow holds two merit entries with the identical `.name`, a diff
  could misattribute which one changed. Accepted for this story because the triggering incident
  (Majesty, a Status merit) is realistically unique per character; flag in code with a short comment
  rather than solving generally.

### Current state of the files this story touches

**`server/routes/characters.js`**: `PUT /:id` (line 448) already has ordering:
`requireRole('st')` → `stripEphemeral` → `validateCharacterPartial` → `normalizeMeritsMiddleware` →
`validateWhiteAntsTerritoriesMiddleware` → `validateTrapDoorAnchorMiddleware` → handler. Handler
destructures `const { _id, willpower, ...updates } = req.body;` (line 452), does equipment
hydration (458-493) and a touchstones-only pre-fetch+validate (496-501) BEFORE the write, then
`findOneAndUpdate({_id: oid}, {$set: updates}, {returnDocument: 'after'})` (503-507), 404s if null,
else `res.json(result)` (510). This story's pre-fetch (Task 2) sits alongside the existing
touchstones one — same file region, same `col().findOne` idiom, different projection. The ledger
insert sits after line 509's null-check, before `res.json(result)`.

**`public/js/editor/xp.js`**: `sumInlineXP(obj)` (line 82) is the existing reader pattern for "sum
`.xp` across all keys of an attributes/skills/disciplines-shaped object" — useful reference for
Task 2's diff function shape, though the diff needs per-key deltas, not just a sum.
`xpSpentMerits(c)` (line 121) confirms merits carry `.xp` directly on each array entry (`m.xp`), not
nested.

**`public/js/editor/edit.js`**: `shEditAttrPt` (547), `shEditDiscPt` (619), `shEditSkillPt` (710),
`shEditMeritPt` (991) are the four client-side mutators that produce the eventual PUT body — READ
for context, NOT modified by this story. Each sets its trait's `.xp` as an absolute value (not an
increment), confirming the route-side diff (new value vs pre-fetch value) is the correct mechanism,
not an attempt to intercept a delta client-side.

**`public/js/editor/sheet.js`**: `renderSheet(c, target)` (line 3116) is the function this story's
Task 4 extends. The existing XP breakdown table (`.sh-xp-breakdown`, line 3149) is built
synchronously from `c` (no fetch) inside `if (editMode)`. Lines 1756-1815 already document, in
detail, the exact async-slot-then-patch pattern this story's history list should follow
(`shRenderOfficeMerits`/`patchOfficeMerits`, built for oxp.7's read-only Office Merits section — a
structurally identical problem: render a placeholder synchronously, fill it from an API call the
synchronous render pass can't await). Reuse the pattern, including its module-scoped generation
counter for stale-response safety, not the `office-tab.js` per-element counter variant (this file's
own comment explains why: no single stable root element here, since the sheet re-renders for
different characters into different containers).

**`server/schemas/office_action.schema.js`**: the schema-shape exemplar to follow — flat,
`additionalProperties: false`, no nested validation library beyond this project's existing
`validate(schema)` middleware (`server/routes/office-actions.js:5,149` shows the import + usage
pattern, though this story's own writes are NOT going through a POST route with `validate()` — the
ledger insert is a direct `insertOne`/`insertMany` inside the existing PUT handler, so the schema
exists for documentation/future-validation value, not as route middleware).

### Testing standards summary

- vitest, `cd server && npx vitest run tests/<name>.test.js`. Suites are forced onto
  `tm_suite_test` via the vitest setup file — never live data.
- Follow the `otc-2-office-actions-api.test.js` precedent for live-app integration tests
  (`server/tests/helpers/test-app.js`) — mount `charactersRouter` if not already mounted there
  (check first; `characters.js` is a foundational route, likely already mounted, unlike
  `office-actions.js` which needed adding in otc.2).
- Known pre-existing failures (not this story's concern), per `CLAUDE.md`: the allocator-readers
  source-window assertion (#1115), `epic.708.3-cycle-phase-controls.test.js`,
  `oath-a-pledge-helpers.test.js`, `issue-836-legacy-tracker-cache-removed.test.js`,
  `issue-1013-indomitable-rules-text.test.js`, `desktop-and-css.spec.js` (12),
  `post-game-1.spec.js` nav-1-3 (3).

### Project Structure Notes

- New files: `server/schemas/xp_ledger.schema.js`, a small pure diff module (exact path/name at the
  dev agent's discretion — suggest `server/lib/xp-ledger-diff.js`, mirroring `server/lib/
  office-seat-resolve.js`'s placement convention for a small shared-logic helper), `server/tests/
  xpl-1-xp-ledger.test.js` (or split per Task 5).
- Modified files: `server/routes/characters.js` (pre-fetch + diff + insert in PUT, new GET route),
  `public/js/editor/sheet.js` (read view), possibly `server/tests/helpers/test-app.js` if
  `charactersRouter` needs mounting (verify before assuming).
- British English throughout, no em-dashes in any player-facing string (project hard rule) — the
  history list's UI text falls under this.

### References

- [Source: server/routes/characters.js#L448-511] — the PUT handler this story's hook lives inside.
- [Source: public/js/admin.js#L964-991] — `buildSaveBody`, confirms full-object round-trip on every
  save.
- [Source: public/js/editor/xp.js#L77-197] — `xpEarned`/`xpSpent`/category breakdown functions;
  confirms the real inline-`.xp` shape (not `attr_creation`/etc — `CLAUDE.md`'s own XP section is
  stale on this point, per the data-lock).
- [Source: public/js/editor/edit.js#L547,619,710,991] — the four client mutators, read-only context.
- [Source: public/js/editor/sheet.js#L1756-1815,3116,3149] — `renderSheet`, the existing XP
  breakdown, and the async-slot-then-patch precedent to reuse.
- [Source: server/schemas/office_action.schema.js] — schema-shape exemplar.
- [Source: server/routes/office-actions.js#L304,398] — `req.user.username` as the established
  "acting ST identity" field, reused here for `st_username`.
- [Source: D:\Terra Mortis\data-map.md — TM Suite section, 2026-08-15 entries] — full data-lock
  findings this story is built against: the real XP-spend shape, the confirmed absence of any
  pre-existing ledger, the single real write choke point, and the correction of the party-mode
  panel's two-write-path and DT5-unreconcilable assumptions.
- [Source: specs/epic-xpl-xp-ledger.md] — parent epic.
- [Source: 2026-08-15 party-mode roundtable] — Dana/Winston/John/Sally/Quinn's original design; John's
  sequencing recommendation (ledger before reconciliation) shaped the epic's own story order.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- The "reason persists on the row" integration test failed red on the first run: 400
  `VALIDATION_ERROR`, `"must NOT have additional properties", "property":"xp_ledger_reason"`.
  Root-caused by reading the actual error body (not assumed) — `validateCharacterPartial` runs
  BEFORE the PUT handler and the character schema's `additionalProperties: false` root rejects any
  key it doesn't declare, including a body-level `xp_ledger_reason` the handler hadn't destructured
  out yet at that point in the middleware chain. Fixed by moving the strip into `stripEphemeral`
  (which already runs first, before validation) rather than the handler's own destructure. Confirmed
  green after the fix, same test, no other changes.
- A second failure (`GET /:id/xp_ledger` expected ≥3 rows, got 2) was a knock-on of the first — the
  failed reason-test never persisted its row. Resolved automatically once the root cause above was
  fixed; not a separate defect.
- Verified `stripEphemeral`'s change doesn't affect any other route: it is characters-route-local
  (declared in `characters.js`, not a shared middleware module), so the fix's blast radius is
  provably contained to this one file.

### Completion Notes List

- All 8 ACs implemented and covered by real, passing tests (17 new: 10 unit + 7 live-integration).
- One real implementation bug found and fixed during dev (see Debug Log References) — caught by the
  integration test itself, prove-discriminated by the same test going red then green around the
  single fix.
- Confirmed live (via the test suite, not assumed): every save that touches
  `attributes`/`skills`/`disciplines`/`merits` diffs against a fresh pre-fetch, not the incoming
  body alone — a second PUT changing `Strength.xp` from 4 to 6 correctly logs a `delta: 2` row
  against the already-updated total, not a fresh `delta: 6` against zero.
- `xp_ledger` did not exist as a collection before this story; MongoDB auto-created it on the first
  `insertMany` in the live integration test, exactly as expected — no manual collection-creation
  step was needed or added.
- Live `tm_suite` (production) was never touched — every test ran forced onto `tm_suite_test` via
  the existing vitest setup file, verified by the same chain this project's other stories already
  cite (`vitest.config` setupFiles → `setup-env.js` → `assertTestDbSafety`).
- Task 4's UI (the admin sheet editor's XP History section) was implemented and code-reviewed by
  reading against the established `patchOfficeMerits` pattern exactly, but has NOT been visually
  verified in a browser this session — Angelus cannot run the app locally (`CLAUDE.md`), and this
  story's own scope did not call for a Playwright spec (Task 5 covers AC8 with server-side tests
  only, matching the story's own test-plan wording). Flag for a deployed-environment look before
  calling this AC fully closed in review, not just code-reviewed.

### File List

- `server/schemas/xp_ledger.schema.js` — NEW. Schema shape (documentation/future-validation value;
  not wired as route middleware since the insert is a direct `insertMany`, not a validated POST).
- `server/lib/xp-ledger-diff.js` — NEW. Pure `diffXpLedgerRows(before, after)`, no I/O.
- `server/routes/characters.js` — MODIFIED. `stripEphemeral` now also pulls `xp_ledger_reason` onto
  `req.xpLedgerReason`; the `PUT /:id` handler pre-fetches attributes/skills/disciplines/merits when
  any are present in the body, diffs via `diffXpLedgerRows`, 400s on a blank reason with a real
  delta, and best-effort-inserts ledger rows after a successful character write. New `GET
  /:id/xp_ledger` route (`requireRole('st')`).
- `public/js/editor/sheet.js` — MODIFIED. New reserved placeholder inside the existing
  `.sh-xp-breakdown` edit-mode block; new exported `patchXpLedger(c)` (own module-scoped
  `_xpLedgerGen` counter) called un-awaited right after `renderSheet`'s own `el.innerHTML = h`, only
  when `editMode`.
- `server/tests/xpl-1-xp-ledger-diff.test.js` — NEW, then MODIFIED during review. 16 pure unit
  tests (10 original + 6 added during review: duplicate-merit-by-area, duplicate-merit-by-qualifier,
  three-merits-one-name, removed-attribute, removed-merit, category-absent-vs-deleted).
- `server/tests/xpl-1-xp-ledger-api.test.js` — NEW, then MODIFIED during review. 9 live integration
  tests (7 original + 2 added during review: insert-failure-does-not-block-save,
  duplicate-merit-through-real-API), plus the `afterAll` cleanup scoping fix and the removed
  misleading restore-name step.
- `public/css/components.css` — MODIFIED during review. New `.sh-xp-ledger-table` rules (fixes the
  wrong 2-column label/value styling the ledger table inherited from `.sh-xp-breakdown`).
- `public/css/admin-layout.css` — MODIFIED during review. Scoped `.cd-header-actions .sh-edit-input`
  sizing for the new XP-reason input.
- `public/js/admin.js` — MODIFIED during review. New `#cd-xp-reason` input in the character-detail
  header (shown/hidden alongside `#cd-save-api`); `saveCharToApi()` reads, sends, and clears it.

## Change Log

- 2026-08-15: Story implemented (`bmad-dev-story`). All 6 tasks / 8 ACs complete. 17 new tests,
  128/128 across the full changed-area regression (8 files). One real bug found and fixed during
  dev (see Debug Log References — `xp_ledger_reason` needed stripping before schema validation, not
  after). Status: ready-for-dev → review. Not committed, not pushed, not merged.
- 2026-08-15: Committed (`4452e617`) and code-reviewed — internal 3-layer pass (external Codex CLI
  unavailable, usage limit until 2026-08-20). See Senior Developer Review below. 2 High + 5 Medium +
  3 Low patched, 1 Medium resolved by Angelus (add the UI now) and patched, 5 items deferred, 3 Low
  dismissed with evidence. 8 new tests added during review (6 unit + 2 integration), bringing the
  suite to 25 new tests / 136 passing across the 8-file changed-area regression. All decision-needed
  and patch findings resolved, no unresolved High/Medium remaining. Status: review → done. Not
  pushed, not merged, not deployed — Angelus's call.

## Senior Developer Review (AI)

**Reviewer:** Internal — 3 layers as parallel subagents in this session (Blind Hunter / Edge Case
Hunter / Acceptance Auditor), Opus, 2026-08-15. External Codex CLI review was attempted first and
failed with a usage-limit error (retryable 2026-08-20), so this session ran the equivalent 3-pass
adversarial protocol internally instead, reusing the same hand-written, diff-specific hunt lists
prepared for the external pass. Diff reviewed: `git diff 77ba0866 4452e617` (commit `77ba0866` is an
unrelated prior commit on this branch from a different session/story and was explicitly excluded
from scope). Full raw findings: `specs/stories/code-review/xpl-1-diff.txt` (the scoped diff) and
this section (findings consolidated from all three layers' verbatim output).

### Outcome

**Two real, confirmed High-severity defects found and patched — both independently reproduced by
all three review layers, one with live-data proof against 5 of 31 real characters.** Several real
Medium/Low findings patched alongside them. One Medium is a genuine product decision, not a code
fix, and is left open for Angelus below.

### High — patched, prove-discriminated

- **[All 3 layers] Merits matched by bare `.name` fabricated and dropped ledger rows.** CONFIRMED —
  the Acceptance Auditor reproduced it directly against `data/dev-fixtures/characters.json`: on a
  no-op save, 5 of 31 real characters emitted fabricated rows (Jack Fallow, Carver, Reed Justice,
  Charlie Ballsack, Eve Lockridge), and a genuine Eve Lockridge Allies purchase produced ZERO rows —
  the exact Majesty-4 failure mode this story exists to prevent, reproduced by the code meant to
  prevent it. The story's own Dev Notes had accepted this as a narrow, low-probability limitation;
  the review found the justification itself was false (duplicate merit names, distinguished by
  `qualifier`/`area`, are the norm in this schema, not an edge case — Reed Justice alone holds three
  `Status` merits). **Fixed**: `diffXpLedgerRows` now keys merits on `name + qualifier + area`
  (`server/lib/xp-ledger-diff.js`), matching this codebase's own documented merit-identity
  convention (`character.schema.js`'s `sworn_by.attachments` comment: "Attachments reference merits
  by name + qualifier, NOT by array index"). New unit tests reproduce the exact Allies/Contacts/
  Status duplicate-name shapes from the real fixture data; a new integration test proves the fix
  through the real HTTP path. Prove-discriminated: reverted to the old `.name`-only match via
  `git stash`, 5 of 7 new unit tests failed exactly as predicted (red), restored, all 16 pass (green).
- **[Blind Hunter + Edge Case Hunter] A removed trait or merit produced no ledger row at all.** The
  original diff only iterated `after`'s keys, so a deleted merit or a trait dropped from an included
  category vanished from the character with zero audit trail — the ledger was structurally blind to
  exactly the kind of disappearing XP it exists to catch. **Fixed**: the diff now walks the UNION of
  `before`/`after` keys per category (and per merit key), so a key present in `before` but absent
  from `after` produces a negative-delta row. A category absent from the incoming body ENTIRELY is
  still correctly treated as "not part of this save," not "everything in it was deleted" — new tests
  cover both cases explicitly.

### Medium — patched

- **[Acceptance Auditor] XP History table rendered as 9px uppercase label chrome on every column.**
  Reusing `.sh-xp-breakdown`'s CSS for a 5-column data table inherited a `td:nth-child(odd/even)`
  rule written for a 2-column label/value grid — Date, Trait and Reason (the most important field)
  all rendered shouted at 9px. **Fixed**: new `.sh-xp-ledger-table` class with its own td/th rules,
  same design tokens, no odd/even split. Not visually re-verified in a browser (same constraint as
  the original dev pass — Angelus cannot run the app locally); flagged again here for the same
  deployed-environment look.
- **[Blind Hunter] `xp_ledger.schema.js` was dead code AND latently broken.** Not wired to any
  validator (a disclosed, deliberate choice per the story's own Dev Notes), but the review found
  that if it ever WERE wired up, `additionalProperties: false` with no `_id` declared would reject
  every real document, and `character_id: { type: 'object' }` is a JSON-Schema type a validator
  would never actually see satisfied (it sees the serialised form, not raw BSON). **Fixed**: matches
  `office_seat.schema.js`'s own established convention — `_id` declared, `character_id` as a 24-hex
  pattern string.
- **[Blind Hunter] `st_username` written unguarded from `req.user.username`.** No fallback if a
  session somehow carries no `username`. **Fixed**: falls back to `'unknown'` rather than writing an
  unattributed row.
- **[Blind Hunter] The "ledger insert failure never blocks the character save" guarantee was
  asserted in a comment and exercised by zero tests.** **Fixed**: new integration test mocks
  `Collection.prototype.insertMany` to throw and confirms the character PUT still returns 200 with
  the real trait change persisted, while no ledger row exists for it.
- **[Blind Hunter + Edge Case Hunter] The pre-fetch itself was unguarded — a transient read failure
  would 500 the WHOLE character save, contradicting the "ledger machinery never blocks a save"
  design intent the insert's own try/catch already honoured for the write half.** **Fixed**: wrapped
  the pre-fetch the same way; a failed pre-fetch now just means no ledger rows for that save,
  logged, not thrown.
- **[Edge Case Hunter] The XP History section sits directly under the full XP Spent breakdown with
  no scope caveat**, but only covers 4 of the 5 spend buckets `xpSpent` sums. **Fixed**: section
  title now states its scope explicitly ("XP History (Attributes / Skills / Disciplines /
  Merits)"). Full bucket coverage is a deferred follow-up, not folded into this patch.

### Medium — decision needed (Angelus) — RESOLVED, patched

- **[Acceptance Auditor + Edge Case Hunter] `xp_ledger_reason` has no writer anywhere in the real
  app.** `buildSaveBody` never sets it; Task 4 deliberately shipped a read-only list with "no editing
  affordance" per its own subtask text — which the story's OWN Dev Notes contradict elsewhere
  ("Task 4's UI work is expected to surface a simple 'this is a correction' checkbox"). Net effect:
  every ledger row the real app wrote had `reason` empty, so the one field that would distinguish a
  downtime-driven purchase from an ad-hoc ST correction (like Majesty-4) was unreachable in
  production. **Angelus's call: add a minimal UI affordance now.** Implemented: a small optional text
  input (`#cd-xp-reason`, `.sh-edit-input` styled, scoped width in `.cd-header-actions`) next to
  "Save to DB" in the admin character-detail header, shown/hidden in step with the save button
  (both edit-mode entry points — `cd-edit-toggle`'s click handler and the global `editFromSheet`).
  `saveCharToApi()` reads and trims it fresh on every save, includes it as `xp_ledger_reason` on the
  PRIMARY character's save body only (deliberately NOT on cascade partner saves — a reason belongs to
  the character whose XP the ST is annotating, not to unrelated partners re-saved for domain-sharing
  reasons), and clears the input after a successful save so it can never leak onto a later, unrelated
  save. Not visually verified in a browser (same disclosed constraint as the rest of this story's UI
  work) — flag alongside the CSS fix above for the same deployed-environment look.

### Low — patched

- **[Blind Hunter] `patchXpLedger` bumped its generation counter BEFORE its own null/`_id` guard** —
  a no-op call could cancel a legitimate in-flight fetch. **Fixed**: guard now runs first.
- **[Edge Case Hunter] `r.delta` was interpolated into the row HTML unescaped**, the one field in the
  row builder not passed through `esc()`. Not reachable via the write path in this diff (delta is
  always numeric there), but the collection has no schema enforcement, so a future writer could
  change that. **Fixed**: escaped, and a `" XP"` unit suffix added (closes a separate Low — "no unit,
  reads as dots" — as a side effect of the same edit).
- **[Acceptance Auditor + Edge Case Hunter] Test teardown deleted the WHOLE `xp_ledger` collection**
  (`{character_id: {$exists: true}}` matches every document), not just this suite's own rows; and a
  test comment claimed a name-restore step was needed "for the cleanup regex to keep matching," which
  was false — the regex already matched the renamed document. **Fixed both**: `afterAll` now scopes
  to this suite's own `character_id`, and the unnecessary restore step (with its false justification)
  was removed.
- **[Edge Case Hunter] Rows from one save share an identical `at` timestamp**, so intra-save ordering
  was unspecified and the "newest first" test could not actually detect a broken sort (ties satisfy
  `[...times].sort().reverse()` trivially). **Fixed**: added `_id: -1` as a secondary sort key on the
  GET route.

### Dismissed with evidence

- **[Edge Case Hunter, Low] "The reason-persistence test asserts on the response body, not the
  persisted document, and the outcome depends on `returnDocument`."** Checked: the route uses
  `returnDocument: 'after'`, so `res.body` IS the true persisted state — the assertion is sound as
  written. No change.
- **[Edge Case Hunter, Low] "`apiGet` is called in `sheet.js` with no import visible in the diff."**
  Checked: `apiGet` is imported at `sheet.js:46`, pre-existing (already used by `patchOfficeMerits`
  directly above the new code). Not a gap.
- **[Edge Case Hunter, Low] "The slot-emission condition and the `patchXpLedger` call are gated
  separately, and could diverge."** Checked: both are the same `editMode` local variable, captured
  once at the top of `renderSheet` — they cannot diverge within a single render call.

### Deferred (real, not blocking, logged to `deferred-work.md`)

No index on `xp_ledger.character_id` (avoided touching `server/index.js`, which carries an unrelated
uncommitted change from a concurrent session), the pre-fetch/write TOCTOU race (mirrors this route's
own pre-existing no-locking behaviour, low probability at this team's scale), partial XP-bucket
coverage (named explicitly in the UI now, full coverage is its own follow-up), non-integer `.xp`
guarding, and test order-dependence in the API suite. Full detail in `deferred-work.md`'s new entry.

### Final regression

136/136 passing across 8 files (up from 128 — 8 new tests added during review: 6 unit covering the
two High fixes' exact failure shapes, 1 integration proving the insert-failure guarantee, 1
integration proving the merit-key fix through the real HTTP path). Zero skipped, mongod genuinely
reachable. Both High-severity fixes prove-discriminated by `git stash`/re-run/`git stash pop` against
the pre-fix code.
