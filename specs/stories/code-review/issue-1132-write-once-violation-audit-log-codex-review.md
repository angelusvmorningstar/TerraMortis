# Adversarial review - issue-1132-write-once-violation-audit-log (Log forbidden write-once transition attempts), Terra Mortis TM Game

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
   `specs/stories/code-review/issue-1132-write-once-violation-audit-log-codex-findings.md`, before you
   open anything the next pass allows. Do not revise an earlier pass's findings in light of what a
   later pass taught you - if a later pass contradicts an earlier one, say so as a new finding and
   leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/issue-1132-write-once-violation-audit-log-diff.txt` and is relative to
  that root, taken against base commit `dab928ed` (the branch's own root - `git log` on this branch
  shows nothing between that commit and the working tree; all of this story's work is uncommitted).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo is one of four sibling apps under an
  umbrella workspace at `D:\Terra Mortis\` (TM Story, TM Admin, TM Herald, TM Design System, plus
  non-code content dirs) - do not read, open, or touch anything outside `D:\Terra Mortis\TM Game`
  even to check something, and do not touch any file under `D:\Terra Mortis\TM Game` that is not part
  of this diff (the working tree also carries unrelated in-progress work from a parallel session -
  leave it alone).
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards, disclose rather than skip:** the vitest suite needs a **reachable local
  mongod** and a `markdown/` directory to exist at the repo root (an existing placeholder file already
  sits there - `markdown/placeholder.md` - leave it as is) or the ENTIRE suite refuses to start with a
  named precondition error (`server/tests/helpers/global-setup.js`, issue #1117). If either is
  unavailable in your environment, say so explicitly rather than reporting a run that did not happen.
  A full untargeted `npx vitest run` in this repo currently takes **over 10 minutes** (4711 tests) -
  prefer the targeted files named below for your own verification unless you have time for the full
  run.
- **Blast radius:** `server/routes/characters.js`'s `PUT /:id` is this app's single highest-traffic
  write path (every character-sheet save from every player and ST goes through it). A mistake in the
  two call sites this diff adds there risks the SAVE PATH ITSELF, not just the new audit feature - a
  thrown, unhandled exception in the new logging code would turn a normal 409 refusal (or worse, a
  normal successful save, if the wiring is wrong) into a 500 for every character editor, not just the
  write-once feature this diff is nominally about.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/issue-1132-write-once-violation-log.test.js` (expect 33 passed), and if time allows,
  `cd server && npx vitest run tests/bl5-write-once.test.js tests/xpl-1-ledger-write.test.js` (the two
  named existing regression suites this diff's own comments say it must not disturb). Report the real
  numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at
`specs/stories/code-review/issue-1132-write-once-violation-audit-log-diff.txt` and **nothing else**.
No spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

An existing route (`server/routes/characters.js`'s `PUT /:id`) already refuses a forbidden change to
a character's `clan` or `bloodline` field with `409 WRITE_ONCE_VIOLATION`, at two separate call
sites (a direct single-field check, and a race-condition check that can name up to two fields at
once). This diff adds a purely-additive audit trail for those refusals: a new module
(`server/lib/write-once-violation-log.js`) builds one document per refused field and inserts it into
a new `write_once_violations` collection, called from both existing 409 sites just before each
`return`. A new router (`server/routes/write-once-violations.js`) adds a minimal ST-only `GET`
endpoint to read the log back, filtered by `character_id`, sorted newest-first, capped at 500 rows.
The insert is explicitly best-effort - it swallows its own errors - so a logging failure can never
turn a 409 into a 500.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. `recordWriteOnceViolations`'s `try/catch` swallows the error and only `console.error`s it. Is
   there any path where this silence hides more than a DB outage - e.g. could a bug INSIDE
   `buildViolationDocs` itself (a `TypeError` from malformed input) get caught by the same `catch` and
   silently discarded, masking a real logic error as if it were "just" a transient write failure?
2. `buildViolationDocs`'s normalisation: `stored_value: row.stored_value === undefined ? null :
   row.stored_value` (and the same for `attempted_value`). Walk this against every falsy value that
   is NOT `undefined` - empty string, `0`, `false`, `null` itself - and confirm none of them are
   accidentally coerced to something other than what was passed in. The docstring claims "nothing
   else is normalised"; verify that claim against the actual code, not the comment.
3. `actorFromUser`'s fallback chain: `discord_name: user?.global_name || user?.username || 'unknown'`.
   If `global_name` is set to an empty string (falsy, but genuinely "present" as a value) and
   `username` is also set, does the `||` chain silently prefer `username` over an intentionally-blank
   `global_name`? Is that the same "not present" as `global_name` being truly absent (`undefined`)?
4. Assertions/checks whose PASS condition is broader than it looks - any place a check could
   trivially pass for a reason unrelated to what its neighbouring comment claims it verifies.
5. Error paths, async/await misuse, unhandled rejections. `recordWriteOnceViolations` is `await`ed at
   both call sites in the route (visible in the diff) - confirm nothing after it in either branch
   assumes it can throw, and confirm nothing BEFORE it depends on it having already run.
6. Resource cleanup on the THROWN path, not just the happy path - if `getCollection(...).insertMany`
   itself throws synchronously (not just rejects), does the `try/catch` genuinely catch that too?
7. Dead code, unused imports, unreachable branches in every new/changed file in the diff.
8. Self-contradiction WITHIN the diff: `buildViolationDocs`'s own docstring says "A single request
   that is refused over both `clan` and `bloodline` produces two documents, never one document naming
   two fields" - but the DIRECT-check call site's comment says the loop "returns on the FIRST
   refusal... records the first one [field]". Do these two claims describe the SAME code path, or does
   the "two documents" claim only ever become reachable through the OTHER (race-condition) call site?
   Flag which claim belongs to which call site rather than assuming they agree.
9. The GET route's `limit` handling: `Number(req.query.limit)` on a non-numeric query string produces
   `NaN`; confirm `Number.isInteger(NaN)` correctly routes to the stated default rather than silently
   producing a broken/unbounded query.
10. Flag anything you cannot judge without the spec as "worth checking" rather than asserting it.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/issue-1132-write-once-violation-audit-log-codex-findings.md` now, before
reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1 above - re-verify it against the real surrounding code rather than trusting it
a second time.

### What to hunt for

1. **Hand-trace the direct-check call site exactly.** Read `server/routes/characters.js` around its
   `PUT /:id` handler in full. Walk the EXACT sequence: `guardedInBody =
   WRITE_ONCE_FIELDS.filter(has)` -> `for (const field of guardedInBody)` -> `checkWriteOnce(...)` ->
   on `!v.allowed`, call `recordWriteOnceViolations` then `return res.status(409)`. Confirm, by
   reading `server/lib/character-write-once.js`'s own declaration of `WRITE_ONCE_FIELDS`, what order
   the fields are actually checked in, and confirm a request body that forbids BOTH `clan` and
   `bloodline` really can only ever produce ONE violation document via this path (the early `return`
   inside the loop), not two.
2. **Hand-trace the race-condition call site separately.** It is a different code shape (can name up
   to two fields from one `recordWriteOnceViolations` call via `.map`). Confirm `stillThere` really is
   populated from a READ THAT HAPPENS AFTER the compare-and-set failure (not the original pre-request
   read), and that `stored_value: stillThere[f] ?? null` is recording what the code comment claims -
   "what ACTUALLY LANDED", not the value this request was originally trying to pin against.
3. Route/matcher order: read `server/index.js`'s and `server/tests/helpers/test-app.js`'s full mount
   list. Confirm `/api/write_once_violations` cannot be shadowed by, or shadow, any existing mounted
   prefix (check especially anything starting `/api/write_once` or a generic catch-all mounted
   earlier).
4. Read `server/middleware/auth.js`'s `requireRole` in full. The new GET route's own comment claims
   `requireRole('st')` "already admits `dev`... do not add it explicitly" - verify this against the
   real implementation, and confirm a `player`-role request is genuinely rejected (403), not merely
   assumed to be.
5. Malformed or absent input at the new GET endpoint: an empty-string `character_id`, a
   valid-length-but-wrong-alphabet 24-char string, a 12-character string (the code's own comment notes
   `ObjectId.isValid` accepts this), an uppercase-hex 24-char string, and a `limit` of `0`, a negative
   number, a float, and a string like `"abc"`. Trace each through the actual validation code and state
   what HTTP response each produces.
6. Read `server/db.js`'s `getCollection`. Does inserting into a MongoDB collection that has never been
   explicitly created auto-create it (standard MongoDB behaviour), or is there any code path here that
   assumes prior explicit creation? Does the GET side silently return an empty array if the collection
   does not yet exist, or does it error?
7. Concurrency: can two simultaneous forbidden requests against the SAME character and field both
   reach `recordWriteOnceViolations` and both succeed, producing two rows for what a human would call
   one retried mistake? Is anything about that a correctness problem, or purely a cosmetic
   "duplicate-looking" row - state which.
8. Fixture/mock shape vs what the real consumer actually reads: open the new test file
   (`server/tests/issue-1132-write-once-violation-log.test.js`) and confirm its fixtures/mocks for
   `req.user` genuinely match the shape `req.user` really has at that point in the real middleware
   chain (check `requireAuth` in `server/middleware/auth.js` for what it actually attaches to
   `req.user`), field for field - not merely a shape the test author assumed.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/issue-1132-write-once-violation-audit-log-codex-findings.md` now, before
reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/issue-1132-write-once-violation-audit-log.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly settled, outside this diff - do not flag these as gaps, only genuine correctness bugs in
how they were implemented:**
- WHERE the record lives (a new small `write_once_violations` collection, not `xp_ledger`, not
  `st_mod_audit`, and deliberately not embedded on the `characters` document) is Angelus's own
  explicit ruling, made before this diff was written. Do not re-litigate the choice of collection.
- No MongoDB index was added on the new collection. Explicitly deferred until the collection's real
  size in production is known - a Low-severity suggestion is fine, this is not a gap to flag as Medium
  or High.
- `server/lib/character-write-once.js`'s own refusal logic and BL-5's `409` response shape are
  explicitly OUT of scope for this story and must be byte-for-byte unchanged by this diff - verify
  they are unchanged, but do not propose changing them yourself.
- The race-condition test coverage deliberately provokes the race at HTTP level (spying
  `Collection.prototype.findOneAndUpdate` and moving the stored value inside the route's own
  read-to-write window) rather than as a lower-level unit test. This was a considered choice, not an
  accidental gap - you may still judge whether the test genuinely proves what it claims to prove.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims - among them:
   - `cd server && npx vitest run tests/issue-1132-write-once-violation-log.test.js` goes from 1
     failing (missing schema module, RED) to **33 passed** (GREEN).
   - A named regression run across BL-5 + `xp_ledger`-adjacent suites (4 suites) returns **179
     passed**, and a separate run across the `characters` route suites (5 suites) returns **91
     passed**.
   - A final combined run of the new suite plus `tests/bl5-write-once.test.js` returns **126 passed**.
   - The claim that AC3 (the race-condition path) is "covered at HTTP level for real", not faked or
     approximated.
   - A claim that exactly one pre-existing, unrelated test failure was observed
     (`gdx-4-css-standards-grep.test.js`, a `suite.css` assertion) and that it is "structurally
     impossible" to be caused by this story since the diff touches zero files under `public/`.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/issue-1132-write-once-violation-audit-log-codex-findings.md`, grouped
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
- Every command you ran, with its real result, including the gate commands named above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
