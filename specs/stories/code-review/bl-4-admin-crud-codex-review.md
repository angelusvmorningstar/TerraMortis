# Adversarial review - bl-4-admin-crud (ST admin CRUD for bloodlines), TM Suite

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
   `specs/stories/code-review/bl-4-admin-crud-codex-findings.md`, before you open anything the next
   pass allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if
   a later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/bl-4-admin-crud-diff.txt` and is relative to that root, taken against
  base commit `8abd6704` (current HEAD `f4c6d890` on branch `bl/bl-1-bloodline-collection`, already
  committed - the diff reproduces with `git diff 8abd6704 f4c6d890 -- public/js public/css
  public/admin.html server/routes server/schemas server/scripts server/lib server/ws.js
  server/tests`).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/bl-4-admin-crud.story.md`, `sprint-status.yaml`, `deferred-work.md`) are excluded
  from it on purpose, so the earlier passes stay genuinely blind to the author's own account. Do not
  treat their absence as an omission or go hunting for them.
- This is an umbrella workspace with sibling repos `../TM Cockpit`, `../TM Wiki`, `../TM Herald`.
  This diff does not touch any of them; you do not need to and should not open them.
- **Read and run freely** to verify a claim, with one hard exception below. Running the code beats
  reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- **Do NOT connect to any MongoDB instance, live or local, and do NOT start `cd server && npm run
  dev`.** `server/.env` in this repo carries LIVE PRODUCTION credentials - there is no sandbox mode.
  The project's own vitest suite forces every test onto a `tm_suite_test` database via its setup
  file, so running vitest is safe; hand-starting the API server is not, because it would connect to
  the real chronicle. If you need to exercise a route, do it through the test suite.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards**: the full test suite is NOT a trustworthy signal in this repo right now.
  Six pre-existing failures are known and unrelated to this change (#1116, #1115, #1125, #1117,
  `issue-837-xp-totals-deprecation`, `n8-mandragora-prereq`), and this story's own author claims a
  seventh (`issue-836-legacy-tracker-cache-removed.test.js`). Do not run the full suite and treat its
  result as information; use the scoped gate commands below.
- **Blast radius**: `server/routes/bloodlines.js`'s public `GET /` and `GET /:id` are read by BOTH
  the player app and the DT form to cost every discipline on the sheet - a mistake in the
  `PUBLIC_PROJECTION` shape or in what the new write handlers persist would silently mis-cost every
  bloodline character, not just break the new admin screen. `server/ws.js`'s broadcaster is shared
  infrastructure already used by the equipment catalogue feature; a mistake in the new broadcaster
  function should not be assumed isolated from that existing consumer.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  - `cd server && npx vitest run tests/bl4-bloodlines-write-api.test.js tests/bl4-bloodlines-refetch.test.js tests/bl4-bloodlines-admin-view.test.js tests/bl1-bloodlines-api.test.js tests/bl2-bloodlines-cache.test.js tests/repo-no-nul-bytes.test.js`
  - `node --check` on every JS file named in the diff.
  Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/bl-4-admin-crud-diff.txt` and **nothing else**. No
spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point.

### What this diff claims to be

This diff adds ST-gated write endpoints (POST, PATCH, DELETE) plus two ST-gated reads (`GET /admin`,
`GET /:id/impact`) to an existing public, read-only `bloodlines` router, following an
equipment-catalogue precedent elsewhere in the repo with three declared departures: PATCH validates
the fully merged document rather than the patch body, the impact endpoint is ST-gated rather than
public, and DELETE is guarded on references from two different collections (`characters.bloodline`
and `rule_grant.bloodline_name`) rather than one. A shared slug-derivation module, a new client cache
refetch function claimed to preserve the last good state on a failed refetch, a WebSocket broadcast
frame wired into two separate boot paths, and a new admin CRUD screen round it out.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **A possible TOCTOU race in the POST handler's name-collision check.** It reads every existing
   bloodline's `name`, filters in memory for a case-insensitive/trimmed match, and only inserts if
   none is found - then catches a MongoDB `E11000` duplicate-key error as a backstop. The underlying
   unique index is on the raw `name` field with no collation, i.e. it is case-SENSITIVE (a comment in
   the diff says so explicitly). Walk through two concurrent POST requests for `"Khaibit"` and
   `"khaibit"` arriving close together: does the in-memory pre-check actually close this race, or can
   both pass their own read-then-check before either write lands, given the E11000 backstop cannot
   fire for a case-different pair?
2. **PATCH's merged-document validation against a raw existing document.** The handler does
   `const merged = { ...current, ...filtered }` where `current` is a full MongoDB document (raw
   `_id`, whatever shape `created_at`/`updated_at` are actually stored as) fetched straight from the
   driver, then validates `merged` against the same AJV schema instance used for POST. Does the
   schema's `additionalProperties: false` (if present) or its type constraints on `created_at`
   /`updated_at`/`_id` cause EVERY PATCH to fail validation regardless of what fields were actually
   changed? Or does the schema genuinely tolerate this? Read the actual schema file in the diff and
   reason through a concrete PATCH call by hand.
3. **`unknownDisciplineMessage`'s exact-match check against `KNOWN_DISCIPLINES`.** It uses
   `.includes(d)` - a case-sensitive, untrimmed exact match. Is any discipline value trimmed before
   it reaches this check, either on POST or on PATCH's merged document? If a client sends
   `"Auspex "` or `"auspex"`, does it fail this check with a confusing "unknown discipline" error
   despite being schema-legal, or does it silently pass and get stored un-normalised - which is
   exactly the costing-drift failure mode the code's own comments say this check exists to prevent?
4. **`broadcastBloodlineUpdate`'s send loop has no per-client try/catch.** It iterates
   `_wss.clients` and calls `ws.send(msg)` on each open one. If a single client's socket throws
   mid-send, does the loop abort and skip broadcasting to every client enumerated after it? Check
   whether the pre-existing `broadcastCatalogueUpdate` in the same file has the same shape - is this
   a new regression or a pre-existing, consistent pattern?
5. **Self-contradiction check**: a comment on `PUBLIC_PROJECTION` says reads there are
   "unauthenticated" with `notes` projected out. Does the new `GET /admin` handler's query genuinely
   have NO projection (so `notes` really is included), or could it have inherited the same
   projection object by reference somewhere and silently strip `notes` from the read that's supposed
   to include it?
6. **Error-path behaviour under Express.** These are async route handlers with no visible try/catch
   around most of the body (aside from the explicit E11000 catch in POST). If a database call throws
   for an unrelated reason, does anything in this diff suggest the request would hang, crash the
   process, or silently 500 with no response? You may not be able to fully answer this from the diff
   alone - say so if you can't, rather than asserting an answer either way.
7. **Dead code / unused imports** in every file touched by the diff.
8. **Any check whose PASS condition is trivially satisfiable** - a truthy check that would pass on an
   empty object, an array-length check that doesn't distinguish 0 from "not an array," anything
   similar.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/bl-4-admin-crud-codex-findings.md` now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec
or any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same shape as Pass 1's summary: ST-gated writes and two ST-gated reads added to a public read-only
router, a shared slug module, a cache refetch function, a WS broadcast frame wired into two boot
paths, and a new admin CRUD screen harvested from an existing equipment-catalogue admin pattern.
DELETE is guarded against references in two collections.

### What to hunt for

1. **The admin screen's list-view Delete-disable state may not match the server's actual delete
   guard.** Read `public/js/admin/bloodlines-admin.js` in full, specifically `buildHoldersIndex` and
   how `renderRow` decides `deleteAttrs`. Trace what data source that count comes from - is it built
   purely from the client's already-loaded `characters` list, or does it also account for
   `rule_grant` references? Separately, the individual edit view fetches `/api/bloodlines/:id/impact`
   fresh, which `referencesFor` (server-side) computes from BOTH `characters` and `rule_grant`.
   **Construct the case**: a bloodline with zero character holders but at least one `rule_grant`
   reference. If the list view's disabled-state only reflects character holders, would its Delete
   button render ENABLED for such a bloodline, while clicking it correctly gets refused server-side
   with a 409? Judge whether this is a real UX/guard-parity gap and, if so, its severity.
2. **Walk the exact concurrency claim in `refetchBloodlines`'s own docstring.** It asserts "boot
   priming is awaited before `initWS` is called in both apps, so the two [`loadBloodlines` and
   `refetchBloodlines`] cannot overlap in practice." Read the actual boot sequences in both
   `public/js/admin.js` and `public/js/app.js` and confirm this holds. Also check: is there ANY other
   code path that could call `loadBloodlines()` again after boot concurrently with a WS-triggered
   `refetchBloodlines()`? The two do NOT share `_inFlight` by design - if they can overlap outside the
   boot window, what happens to `_items`/`_loaded`/`_loadFailed` state?
3. **`_clearResolvedMisses`'s `MISS_EMPTY_COLLECTION` branch** resolves a miss when
   `_items.length > 0`. Read `bloodlines-cache.js` in full. Is there a reachable sequence where this
   miss type is recorded while `_items.length` is ALREADY greater than 0, such that
   `_clearResolvedMisses` "resolves" a miss that was never really about the current item count?
4. **Route registration order, read from the WHOLE assembled file, not just the diff hunks.** Open
   `server/routes/bloodlines.js` as it now stands and confirm `GET /admin` and `GET /:id/impact` are
   registered strictly before `GET /:id`, with nothing between them that could change Express's
   matching. Separately: `GET /:id/impact` runs `authMiddleware, requireRole('st'), withObjectId` in
   that order - an unauthenticated request with a MALFORMED id gets a 401 before the id is ever
   validated, while the plain public `GET /:id` (no auth) would 404 a malformed id immediately. Judge
   whether that inconsistency is worth flagging.
5. **`requireRole('st')` and this project's `dev` role.** Read `server/middleware/auth.js` (or
   wherever `requireRole` is defined) to determine whether a user with role `dev` (this project's
   convention for a second ST-equivalent login) is treated as equivalent to `st` for these new write
   endpoints. Check how OTHER ST-gated routes (e.g. `server/routes/equipment-catalogue.js`) handle
   this, and flag any inconsistency.
6. **`referencesFor`'s `rule_grant` matching walked for a malformed record.** Confirm every
   `condition: 'bloodline'` document in the real schema is REQUIRED to carry a non-empty
   `bloodline_name`. If a malformed/legacy document could have `condition: 'bloodline'` with a
   missing or empty `bloodline_name`, walk what `normKey(undefined)` or `normKey('')` produces and
   whether that could ever falsely match or fail to match a real bloodline name.
7. **The client WS message handler for the new `bloodline` frame type.** Read `public/js/data/ws.js`
   in full. Confirm the new frame-type handling cannot throw on an unexpected/missing `op` value or a
   malformed frame, and does not conflict with the existing `catalogue` frame handling.
8. **Malformed or absent input at the two new entry points that accept a client body**: what happens
   to POST/PATCH when `req.body` is genuinely absent versus an empty object `{}`? Trace both through
   to the actual response.
9. **`server/scripts/seed-bloodlines.js`'s changed relationship to the new shared `deriveSlug`
   module.** Confirm the seed script still produces IDENTICAL slugs to before this diff.
10. **Fixture/mock shape vs. what the real route now reads.** For the two CONVERTED test files
    (`bl1-bloodlines-api.test.js`, `bl2-bloodlines-cache.test.js`), read them alongside the real
    route/cache code and confirm every mock/fixture object still matches the real shape
    field-for-field after this diff.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/bl-4-admin-crud-codex-findings.md` now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/bl-4-admin-crud.story.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely.
3. Against the acceptance criteria (15, grouped under "Server - write endpoints" and "Client - cache,
   live update, admin screen"), check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (deleting the JS bloodline constants,
     changing `dev-fixtures.js`, any write-once enforcement on `characters.bloodline`/`.clan`, a
     player-visible `description` field, an `active`/soft-retire field, any change to the two public
     GET routes' shape, a collection-level Mongo validator, a unique index on `slug`, a rename
     cascade, or any bloodline GRANT-editing UI).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Settled decisions - already ruled, do not re-litigate (but DO review their implementations):

- **Rename is deliberately blocked.** `name`/`slug` excluded from the PATCH allowlist by design.
  Do not flag "no rename support" as a gap; DO check the block's implementation is correct.
- **DELETE exists and is deliberately hard-guarded**, not soft-retired - there is explicitly no
  `active`/soft-retire field anywhere in this epic. Do not propose reintroducing one. DO check the
  guard's correctness.
- **No player-facing `description` field.** Deliberately excluded.
- **The two public GET routes' shape is deliberately unchanged.** DO check this is actually still
  true after the diff.
- **The full test suite is not a gate.** Six pre-existing failures are known
  (#1116, #1115, #1125, #1117, `issue-837-xp-totals-deprecation`, `n8-mandragora-prereq`); flag the
  current failure set only if it differs from exactly those six (a claimed seventh gets checked in
  Pass 3b, not here).
- **No write to any real character document happened during this story's own verification**,
  deliberately, to protect live production data - a declared choice, not an oversight.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **"Dev Agent Record"** section in full. It makes specific, checkable claims. Attack
   these:
   - **"24 files / 442 tests passed, run three times... 74 new tests"** (33 + 15 + 26 across the
     three new test files). Run the gate command yourself and compare, file by file.
   - **"NUL guard: green... failed once, on the first batch, then passed in isolation and in every
     run since; a direct `\x00` byte scan over all 18 touched files found nothing."** Run
     `tests/repo-no-nul-bytes.test.js` yourself, and independently scan every diff file for a literal
     NUL byte.
   - **"Two conversions, not deletions"** - `bl1-bloodlines-api.test.js:146-179` and
     `bl2-bloodlines-cache.test.js`'s "no refetch exists" scope guard. Confirm both were genuinely
     converted into something meaningful about the NEW behaviour, not gutted into a trivial pass.
   - **"A seventh pre-existing red... `issue-836-legacy-tracker-cache-removed.test.js` fails at
     import reading `public/js/suite/tracker.js`, deleted from HEAD by `58c88b5b`. Untouched by this
     story."** Verify the file exists, fails for the stated reason, that the tracker module is
     genuinely absent, and that nothing in THIS diff caused it.
   - **Live-browser claims you cannot re-run, but CAN check for code-level plausibility**: "Khaibit
     showing Holders 2 with Delete disabled (matching both 'Khaibit' and '  khaibit ')" - trace the
     actual `normKey`/holder-matching code by hand and confirm it would genuinely produce this.
     Likewise for "AC 9's failure path with the API process actually killed - refetch returned false,
     cache stayed at 24, still resolvable, still 3 XP/dot" - read `refetchBloodlines`'s actual failure
     branch and confirm the code genuinely behaves this way.
   - **"Never wrote to any real character document... the costing claim is instead backed by
     exercising the real `isInClanDisc`/`clanDiscList` accessors in the browser against the
     brand-new bloodline."** Check this against AC 15's literal wording ("assign it to a test
     character") - is this a disclosed, reasoned deviation, or a silent scope-narrowing dressed up as
     equivalent coverage? Form your own judgement.
   - **"`sprint-status.yaml` was already invalid YAML before I touched it... I quoted the field so it
     parses again."** Confirm `specs/stories/sprint-status.yaml` currently parses as valid YAML.
   - **Note on production-state claims**: the Dev Agent Record also claims production was re-queried
     after the browser pass and matched the pre-implementation baseline exactly (0 bloodlines, 41
     characters, 13 holders, 3 `rule_grant` docs). A separate, independent session already
     re-confirmed this directly against production after the story was written - you do not need to
     and must not attempt to connect to MongoDB to check it yourself; treat it as independently
     verified and spend your effort on the claims above instead.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/bl-4-admin-crud-codex-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`,
`[Pass 2]`, `[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than
dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the gate commands from the Honesty section.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
- Explicit confirmation you did NOT connect to any MongoDB instance and did NOT start the API server.
