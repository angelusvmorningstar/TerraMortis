# Adversarial review - bl-5-character-bloodline-validation (clan and bloodline are write-once), TM Suite

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
   `specs/stories/code-review/bl-5-character-bloodline-validation-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave the
   original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/bl-5-character-bloodline-validation-diff.txt` and is relative to that
  root, taken against base commit `46a487d7`. **The implementation is UNCOMMITTED in the working
  tree** on branch `bl/bl-1-bloodline-collection`; `git diff 46a487d7 -- public/js/editor
  server/routes server/lib server/tests` plus the five untracked new files
  (`public/js/data/write-once.js`, `server/lib/bloodline-key.js`,
  `server/lib/character-write-once.js`, `server/tests/bl5-write-once.test.js`,
  `server/tests/bl5-lineage-lock-client.test.js`) reproduces it.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/bl-5-character-bloodline-validation.story.md`, `sprint-status.yaml`,
  `deferred-work.md`) are excluded on purpose. Do not treat their absence as an omission.
- This is an umbrella workspace with sibling repos `../TM Cockpit`, `../TM Wiki`, `../TM Herald`.
  This diff does not touch any of them; you do not need to and should not open them.
- The working tree also carries unrelated debris - a large scratch pile under `server/scripts/_*`
  (map-generation tooling), plus two untracked project files (`.claude/session-start.md`,
  `.claude/session-wrap.md`) and a stray `tm-map.html`. None of it is part of this diff. Ignore it.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- **Do NOT connect to any MongoDB instance beyond what the vitest suite itself does, and do NOT
  start `cd server && npm run dev`.** `server/.env` carries LIVE PRODUCTION credentials - there is no
  sandbox mode. The vitest suite forces every test onto `tm_suite_test` via its setup file, so
  running vitest is safe; hand-starting the API server is not.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards**: the full test suite is NOT a trustworthy signal in this repo right now.
  Multiple pre-existing failures are known and unrelated to this change - the story's own Dev Notes
  list the current authoritative set (9 files, all pre-existing). Do not run the full suite and treat
  its raw result as information; use the scoped gate commands below.
- **Blast radius**: `server/routes/characters.js`'s `PUT /:id` is the SOLE write path for every
  character save in the entire app - every ST edit to any field, on any character, goes through this
  one handler. This diff adds a new read and a new conditional filter to that handler. A mistake here
  does not just affect bloodline/clan; it can break saving ANY character field for ANY character.
  Weight this pass accordingly.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  - `cd server && npx vitest run tests/bl5-write-once.test.js tests/bl5-lineage-lock-client.test.js tests/api-characters-crud.test.js tests/bl3a-one-inclan-implementation.test.js tests/repo-no-nul-bytes.test.js`
  - `node --check` on every JS file named in the diff.
  Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/bl-5-character-bloodline-validation-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point.

### What this diff claims to be

`characters.clan` and `characters.bloodline` become write-once fields: acquirable from no-value, but
never changeable once set. A new pure decision module, `server/lib/character-write-once.js`, is
wired into `PUT /api/characters/:id` - it hoists and widens an existing conditional read of the
character's current document, compares old-versus-new for each guarded field present in the request
body, refuses a forbidden transition with a 409, and turns a genuine acquisition into a
compare-and-set (the prior value joins the update filter) so a race between two concurrent
acquisitions is caught rather than silently overwritten. An acquired bloodline is additionally
checked against the live collection, but only on acquisition and never when the collection is empty
or unreadable. The same rule is implemented a second time as a pure client module
(`public/js/data/write-once.js`, since the two trees deploy to different platforms and cannot share
code), wired into both character-editing surfaces' write handlers (`updField` in `identity.js`,
`shEdit` in `edit.js`), and all four affected dropdowns gain a `disabled` state with an explanatory
note. A dead client-side "clear bloodline on clan change" code path is deleted, since a permanent
clan means it can never fire.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **A likely crash when the target character does not exist.** In the `PUT /:id` handler:
   `let existingChar = null;` is only reassigned inside
   `if (guardedInBody.length || has('touchstones')) { existingChar = await col().findOne({ _id: oid }, ...); }`.
   MongoDB's `findOne` resolves to `null`, not throws, when nothing matches `_id: oid`. The very next
   block is `for (const field of guardedInBody) { const v = checkWriteOnce(field, existingChar[field], updates[field]); ... }`
   - indexing `existingChar[field]` when `existingChar` is `null` throws a `TypeError`. Trace whether
   ANY code path checks the document actually exists BEFORE this point (the diff's own context shows
   the ORIGINAL 404 check only happens after `findOneAndUpdate`, as a side effect of the update
   itself, not as a pre-check). If nothing else 404s first, a `PUT` to a non-existent character ID
   carrying a `clan` or `bloodline` field in the body would throw an unhandled exception instead of
   returning 404. Is this reachable from a real client request, and what does it actually produce
   (crash the process, 500 with a stack trace leaked to the client, something else)?
2. **The race-recovery message may name fields that did not actually race.** `writeOnceRaceMessage(raced)`
   is called with `Object.keys(acquisitions)` - EVERY field being acquired in this request, not
   specifically the field(s) whose stored value actually changed underneath. If a request acquires
   BOTH `clan` and `bloodline` in one call, and only one of them raced (a concurrent write changed
   just that one field), the Mongo filter (which ANDs both prior-value conditions) would still miss
   and trigger the 409 - but the message would tell the ST both fields raced when only one did. Is
   this a real, reachable inaccuracy, and does it matter (the ST is told to reload either way, so is a
   slightly-wrong list of "which field" cosmetic, or could it cause someone to look for a race in the
   wrong place)?
3. **`hasNoValue`'s treatment of a non-string, non-null CURRENT (stored) value.** The predicate
   `typeof v !== 'string' || v.trim() === ''` returns `true` (meaning "no value") for ANY non-string
   input - not just `null`/`undefined`, but also a number, a boolean, an array, an object. This is
   applied to BOTH the incoming request value AND the character's own STORED value
   (`checkWriteOnce(field, existingChar[field], ...)` calls `hasNoValue(current)` internally). If a
   character document somehow held a malformed, non-string, non-null value for `clan` or `bloodline`
   (a legacy row, a bug elsewhere, a direct Mongo edit), this guard would treat it as "had = false"
   and process ANY incoming value as an "acquisition" - silently allowing a write-once field to be
   overwritten past a genuinely-set-but-malformed stored value. Judge whether this is worth guarding
   against defensively (failing CLOSED on an unexpected stored shape, rather than open) or whether the
   schema genuinely makes this unreachable and the permissive read is fine.
4. **The referential check's placement relative to the write-once check, when both `clan` and
   `bloodline` are being acquired in the same request.** Trace the loop order (`WRITE_ONCE_FIELDS =
   ['clan', 'bloodline']`) and confirm there's no ordering hazard - e.g., does anything about
   `bloodlineDoesNotResolve` implicitly depend on `clan` having already been validated/acquired in the
   same pass, and if the bloodline check fails (400) AFTER the clan field's `acquisitions` entry was
   already recorded, does the response correctly abandon the whole write (no partial `$set`), or could
   a clan acquisition partially "stick" in some way before the bloodline check fails the request?
5. **Dead code / unused imports** across all touched files - confirm the deleted `edit.js` block's
   imports (`bloodlinesByClan`, `bloodlinesResolvable`) are genuinely gone and nothing else in the
   file still references them.
6. **Any check whose PASS condition is trivially satisfiable** - in either new test file, or in the
   guard modules themselves.
7. **Self-contradiction within the diff**: does the client module's `refuseLineageWrite` genuinely
   implement the SAME transition table as the server's `checkWriteOnce` (same rows, same verdicts),
   or is there a subtle divergence between the two independently-written pure functions that a parity
   test would need to exist to catch? Flag this as "needs Pass 2 to actually compare them" rather than
   asserting an answer from the diff alone.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/bl-5-character-bloodline-validation-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

### Orientation (not ground truth - verify against the code)

Same shape as Pass 1's summary: a pure server module and a pure client module both implement the same
write-once transition rule for `clan`/`bloodline`, wired into the sole character-save route and both
character-editing UI surfaces respectively, with a compare-and-set for acquisition races and a
narrowed referential check on bloodline acquisition only.

### What to hunt for

1. **Resolve Pass 1's crash concern with an actual trace.** Read `server/routes/characters.js`'s full
   `PUT /:id` handler from the top, including everything above the diff hunk (the middleware chain:
   `requireRole('st')`, `stripEphemeral`, `validateCharacterPartial`, `normalizeMeritsMiddleware`,
   etc.) - does ANY of them 404 or otherwise short-circuit for a non-existent `:id` before reaching
   the new guard code? If not, either reproduce the crash with a targeted test (a PUT to a
   fabricated/non-existent ObjectId carrying a `clan` field, against `tm_suite_test`) or explain
   precisely why it can't happen.
2. **Compare the server and client transition tables field-for-field, row-for-row.** Read
   `server/lib/character-write-once.js`'s `checkWriteOnce`/`hasNoValue` and
   `public/js/data/write-once.js`'s equivalent in full. Do they actually agree on every row of the
   transition table (no-value→value: allow; value→same value: allow; value→different value: refuse;
   value→no-value: refuse), including the edge cases (whitespace-only, case-differing "same" values,
   non-string inputs)? If a parity test exists in the diff, read it and judge whether its coverage is
   exhaustive enough to catch a real divergence, or whether it only exercises a handful of cases that
   happen to agree while a corner case could still differ.
3. **Read `edit.js`'s `shEdit` function in full** and confirm the story's own claim (visible in a code
   comment, not asserted by you) that the write-once guard must sit ABOVE the line that mutates
   `state.chars[state.editIdx][field]`, and confirm the actual diff places it there - not after, not
   in a branch that could be skipped.
4. **`edit.js` has two importers** (`admin.js` and `app.js`, per this repo's own established
   convention for this file) - confirm both actually reach the new guarded `shEdit`, and that neither
   app has its own separate bloodline/clan write path that bypasses `shEdit` entirely.
5. **Malformed or absent input at the route's new code paths.** What happens when `updates.clan` or
   `updates.bloodline` in the PUT body is present but explicitly `null`, versus omitted entirely,
   versus an empty object `{}` for the whole body? Trace each through `has()`, `guardedInBody`, and
   `checkWriteOnce` to confirm the behaviour matches what AC-shaped reasoning would expect (a body
   with the field truly absent should never trigger the read or the guard at all).
6. **The referential check's collection read** (`bloodlineDoesNotResolve`) does a full unfiltered
   `find({}, {projection:{name:1}}).toArray()` on every acquisition. Is there any other place in this
   route (or the wider request lifecycle) that already has a warmed copy of this data it could reuse,
   or is a fresh read genuinely necessary here? Not necessarily a defect - judge whether the cost is
   proportionate (the story's own reasoning says "a couple of dozen documents", verify that's still
   true) or whether this is a latent scaling concern worth naming even if not urgent.
7. **State mutated by one step leaking into a later step in the same request.** Walk the full `PUT`
   handler body once end to end (not just the diff hunk) for the case where `updates` is later spread
   or mutated by something ELSE further down the handler (e.g. `normalizeMeritsMiddleware` or the
   equipment-hydration block already visible in the diff context) - could anything downstream mutate
   `updates.clan`/`updates.bloodline` AFTER the write-once check ran but BEFORE the `$set`, making the
   check's verdict stale by the time the write actually happens?
8. **Fixture/mock shape vs. what the real route now reads** - in `bl5-write-once.test.js` and
   `bl5-lineage-lock-client.test.js`, confirm the mocked/fixture character documents used in tests
   accurately reflect the real schema shape (particularly around the `''`-vs-`null` distinction the
   guard is built to handle), not a simplified stand-in that would pass even if the real logic were
   subtly wrong.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/bl-5-character-bloodline-validation-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/bl-5-character-bloodline-validation.story.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely.
3. Against the 15 acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (no character-editor redesign beyond the
     four controls and two handlers, no UI override/unlock affordance, no correction script, no
     touching BL-4's admin CRUD or its shared modules, no referential validation on POST, no touching
     `wizard.js`, no `data-map.md` edits).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Settled decisions - already ruled, do not re-litigate (but DO review their implementations):

- **No in-app remedy for a mis-entered clan/bloodline** - deliberate, per Angelus's explicit ruling.
  Do not flag the absence of a correction UI as a gap.
- **No audit-logging of forbidden transition attempts** - deliberately out of scope, tracked
  separately as GitHub issue #1132. Do not flag its absence.
- **The server check placement (pure module wired into the route, not a sibling middleware)** is a
  deliberate architectural choice, reasoned in the story. Do not propose moving it to middleware; DO
  review whether the wiring itself is correct.
- **The compare-and-set (not a transaction) is the deliberate concurrency answer.** Do not propose a
  transaction instead; DO review whether the compare-and-set is implemented correctly.
- **The rule is deliberately implemented twice** (server + client, because the two trees deploy
  separately and cannot share code). Do not flag the duplication itself as a defect; DO check whether
  the two implementations can actually diverge undetected (this is exactly Pass 2's item 2).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **"Dev Agent Record"** section in full. It makes specific, checkable claims. Attack
   these:
   - **Exact test counts**: "150 tests" in the story's own new specs (90 + 60 across two files), and a
     "41 files, 811 tests" full touched-suite regression figure. Run the scoped gate command yourself
     and compare. The 41-file figure is a large claim to audit fully - at minimum, spot-check that the
     files it claims to include genuinely do read `editor/edit.js`, `editor/identity.js`,
     `editor/sheet.js`, or `/api/characters`, and that the count itself is plausible rather than
     inflated.
   - **The browser-verification claim**: specific observations about locked dropdowns rendering
     correctly on both screens for a real character (cited by name), forbidden writes being refused
     with `state.chars` untouched and no dirty-flag firing, and the acquisition path remaining open
     for an unbloodlined character. You cannot re-run the browser session, but you CAN check these for
     code-level plausibility by tracing the actual render and handler code against the claims.
   - **The explicit claim that production was NOT mutated** despite live-database browser testing -
     specifically that a tested acquisition on a real character was "accepted in memory" only, never
     saved. You do NOT have permission to query production yourself; note this as unverifiable-by-you
     rather than treating silence as confirmation, and do not flag it as a defect merely because you
     can't check it.
   - **The claim that a real bug was caught and fixed during this story** (a first cut of the
     compare-and-set returning 404 on a lost race instead of the intended 409) - read the current code
     and confirm it now does return 409 in that case, per AC 6.
   - **The claim about `server/lib/bloodline-name-index.js:45` carrying a duplicate private `normKey`**,
     flagged but deliberately not fixed as out-of-scope for this story - confirm this is accurately
     described (does that duplication genuinely exist, and is it genuinely a pre-existing BL-4
     artefact rather than something this diff introduced or could have trivially fixed).
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem - bearing in mind the blast-radius note above: this touches the one write path
   every character save in the app goes through.

---

## Output

Write everything to `specs/stories/code-review/bl-5-character-bloodline-validation-codex-findings.md`,
grouped `## High` / `## Medium` / `## Low`, each finding tagged with the pass that produced it
(`[Pass 1]`, `[Pass 2]`, `[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading
rather than dropping it.

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
  (`git status --short` clean of unintended change - note the working tree has pre-existing unrelated
  debris, listed in Ground rules above; only confirm THIS diff's files are clean of unintended
  changes).
- Explicit confirmation you did NOT start the API server and made no manual MongoDB connection beyond
  what the scoped vitest gate itself performs.
