# Adversarial review - dbo-1-purchasable-powers-schema-vs-data (`purchasable_powers` schema declares `special`, cleans up dead `selected`), TM Suite

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
   `specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md`, before you
   open anything the next pass allows. Do not revise an earlier pass's findings in light of what a
   later pass taught you - if a later pass contradicts an earlier one, say so as a new finding and
   leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-diff.txt` and is relative to
  that root, taken against base commit `2534c559` (`origin/main`, the merge of PR #1166 / dbo-3, the
  point this story's own branch was cut fresh from).
- The diff is **deliberately scoped to source and tooling only** (the schema file, the new cleanup
  script, the new test file). Story-spec and tracking edits (the story file itself,
  `specs/epic-dbo-database-ownership.md`, `specs/stories/sprint-status.yaml`) are excluded from it on
  purpose, so the earlier passes stay genuinely blind to the author's own account. Do not treat their
  absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time -
  with one hard exception below.
- **Do NOT modify, commit, or push anything.**
- This repo sits inside an umbrella workspace (`D:\Terra Mortis\`) alongside three sibling repos -
  `TM Wiki`, `TM Cockpit`, `TM Herald`. **Do not open, read, or reference any of them.** This review
  is scoped entirely to `TM Suite`.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **HARD ENVIRONMENT HAZARD - read this before touching anything Mongo-related.** The new script,
  `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs`, connects to whatever database
  `server/.env`'s `MONGODB_URI`/`MONGODB_DB` configures - which defaults to **live production
  `tm_suite`** - unless `MONGODB_DB=tm_suite_test` is set in the environment when it runs. Its
  dry-run default only withholds *writes*; a bare invocation still *connects to and reads* whatever
  database is configured.
  - **NEVER invoke this script's `main()` or its CLI directly, under any circumstances, with or
    without `--apply`.** You do not need to - the vitest suite already exercises `planCleanup` and
    `applyCleanup` against `tm_suite_test` in isolation, which is the only way this story's own DB
    claims should be verified.
  - **NEVER pass `--apply` to anything, against any database, for any reason.**
  - The project's own vitest setup file forces all suites onto `tm_suite_test` - running
    `npx vitest run` is safe. Do not override `MONGODB_DB` yourself.
  - If Mongo/Atlas is unreachable from your environment, the DB-backed `describe.skipIf(!dbAvailable)`
    block will silently skip rather than fail (a documented, known hazard in this repo - issue #1117).
    **A skipped suite is not a passing suite.** State explicitly whether the DB-backed half ran for
    real or skipped - do not report a green result without checking which one happened.
- **Blast radius.** `special` is read by exactly one function in production,
  `isMeritEventGranted(rule)` in `public/js/editor/merits.js:46` (`rule.special === 'standing'`),
  which gates the XP-spend merit picker shipped in DBO-3 (already merged to `main`). If this story's
  schema validation is subtly wrong, the failure mode is narrow (POST `/api/rules` rejecting or
  accepting the wrong shapes) rather than a runtime behaviour change - `isMeritEventGranted` itself is
  untouched by this diff. Still worth being precise about, since a POST-time rejection would block any
  future third "standing"-tagged power from ever being created.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/dbo-1-purchasable-powers-schema-cleanup.test.js tests/dbo-3-standing-merit-filter.test.js tests/n7-n9-allocator-readers.test.js tests/oath-a-d8-api-roundtrip.test.js tests/oath-a-pledge-helpers.test.js tests/oath-a-render-and-gate.test.js tests/oath-b-d6-api-roundtrip.test.js tests/oath-b-suspension.test.js`.
  Report the real numbers even if they disagree with anything the story claims - especially then. The
  story claims 127/128 for its own "full targeted gate" (unspecified exact file set beyond "the new
  file + dbo-3's file + n7-n9-allocator-readers + three oath suites") with the 1 failure being the
  pre-existing, `CLAUDE.md`-documented #1115. State the real total from the command above, and flag
  it if the file set you can identify doesn't obviously add up to the same denominator.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A JSON-schema field (`special`) on a MongoDB document schema, previously undeclared (so
`additionalProperties: false` rejected every document that carried it), is now declared as
`{ type: ['string', 'null'], enum: ['standing', null] }`. A sibling field (`selected`) stays
deliberately undeclared. A new one-off maintenance script (`dbo-1-purchasable-powers-field-cleanup.mjs`)
exports `planCleanup`/`applyCleanup`/`main`: it reads every document in a `purchasable_powers`
collection, plans an `$unset` of `selected` unconditionally and of `special` only when present and not
exactly the string `'standing'`, and writes a JSON backup before any real write, gated behind a
`--apply` flag that defaults off. A new test file exercises both the schema (via `ajv`) and the script
(via a real MongoDB connection, `describe.skipIf`-guarded).

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The two-fetch gap in `applyCleanup`.** `planCleanup` reads the full collection once
   (`collection.find({}).toArray()`); when `apply: true`, `applyCleanup` then does a *second*,
   independent read (`collection.find({ _id: { $in: rows.map(r => r._id) } })`) to build the JSON
   backup, before issuing the `$unset`s. If a document's real state changed between those two reads
   (however unlikely for a manual, ST-invoked script), the backup captures the *second* read's state,
   not the state `planCleanup` actually reasoned about. Is this addressed, acknowledged, or a real
   (if narrow) gap in the backup's purpose as a restore point?
2. **Exact-string claim vs actual comparison.** The code comment and the docstring both assert the
   `special !== 'standing'` guard is a strict, case-/whitespace-sensitive equality check. Read the
   actual line (`doc.special !== 'standing'`) and confirm this independently rather than trusting the
   prose around it - is there any coercion, trimming, or loose-equality anywhere in the path from
   Mongo document to this comparison?
3. **`$unset` value semantics.** `applyCleanup` builds `unset.selected = ''` / `unset.special = ''`
   before passing `{ $unset: unset }` to `updateOne`. Confirm this is inert (MongoDB's `$unset`
   ignores the value entirely) and not a latent bug where some future refactor might start relying on
   the assigned value meaning something.
4. **`modifiedCount` trust.** `applyCleanup` only increments `cleaned` when `result.modifiedCount === 1`.
   What happens to `backedUp` accounting (and the function's returned totals) if a row's backup was
   taken but its subsequent `updateOne` reports `modifiedCount === 0` (already-clean, deleted, or
   concurrently modified between backup and write)? Is the return value's `backedUp` count still
   accurate in that case, or does it silently overcount relative to what was actually cleaned?
5. **Idempotency claim.** The docstring states re-running `planCleanup` after a successful `--apply`
   returns an empty array. Trace this by hand from the `hasOwnProperty` checks in `planCleanup` -
   confirm it actually holds, rather than assuming the comment is correct.
6. **CLI argument handling.** `main()` only checks `argv.includes('--apply')`. Any other flag, typo,
   or unexpected argument is silently ignored with no error. Worth flagging as "worth checking" -
   is silent-ignore the right failure mode for a script whose default behaviour targets a live
   production database by default?
7. **Self-contradiction within the diff.** Does any comment claim behaviour the code doesn't actually
   implement, or vice versa? (Read the schema-file comment block in full against the single line of
   actual schema it precedes.)
8. **Assertions whose pass condition is weaker than the comment claims**, dead code, unused imports,
   unreachable branches, error-path/resource-cleanup gaps on the thrown path (not just the happy
   path) anywhere in the new script or test file.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md` now, before
reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite` (and only that repo - see the sibling-repo
rule above). Read whatever surrounding code you need to understand what this change is actually
plugging into. You still do **not** have the story spec or any account of the author's intent - work
from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Additionally: the schema is consumed by exactly one route,
`POST /api/rules` (`server/routes/rules.js`), via `validate(purchasablePowerSchema)` against the
*entire* request body. `PUT /api/rules/:key` in the same file filters the request body through a
separate `UPDATABLE_FIELDS` allowlist that does **not** include `special` (or `selected`).
`isMeritEventGranted(rule)` in `public/js/editor/merits.js:46` is the only production reader of
`special`, checking `rule.special === 'standing'` exactly.

### What to hunt for

1. **POST-creatable, PUT-uneditable asymmetry.** Declaring `special` in the schema makes it
   `POST`-acceptable on document creation (an ST could hand-craft a body with
   `special: 'standing'`), but it is absent from `PUT`'s `UPDATABLE_FIELDS`, so it can never be
   changed on an existing document through the API. Walk the real-world path: is there any actual
   UI flow (the admin Rule Data "add new power" form, `ingest-excel.js`, or anything else) that could
   set `special` on creation today, or is `POST /api/rules` with a hand-crafted body the *only* way
   any future third "standing"-tagged power could ever come to exist? Is that a gap or is it fine as
   a deliberately code-managed, not ST-managed, field?
2. **Collection-wide guard, not category-scoped.** `planCleanup`'s `unsetSpecial` check applies to
   every document in `purchasable_powers` regardless of `category`. Confirm (by reading the schema's
   full property list and, if you can safely query `tm_suite_test` - never live - the shape of
   fixtures used) whether `special` is genuinely a merit-only concept or whether the guard's
   blast radius is wider than the story's own framing ("event-granted-merit marker") suggests.
3. **Concurrent `--apply` runs.** There's no locking or transaction around the read-plan-write
   sequence. Is a second, concurrent invocation (however implausible for a manual, one-off script) a
   real hazard, or is the risk genuinely negligible given how this is invoked? State your reasoning
   either way rather than a bare "yes/no".
4. **Malformed or unusual documents.** What happens to a document missing `key` entirely (the log
   line falls back to `row.key || row._id` - fine) - trace whether anything else in `planCleanup` or
   `applyCleanup` assumes `key`'s presence in a way that would throw rather than degrade gracefully.
5. **Schema shape equivalence, precisely.** The declared shape is
   `{ type: ['string', 'null'], enum: ['standing', null] }`. Hand-trace (or run `ajv` directly) what
   this accepts/rejects for: `'standing'`, `null`, absent, `'Standing'`, `'standing '`, `''`,
   `undefined` explicitly set, `0`, `false`. Note anything surprising.
6. **Route/matcher order** - not really applicable here (no new routes), but confirm nothing about
   the new schema property interacts unexpectedly with any existing `oneOf`/`anyOf` branch elsewhere
   in the same schema file (e.g. does declaring `special` change how any other property's validation
   resolves, given `additionalProperties: false` at the schema's top level)?

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md` now, before
reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/dbo-1-purchasable-powers-schema-vs-data.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record section yet** (headed `## Dev Agent Record`, including its
   `Debug Log References` and `Completion Notes List` subsections). Skip past it entirely. Reading
   the author's own record first anchors you on their framing and turns a review into grading
   homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an
     AC's exception is exactly as narrow as it is written. **AC1 specifies an exact code block**:
     ```js
     special: {
       oneOf: [
         { type: 'string', enum: ['standing'] },
         { type: 'null' },
       ],
     },
     ```
     Compare this, verbatim, against what the diff actually shipped. If they differ, that is a literal
     deviation from AC1 regardless of whether the two shapes are behaviourally equivalent - name it as
     such, then separately assess whether the equivalence claim (if the diff makes one anywhere you
     are allowed to see, i.e. in-code comments) actually holds by hand-tracing both schema forms
     against `special: 'standing'`, `special: null`, `special` absent, and `special: 'anything-else'`.
   - AC1 also asks that the replaced `:219-245` comment block become "a short pointer to the epic's
     own DBO-1 section rather than re-narrating the investigation inline". Read the actual replacement
     comment in the diff and judge whether it meets that bar or still re-narrates.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (see the settled-decisions list below for
     what's already ruled out - do not re-flag those as gaps, but you MAY independently confirm the
     diff doesn't touch them).
   - Specified behaviour that is missing, or present only in appearance - in particular AC2's claim
     that the script "follows `migrate-office-purchases-to-seats.mjs`'s established shape". Actually
     open both files and compare structurally rather than trusting the claim.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope, and deliberate - do not flag these as gaps:**
- Not running `--apply` against live `tm_suite` (Angelus's action, post pre-game-freeze - this story
  builds and tests against `tm_suite_test` only, by design).
- `special` staying code-managed and NOT added to `PUT`'s `UPDATABLE_FIELDS` - confirmed by grep
  against `admin/rules-view.js` that nothing ST-facing reads or edits it today. (You may still assess
  this asymmetry as an *edge case worth noting* per Pass 2 above - the settled decision is that it's
  out of scope for THIS story, not that the asymmetry doesn't exist.)
- Not retiring the archived `strip-selected-from-purchasable-powers.js` script.
- Not touching `isMeritEventGranted` or any of DBO-3's four call sites - this story is additive only.
- Not resolving DBO-4 through DBO-9 (separate, unstarted stories in the same epic).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full (`Agent Model Used`, `Debug Log References`,
   `Completion Notes List`, `File List`). It makes specific, checkable claims:
   - "10 new tests... DB-backed half ran against real Atlas (`tm_suite_test`), not a skip." Run the
     suite yourself and confirm which half actually ran versus skipped in *your* environment - do not
     assume it matches the author's environment.
   - "`dbo-3-standing-merit-filter.test.js` run unmodified, all 17 still green." Confirm the file is
     genuinely untouched by this diff (it should not appear in the diff at all) and run it for real.
   - "Full targeted gate: this file + `dbo-3-standing-merit-filter.test.js` +
     `n7-n9-allocator-readers.test.js` + the three oath suites = 127/128, the 1 being the pre-existing
     #1115 failure." Run the gate command given in the Ground rules section above and report the real
     number. Note: there are five `oath-*.test.js` files in `server/tests/` (`oath-a-d8-api-roundtrip`,
     `oath-a-pledge-helpers`, `oath-a-render-and-gate`, `oath-b-d6-api-roundtrip`, `oath-b-suspension`)
     - the claim says "three"; if you can't identify which three, run all five (already included in
     the gate command above) and report the real total rather than guessing which subset was meant.
   - "Prove-discrimination pass (single-change revert of the `special !== 'standing'` guard) failed
     exactly the 2 tests protecting that invariant, nothing else." You may reproduce this yourself
     (temporarily revert the guard in `planCleanup`, run the suite, confirm exactly which tests fail,
     restore, confirm `git diff` is clean again) - this is exactly the kind of temporary edit the
     Ground rules permit.
   - "Implementation deviates from AC1's literal code snippet... behaviourally identical (both AC5
     tests and the schema-shape convention pass either way)." This is the author's own disclosure of
     the Pass 3a deviation you already found blind. Confirm the disclosure is accurate: does it in
     fact match what you found, and is "behaviourally identical" actually true for every case you
     hand-traced in Pass 3a/2?
   - "Live dry-run sanity check... 656 documents planned for `selected` removal... confirmed by name
     that MCI/PT each show only `would $unset selected`." **Do not attempt to reproduce this claim
     yourself** - it required connecting to live `tm_suite`, which you must not do (see the hard
     environment hazard above). Note it as an unverifiable-by-you claim rather than either accepting
     or attempting to check it.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now, subject
   to the environment hazard rule.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md`, grouped
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
- Every command you ran, with its real result, including the gate command above.
- **Anything you could not run, and why.** Name it specifically (the live-`tm_suite` dry-run claim
  should appear here as something you deliberately did not attempt).
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
