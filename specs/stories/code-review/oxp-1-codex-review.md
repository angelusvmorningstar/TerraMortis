# Adversarial review - oxp-1 (Data-lock: office/seat schema), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This diff has a genuine data-safety stake: it includes a migration script that, when eventually run
for real by a human, will write to a LIVE production MongoDB database containing real player
character data. Scrutinise its safety mechanisms as carefully as its correctness.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing.

1. Work the passes **in the order written**. Do not read ahead. The story spec is deliberately NOT
   in the diff - do not go looking for it during the earlier passes.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/oxp-1-codex-findings.md`, before you open anything the next pass
   allows.
3. At the very end, **attest** to what you actually did.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at `specs/stories/code-review/oxp-1-diff.txt`,
  taken against base commit `ddf059f8`.
- The diff is **deliberately scoped to source and tooling only**. The story spec and
  `sprint-status.yaml` are excluded on purpose.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it.
- **Do NOT modify, commit, or push anything.** `TM Suite` sits inside an umbrella workspace
  (`D:\Terra Mortis`) alongside sibling repos `TM Cockpit`, `TM Wiki`, `TM Herald`, and non-repo
  content folders. Stay entirely inside `D:\Terra Mortis\TM Suite`.
- **CRITICAL - do not connect to or write to any MongoDB database, live or test, and do not run
  `server/scripts/seed-office-seats.mjs` as a shell command under any circumstances, with or
  without `--apply`.** If you want to verify its behaviour, read its exported functions
  (`buildSeatDocs`, `seedOfficeSeats`) and reason about them statically, or trace how the project's
  own vitest suite already exercises them (`server/tests/oxp-1-office-seats.test.js`) rather than
  invoking the script yourself. The root `.env` at `D:\Terra Mortis\TM Suite\.env` points at a real
  live Atlas cluster with real player data; this repo's own standing rule is that a human runs all
  Mongo writes deliberately, never an agent as a side effect of review.
- You MAY run the project's existing vitest suite (`npx vitest run ...`) - that is safe, since this
  project's test harness force-connects to `tm_suite_test` only (verify this claim yourself in Pass
  2 rather than trusting this sentence).
- Temporarily editing a file to prove something (revert one line, confirm the check now fails,
  restore it) is allowed - restore it exactly, confirm with `git diff`, say so.
- This machine's `mongod`/Atlas reachability has been flaky across recent review sessions in this
  same project (an `EACCES` connecting to a remote address, transient). If DB-backed tests skip
  rather than run, say so explicitly rather than reporting them as passed.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly.
- If you found nothing in a pass or at a severity, say that explicitly.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/oxp-1-office-seats.test.js tests/office-merit-dots.test.js tests/issue-1141-office-data-sync.test.js tests/otc-2-office-actions-api.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/issue-823-test-db-guard.test.js`.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oxp-1-diff.txt` and **nothing else**.

### What this diff claims to be

A new AJV schema (`server/schemas/office_seat.schema.js`) for an `office_seats` MongoDB collection —
one document per office "seat" (not per office category), so an office can have any number of
concurrently-held seats. A manual, ST-invoked migration script
(`server/scripts/seed-office-seats.mjs`) that seeds seven specific real seat records, refusing to
proceed if one particular date (a named character's seat-creation date) is not supplied. A large test
file (`server/tests/oxp-1-office-seats.test.js`) covering schema validation, the seed script's pure
logic, and DB-backed behaviour against a real MongoDB test collection.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The idempotency claim is NOT atomic.** `seedOfficeSeats` does `collection.findOne(...)` then,
   only if nothing was found, `collection.insertOne(...)` - two separate round-trips, not one atomic
   operation (e.g. not an `updateOne` with `upsert: true`). If this script were ever invoked twice
   concurrently (unlikely for a manual one-off, but the code doesn't prevent it), could both
   invocations' `findOne` calls return nothing for the same seat before either `insertOne` completes,
   producing two documents for what should be one seat? The committed tests only exercise
   SEQUENTIAL re-runs (call once, then call again) - is there a test anywhere that exercises
   concurrent/overlapping calls? If not, is the "idempotent" claim in the script's own doc comment
   accurate as stated, or accurate only for the sequential case actually tested?
2. **`buildSeatDocs`'s Rene-date fallback uses `||`, not `??`**: `const reneDate = reneCreatedAt ||
   RENE_PRIMOGEN_SEAT_CREATED_AT;`. Enumerate what happens for every falsy value `reneCreatedAt`
   could plausibly be (`undefined`, `null`, `''`, `0`, `false`) - does each one correctly fall through
   to the "unconfirmed, throw" path, or is there a falsy-but-meaningful value that `||` would treat
   identically to "not provided" when it shouldn't?
3. **The schema's `_id` field is `{ type: 'string' }`**, but a real MongoDB document's `_id` is a
   BSON ObjectId, not a string, until something explicitly stringifies it. Trace every place in the
   diff where a document is validated against this schema and check whether it's validating a
   JSON-serialised form (with `_id` already a string) or could ever receive a raw document with a
   real ObjectId `_id` - would the latter silently fail (or silently pass in a way that hides a bug)
   against `type: 'string'`?
4. **Self-contradiction check**: the schema file's own header comment says "If you are about to add
   a unique index on `office_category`, read oxp.1's story file first" - implying a FUTURE risk. Does
   anything ELSE in this diff already assume or rely on `office_category` being unique in a way that
   would silently break the moment two same-category seats exist (e.g. a `findOne` anywhere that
   should be a `find`, or an assumption buried in the seed script's own labelling/logging logic)?
5. **The seed script's own doc comment claims**: "Connection comes from `../db.js`... Running it bare
   with `server/.env` in place therefore targets LIVE Atlas. The dry-run default is what makes that
   safe." Is dry-run genuinely the DEFAULT if the script is invoked with zero arguments (no
   `--apply`, no `--rene-created-at`) - trace `main()`'s argument parsing by hand and confirm exactly
   what happens on a bare `node scripts/seed-office-seats.mjs` with no flags at all (does it exit
   safely before touching the database, or does it connect first and fail on the missing-date
   check only after establishing a live connection - and if the latter, is that itself worth flagging
   as marginally less safe than "never connects at all" even though it never writes)?
6. Standard sweep: assertions whose pass condition is weaker than their label claims (particularly
   in the large N-seats-per-office test block, which uses TWO separately-compiled AJV validator
   instances per test specifically to avoid one call's cached `.errors` leaking into the other's
   assertion - confirm this precaution is actually necessary, i.e. that a SHARED validator instance
   really would have this hazard, or whether it's defensive over-engineering); dead code; whether the
   test file's AC-numbered `describe`/`it` titles match what their bodies actually assert.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/oxp-1-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`.

### What to hunt for

1. **Verify the load-bearing data-safety claim for real**: read `server/tests/helpers/setup-env.js`
   and `server/db.js`'s `assertTestDbSafety` (or equivalent) in full, and confirm independently that
   it is genuinely impossible for a vitest run in this repo to resolve a non-`_test`-suffixed
   database, for ANY test file, not just this one. This is the entire reason it was safe for the
   original implementation to write DB-backed tests against `getCollection('office_seats')` without
   ever touching production - confirm the guarantee is real, not just asserted in a comment.
2. **Read `server/schemas/character.schema.js`'s `court_category` enum directly** and confirm, by
   your own comparison (not by trusting the diff's own test that claims to check this), that
   `OFFICE_CATEGORY_ENUM` in the new schema really is exactly that enum minus the blank/null members
   - character for character, not just "looks about right."
3. **Read `server/schemas/downtime_submission.schema.js`** (cited in the new schema's own comments
   as the precedent for both the ObjectId-pattern convention and the reason `format: 'date-time'`
   isn't used) and confirm both claims are actually true of that file, not just asserted.
4. **Read `server/scripts/backfill-free-grants.js`** (cited as the precedent for how this new script
   resolves its Mongo connection) and confirm the new script's connection-handling genuinely matches
   it, not just superficially.
5. **Malformed input at the schema boundary**: `holder_id`'s pattern is `^[a-f0-9]{24}$` - does AJV,
   as configured in this project (`coerceTypes: false`, per the test file's own instantiation),
   actually enforce this strictly, or is there a way a non-string type (e.g. a number, or an object)
   sneaks past a `pattern` keyword when the outer `type` union already includes `'string'`? Confirm
   by testing (statically, by reading AJV's real documented behaviour for a `type: ['string',
   'null']` + `pattern` combination, or by writing your own throwaway Node script - NOT by touching
   any database) exactly what a non-string, non-null `holder_id` (e.g. `holder_id: 12345`) does
   against this schema.
6. **Route/consumer sweep**: grep the ENTIRE repo (not just what the diff touches) for any existing
   reference to `office_seats`, `office_seat.schema`, or `seed-office-seats` to confirm the story's
   own claim that "nothing reads this collection yet" is genuinely true right now, not just true of
   this diff's own files.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/oxp-1-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/oxp-1-data-lock-office-seat-schema.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.**
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's literal wording (there are 6; check each, especially AC2's claim that
     `holder_id` is "typed consistently as an ObjectId (never a mixed string/ObjectId)" against what
     the schema and the seed script's stored-document shape actually enforce end to end).
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing**
     - confirm this diff does not quietly touch `office_merit_dots`/`office_manoeuvre_rank`, does not
     add any API route or client consumer, does not add handover-reaction logic, and does not touch
     `OFFICE_DATA`.
   - Specified behaviour missing or present only in appearance.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps: any migration of
`office_merit_dots`/`office_manoeuvre_rank` to seat-keying, any new API route or UI consumer for
`office_seats`, handover-reaction logic (oxp.5), `OFFICE_DATA`'s Mongo migration (split to a
separate `oxp-10` story), and resolving René St. Dominique's actual creation date (the script's
explicit refusal to guess it is the correct behaviour, not a gap to fill).

### Pass 3b - now read the author's record and check it against reality

5. Read the **Dev Agent Record** in full. It makes specific, checkable claims - notably a test-count
   and pass-rate claim, several prove-discrimination mutation claims (an idempotency-check mutation,
   a `holder_id` pattern mutation, a Rene-date-default-softening mutation, and an
   `office_category` enum mutation, each said to produce an EXACT number of failures), and an
   explicit claim that the live database was never connected to. Reproduce what you safely can:
   run the exact gate command yourself and compare counts; for the mutation claims, you may
   reproduce them ONLY as static source edits to schema/script files (never re-run the seed script
   itself, per the Ground Rules) and re-run the vitest gate to see if the same test subset fails,
   then revert and confirm `git diff` clean.
6. Verify by running, not by reading, wherever the Ground Rules allow it.
7. Flag anything FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED.
8. State plainly whether this is ready to ship as-is, needs patches, or has a blocking problem. Given
   the data-safety stakes, be explicit about whether you are confident NO code path in this diff can
   reach the live database under any circumstance you can identify.

---

## Output

Write everything to `specs/stories/code-review/oxp-1-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it. Write `- None found.`
under any empty heading.

For each finding: one-line title, severity, file:line, triggering input/sequence, observable
consequence, confidence.

Close with a **Validation notes** section: which files you opened in each pass, every command you
ran with its real result, anything you could not run and why, explicit confirmation you never
connected to or wrote to any MongoDB database (live or test) via a direct script invocation, and
confirmation you modified nothing (or restored and verified anything you touched).
