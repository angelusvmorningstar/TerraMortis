# Adversarial review - oxp-10 (office content -> MongoDB migration), TM Game

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/oxp-10-office-data-mongo-migration-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave the
   original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/oxp-10-office-data-mongo-migration-diff.txt` and is relative to that
  root, taken against base commit `fcf5bd2b` (parent of the reviewed commit `5c3d168e`).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/oxp-10-office-data-mongo-migration.md`, `specs/stories/sprint-status.yaml`,
  `specs/reference-data-ssot.md`, `specs/epic-oxp-office-xp-economy.md`) are excluded from it on
  purpose, so the earlier passes stay genuinely blind to the author's own account. Do not treat their
  absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This is a standalone repo (`TM Game`), not an umbrella
  workspace - you do not need to worry about sibling repos, but do not touch anything outside this
  checkout either.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- This repo needs a real local MongoDB (`mongod`) reachable for the DB-backed vitest suites to run
  rather than skip - if one is not reachable in your environment, say so plainly rather than reporting
  a skip as a pass. `server/vitest.config.js` forces every test run onto `tm_game_test`
  (`server/tests/helpers/setup-env.js`), never the live `tm_game` database - you do not need to worry
  about touching real game data.
- **Blast radius warning**: `server/tests/helpers/db-setup.js`'s `setupDb()` is called by essentially
  every DB-backed vitest suite in this repo (100+ files), not just the office-domain ones. A mistake in
  this diff's change to that one shared file could silently affect suites that have nothing to do with
  office content - if you can spare the time, a broader vitest run (not just the office-domain files)
  is worth doing in Pass 3b, not just the narrowly-scoped one.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run tests/office-merit-dots.test.js tests/oxp-1-office-seats.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/oxp-4-merit-persistence-handover.test.js tests/oxp-5-handover-logic.test.js tests/oxp-7-office-merits-empty-list-guard.test.js tests/oxp-7-sheet-office-merits-section.test.js tests/oxp-9-spend-routes-through-oaq.test.js tests/issue-1141-office-data-sync.test.js tests/issue-1141-office-tab-render.test.js tests/issue-1143-db-setup-skip.test.js`. Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oxp-10-office-data-mongo-migration-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not go
looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A migration of a Vampire: The Requiem character-manager app's "office content" (Court Position asset
names, styles, merit suites, ranked manoeuvre lists, status powers, and a flat merit-name-to-dot-cap
map) off a static JS module (`public/js/tabs/office-data.js`, deleted in this diff) into a new MongoDB
collection, `office_content`. Two document kinds share the collection, discriminated by a `kind`
field: `kind: 'office'` (one per Court Position category) and a single `kind: 'merit_caps'` singleton
document. A new public, read-only `GET /api/office_content` route serves it; a new server-side helper
(`server/lib/office-content-read.js`) and a new client-side cache module
(`public/js/data/office-content-cache.js`) are the two read paths, deliberately NOT sharing an
implementation - the server helper is session-aware (reads can participate in an active MongoDB
transaction) and uncached; the client module fetches once at boot and caches synchronously-readable
results. Four existing server routes and two existing client modules are repointed from the deleted
static import to one of these two new read paths. A new seed script
(`server/scripts/seed-office-content.js`) carries the frozen literal data and an integrity gate, but
has NOT been run against any live database as part of this diff. Several existing test files are
modified to keep working against the new data source instead of the deleted static module.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`server/routes/office-purchase.js`'s `checkPurchaseValidity` signature change.** It gained a new
   `meritCaps` parameter, inserted BEFORE the pre-existing `conflictStatus` parameter (i.e. the
   parameter list grew from 6 to 7 args, with the new one second-to-last). Find every call site in the
   diff and confirm each one passes its arguments in the correct new order - an off-by-one here would
   silently pass `meritCaps` where `conflictStatus` is expected (or vice versa), and since both are
   read only via property access / comparison, a wrong value would not necessarily throw - it could
   silently produce a wrong dot cap or a wrong HTTP status code on a real purchase-approval race.
2. **`office-purchase.js`'s accept-route transaction (the `PUT /:id/accept` handler, inside
   `dbSession.withTransaction`).** Confirm the new `getOfficeEntry(seat.office_category, { session:
   dbSession })` and `getMeritCaps({ session: dbSession })` calls are BOTH genuinely passed the active
   `dbSession`, not silently defaulting to an unscoped read. Read `server/lib/office-content-read.js`'s
   own two exported functions and confirm the `session` option is actually threaded into the
   `findOne(...)` call (not just accepted and dropped) for both. This is a financial/purchase-approval
   code path - a read that escapes the transaction's snapshot here would defeat the entire point of
   using a transaction.
3. **`server/lib/office-seat-resolve.js`'s `resolveOfficeSeat(seatId, opts)`.** It gained an `opts`
   parameter with a `session` field, threaded into two separate reads (`office_seats.findOne`, and the
   new `getOfficeEntry` call). Confirm both reads actually use it, and confirm every EXISTING call site
   in the diff that does NOT pass a session (there should be several - the merit-dots and
   manoeuvre-rank routes, and office-purchase.js's own non-transactional POST/GET handlers) still
   behaves correctly with `session` absent (i.e. `opts = {}` default, `session` undefined, and the
   downstream `session ? { session } : undefined` pattern actually tolerates `undefined` correctly
   rather than passing a literal `undefined` value somewhere MongoDB's driver would reject).
4. **`public/js/data/office-content-cache.js`'s accessors return the raw cached object, not a copy.**
   `officeEntry(category)` does `return _byCategory.get(category)` directly - no `.slice()`, no spread,
   no defensive copy. Check whether ANY consumer in this diff (`public/js/tabs/office-tab.js`,
   `public/js/editor/sheet.js`) ever mutates the object it gets back (`.push`, `.sort`, property
   assignment) - if so, that mutation would permanently corrupt the shared in-memory cache for every
   future read until the next page reload, not just the one render that mutated it.
5. **`server/tests/helpers/db-setup.js`'s `setupDb()`** now wraps a new `ensureOfficeContentSeeded()`
   call in a try/catch that only logs on failure, never rethrows. Read this function and its caller.
   Ask: under what real conditions could this silently fail in a way that leaves `office_content` EMPTY
   in the test database, while every other DB-backed test in the suite continues to run (not skip)
   against that empty collection? Would a test that actually needs real office content there (e.g. a
   PUT against a real office category) fail loudly with a clear error in that scenario, or fail
   confusingly, or - worse - silently pass for the wrong reason?
6. **`server/schemas/office_content.schema.js`'s `oneOf` at the top level**, discriminating two very
   differently-shaped documents (`officeDoc` vs `meritCapsDoc`) by a `kind` const. Ajv's `oneOf`
   requires EXACTLY one subschema to validate - check whether a document could conceivably validate
   against both (or neither) given the two `required`/`additionalProperties: false` blocks as written.
7. **`server/lib/office-content-index.js`'s two partial unique indexes** (`{category:1}` filtered to
   `kind:'office'`; `{kind:1}` filtered to `kind:'merit_caps'`). Confirm the second index's
   `partialFilterExpression` genuinely limits uniqueness to `merit_caps` documents and would NOT also
   reject a second `office` document sharing no fields with the first (i.e. that the filter is scoped
   correctly and isn't accidentally broader or narrower than intended).
8. Standard hunts: assertions/checks whose PASS condition is trivially satisfiable; a check whose label
   claims more than it tests; unhandled promise rejections; error-path resource cleanup (not just the
   happy path); dead code / unused imports left behind by the deletion of `office-data.js`; any
   self-contradiction within the diff itself.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/oxp-10-office-data-mongo-migration-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need to
understand what this change is actually plugging into. You still do **not** have the story spec or any
account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1 above - re-read it, but now verify every claim in it against the real code
rather than taking it on faith.

### What to hunt for

1. **Trace `server/scripts/seed-office-content.js`'s `seedOfficeContent()` reconciliation logic by
   hand.** Build a mental (or real) test case where the live `office_content` collection already holds
   a document for one category with a field that DIFFERS from the frozen literal, plus a genuinely
   DUPLICATE document for another category (two documents with the same `category` value), plus an
   ORPHAN document (a `kind`/`category` combination not in the frozen source at all). Walk the function
   line by line against this scenario and confirm: does `--apply` genuinely refuse to overwrite the
   DIFFERS document (never auto-clobbers)? Does it correctly refuse to proceed at all when a duplicate
   exists (the `duplicateKeys.length` check)? Is the orphan correctly reported but left untouched? Read
   the equivalent `seed-bloodlines.js` (`server/scripts/archive/seed-bloodlines.js`) reconciliation
   logic as the precedent this script claims to mirror, and check for any real behavioural divergence,
   not just a structural one.
2. **`checkIntegrity()` in the same file** - walk it against a deliberately malformed input: an
   office category not in `OFFICE_CONTENT_CATEGORY_ENUM`, a manoeuvre with an empty `effect` string, a
   `merits` array containing a merit name not present as a key in `MERIT_DOT_CAPS` (this one is
   EXPLICITLY meant to be allowed per the code's own comment - the merit is meant to default to a cap
   of 5 downstream - confirm that comment's claim is actually true end-to-end: does the client cache's
   `meritCap()` and the server helper's `getMeritCaps()` both actually apply a `|| 5` default for a
   merit name absent from the caps map, at every call site that reads a cap?), a merit_caps entry with
   a cap of `0` or a negative number or a non-integer.
3. **`office-content-cache.js`'s `_generation` counter and the "no miss registry" design decision.**
   Trace what happens if `loadOfficeContent()` is called twice in overlapping fashion (the second call
   starting before the first resolves) - does `_inFlight` sharing actually prevent the two fetches from
   racing, or could a caller that calls `loadOfficeContent()` a second time AFTER the first has already
   resolved (not concurrently) get a stale `_inFlight` promise, or double-fetch unnecessarily? Compare
   directly against `bloodlines-cache.js`'s `loadBloodlines()`/`refetchBloodlines()` pair - this new
   module has NO refetch function at all (office content in this repo is read-only, so nothing should
   ever need one) - confirm nothing in the diff's client repoints (`office-tab.js`, `editor/sheet.js`,
   `app.js`, `admin.js`) actually calls or expects a refetch capability that does not exist.
4. **`server/routes/office-content.js`'s `GET /` route has no auth middleware applied to it at all**
   (mounted unauthenticated in `server/index.js`, matching the bloodlines precedent). Confirm this is
   consistent with what the collection actually contains (no player-identifying data, no ST-only
   fields, no `notes`-equivalent field the bloodlines route explicitly projects out) - re-read
   `server/schemas/office_content.schema.js`'s full field list and confirm nothing in it should have
   been access-gated the way bloodlines' own `notes` field is.
5. **`office-tab.js`'s two `MERIT_DOT_CAPS[merit] || 5` call sites, now `meritCap(merit)`.** Read both
   call sites in full context (one is inside a synchronous render path, one is inside an async
   click-handler for a manoeuvre/merit rank step). Confirm `meritCap()` is called at a point where
   `office-content-cache.js`'s cache is guaranteed already loaded (i.e. these are reachable only after
   the app's own boot sequence has awaited `loadOfficeContent()`) - is there any code path (a very fast
   click immediately after page load, before boot's `await Promise.allSettled([...])` resolves) where
   one of these could run against an unloaded cache and get a wrong default?
6. **`server/tests/helpers/test-app.js`'s new `office_content` router mount** - confirm it uses the
   exact same `mockAuth` factory pattern as the adjacent `bloodlines` mount, and that no test in the
   diff's own modified test files accidentally relies on the office-content route being protected when
   it is not (or vice versa).
7. **Malformed input at the new route's only real "input surface":** `GET /api/office_content` takes no
   query parameters and no body - confirm there is genuinely nothing here for a malformed-input hunt to
   find, or if there is (e.g. an unbounded `find({})` with no limit on a collection that in practice
   will only ever hold ~5 documents but has no documented ceiling), note it as a Low if worth mentioning
   at all.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/oxp-10-office-data-mongo-migration-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/oxp-10-office-data-mongo-migration.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review into
   grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (in particular: no write route, no admin UI,
     anywhere in this repo - grep for any `POST`/`PATCH`/`DELETE` handler touching `office_content`).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope, and deliberate - do not flag these as gaps:**
- No write route, no admin UI, no admin CRUD screen for `office_content` anywhere in this repo. This
  is a locked, explicit scope decision (Angelus, matching the bloodlines/ADMR-1 precedent exactly) - a
  future, separate TM Admin story owns authoring. Do not suggest adding one.
- No Administrator office content document. Administrator is oxp-8's separate content-authoring job,
  not app code - every reader treating "no document for Administrator" as a normal, valid state is
  correct, not a gap.
- The seed script (`server/scripts/seed-office-content.js`) has NOT been run with `--apply` against any
  live/dev database as part of this diff, and is not expected to have been - running it is a separate,
  deliberate operational action outside this diff's own scope.
- `office-manoeuvre-rank.js` does not import anything from the new modules at all (it never imported
  the deleted static module either) - only its comments changed. This is correct, not a missed
  repoint.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims. Attack these in
   particular:
   - "Re-ran the six-dependents grep... found it had UNDERCOUNTED, not overcounted" - 5 additional test
     files named as needing rework beyond the original 6 production call sites. Grep the CURRENT
     working tree yourself for any remaining reference to `office-data.js` or `OFFICE_DATA`/
     `MERIT_DOT_CAPS` as bare identifiers, anywhere in `public/` or `server/` (excluding this diff's own
     new files, which legitimately reference the OLD name in prose comments for history). Confirm
     nothing was missed.
   - The exact regression-and-fix claim about `issue-1143-db-setup-skip.test.js`: that `setupDb()`'s
     new auto-seed step broke that file's own "positive control" test by throwing against its minimal
     `db.js` mock, and that wrapping the seed call in try/catch fixed it. Reproduce this yourself: run
     `cd server && npx vitest run tests/issue-1143-db-setup-skip.test.js` against the CURRENT diff (should
     pass, 3/3) - then, ONLY as a temporary local edit you restore afterward, remove the try/catch
     around `ensureOfficeContentSeeded()` in `server/tests/helpers/db-setup.js` and re-run the same
     file to confirm the claimed failure actually reproduces the way the record describes, then restore
     the file and confirm `git diff` is clean of that change again.
   - "Full untargeted suite run... 28 failed... verified pre-existing via git-stash A/B isolation on a
     representative spot-check... None of the 27 touch office content or any file this story modified."
     You do not need to re-run the full 4430-test suite (it takes ~18 minutes) - but DO run
     `cd server && npx vitest run tests/api-rules-offering.test.js tests/rule-engine-integration.test.js
     tests/ws-fanout.test.js` yourself against the current tree and confirm these fail for reasons that
     are genuinely unrelated to `office_content`/office-tab/office-purchase/etc (read the actual failure
     output - are the failure messages about anything office-related at all?).
   - The AC6 explicit ordering test claim (`issue-1141-office-tab-render.test.js`, "Primogen's
     manoeuvre-to-rank mapping is unchanged end to end"). Read that specific test and confirm it
     actually asserts ORDER (not just presence) of the 5 real Primogen manoeuvre names, and that the
     content it renders from was genuinely built via the real `buildSeedDocs(OFFICE_DATA)` pipeline
     this diff introduces, not a hand-typed duplicate fixture that could drift from the real seed data
     independently.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run the
   drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/oxp-10-office-data-mongo-migration-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the gate commands named above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
